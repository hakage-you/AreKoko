// 結合試験：レビュー1の直し（詳細設計 レビュー1）。図のないクウカンに図を描く流れ（R-A1）と、ヘルプの項目（R-H）。

import { describe, expect, it } from 'vitest';
import { makeApp, expectHealthy } from './harness';
import type { AppStore } from '../../src/app/store';
import type { Id } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { addItem } from '../../src/core/ops/items';
import { createKuukan } from '../../src/core/ops/kuukans';
import { splitAt } from '../../src/core/ops/areas';
import { addMarker } from '../../src/core/ops/markers';
import { confirmModes } from '../../src/editor/confirm';
import { HELP, HELP_ORDER, WORDS } from '../../src/app/help';

function draftOf(app: AppStore) {
  const ed = app.state.editor;
  if (ed?.kind !== 'draft') throw new Error('下書きが開いていない');
  return ed.draft;
}

describe('結合試験: レビュー1の直し', () => {
  it('R-A1: 図のないクウカンに図を描くと、ID・名前・中のモノはそのままで図が付く', async () => {
    const { app, file } = makeApp();
    await app.newDocument();
    const room = app.apply((d, ctx) => createKuukan(d, { name: '物置', areaLabel: '棚' }, ctx))!.created[0]!;
    const items: Id[] = ['脚立', '扇風機'].map(name => app.apply((d, ctx) => addItem(d, { name, place: room }, ctx))!.created[0]!);
    app.openView(room);

    app.openDraft({ kind: 'redraw', source: room });
    const draft = draftOf(app);
    expect(draft.kuukan).toBe(room);
    expect(confirmModes(draft)).toEqual(['replace']);
    expect(draft.doc.drawing.kuukans).toHaveLength(1);
    // 下書きの間は文書に図はない
    expect(app.state.doc!.drawing.kuukans.some(k => k.kuukan === room)).toBe(false);

    app.draftApply((d, ctx) => splitAt(d, room, 'x', [5000, 5000], ctx));
    app.draftApply((d, ctx) => addMarker(d, room, { name: 'ドア', shape: { type: 'point', at: [0, 5000] } }, ctx));
    app.confirmDraft('replace');

    const doc = app.state.doc!;
    const k = doc.membership.kuukans.find(x => x.id === room)!;
    expect(k).toMatchObject({ name: '物置', owner: null, areaLabel: '棚' });
    expect(doc.drawing.kuukans.some(x => x.kuukan === room)).toBe(true);
    expect(doc.membership.areas.filter(a => a.kuukan === room).map(a => a.name)).toEqual(['棚1', '棚2']);
    expect(doc.drawing.markers.filter(m => m.kuukan === room)).toHaveLength(1);
    for (const id of items) expect(doc.membership.items.find(i => i.id === id)!.place).toBe(room);
    // 確定した後はそのクウカンの編集。元に戻すで図を描く前に戻る
    expect(app.state.editor).toEqual({ kind: 'kuukan', kuukan: room });
    app.undo();
    expect(app.state.doc!.drawing.kuukans.some(x => x.kuukan === room)).toBe(false);
    expect(app.state.doc!.membership.kuukans.some(x => x.id === room)).toBe(true);
    await app.flush();
    expectHealthy(app, file);
  });

  it('R-A1: 図のあるクウカンと未設定には図を描く下書きを開かない', async () => {
    const { app } = makeApp();
    await app.newDocument();
    app.openDraft({ kind: 'template', template: 'room6' });
    const room = draftOf(app).kuukan;
    app.confirmDraft('create');
    app.setScreen('kuukans');
    app.openDraft({ kind: 'redraw', source: room });
    expect(app.state.editor).toBeNull();
    expect(app.state.toast?.kind).toBe('error');
    app.openDraft({ kind: 'redraw', source: NIL_ID });
    expect(app.state.editor).toBeNull();
  });

  it('R-H: 今の画面に合うヘルプが開き、すべての項目に中身がある', async () => {
    const { app } = makeApp();
    app.openHelp();
    expect(app.state.help).toBe('start');
    app.closeHelp();
    await app.newDocument();
    app.openHelp();
    expect(app.state.help).toBe('kuukans');
    app.openDraft({ kind: 'new' });
    app.openHelp();
    expect(app.state.help).toBe('draft');
    app.cancelDraft();
    const room = app.apply((d, ctx) => createKuukan(d, { name: '部屋' }, ctx))!.created[0]!;
    app.openView(room);
    app.openHelp();
    expect(app.state.help).toBe('view');
    app.openView(NIL_ID);
    app.openHelp();
    expect(app.state.help).toBe('unset');
    app.openHelp('words');
    expect(app.state.help).toBe('words');
    app.closeHelp();
    expect(app.state.help).toBeNull();

    for (const t of HELP_ORDER) {
      const p = HELP[t];
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.what.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThan(0);
      expect(p.buttons.length).toBeGreaterThan(0);
    }
    expect(WORDS.map(w => w.term)).toContain('クウカン');
  });
});
