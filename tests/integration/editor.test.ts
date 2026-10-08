// 結合試験：クウカン編集（段階5）。設計 13章の終わりの目安「部屋と棚を描いて確定し、複製して置き換えられる」と、
// 詳細設計 段階5 の E1〜E6・7章を、AppStore の公開の操作で確かめる。

import { describe, expect, it } from 'vitest';
import { makeApp, expectHealthy, expectOnlyMoved } from './harness';
import type { ConfirmDialog } from '../../src/app/store';
import type { Point } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { splitAt, deleteLine, renameArea } from '../../src/core/ops/areas';
import { addItem } from '../../src/core/ops/items';
import { addMarker } from '../../src/core/ops/markers';
import { setRealSize } from '../../src/core/ops/kuukanDrawing';
import { moveEdge, addStep } from '../../src/editor/outline';
import { removeDraftOutline } from '../../src/editor/draft';
import { validateKuukanDrawing } from '../../src/core/validate';

function draftOf(app: ReturnType<typeof makeApp>['app']) {
  const ed = app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開いていない');
  return ed.draft;
}
function outlineOf(app: ReturnType<typeof makeApp>['app']): Point[] {
  return draftOf(app).doc.drawing.kuukans[0]!.outline;
}
/** 縦の辺のうち x が value のものの番号 */
function verticalEdgeAt(outline: Point[], x: number): number {
  return outline.findIndex((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    return p[0] === x && q[0] === x;
  });
}

describe('結合試験: クウカン編集 (段階5)', () => {
  it('E-S: 部屋と棚を描いて確定し、複製して置き換えられる（設計 13章 段階5）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    // 1. 部屋：6畳間のテンプレートから。仕切りを1本入れて確定
    app.openDraft({ kind: 'template', template: 'room6' });
    expect(app.state.screen).toBe('editor');
    const roomDraft = draftOf(app);
    app.draftApply((d, ctx) => splitAt(d, roomDraft.kuukan, 'x', [5000, 5000], ctx));
    expect(file.writes).toBe(1); // 下書きの間は文書に入らない（設計 4章「下書き」）
    app.confirmDraft('create');
    const room = app.state.editor?.kind === 'kuukan' ? app.state.editor.kuukan : '';
    expect(room).toBe(roomDraft.kuukan);
    await clock.advance(1000);
    expect(file.json().membership.kuukans.some((k: { id: string; name: string }) => k.id === room && k.name === '6畳間')).toBe(true);

    // 2. 棚：3段の棚のテンプレートから確定し、段2 にモノを置く
    app.openDraft({ kind: 'template', template: 'shelf3' });
    const shelfDraft = draftOf(app);
    app.confirmDraft('create');
    const shelf = shelfDraft.kuukan;
    const doc1 = app.state.doc!;
    const dan = doc1.membership.areas.filter(a => a.kuukan === shelf).sort((a, b) => a.order - b.order);
    expect(dan.map(a => a.name)).toEqual(['段1', '段2', '段3']);
    const item = app.apply((d, ctx) => addItem(d, { name: '工具箱', place: dan[1]!.id }, ctx))!.created[0]!;

    // 3. 複製して、下書きで段1と段2の間の線を消し、置き換える（影響を見せる）
    app.openDraft({ kind: 'duplicate', source: shelf });
    app.draftApply((d, ctx) => deleteLine(d, shelf, 0, ctx));
    const plan = app.planDraftConfirm('replace')!;
    expect(new Set(plan.removedAreas)).toEqual(new Set([dan[0]!.id, dan[1]!.id]));
    expect(plan.relocations).toEqual([{ from: dan[1]!.id, to: shelf, items: [item] }]);
    const before = app.state.doc!;
    app.confirmDraft('replace');
    const after = app.state.doc!;
    expectOnlyMoved(before, after, [item]);
    expect(after.membership.items.find(i => i.id === item)!.place).toBe(shelf);
    expect(app.state.highlights.has(item)).toBe(true);
    expect(after.membership.areas.some(a => a.id === dan[2]!.id)).toBe(true); // 残ったエリアのIDは引き継ぐ
    expect(app.state.editor).toEqual({ kind: 'kuukan', kuukan: shelf });

    await clock.advance(1000);
    expectHealthy(app, file);

    // 4. 置き換えは元に戻せる
    app.undo();
    expect(app.state.doc!.membership.items.find(i => i.id === item)!.place).toBe(dan[1]!.id);
  });

  it('E-K: 複製して元を残すと、IDの新しい「〇〇のコピー」ができ、元は変わらない（E5）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();
    app.openDraft({ kind: 'template', template: 'chest4' });
    const chest = draftOf(app).kuukan;
    app.confirmDraft('create');
    const before = app.state.doc!;

    app.openDraft({ kind: 'duplicate', source: chest });
    app.confirmDraft('keep');
    const after = app.state.doc!;
    const copyId = app.state.editor?.kind === 'kuukan' ? app.state.editor.kuukan : '';
    expect(copyId).not.toBe(chest);
    expect(after.membership.kuukans.find(k => k.id === copyId)!.name).toBe('4段のチェストのコピー');
    const origAreas = new Set(before.membership.areas.filter(a => a.kuukan === chest).map(a => a.id));
    const copyAreas = after.membership.areas.filter(a => a.kuukan === copyId);
    expect(copyAreas).toHaveLength(4);
    expect(copyAreas.some(a => origAreas.has(a.id))).toBe(false);
    // 元のクウカンは同じまま
    expect(after.membership.areas.filter(a => a.kuukan === chest)).toEqual(before.membership.areas.filter(a => a.kuukan === chest));
    expect(validateKuukanDrawing(after, copyId).ok).toBe(true);
    await clock.advance(1000);
    expectHealthy(app, file);
  });

  it('E1: 外形は、辺を動かす・段差を足すで描ける（いつも正しい直角の多角形）', async () => {
    const { app } = makeApp();
    await app.newDocument();
    app.openDraft({ kind: 'new' }, { name: 'リビング' });
    const o0 = outlineOf(app);
    // 右の辺を外へ広げる → 外接長方形が付け直される（0〜10000 のまま）、aspect が増える
    const aspect0 = draftOf(app).doc.drawing.kuukans[0]!.aspect;
    expect(app.draftSetOutline(moveEdge(o0, verticalEdgeAt(o0, 10000), 5000)!)).toBe(true);
    const kd1 = draftOf(app).doc.drawing.kuukans[0]!;
    expect(Math.max(...kd1.outline.map(p => p[0]))).toBe(10000);
    expect(kd1.aspect).toBeCloseTo(aspect0 * 1.5, 5);
    // 上の辺に段差 → L字
    const o1 = kd1.outline;
    const top = o1.findIndex((p, i) => p[1] === 0 && o1[(i + 1) % o1.length]![1] === 0);
    expect(app.draftSetOutline(addStep(o1, top, 6000, 4000, 'end')!)).toBe(true);
    expect(outlineOf(app)).toHaveLength(6);
  });

  it('E2: 仕切りと矛盾する外形の変更は受け付けず、理由を出す', async () => {
    const { app } = makeApp();
    await app.newDocument();
    app.openDraft({ kind: 'new' }, { name: '部屋' });
    const k = draftOf(app).kuukan;
    app.draftApply((d, ctx) => splitAt(d, k, 'x', [5000, 5000], ctx));
    const o = outlineOf(app);
    // 仕切りより左まで右の辺を動かす → 仕切りが外形の外になる
    const bad = moveEdge(o, verticalEdgeAt(o, 10000), -6000)!;
    expect(app.draftSetOutline(bad)).toBe(false);
    expect(app.state.toast?.kind).toBe('error');
    expect(outlineOf(app)).toEqual(o);
    // 矛盾しない変更（右へ広げる）は通る
    expect(app.draftSetOutline(moveEdge(o, verticalEdgeAt(o, 10000), 2000)!)).toBe(true);
  });

  it('E6: 下書きには独自の元に戻す・やり直す。文書の履歴とは別', async () => {
    const { app, file } = makeApp();
    await app.newDocument();
    app.apply((d, ctx) => addItem(d, { name: '前からあるモノ', place: NIL_ID }, ctx));
    app.openDraft({ kind: 'template', template: 'room6' });
    const k = draftOf(app).kuukan;
    app.draftApply((d, ctx) => splitAt(d, k, 'y', [5000, 5000], ctx));
    expect(app.state.editor?.kind === 'draft' && app.state.editor.canUndo).toBe(true);
    app.undo(); // 下書きの履歴に効く
    expect(draftOf(app).doc.membership.areas).toHaveLength(0);
    app.redo();
    expect(draftOf(app).doc.membership.areas).toHaveLength(2);
    // 文書は変わっていない
    expect(app.state.doc!.membership.items.map(i => i.name)).toEqual(['前からあるモノ']);
    expect(file.writes).toBe(1);
  });

  it('取り消すと何も変わらない。下書きを開いたまま画面を変えると、捨てるか確認する', async () => {
    const { app } = makeApp();
    await app.newDocument();
    app.setScreen('kuukans');
    const before = app.state.doc;
    app.openDraft({ kind: 'template', template: 'livingL' });
    app.cancelDraft();
    expect(app.state.doc).toBe(before);
    expect(app.state.screen).toBe('kuukans');
    expect(app.state.editor).toBeNull();

    app.openDraft({ kind: 'template', template: 'livingL' });
    app.setScreen('search');
    expect(app.state.dialog?.kind).toBe('confirm');
    expect(app.state.screen).toBe('editor');
    (app.state.dialog as ConfirmDialog).onConfirm();
    expect(app.state.screen).toBe('search');
    expect(app.state.doc).toBe(before);
  });

  it('収納として設定する：下書きで開き、確定すると収納になる。外形を外して確定すると描画なしの収納（設計 7.5）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();
    const box = app.apply((d, ctx) => addItem(d, { name: '道具箱' }, ctx))!.created[0]!;
    const bag = app.apply((d, ctx) => addItem(d, { name: '紙袋' }, ctx))!.created[0]!;

    app.openDraft({ kind: 'storage', item: box });
    app.confirmDraft('create');
    const boxK = app.state.doc!.membership.kuukans.find(k => k.owner === box)!;
    expect(boxK.name).toBeUndefined(); // 収納のクウカンは名前を持たない（D3）
    expect(app.state.doc!.drawing.kuukans.some(kd => kd.kuukan === boxK.id)).toBe(true);

    app.openDraft({ kind: 'storage', item: bag });
    expect(app.draftReplace(removeDraftOutline(draftOf(app)))).toBe(true);
    app.confirmDraft('create');
    const bagK = app.state.doc!.membership.kuukans.find(k => k.owner === bag)!;
    expect(app.state.doc!.drawing.kuukans.some(kd => kd.kuukan === bagK.id)).toBe(false);

    await clock.advance(1000);
    expectHealthy(app, file);
  });

  it('確定したクウカンの編集：仕切り・マーカー・名前・実際の長さは文書の履歴で、表示するクウカンが変わると履歴が消える', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();
    app.openDraft({ kind: 'template', template: 'room6' });
    const room = draftOf(app).kuukan;
    app.confirmDraft('create');
    app.openKuukanEditor(room);
    expect(app.state.canUndo).toBe(false); // 表示するクウカンが変わったので履歴は消える

    const sp = app.apply((d, ctx) => splitAt(d, room, 'x', [3000, 5000], ctx))!;
    app.apply(d => renameArea(d, sp.created[0]!, '窓側'));
    app.apply((d, ctx) => addMarker(d, room, { name: '柱', shape: { type: 'rect', x: 100, y: 100, w: 400, h: 400 }, notAPlace: true }, ctx));
    app.apply(d => setRealSize(d, room, { w: 400, d: 300 }));
    expect(app.state.canUndo).toBe(true);
    await clock.advance(1000);
    const saved = file.json();
    expect(saved.membership.areas.some((a: { name: string }) => a.name === '窓側')).toBe(true);
    expect(saved.drawing.kuukans.find((kd: { kuukan: string }) => kd.kuukan === room).aspect).toBeCloseTo(4 / 3, 5);
    expectHealthy(app, file);

    app.leaveEditor();
    expect(app.state.screen).not.toBe('editor');
    expect(app.state.canUndo).toBe(false);
  });
});
