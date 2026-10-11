// 結合試験：シナリオ（docs/scenarios.md）を AppStore の公開の操作だけで通す（詳細設計(シナリオ) 3章）。
// 手順の名前は E2E（e2e/sc*.spec.ts）と同じ。図の上の操作は、画面が呼ぶのと同じ中核の操作を
// editorApply・tryApply で呼ぶ（押した位置から節を選ぶのは画面の仕事なので、ここでは節を直接選ぶ）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。根拠は docs/scenarios.md の表。

import { beforeAll, describe, expect, it } from 'vitest';
import { makeApp, expectHealthy, MemoryFile, type AppHarness } from './harness';
import type { ArekokoDocument, Id } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { serializeDocument } from '../../src/core/serialize';
import { sampleDocument } from '../../src/app/memoryDeps';
import { splitAt, splitEven } from '../../src/core/ops/areas';
import { setAreaLabel } from '../../src/core/ops/kuukans';
import { setItemDrawing } from '../../src/core/ops/itemDrawings';
import { removeNotice } from '../../src/core/ops/notices';
import { createTag } from '../../src/core/ops/tags';
import { addTagToItems } from '../../src/core/ops/items';
import { confirmModes } from '../../src/editor/confirm';
import { searchItems } from '../../src/search/search';
import { itemsInScope, kuukanTrail, drawingOffset } from '../../src/view/model';
import { shapeCenter } from '../../src/geometry/shape';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sampleFile(): MemoryFile {
  return new MemoryFile({ name: '見本.json', text: serializeDocument(sampleDocument()) });
}
function item(doc: ArekokoDocument, name: string) {
  const found = doc.membership.items.filter(i => i.name === name);
  if (found.length !== 1) throw new Error(`モノ「${name}」が ${found.length} 個ある`);
  return found[0]!;
}
function kuukanNamed(doc: ArekokoDocument, name: string) {
  return doc.membership.kuukans.find(k => k.name === name)!;
}
function ownedBy(doc: ArekokoDocument, itemId: Id) {
  return doc.membership.kuukans.find(k => k.owner === itemId);
}
function areasOf(doc: ArekokoDocument, kuukan: Id) {
  return doc.membership.areas.filter(a => a.kuukan === kuukan).sort((a, b) => a.order - b.order);
}
function areaNamed(doc: ArekokoDocument, kuukan: Id, name: string) {
  return areasOf(doc, kuukan).find(a => a.name === name)!;
}
function draftOf(h: AppHarness) {
  const ed = h.app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開かれていない');
  return ed.draft;
}
function confirmDialog(h: AppHarness) {
  const d = h.app.state.dialog;
  if (d?.kind !== 'confirm') throw new Error('確認のダイアログが出ていない');
  return d;
}
async function healthy(h: AppHarness) {
  await h.clock.advance(1000);
  expectHealthy(h.app, h.file);
}

describe('SC-01 部屋をエリアに分け、片方にモノを追加して図に置く', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  let before: ArekokoDocument;

  it('SC-01-1 見本を開く → クウカンの一覧', async () => {
    await h.app.openFile();
    expect(h.app.state.screen).toBe('kuukans');
  });
  it('SC-01-2 「書斎」を作る → 長方形の外形の下書き。文書はまだ変わらない', () => {
    h.app.openDraft({ kind: 'new' }, { name: '書斎' });
    const draft = draftOf(h);
    const outline = draft.doc.drawing.kuukans.find(d => d.kuukan === draft.kuukan)!.outline;
    expect(new Set(outline.map(p => p.join(',')))).toEqual(new Set(['0,0', '10000,0', '10000,10000', '0,10000']));
    expect(doc().membership.kuukans.some(k => k.name === '書斎')).toBe(false);
  });
  it('SC-01-3 左右に分ける → 左がエリア1、右がエリア2。文書は変わらない', () => {
    const k = draftOf(h).kuukan;
    h.app.editorApply((d, ctx) => splitAt(d, k, 'x', [5000, 5000], ctx));
    const draft = draftOf(h);
    const areas = areasOf(draft.doc, k);
    expect(areas.map(a => a.name)).toEqual(['エリア1', 'エリア2']);
    expect(draft.doc.drawing.partitions.find(p => p.area === k)!.children).toEqual(areas.map(a => a.id));
    expect(doc().membership.kuukans.some(x => x.name === '書斎')).toBe(false);
  });
  it('SC-01-4 「確定する」 → 文書に書斎とエリア1・エリア2。確定したクウカンの編集へ', () => {
    h.app.requestConfirmDraft('create');
    const k = kuukanNamed(doc(), '書斎');
    expect(k.owner).toBeNull();
    expect(areasOf(doc(), k.id).map(a => a.name)).toEqual(['エリア1', 'エリア2']);
    expect(h.app.state.editor).toEqual({ kind: 'kuukan', kuukan: k.id });
  });
  it('SC-01-5 編集を出て、一覧で書斎を開く → 書斎のクウカンビュー（モノ 0件）', () => {
    h.app.leaveEditor();
    expect(h.app.state.screen).toBe('kuukans');
    const k = kuukanNamed(doc(), '書斎').id;
    h.app.openView(k);
    expect(h.app.state.view?.kuukan).toBe(k);
    expect(itemsInScope(doc(), k, null)).toEqual([]);
  });
  it('SC-01-6 右のエリアを選ぶ → エリア2（モノ 0件）', () => {
    const k = kuukanNamed(doc(), '書斎').id;
    const e2 = areaNamed(doc(), k, 'エリア2').id;
    h.app.selectViewArea(e2);
    expect(h.app.state.view?.area).toBe(e2);
    expect(itemsInScope(doc(), k, e2)).toEqual([]);
  });
  it('SC-01-7 「＋モノを追加」で「ノートPC」 → 置き場はエリア2、描画なし、詳細が開く', () => {
    const id = h.app.addItemInView('ノートPC')!;
    const k = kuukanNamed(doc(), '書斎').id;
    expect(item(doc(), 'ノートPC').place).toBe(areaNamed(doc(), k, 'エリア2').id);
    expect(doc().drawing.items.some(d => d.item === id)).toBe(false);
    expect(h.app.state.detail).toBe(id);
  });
  it('SC-01-8 配置モードで長方形の描画を付ける → 中心は右のエリアの中。置き場と更新日時は変わらず、ずれなし', () => {
    before = doc();
    h.app.setPlacing(true);
    expect(h.app.state.view?.placing).toBe(true);
    const pc = item(before, 'ノートPC');
    const r = h.app.tryApply((d, ctx) => setItemDrawing(d, pc.id, { shape: { type: 'rect', x: 6000, y: 3000, w: 3000, h: 4000 } }, ctx));
    expect(r.ok).toBe(true);
    const drawing = doc().drawing.items.find(d => d.item === pc.id)!;
    const [cx] = shapeCenter(drawing.shape);
    expect(cx).toBeGreaterThan(5000);
    expect(item(doc(), 'ノートPC').place).toBe(pc.place);
    expect(item(doc(), 'ノートPC').updatedAt).toBe(pc.updatedAt);
    expect(drawingOffset(doc(), pc.id)).toEqual({ kind: 'ok' });
  });
  it('SC-01-9 「元に戻す」 → 描画だけが消え、ノートPC と置き場は残る', async () => {
    h.app.undo();
    const pc = item(doc(), 'ノートPC');
    expect(doc().drawing.items.some(d => d.item === pc.id)).toBe(false);
    expect(pc.place).toBe(item(before, 'ノートPC').place);
    await healthy(h);
  });
});

describe('SC-02 部屋に棚を置き、棚を収納にして段に分け、段にモノを入れる', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  let shelf = '';
  const roomA = () => kuukanNamed(doc(), 'Room A').id;

  it('SC-02-1 見本を開き、Room A を開く', async () => {
    await h.app.openFile();
    h.app.openView(roomA());
    expect(h.app.state.view?.kuukan).toBe(roomA());
  });
  it('SC-02-2 「本棚」を追加 → 置き場は Room A そのもの、詳細が開く', () => {
    shelf = h.app.addItemInView('本棚')!;
    expect(item(doc(), '本棚').place).toBe(roomA());
    expect(h.app.state.detail).toBe(shelf);
  });
  it('SC-02-3 「収納として設定する」 → 収納の下書き（長方形）。文書はまだ変わらない', () => {
    h.app.openDraft({ kind: 'storage', item: shelf });
    const draft = draftOf(h);
    expect(draft.doc.membership.kuukans.find(k => k.id === draft.kuukan)!.owner).toBe(shelf);
    expect(draft.doc.drawing.kuukans.find(d => d.kuukan === draft.kuukan)!.outline).toHaveLength(4);
    expect(ownedBy(doc(), shelf)).toBeUndefined();
  });
  it('SC-02-4 呼び名を「段」にし、全体を上下に3等分 → 段1・段2・段3', () => {
    const k = draftOf(h).kuukan;
    h.app.editorApply(d => setAreaLabel(d, k, '段'));
    h.app.editorApply((d, ctx) => splitEven(d, k, 'y', 3, ctx));
    expect(areasOf(draftOf(h).doc, k).map(a => a.name)).toEqual(['段1', '段2', '段3']);
  });
  it('SC-02-5 「確定する」 → 本棚が収納（名前なし、IDは同じ、段1〜段3）', () => {
    h.app.requestConfirmDraft('create');
    const k = ownedBy(doc(), shelf)!;
    expect(k.name).toBeUndefined();
    expect(item(doc(), '本棚').id).toBe(shelf);
    expect(areasOf(doc(), k.id).map(a => a.name)).toEqual(['段1', '段2', '段3']);
  });
  it('SC-02-6 編集を出る → Room A のクウカンビュー。本棚は収納として並ぶ', () => {
    h.app.leaveEditor();
    expect(h.app.state.screen).toBe('view');
    expect(h.app.state.view?.kuukan).toBe(roomA());
    expect(itemsInScope(doc(), roomA(), null).map(i => i.name)).toContain('本棚');
  });
  it('SC-02-7 本棚を開く → 経路は Room A › 本棚', () => {
    const k = ownedBy(doc(), shelf)!.id;
    h.app.openView(k);
    expect(kuukanTrail(doc(), k).map(t => t.name)).toEqual(['Room A', '本棚']);
  });
  it('SC-02-8 段2 を選んで「辞書」を追加 → 置き場は段2', () => {
    const k = ownedBy(doc(), shelf)!.id;
    h.app.selectViewArea(areaNamed(doc(), k, '段2').id);
    h.app.addItemInView('辞書');
    expect(item(doc(), '辞書').place).toBe(areaNamed(doc(), k, '段2').id);
  });
  it('SC-02-9 経路の「Room A」 → 本棚はあり、辞書はない', async () => {
    const k = ownedBy(doc(), shelf)!.id;
    const via = kuukanTrail(doc(), k)[0]!;
    h.app.openView(via.kuukan, { area: via.via !== via.kuukan ? via.via : null });
    const names = itemsInScope(doc(), roomA(), null).map(i => i.name);
    expect(names).toContain('本棚');
    expect(names).not.toContain('辞書');
    await healthy(h);
  });
});

describe('SC-03 サガシモノで探して、そのモノの場所を開く', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  const results = () => searchItems(doc(), h.app.state.query).map(i => i.name).sort();

  it('SC-03-1 見本を開き、サガシモノへ', async () => {
    await h.app.openFile();
    h.app.setScreen('search');
    expect(h.app.state.screen).toBe('search');
  });
  it('SC-03-2 「電池」 → 単3電池・単4電池・懐中電灯の3件', () => {
    h.app.setQuery({ text: '電池' });
    expect(results()).toEqual(['単3電池', '単4電池', '懐中電灯'].sort());
  });
  it('SC-03-3 「単３」（全角） → 単3電池と懐中電灯の2件', () => {
    h.app.setQuery({ text: '単３' });
    expect(results()).toEqual(['単3電池', '懐中電灯'].sort());
  });
  it('SC-03-4 単3電池を「クウカンで見る」 → BOX1 のビュー。文字は単3電池、フォーカス、経路は Room A › 棚A1 › BOX1', async () => {
    const denchi = item(doc(), '単3電池');
    h.app.showInView(denchi.id);
    const boxK = ownedBy(doc(), item(doc(), 'BOX1').id)!.id;
    expect(h.app.state.view).toMatchObject({ kuukan: boxK, quick: '単3電池', focus: denchi.id });
    expect(kuukanTrail(doc(), boxK).map(t => t.name)).toEqual(['Room A', '棚A1', 'BOX1']);
    await healthy(h);
  });
});

describe('SC-04 確定したクウカンの仕切りを消して、中身が親へ移る', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  let before: ArekokoDocument;
  let tanaK = '';

  it('SC-04-1 棚A1 を開いて「編集」', async () => {
    await h.app.openFile();
    before = doc();
    tanaK = ownedBy(before, item(before, '棚A1').id)!.id;
    h.app.openView(tanaK);
    h.app.openKuukanEditor(tanaK);
    expect(h.app.state.editor).toEqual({ kind: 'kuukan', kuukan: tanaK });
  });
  it('SC-04-3 段1 と段2 の間の線を消す → 確認に段1 の BOX1・段2 の懐中電灯が棚A1 へ。文書はまだ変わらない', () => {
    h.app.requestDeleteLine(tanaK, 0, 'line');
    const d = confirmDialog(h);
    expect(d.details).toHaveLength(2);
    expect(d.details.some(x => /段1 から 1件（BOX1）→ (.* › )?棚A1$/.test(x))).toBe(true);
    expect(d.details.some(x => /段2 から 1件（懐中電灯）→ (.* › )?棚A1$/.test(x))).toBe(true);
    expect(doc()).toBe(before);
  });
  it('SC-04-4 確認で消す → 段3・段4、BOX1・懐中電灯は棚A1 へ移る、BOX1 の中身は残る、修復メモなし', () => {
    confirmDialog(h).onConfirm();
    expect(areasOf(doc(), tanaK).map(a => a.name).sort()).toEqual(['段3', '段4']);
    const box = item(doc(), 'BOX1');
    const light = item(doc(), '懐中電灯');
    expect([box.place, light.place]).toEqual([tanaK, tanaK]);
    expect(item(doc(), '単3電池').place).toBe(ownedBy(doc(), box.id)!.id);
    expect(box.notices).toBeUndefined();
    expect(light.notices).toBeUndefined();
  });
  it('SC-04-5 「元に戻す」 → 元どおり', async () => {
    h.app.undo();
    expect(areasOf(doc(), tanaK).map(a => a.name)).toEqual(['段1', '段2', '段3']);
    expect(item(doc(), 'BOX1').place).toBe(item(before, 'BOX1').place);
    expect(item(doc(), '懐中電灯').place).toBe(item(before, '懐中電灯').place);
    await healthy(h);
  });
});

describe('SC-05 複製した下書きで作り直し、元と置き換える', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  let before: ArekokoDocument;
  let tanaK = '';

  it('SC-05-1 棚A1 を複製 → 段1〜段3 の下書き。文書は変わらない', async () => {
    await h.app.openFile();
    before = doc();
    tanaK = ownedBy(before, item(before, '棚A1').id)!.id;
    h.app.openDraft({ kind: 'duplicate', source: tanaK });
    expect(areasOf(draftOf(h).doc, tanaK).map(a => a.name)).toEqual(['段1', '段2', '段3']);
    expect(doc()).toBe(before);
  });
  it('SC-05-2 下書きで段2 と段3 の間の線を消す → 確認なし。段1・段4。文書は変わらない', () => {
    h.app.requestDeleteLine(tanaK, 1, 'line');
    expect(h.app.state.dialog).toBeNull();
    expect(areasOf(draftOf(h).doc, tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    expect(doc()).toBe(before);
  });
  it('SC-05-3 確定の方法は「元を残す」と「元と置き換える」', () => {
    expect(confirmModes(draftOf(h))).toEqual(['keep', 'replace']);
  });
  it('SC-05-4 「元と置き換える」 → 確認に消えるエリア（段2・段3）と、段2 の懐中電灯が棚A1 へ。置き換えた後は元に戻せないと出る。文書はまだ変わらない', () => {
    h.app.requestConfirmDraft('replace');
    const d = confirmDialog(h);
    expect(d.details.some(x => x.includes('段2') && x.includes('消える'))).toBe(true);
    expect(d.details.some(x => x.includes('段3') && x.includes('消える'))).toBe(true);
    expect(d.message).toContain('元に戻す');
    expect(d.details.some(x => /段2 から 1件（懐中電灯）→ (.* › )?棚A1$/.test(x))).toBe(true);
    expect(doc()).toBe(before);
  });
  it('SC-05-5 置き換える → 棚A1 と段1 のIDは同じ。段1・段4。懐中電灯は棚A1 へ移る。BOX1 は段1', () => {
    confirmDialog(h).onConfirm();
    expect(ownedBy(doc(), item(doc(), '棚A1').id)!.id).toBe(tanaK);
    const dan1 = areaNamed(before, tanaK, '段1').id;
    expect(areaNamed(doc(), tanaK, '段1').id).toBe(dan1);
    expect(areasOf(doc(), tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    expect(item(doc(), '懐中電灯').place).toBe(tanaK);
    expect(item(doc(), 'BOX1').place).toBe(dan1);
  });
  it('SC-05-6 「元に戻す」 → 確定は取り消されない（段1・段4 のまま。懐中電灯は棚A1）', async () => {
    h.app.undo();
    expect(areasOf(doc(), tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    expect(item(doc(), '懐中電灯').place).toBe(tanaK);
    await healthy(h);
  });
});

describe('SC-06 壊れたファイルを開いて、修復を承認する', () => {
  const broken = sampleDocument();
  broken.membership.items.push(
    { id: '01900000-0000-7000-8000-00000000a001', name: '迷子の傘', place: '01900000-0000-7000-8000-00000000a999', category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'new:メモ帳', name: 'メモ帳', place: NIL_ID, category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
  );
  const brokenText = JSON.stringify(broken);
  const h = makeApp({ file: new MemoryFile({ name: '壊れた.json', text: brokenText }) });
  const doc = () => h.app.state.doc!;

  it('SC-06-1 開く → 修復案の一覧（迷子の傘を未設定へ、メモ帳の仮IDを付け替え）', async () => {
    await h.app.openFile();
    const d = h.app.state.dialog;
    if (d?.kind !== 'repair') throw new Error('修復の確認が出ていない');
    expect(d.repairs).toHaveLength(2);
    expect(d.repairs.find(r => r.code === 'placeMissing')?.message).toContain('迷子の傘');
    expect(d.repairs.find(r => r.code === 'tempId')?.message).toContain('new:メモ帳');
  });
  it('SC-06-2 「読み込まない」 → 最初の画面のまま、ファイルは書かれない', async () => {
    h.app.rejectRepair();
    await h.clock.advance(1000);
    expect(h.app.state.screen).toBe('start');
    expect(h.file.writes).toBe(0);
    expect(h.file.text).toBe(brokenText);
  });
  it('SC-06-3 もう一度開いて「直して読み込む」 → 一覧。迷子の傘は未設定、メモ帳は v7。ファイルに書かれる', async () => {
    await h.app.openFile();
    h.app.approveRepair();
    expect(h.app.state.screen).toBe('kuukans');
    expect(item(doc(), '迷子の傘').place).toBe(NIL_ID);
    expect(item(doc(), 'メモ帳').id).toMatch(UUID_V7);
    await healthy(h);
  });
  it('SC-06-4 迷子の傘に修復メモが付いている', () => {
    const notices = item(doc(), '迷子の傘').notices ?? [];
    expect(notices).toHaveLength(1);
    expect(notices[0]!.text).toMatch(/置き場の参照先が見つからなかったため.*未設定へ移しました/);
  });
  it('SC-06-5 修復メモを消す → ファイルからも消える', async () => {
    const id = item(doc(), '迷子の傘').id;
    h.app.apply(d => removeNotice(d, 'item', id, 0));
    await healthy(h);
    expect(item(JSON.parse(h.file.text), '迷子の傘').notices).toBeUndefined();
  });
});

describe.each(['overwrite', 'reload'] as const)('SC-07 外で変更されたファイルに対処する（%s）', choice => {
  const h = makeApp({ file: sampleFile() });
  const names = () => (JSON.parse(h.file.text) as ArekokoDocument).membership.items.map(i => i.name);

  beforeAll(async () => {
    await h.app.openFile();
    h.app.openView(NIL_ID);
  });
  it('SC-07-1 未設定に「メモ1」 → 約1秒後にファイルに書かれ「保存済み」', async () => {
    h.app.addItemInView('メモ1');
    await h.clock.advance(1000);
    expect(h.app.state.saveStatus).toBe('saved');
    expect(names()).toContain('メモ1');
  });
  it('SC-07-2 外で変わった後に「メモ2」 → 書かれず、外での変更を知らせる', async () => {
    h.file.lastModified += 1000;
    h.app.addItemInView('メモ2');
    await h.clock.advance(1000);
    expect(h.app.state.dialog?.kind).toBe('conflict');
    expect(names()).not.toContain('メモ2');
  });
  it(`SC-07-3 ${choice === 'overwrite' ? '「それでも上書きする」 → メモ2 が書かれる' : '「読み込み直す」 → メモ2 は捨てられる'}`, async () => {
    await h.app.resolveConflict(choice);
    await h.clock.advance(1000);
    const docNames = h.app.state.doc!.membership.items.map(i => i.name);
    if (choice === 'overwrite') {
      expect(names()).toContain('メモ2');
      expect(h.app.state.saveStatus).toBe('saved');
    } else {
      expect(docNames).toContain('メモ1');
      expect(docNames).not.toContain('メモ2');
    }
    expectHealthy(h.app, h.file);
  });
});

describe('SC-08 タグを作ってモノに付け、絞り込み、消す', () => {
  const h = makeApp({ file: sampleFile() });
  const doc = () => h.app.state.doc!;
  let tag = '';

  it('SC-08-1 サガシモノで延長コードの詳細 → タグなし', async () => {
    await h.app.openFile();
    h.app.setScreen('search');
    const cord = item(doc(), '延長コード');
    h.app.showDetail(cord.id);
    expect(h.app.state.detail).toBe(cord.id);
    expect(cord.tags).toEqual([]);
  });
  it('SC-08-3 新しいタグ「電源まわり」を作って付ける', () => {
    // 作る候補を選んだときに画面がすること（TagPicker の作成 → 詳細の付ける）
    tag = h.app.apply((d, ctx) => createTag(d, { name: '電源まわり' }, ctx))!.created[0]!;
    h.app.apply((d, ctx) => addTagToItems(d, [item(d, '延長コード').id], tag, ctx));
    expect(item(doc(), '延長コード').tags).toEqual([tag]);
  });
  it('SC-08-4 絞り込みでタグ「電源まわり」 → 延長コードだけ', () => {
    h.app.setQuery({ tags: { ids: [tag], mode: 'all' } });
    expect(searchItems(doc(), h.app.state.query).map(i => i.name)).toEqual(['延長コード']);
  });
  it('SC-08-5 タグを消す → 確認に付いている件数（1件）', () => {
    h.app.setScreen('manage');
    h.app.requestDeleteTag(tag);
    const d = confirmDialog(h);
    expect(d.message).toContain('電源まわり');
    expect(d.message).toContain('1件');
  });
  it('SC-08-6 確認で消す → タグがなくなり、延長コードからも外れる', async () => {
    confirmDialog(h).onConfirm();
    expect(doc().membership.tags.some(t => t.id === tag)).toBe(false);
    expect(item(doc(), '延長コード').tags).toEqual([]);
    await healthy(h);
  });
});
