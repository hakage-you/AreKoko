// AppStore のクウカンビューの状態と移動（詳細設計 段階6 5章）。

import { describe, expect, it } from 'vitest';
import { makeApp } from '../integration/harness';
import { NIL_ID } from '../../src/core/constants';
import { createKuukan, deleteKuukan } from '../../src/core/ops/kuukans';
import { addItem } from '../../src/core/ops/items';
import { splitAt } from '../../src/core/ops/areas';

async function setup() {
  const h = makeApp();
  await h.app.newDocument();
  const { app } = h;
  // 描画のあるクウカン（6畳間を確定）と、描画のないクウカン
  app.openDraft({ kind: 'template', template: 'room6' });
  const ed = app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開いていない');
  const room = ed.draft.kuukan;
  app.confirmDraft('create');
  app.apply((d, ctx) => splitAt(d, room, 'x', [5000, 5000], ctx));
  const plain = app.apply((d, ctx) => createKuukan(d, { name: '物置' }, ctx))!.created[0]!;
  const areas = app.state.doc!.membership.areas.filter(a => a.kuukan === room);
  app.setScreen('kuukans');
  return { ...h, room, plain, areas };
}

describe('AppStore: クウカンビュー', () => {
  it('openView で開き、別のクウカンに変わると履歴を消す。同じクウカンなら残す', async () => {
    const { app, room, plain, areas } = await setup();
    app.openView(room);
    expect(app.state.screen).toBe('view');
    expect(app.state.view).toEqual({ kuukan: room, area: null, quick: '', focus: null, placing: false });

    app.apply((d, ctx) => addItem(d, { name: 'ほうき', place: room }, ctx));
    expect(app.state.canUndo).toBe(true);
    app.openView(room, { area: areas[0]!.id });
    expect(app.state.canUndo).toBe(true);
    expect(app.state.view?.area).toBe(areas[0]!.id);

    app.openView(plain);
    expect(app.state.canUndo).toBe(false);
    expect(app.state.view?.kuukan).toBe(plain);
  });

  it('ほかのクウカンのエリアや、存在しないクウカンは開かない／選ばない', async () => {
    const { app, room, plain, areas } = await setup();
    app.openView(plain, { area: areas[0]!.id });
    expect(app.state.view?.area).toBeNull();
    app.openView('018f0000-0000-7000-8000-ffffffffffff');
    expect(app.state.view?.kuukan).toBe(plain);
    app.openView(room);
    app.selectViewArea(areas[1]!.id);
    expect(app.state.view?.area).toBe(areas[1]!.id);
  });

  it('setQuick はフォーカスを外す。配置モードは描画のあるクウカンでだけ入れ、履歴を消さない', async () => {
    const { app, room, plain } = await setup();
    const it1 = app.apply((d, ctx) => addItem(d, { name: 'ほうき', place: room }, ctx))!.created[0]!;
    app.showInView(it1);
    expect(app.state.view?.focus).toBe(it1);
    app.setQuick('ほう');
    expect(app.state.view?.focus).toBeNull();
    expect(app.state.view?.quick).toBe('ほう');

    app.apply((d, ctx) => addItem(d, { name: 'ちりとり', place: room }, ctx));
    app.setPlacing(true);
    expect(app.state.view?.placing).toBe(true);
    expect(app.state.canUndo).toBe(true);
    app.openView(plain);
    app.setPlacing(true);
    expect(app.state.view?.placing).toBe(false);
  });

  it('searchFromView は文字と置き場を持ってサガシモノへ', async () => {
    const { app, room } = await setup();
    app.openView(room);
    app.setQuick('  ほうき ');
    app.searchFromView();
    expect(app.state.screen).toBe('search');
    expect(app.state.query).toEqual({ text: 'ほうき', place: room });
    expect(app.state.view).toBeNull();
  });

  it('showInView：エリアのモノはそのエリアを選び、未設定のモノは未設定のクウカンを開く', async () => {
    const { app, room, areas } = await setup();
    const a = areas[1]!.id;
    const inArea = app.apply((d, ctx) => addItem(d, { name: 'はさみ', place: a }, ctx))!.created[0]!;
    const unset = app.apply((d, ctx) => addItem(d, { name: 'メモ', place: NIL_ID }, ctx))!.created[0]!;
    app.setScreen('search');
    app.showInView(inArea);
    expect(app.state.view).toEqual({ kuukan: room, area: a, quick: 'はさみ', focus: inArea, placing: false });
    app.showInView(unset);
    expect(app.state.view).toEqual({ kuukan: NIL_ID, area: null, quick: 'メモ', focus: unset, placing: false });
  });

  it('選んだエリアやフォーカスのモノが元に戻すで消えたら外す', async () => {
    const { app, room } = await setup();
    app.openView(room);
    app.apply((d, ctx) => splitAt(d, room, 'y', [2500, 2500], ctx));
    const newArea = app.state.doc!.membership.areas.filter(a => a.kuukan === room).at(-1)!.id;
    app.selectViewArea(newArea);
    const it1 = app.apply((d, ctx) => addItem(d, { name: 'ほうき', place: room }, ctx))!.created[0]!;
    app.openView(room, { quick: 'ほうき', focus: it1, area: newArea });
    app.undo(); // ほうきの追加を戻す
    expect(app.state.view?.focus).toBeNull();
    expect(app.state.view?.area).toBe(newArea);
    app.undo(); // 仕切りを戻す
    expect(app.state.view?.area).toBeNull();
    expect(app.state.screen).toBe('view');
  });

  it('開いているクウカンが消えたら一覧へ', async () => {
    const { app } = await setup();
    const k = app.apply((d, ctx) => createKuukan(d, { name: '倉庫' }, ctx))!.created[0]!;
    app.openView(k);
    app.apply((d, ctx) => deleteKuukan(d, k, ctx));
    expect(app.state.screen).toBe('kuukans');
    expect(app.state.view).toBeNull();
  });

  it('クウカンビューから開いたクウカン編集を出ると、同じクウカンビューへ戻る', async () => {
    const { app, room, areas } = await setup();
    app.openView(room, { area: areas[0]!.id });
    app.openKuukanEditor(room);
    expect(app.state.screen).toBe('editor');
    app.leaveEditor();
    expect(app.state.screen).toBe('view');
    expect(app.state.view?.kuukan).toBe(room);
    expect(app.state.view?.area).toBe(areas[0]!.id);
  });

  it('タブでほかの画面に移ると view は消える', async () => {
    const { app, room } = await setup();
    app.openView(room);
    app.setScreen('kuukans');
    expect(app.state.view).toBeNull();
    expect(app.state.screen).toBe('kuukans');
  });
});
