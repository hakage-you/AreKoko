import { describe, expect, it } from 'vitest';
import { makeApp, MemoryFile, expectHealthy } from './harness';
import { NIL_ID } from '../../src/core/constants';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';
import { serializeDocument } from '../../src/core/serialize';
import { addItem } from '../../src/core/ops/items';
import { makeStorage, removeStorage } from '../../src/core/ops/storage';
import type { ConfirmDialog } from '../../src/app/store';

describe('結合試験: 保存と安全 (P1〜P9)', () => {
  it('P1: 自動保存は約1秒待ってまとめて1回', async () => {
    const file = new MemoryFile('p1.json', serializeDocument(createSampleDocument()));
    const { app, clock } = makeApp({ file });
    await app.openFile();
    expect(file.writes).toBe(0);

    // 0.9秒以内に3回操作
    app.apply((d, ctx) => addItem(d, { name: '操作1', place: NIL_ID }, ctx));
    await clock.advance(300);
    expect(file.writes).toBe(0);

    app.apply((d, ctx) => addItem(d, { name: '操作2', place: NIL_ID }, ctx));
    await clock.advance(300);
    expect(file.writes).toBe(0);

    app.apply((d, ctx) => addItem(d, { name: '操作3', place: NIL_ID }, ctx));
    expect(file.writes).toBe(0);

    // 最後の操作から999msではまだ書かれない
    await clock.advance(999);
    expect(file.writes).toBe(0);

    // 1000ms 経過でまとめて1回書き込まれる
    await clock.advance(1);
    expect(file.writes).toBe(1);
    expect(file.text).toContain('操作1');
    expect(file.text).toContain('操作2');
    expect(file.text).toContain('操作3');

    expectHealthy(app, file);
  });

  it('P2: タブを隠す・閉じるときは待たずに書く', async () => {
    const file = new MemoryFile('p2.json', serializeDocument(createSampleDocument()));
    const { app } = makeApp({ file });
    await app.openFile();

    app.apply((d, ctx) => addItem(d, { name: '即時保存モノ', place: NIL_ID }, ctx));
    expect(app.state.saveStatus).toBe('pending');
    expect(file.writes).toBe(0);

    await app.flush();
    expect(file.writes).toBe(1);
    expect(app.state.saveStatus).toBe('saved');
    expect(app.state.dirty).toBe(false);
    expect(file.text).toContain('即時保存モノ');

    expectHealthy(app, file);
  });

  it('P3: 自動保存オフでは書かない（flush でも）', async () => {
    const file = new MemoryFile('p3.json', serializeDocument(createSampleDocument()));
    const { app, clock, settings } = makeApp({ file });
    await app.openFile();

    app.setAutosave(false);
    expect(settings.autosave).toBe(false);
    expect(app.state.autosave).toBe(false);

    app.apply((d, ctx) => addItem(d, { name: '手動保存モノ', place: NIL_ID }, ctx));
    expect(app.state.saveStatus).toBe('dirty');
    expect(app.state.dirty).toBe(true);

    await clock.advance(5000);
    expect(file.writes).toBe(0);

    await app.flush();
    expect(file.writes).toBe(0);
    expect(app.state.saveStatus).toBe('dirty');

    await app.save();
    expect(file.writes).toBe(1);
    expect(app.state.saveStatus).toBe('saved');
    expect(app.state.dirty).toBe(false);
    expect(file.text).toContain('手動保存モノ');

    expectHealthy(app, file);
  });

  it('P4: 書く前に必ず検査し、問題があれば書かない', async () => {
    const file = new MemoryFile('p4.json', serializeDocument(createSampleDocument()));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    const previousFileText = file.text;
    const initialWrites = file.writes;

    // 不変条件を壊した文書を通す（モノの ID を不正な文字列にする）
    const brokenDoc = {
      ...app.state.doc!,
      membership: {
        ...app.state.doc!.membership,
        items: [{ ...app.state.doc!.membership.items[0]!, id: 'broken-invalid-id' }],
      },
    };

    app.apply(() => ({ doc: brokenDoc as any, moved: [], created: [] }));

    await clock.advance(1000);
    expect(app.state.saveStatus).toBe('invalid');
    expect(file.writes).toBe(initialWrites);
    expect(file.text).toBe(previousFileText);

    // 元に戻せば正常な文書に戻り、書けるようになる（不具合で閉じ込められない）
    app.undo();
    await clock.advance(1000);
    expect(app.state.saveStatus).toBe('saved');
    expectHealthy(app, file);
  });

  it('P5: 閉じるときの警告', async () => {
    // 1. 自動保存オフで変更 → closeDocument で confirm が出る
    const file1 = new MemoryFile('p5-1.json', serializeDocument(createSampleDocument()));
    const { app: app1 } = makeApp({ file: file1 });
    await app1.openFile();
    app1.setAutosave(false);

    app1.apply((d, ctx) => addItem(d, { name: '未保存モノ', place: NIL_ID }, ctx));
    expect(app1.state.dirty).toBe(true);

    await app1.closeDocument();
    expect(app1.state.dialog?.kind).toBe('confirm');
    expect(app1.state.screen).not.toBe('start');

    const confirmDlg = app1.state.dialog as ConfirmDialog;
    confirmDlg.onConfirm();
    expect(app1.state.screen).toBe('start');
    expect(app1.state.doc).toBeNull();

    // 2. 自動保存の待ちの途中 → 書いてから閉じる（confirm なし）
    const file2 = new MemoryFile('p5-2.json', serializeDocument(createSampleDocument()));
    const { app: app2 } = makeApp({ file: file2 });
    await app2.openFile();

    app2.apply((d, ctx) => addItem(d, { name: '待ちの途中のモノ', place: NIL_ID }, ctx));
    expect(app2.state.saveStatus).toBe('pending');

    await app2.closeDocument();
    expect(app2.state.dialog).toBeNull();
    expect(app2.state.screen).toBe('start');
    expect(file2.text).toContain('待ちの途中のモノ');

    expectHealthy(app2, file2);
  });

  it('P6: 元に戻すは直近50回、画面切り替えで消え、まとめ方切り替えでは残る', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    // 51回操作を行う
    for (let i = 1; i <= 51; i++) {
      app.apply((d, ctx) => addItem(d, { name: `アイテム${i}`, place: NIL_ID }, ctx));
    }

    // 50回戻せる
    let undoCount = 0;
    while (app.state.canUndo) {
      app.undo();
      undoCount++;
    }
    expect(undoCount).toBe(50);
    expect(app.state.canUndo).toBe(false);
    expect(app.state.canRedo).toBe(true);

    // 戻した後の新しい操作でやり直すが消える
    app.apply((d, ctx) => addItem(d, { name: '新しい分岐アイテム', place: NIL_ID }, ctx));
    expect(app.state.canRedo).toBe(false);
    expect(app.state.canUndo).toBe(true);

    // まとめ方の切り替え（setGrouping）では履歴は消えない
    app.setGrouping('category');
    expect(app.state.grouping).toBe('category');
    expect(app.state.canUndo).toBe(true);

    // 画面の切り替え（setScreen）で履歴は消える
    app.setScreen('kuukans');
    expect(app.state.screen).toBe('kuukans');
    expect(app.state.canUndo).toBe(false);
    expect(app.state.canRedo).toBe(false);

    expectHealthy(app, file);
  });

  it('P7: ハイライトはその場限りで、文書には残さない', async () => {
    const doc = createSampleDocument();
    const file = new MemoryFile('p7.json', serializeDocument(doc));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    // BOX1 の収納設定を解除し、中身（電池）が親へ移ってハイライトされる
    app.apply((d, ctx) => removeStorage(d, FIXTURE_IDS.box1, ctx));
    expect(app.state.highlights.has(FIXTURE_IDS.battery)).toBe(true);

    await clock.advance(1000);
    const saved = file.json();
    expect((saved as any).highlights).toBeUndefined();
    const batteryObj = saved.membership.items.find((i: any) => i.id === FIXTURE_IDS.battery);
    expect((batteryObj as any).highlight).toBeUndefined();

    // 次の操作でハイライトが消える
    app.apply((d, ctx) => addItem(d, { name: '次の操作モノ', place: NIL_ID }, ctx));
    expect(app.state.highlights.has(FIXTURE_IDS.battery)).toBe(false);
    expect(app.state.highlights.size).toBe(0);

    expectHealthy(app, file);
  });

  it('P8: 新しく作るとすぐ保存先に書かれる（D6）', async () => {
    const file = new MemoryFile('p8.json', '');
    const { app } = makeApp({ file });

    await app.newDocument();
    expect(file.writes).toBe(1);
    expect(file.text.length).toBeGreaterThan(0);

    const saved = file.json();
    expect(saved.app).toBe('arekoko');
    expect(saved.schemaVersion).toBe(1);
    expect(saved.membership.kuukans[0].id).toBe(NIL_ID);

    expectHealthy(app, file);
  });

  it('P9: ブラウザに残すのは設定だけ', async () => {
    const { app, settings } = makeApp();
    await app.newDocument();

    app.setAutosave(false);
    expect(Object.keys(settings)).toEqual(['autosave']);
    expect(settings.autosave).toBe(false);
  });
});
