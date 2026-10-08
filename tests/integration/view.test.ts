// 結合試験：クウカンビュー（段階6）。設計 13章の終わりの目安「最初のスケッチ（Room A → 棚A1 → BOX1）を
// 再現して、行き来できる」と、詳細設計 段階6 の 0章・2章・4章・5章を、AppStore の公開の操作で確かめる。

import { describe, expect, it } from 'vitest';
import { makeApp, expectHealthy } from './harness';
import type { AppStore } from '../../src/app/store';
import type { Id } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { addItem, moveItems } from '../../src/core/ops/items';
import { renameKuukan } from '../../src/core/ops/kuukans';
import { splitAt, splitEven } from '../../src/core/ops/areas';
import { addMarker } from '../../src/core/ops/markers';
import {
  setItemDrawing,
  moveItemDrawing,
  rotateItemDrawing,
} from '../../src/core/ops/itemDrawings';
import { removeDraftOutline } from '../../src/editor/draft';
import {
  itemsInScope,
  undrawnCounts,
  drawingOffset,
  offsetText,
  quickSearch,
  kuukanTrail,
} from '../../src/view/model';

function draftKuukan(app: AppStore): Id {
  const ed = app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開いていない');
  return ed.draft.kuukan;
}
function areasOf(app: AppStore, kuukan: Id) {
  return app.state.doc!.membership.areas.filter(a => a.kuukan === kuukan).sort((a, b) => a.order - b.order);
}
function kuukanOwnedBy(app: AppStore, item: Id): Id {
  return app.state.doc!.membership.kuukans.find(k => k.owner === item)!.id;
}
function add(app: AppStore, name: string, place: Id): Id {
  return app.apply((d, ctx) => addItem(d, { name, place }, ctx))!.created[0]!;
}

/** 最初のスケッチ：Room A（6畳間を床1・床2に分ける）→ 棚A1（2段の収納）→ BOX1（描画なしの収納）→ 単3電池 */
async function sketch() {
  const h = makeApp();
  const { app } = h;
  await app.newDocument();

  app.openDraft({ kind: 'template', template: 'room6' });
  const roomA = draftKuukan(app);
  app.confirmDraft('create');
  app.apply(d => renameKuukan(d, roomA, 'Room A'));
  app.apply((d, ctx) => splitAt(d, roomA, 'x', [5000, 5000], ctx));
  const [yuka1, yuka2] = areasOf(app, roomA);

  const tana = add(app, '棚A1', roomA);
  app.openDraft({ kind: 'storage', item: tana });
  app.confirmDraft('create');
  const tanaK = kuukanOwnedBy(app, tana);
  app.apply((d, ctx) => splitEven(d, tanaK, 'y', 2, ctx));
  const [dan1, dan2] = areasOf(app, tanaK);

  const box = add(app, 'BOX1', dan1!.id);
  app.openDraft({ kind: 'storage', item: box });
  const ed = app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開いていない');
  app.draftReplace(removeDraftOutline(ed.draft));
  app.confirmDraft('create');
  const boxK = kuukanOwnedBy(app, box);
  const denchi = add(app, '単3電池', boxK);

  app.setScreen('kuukans');
  return { ...h, roomA, yuka1: yuka1!.id, yuka2: yuka2!.id, tana, tanaK, dan1: dan1!.id, dan2: dan2!.id, box, boxK, denchi };
}

describe('結合試験: クウカンビュー (段階6)', () => {
  it('V-1: 文書を開いた・新しく作った直後はクウカンの一覧', async () => {
    const { app, file } = makeApp();
    await app.newDocument();
    expect(app.state.screen).toBe('kuukans');
    await app.closeDocument();
    await app.openFile();
    expect(app.state.screen).toBe('kuukans');
    expect(file.writes).toBeGreaterThan(0);
  });

  it('V-S: 一覧 → Room A → 棚A1 → BOX1 と開き、経路で戻れる。各画面の範囲のモノが置き場どおり', async () => {
    const s = await sketch();
    const { app } = s;
    const doc = () => app.state.doc!;

    app.openView(s.roomA);
    expect(kuukanTrail(doc(), s.roomA).map(t => t.name)).toEqual(['Room A']);
    expect(itemsInScope(doc(), s.roomA, null).map(i => i.name)).toEqual(['棚A1']);

    // 棚A1 の「開く」
    app.openView(s.tanaK);
    expect(kuukanTrail(doc(), s.tanaK)).toEqual([
      { kuukan: s.roomA, name: 'Room A', via: s.roomA },
      { kuukan: s.tanaK, name: '棚A1', via: null },
    ]);
    expect(itemsInScope(doc(), s.tanaK, null).map(i => i.name)).toEqual(['BOX1']);
    expect(itemsInScope(doc(), s.tanaK, s.dan2)).toEqual([]);

    // BOX1 の「開く」（描画なしの収納）
    app.openView(s.boxK);
    const trail = kuukanTrail(doc(), s.boxK);
    expect(trail.map(t => t.name)).toEqual(['Room A', '棚A1', 'BOX1']);
    expect(trail[1]!.via).toBe(s.dan1);
    expect(itemsInScope(doc(), s.boxK, null).map(i => i.name)).toEqual(['単3電池']);

    // 経路の「棚A1」で戻ると、BOX1 のある段1 を選んだ状態
    const back = trail[1]!;
    app.openView(back.kuukan, { area: back.via !== back.kuukan ? back.via : null });
    expect(app.state.view).toMatchObject({ kuukan: s.tanaK, area: s.dan1 });
    expect(itemsInScope(doc(), s.tanaK, s.dan1).map(i => i.name)).toEqual(['BOX1']);

    // 未設定も同じ画面で開ける
    app.openView(NIL_ID);
    expect(kuukanTrail(doc(), NIL_ID)).toEqual([{ kuukan: NIL_ID, name: '未設定', via: null }]);
    expectHealthy(app, s.file);
  });

  it('V-A: クウカンビューで追加したモノの置き場は、選んだエリア（なければクウカン）。未設定のクウカンなら未設定', async () => {
    const s = await sketch();
    const { app } = s;
    // ItemList の「＋モノを追加」と同じ置き場の決め方
    const addFromView = (name: string) => {
      const v = app.state.view!;
      return add(app, name, v.area ?? v.kuukan);
    };
    app.openView(s.tanaK);
    const a = addFromView('ドライバー');
    app.selectViewArea(s.dan2);
    const b = addFromView('六角レンチ');
    app.openView(NIL_ID);
    const c = addFromView('メモ');
    const place = (id: Id) => app.state.doc!.membership.items.find(i => i.id === id)!.place;
    expect(place(a)).toBe(s.tanaK);
    expect(place(b)).toBe(s.dan2);
    expect(place(c)).toBe(NIL_ID);
    expectHealthy(app, s.file);
  });

  it('V-C: 件数は描画していないモノだけ。途中のエリアに直接置いたモノのキーは途中のエリア', async () => {
    const s = await sketch();
    const { app } = s;
    add(app, 'ほうき', s.yuka1);
    add(app, 'ちりとり', s.yuka1);
    const lamp = add(app, 'スタンド', s.yuka2);
    expect(undrawnCounts(app.state.doc!, s.roomA)).toEqual(new Map([[s.roomA, 1], [s.yuka1, 2], [s.yuka2, 1]]));

    // 棚A1 と スタンド を描くと数えない
    app.apply((d, ctx) => setItemDrawing(d, s.tana, { shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 } }, ctx));
    app.apply((d, ctx) => setItemDrawing(d, lamp, { shape: { type: 'point', at: [7500, 5000] } }, ctx));
    expect(undrawnCounts(app.state.doc!, s.roomA)).toEqual(new Map([[s.yuka1, 2]]));

    // 床1 をさらに分けると、床1 は途中のエリアになり、ほうき・ちりとりの件数のキーは床1 のまま
    app.apply((d, ctx) => splitAt(d, s.roomA, 'y', [2500, 5000], ctx)); // 床1 の中の点
    expect(areasOf(app, s.roomA).some(a => a.parent === s.yuka1)).toBe(true);
    expect(undrawnCounts(app.state.doc!, s.roomA).get(s.yuka1)).toBe(2);
    expectHealthy(app, s.file);
  });

  it('V-O: ずれ。別の葉なら「…の上にあります」、外形の外なら「クウカンの外」。回転しても同じ。線の上は接する葉', async () => {
    const s = await sketch();
    const { app } = s;
    const doc = () => app.state.doc!;
    const broom = add(app, 'ほうき', s.yuka1);
    app.apply((d, ctx) => setItemDrawing(d, broom, { shape: { type: 'rect', x: 1000, y: 1000, w: 1000, h: 1000 } }, ctx));
    expect(drawingOffset(doc(), broom)).toEqual({ kind: 'ok' });

    app.apply(d => moveItemDrawing(d, broom, 5000, 0));
    const off = drawingOffset(doc(), broom)!;
    expect(off).toEqual({ kind: 'off', drawnIn: s.yuka2 });
    expect(offsetText(doc(), broom, off)).toBe('所属：床1（描画は床2の上にあります）');

    app.apply(d => rotateItemDrawing(d, broom, 1));
    expect(drawingOffset(doc(), broom)).toEqual(off);

    app.apply(d => moveItemDrawing(d, broom, 9000, 0));
    const outside = drawingOffset(doc(), broom)!;
    expect(outside).toEqual({ kind: 'off', drawnIn: null });
    expect(offsetText(doc(), broom, outside)).toBe('所属：床1（描画はクウカンの外にあります）');

    // 中心が仕切りの線の上（x = 5000）：床1 の辺の上なので ok
    app.apply((d, ctx) => setItemDrawing(d, broom, { shape: { type: 'point', at: [5000, 3000] } }, ctx));
    expect(drawingOffset(doc(), broom)).toEqual({ kind: 'ok' });

    // クウカンそのものに置いたモノは、外形の内側なら ok
    app.apply((d, ctx) => moveItems(d, [broom], s.roomA, ctx));
    expect(drawingOffset(doc(), broom)).toEqual({ kind: 'ok' });
    expectHealthy(app, s.file);
  });

  it('V-N: マーカーは目印だけ。古い文書の notAPlace: true のマーカーの上にも描画を置け、動かせる（2026-10-08 に「置き場にしない」をなくした）', async () => {
    const s = await sketch();
    const { app } = s;
    app.apply((d, ctx) => addMarker(d, s.roomA, { name: '柱', shape: { type: 'rect', x: 4000, y: 4000, w: 1000, h: 2000 }, notAPlace: true }, ctx));
    const broom = add(app, 'ほうき', s.yuka1);
    expect(app.apply((d, ctx) => setItemDrawing(d, broom, { shape: { type: 'point', at: [4500, 5000] } }, ctx))).not.toBeNull();
    expect(app.apply(d => moveItemDrawing(d, broom, 100, 0))).not.toBeNull();
    expect(app.state.doc!.drawing.items.find(d => d.item === broom)!.shape).toEqual({ type: 'point', at: [4600, 5000] });
    // 古い文書の項目は消さずに残す（知らない・使わない項目も保存で残す決まり）
    await s.clock.advance(1000);
    expect(s.file.json().drawing.markers.find((m: { name: string }) => m.name === '柱').notAPlace).toBe(true);
    expectHealthy(app, s.file);
  });

  it('V-Q: 簡易検索。直接・収納の中・入れ子の収納の中。サガシモノへ移ると条件を持っていく', async () => {
    const s = await sketch();
    const { app } = s;
    const direct = add(app, '電池ケース', s.yuka2);
    add(app, '電池チェッカー', s.dan2);

    const q = quickSearch(app.state.doc!, s.roomA, 'でんち');
    // ひらがなでは当たらない（正規化はひらがな・カタカナの違いだけを同じにする。漢字の読みは扱わない）
    expect(q.direct.size).toBe(0);

    const r = quickSearch(app.state.doc!, s.roomA, '電池');
    expect([...r.direct]).toEqual([direct]);
    // 棚A1 の中：段2 の電池チェッカー（直接）と、BOX1 の中の単3電池（入れ子）で2件
    expect(r.insideStorage).toEqual(new Map([[s.tana, 2]]));
    expect(r.perPlace).toEqual(new Map([[s.yuka2, 1], [s.roomA, 2]]));

    const inShelf = quickSearch(app.state.doc!, s.tanaK, '電池');
    expect(inShelf.insideStorage).toEqual(new Map([[s.box, 1]]));
    expect(inShelf.perPlace).toEqual(new Map([[s.dan2, 1], [s.dan1, 1]]));

    app.openView(s.roomA);
    app.setQuick('電池');
    app.searchFromView();
    expect(app.state.screen).toBe('search');
    expect(app.state.query).toEqual({ text: '電池', place: s.roomA });
  });

  it('V-F: サガシモノの結果から「クウカンで見る」で、置き場のクウカンが開き、文字とフォーカスが入る', async () => {
    const s = await sketch();
    const { app } = s;
    app.setScreen('search');
    app.showInView(s.denchi);
    expect(app.state.screen).toBe('view');
    expect(app.state.view).toEqual({ kuukan: s.boxK, area: null, quick: '単3電池', focus: s.denchi, placing: false });
    app.showInView(s.box);
    expect(app.state.view).toEqual({ kuukan: s.tanaK, area: s.dan1, quick: 'BOX1', focus: s.box, placing: false });
  });

  it('V-M: 同じクウカンの中の置き場の変更では描画が残り、別のクウカンへの変更で外れる', async () => {
    const s = await sketch();
    const { app } = s;
    const broom = add(app, 'ほうき', s.yuka1);
    app.apply((d, ctx) => setItemDrawing(d, broom, { shape: { type: 'point', at: [1000, 1000] } }, ctx));
    app.apply((d, ctx) => moveItems(d, [broom], s.yuka2, ctx));
    expect(app.state.doc!.drawing.items.some(d => d.item === broom)).toBe(true);
    app.apply((d, ctx) => moveItems(d, [broom], s.dan2, ctx));
    expect(app.state.doc!.drawing.items.some(d => d.item === broom)).toBe(false);
    expectHealthy(app, s.file);
  });

  it('V-D: 描画の操作は文書の履歴で1つずつ戻り、配置モードの入り切りでは履歴が消えない', async () => {
    const s = await sketch();
    const { app } = s;
    app.openView(s.roomA);
    app.setPlacing(true);
    app.apply((d, ctx) => setItemDrawing(d, s.tana, { shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 } }, ctx));
    app.apply(d => moveItemDrawing(d, s.tana, 1000, 0));
    app.setPlacing(false);
    expect(app.state.canUndo).toBe(true);
    app.undo();
    expect(app.state.doc!.drawing.items.find(d => d.item === s.tana)!.shape).toEqual({ type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 });
    app.undo();
    expect(app.state.doc!.drawing.items.some(d => d.item === s.tana)).toBe(false);
    // 描画だけの変更では updatedAt を変えない（詳細設計 8.1）
    expectHealthy(app, s.file);
  });
});
