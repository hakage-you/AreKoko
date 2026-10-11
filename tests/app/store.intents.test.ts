// AppStore の「利用者の操作」（詳細設計(シナリオ) 1章）。画面の判断をストアに移したもの。
// 期待は設計から決める：V2（追加の置き場）、8.4（削除の確認）、7.5（収納設定の削除）、7.6（タグ）、
// 7.8（統一規則）、7.2・詳細設計 段階5 8.4（仕切りの線の削除）、8.2（置き換え）、詳細設計UI 5.3（影響の見せ方）。

import { describe, expect, it } from 'vitest';
import { makeApp, expectHealthy } from '../integration/harness';
import type { AppStore, ConfirmDialog } from '../../src/app/store';
import type { Id } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { addItem, addTagToItems } from '../../src/core/ops/items';
import { createKuukan } from '../../src/core/ops/kuukans';
import { createTag } from '../../src/core/ops/tags';
import { splitAt } from '../../src/core/ops/areas';
import { deleteLine } from '../../src/core/ops/areas';
import { setItemDrawing } from '../../src/core/ops/itemDrawings';

function confirmDialog(app: AppStore): ConfirmDialog {
  const d = app.state.dialog;
  if (d?.kind !== 'confirm') throw new Error(`確認のダイアログが出ていない（${d?.kind ?? 'なし'}）`);
  return d;
}
function item(app: AppStore, id: Id) {
  return app.state.doc!.membership.items.find(i => i.id === id);
}
function areasOf(app: AppStore, kuukan: Id) {
  return app.state.doc!.membership.areas.filter(a => a.kuukan === kuukan).sort((a, b) => a.order - b.order);
}
function add(app: AppStore, name: string, place: Id): Id {
  return app.apply((d, ctx) => addItem(d, { name, place }, ctx))!.created[0]!;
}

/** 3段の棚（段1〜段3）を確定し、段1 に工具箱（収納。中にドライバー）、段2 に懐中電灯を置く。 */
async function shelf() {
  const h = makeApp();
  const { app } = h;
  await app.newDocument();
  app.openDraft({ kind: 'template', template: 'shelf3' });
  app.requestConfirmDraft('create');
  const ed = app.state.editor;
  if (ed?.kind !== 'kuukan') throw new Error('確定したクウカンの編集に移っていない');
  const tana = ed.kuukan;
  const [dan1, dan2, dan3] = areasOf(app, tana).map(a => a.id);
  const toolbox = add(app, '工具箱', dan1!);
  app.openDraft({ kind: 'storage', item: toolbox });
  app.requestConfirmDraft('create');
  const toolboxK = app.state.doc!.membership.kuukans.find(k => k.owner === toolbox)!.id;
  const driver = add(app, 'ドライバー', toolboxK);
  const light = add(app, '懐中電灯', dan2!);
  app.setScreen('kuukans');
  return { ...h, tana, dan1: dan1!, dan2: dan2!, dan3: dan3!, toolbox, toolboxK, driver, light };
}

describe('addItemInView（クウカンビューの「＋モノを追加」）', () => {
  it('置き場は選んでいるエリア、選んでいなければクウカンそのもの、未設定のクウカンなら未設定（V2）', async () => {
    const s = await shelf();
    const { app } = s;
    app.openView(s.tana);
    const a = app.addItemInView('メジャー')!;
    expect(item(app, a)!.place).toBe(s.tana);

    app.selectViewArea(s.dan3);
    const b = app.addItemInView('軍手')!;
    expect(item(app, b)!.place).toBe(s.dan3);

    app.openView(NIL_ID);
    const c = app.addItemInView('メモ')!;
    expect(item(app, c)!.place).toBe(NIL_ID);
    expectHealthy(app, s.file);
  });

  it('描画なしで作られ、追加したモノの詳細が開く（8.4、詳細設計 段階6 6.5）', async () => {
    const s = await shelf();
    const { app } = s;
    app.openView(s.tana);
    app.selectViewArea(s.dan3);
    const id = app.addItemInView('軍手')!;
    expect(app.state.doc!.drawing.items.some(d => d.item === id)).toBe(false);
    expect(app.state.detail).toBe(id);
  });

  it('名前の前後の空白を除く。空なら何も作らない。クウカンビューを開いていなければ何もしない', async () => {
    const s = await shelf();
    const { app } = s;
    const before = app.state.doc!.membership.items.length;
    expect(app.addItemInView('軍手')).toBeNull(); // 一覧の画面
    app.openView(s.tana);
    expect(app.addItemInView('   ')).toBeNull();
    expect(app.state.doc!.membership.items.length).toBe(before);
    const id = app.addItemInView('  軍手  ')!;
    expect(item(app, id)!.name).toBe('軍手');
  });
});

describe('モノの削除（設計 8.4）', () => {
  it('requestDeleteItem：ふつうのモノは1件なら確認せずに消し、onDone を呼ぶ', async () => {
    const s = await shelf();
    const { app } = s;
    let done = 0;
    app.requestDeleteItem(s.light, () => { done++; });
    expect(app.state.dialog).toBeNull();
    expect(item(app, s.light)).toBeUndefined();
    expect(done).toBe(1);
    expectHealthy(app, s.file);
  });

  it('requestDeleteItem：収納のモノは、中のクウカンがなくなり中のモノが何件どこへ移るかを見せて確認する。確認すると消え、中身は収納があった置き場へ移り、ハイライトされる（7.5・7.8、付録B I-17）', async () => {
    const s = await shelf();
    const { app } = s;
    let done = 0;
    const before = app.state.doc;
    app.requestDeleteItem(s.toolbox, () => { done++; });
    const d = confirmDialog(app);
    expect(d.message).toContain('工具箱');
    expect(d.message).toContain('1件');
    expect(d.details).toHaveLength(1);
    expect(d.details[0]).toMatch(/工具箱 から 1件（ドライバー）→ .*段1$/);
    expect(app.state.doc).toBe(before);
    expect(done).toBe(0);

    d.onConfirm();
    expect(app.state.dialog).toBeNull();
    expect(item(app, s.toolbox)).toBeUndefined();
    expect(app.state.doc!.membership.kuukans.some(k => k.owner === s.toolbox)).toBe(false);
    expect(item(app, s.driver)!.place).toBe(s.dan1);
    expect(app.state.highlights.has(s.driver)).toBe(true);
    expect(done).toBe(1);
    expectHealthy(app, s.file);
  });

  it('requestDeleteItem：収納のモノの確認を閉じれば何も変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    let done = 0;
    const before = app.state.doc;
    app.requestDeleteItem(s.toolbox, () => { done++; });
    app.closeDialog();
    expect(app.state.doc).toBe(before);
    expect(done).toBe(0);
  });

  it('requestDeleteSelection：件数と、どこから何件がどこへ移るかを見せて確認する。確認するまで文書は変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    app.setSelection([s.toolbox, s.light]);
    const before = app.state.doc;
    app.requestDeleteSelection();
    const d = confirmDialog(app);
    expect(d.message).toContain('2件');
    expect(d.details).toHaveLength(1);
    expect(d.details[0]).toMatch(/工具箱 から 1件（ドライバー）→ .*段1$/);
    expect(app.state.doc).toBe(before);

    d.onConfirm();
    expect(app.state.dialog).toBeNull();
    expect(item(app, s.toolbox)).toBeUndefined();
    expect(item(app, s.light)).toBeUndefined();
    expect(item(app, s.driver)!.place).toBe(s.dan1);
    expect(app.state.selection.size).toBe(0);
    expectHealthy(app, s.file);
  });

  it('requestDeleteSelection：確認を閉じれば何も変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    app.setSelection([s.light]);
    const before = app.state.doc;
    app.requestDeleteSelection();
    app.closeDialog();
    expect(app.state.doc).toBe(before);
    expect(app.state.selection.has(s.light)).toBe(true);
  });
});

describe('requestRemoveStorage（収納設定の削除。設計 7.5）', () => {
  it('中のクウカンがなくなり、中のモノが何件どこへ移るかを見せて確認する。確認すると移り、モノのIDは変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    const before = app.state.doc;
    app.requestRemoveStorage(s.toolbox);
    const d = confirmDialog(app);
    expect(d.message).toContain('1件');
    expect(d.message).toContain('段1');
    expect(d.details[0]).toMatch(/工具箱 から 1件（ドライバー）→ .*段1$/);
    expect(app.state.doc).toBe(before);

    d.onConfirm();
    expect(app.state.doc!.membership.kuukans.some(k => k.id === s.toolboxK)).toBe(false);
    expect(item(app, s.toolbox)).toBeDefined();
    expect(item(app, s.driver)!.place).toBe(s.dan1);
    expect(app.state.highlights.has(s.driver)).toBe(true);
    expectHealthy(app, s.file);
  });

  it('収納でないモノでは確認を出さず、理由を知らせ、文書は変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    const before = app.state.doc;
    app.requestRemoveStorage(s.light);
    expect(app.state.dialog).toBeNull();
    expect(app.state.toast?.kind).toBe('error');
    expect(app.state.doc).toBe(before);
  });
});

describe('requestDeleteKuukan（クウカンの削除。設計 7.8、詳細設計UI 5.3）', () => {
  it('名前と、中のモノが未設定へ移ることを見せて確認する。確認すると中身は未設定へ（中の収納は中身ごと）', async () => {
    const s = await shelf();
    const { app } = s;
    app.requestDeleteKuukan(s.tana);
    const d = confirmDialog(app);
    expect(d.message).toContain('3段の棚');
    expect(d.message).toContain('未設定');
    expect(d.details.some(x => /段1 から 1件（工具箱）→ 未設定$/.test(x))).toBe(true);
    expect(d.details.some(x => /段2 から 1件（懐中電灯）→ 未設定$/.test(x))).toBe(true);

    d.onConfirm();
    expect(app.state.doc!.membership.kuukans.some(k => k.id === s.tana)).toBe(false);
    expect(item(app, s.toolbox)!.place).toBe(NIL_ID);
    expect(item(app, s.light)!.place).toBe(NIL_ID);
    expect(item(app, s.driver)!.place).toBe(s.toolboxK);
    expectHealthy(app, s.file);
  });

  it('未設定は消せない：確認を出さず、理由を知らせる', async () => {
    const s = await shelf();
    const { app } = s;
    app.requestDeleteKuukan(NIL_ID);
    expect(app.state.dialog).toBeNull();
    expect(app.state.toast?.kind).toBe('error');
  });
});

describe('requestDeleteTag（タグの削除。設計 7.6）', () => {
  it('付いている件数を見せて確認する。確認するとタグと全部の参照が消える', async () => {
    const s = await shelf();
    const { app } = s;
    const tag = app.apply((d, ctx) => createTag(d, { name: '防災' }, ctx))!.created[0]!;
    app.apply((d, ctx) => addTagToItems(d, [s.light, s.driver], tag, ctx));
    app.requestDeleteTag(tag);
    const d = confirmDialog(app);
    expect(d.message).toContain('防災');
    expect(d.message).toContain('2件');

    d.onConfirm();
    expect(app.state.doc!.membership.tags.some(t => t.id === tag)).toBe(false);
    expect(item(app, s.light)!.tags).toEqual([]);
    expect(item(app, s.driver)!.tags).toEqual([]);
    expectHealthy(app, s.file);
  });
});

describe('requestDeleteLine（仕切りの線の削除。設計 7.2、詳細設計 段階5 8.4）', () => {
  it('確定したクウカン：どこから、どのモノが何件、どこへ移るかを見せて確認し、確認すると消える（TRS 付録B I-13）', async () => {
    const s = await shelf();
    const { app } = s;
    app.openKuukanEditor(s.tana);
    let done = 0;
    const before = app.state.doc;
    app.requestDeleteLine(s.tana, 0, 'line', () => done++); // 段1 と段2 の間
    const d = confirmDialog(app);
    expect(d.details.some(x => /段1 から 1件（工具箱）→ 3段の棚$/.test(x))).toBe(true);
    expect(d.details.some(x => /段2 から 1件（懐中電灯）→ 3段の棚$/.test(x))).toBe(true);
    expect(app.state.doc).toBe(before);
    expect(done).toBe(0);

    d.onConfirm();
    expect(done).toBe(1);
    expect(item(app, s.toolbox)!.place).toBe(s.tana);
    expect(item(app, s.light)!.place).toBe(s.tana);
    expectHealthy(app, s.file);
  });

  it('下書き：確認せずに下書きの線を消す。文書は変わらない', async () => {
    const s = await shelf();
    const { app } = s;
    app.openDraft({ kind: 'duplicate', source: s.tana });
    const before = app.state.doc;
    let done = 0;
    app.requestDeleteLine(s.tana, 0, 'line', () => done++);
    expect(app.state.dialog).toBeNull();
    expect(done).toBe(1);
    const ed = app.state.editor;
    if (ed?.kind !== 'draft') throw new Error('下書きのはず');
    const draftAreas = ed.draft.doc.membership.areas.map(a => a.id);
    expect(draftAreas).not.toContain(s.dan1);
    expect(draftAreas).not.toContain(s.dan2);
    expect(app.state.doc).toBe(before);
  });
});

describe('requestConfirmDraft（下書きの確定。設計 8.2）', () => {
  it('置き換え：消えるエリアと、どこから、どのモノが何件、どこへ移るかと、置き換えた後は元に戻せないことを見せて確認する。確認すると置き換わり、元に戻すでは戻らない（A-03、TRS 付録B I-06・I-13）', async () => {
    const s = await shelf();
    const { app } = s;
    app.openDraft({ kind: 'duplicate', source: s.tana });
    app.requestDeleteLine(s.tana, 1, 'line'); // 下書きで段2 と段3 の間を消す
    const before = app.state.doc;
    app.requestConfirmDraft('replace');
    const d = confirmDialog(app);
    expect(d.details).toContain('消えるエリア: 段2');
    expect(d.details).toContain('消えるエリア: 段3');
    expect(d.message).toContain('元に戻す');
    expect(d.details.some(x => /段2 から 1件（懐中電灯）→ 3段の棚$/.test(x))).toBe(true);
    expect(app.state.doc).toBe(before);

    d.onConfirm();
    expect(app.state.doc!.membership.kuukans.some(k => k.id === s.tana)).toBe(true);
    const names = areasOf(app, s.tana).map(a => a.name);
    expect(names).toContain('段1');
    expect(names).not.toContain('段2');
    expect(item(app, s.light)!.place).toBe(s.tana);
    expect(item(app, s.toolbox)!.place).toBe(s.dan1);
    expect(app.state.canUndo).toBe(false);
    const after = app.state.doc;
    app.undo();
    expect(app.state.doc).toBe(after);
    expectHealthy(app, s.file);
  });

  it('置き換え以外は確認せずに確定する', async () => {
    const s = await shelf();
    const { app } = s;
    app.openDraft({ kind: 'new' }, { name: '書斎' });
    app.requestConfirmDraft('create');
    expect(app.state.dialog).toBeNull();
    expect(app.state.doc!.membership.kuukans.some(k => k.name === '書斎')).toBe(true);
  });
});

describe('editorApply・tryApply', () => {
  it('editorApply：下書きなら下書きに、確定したクウカンなら文書にかける', async () => {
    const s = await shelf();
    const { app } = s;
    app.openDraft({ kind: 'new' }, { name: '書斎' });
    const ed = app.state.editor;
    if (ed?.kind !== 'draft') throw new Error('下書きのはず');
    const before = app.state.doc;
    app.editorApply((d, ctx) => splitAt(d, ed.draft.kuukan, 'x', [5000, 5000], ctx));
    expect(app.state.doc).toBe(before);
    const ed2 = app.state.editor;
    if (ed2?.kind !== 'draft') throw new Error('下書きのはず');
    expect(ed2.draft.doc.membership.areas).toHaveLength(2);

    app.cancelDraft();
    app.openKuukanEditor(s.tana);
    app.editorApply((d, ctx) => deleteLine(d, s.tana, 0, ctx));
    expect(app.state.doc).not.toBe(before);
    expect(app.state.canUndo).toBe(true);
  });

  it('tryApply：断られたらトーストを出さずに理由を返し、文書は変わらない。成功すれば apply と同じく履歴に積まれ保存される', async () => {
    const s = await shelf();
    const { app, clock, file } = s;
    const k = app.apply((d, ctx) => createKuukan(d, { name: '貸出中' }, ctx))!.created[0]!;
    const lent = add(app, '本', k);
    const before = app.state.doc;
    const ng = app.tryApply((d, ctx) => setItemDrawing(d, lent, { shape: { type: 'point', at: [100, 100] } }, ctx));
    expect(ng.ok).toBe(false);
    if (!ng.ok) expect(ng.message.length).toBeGreaterThan(0);
    expect(app.state.toast).toBeNull();
    expect(app.state.doc).toBe(before);

    const ok = app.tryApply((d, ctx) => setItemDrawing(d, s.light, { shape: { type: 'point', at: [5000, 5000] } }, ctx));
    expect(ok.ok).toBe(true);
    expect(app.state.doc!.drawing.items.some(d => d.item === s.light)).toBe(true);
    expect(app.state.canUndo).toBe(true);
    await clock.advance(1000);
    expect(JSON.parse(file.text).drawing.items.some((d: { item: Id }) => d.item === s.light)).toBe(true);
  });
});
