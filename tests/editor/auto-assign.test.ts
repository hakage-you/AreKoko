import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../../src/core/document';
import { newId } from '../../src/core/ids';
import type { OpContext, OpResult } from '../../src/core/ops/common';
import { createKuukan } from '../../src/core/ops/kuukans';
import { attachOutline, splitEven } from '../../src/core/ops/areas';
import { addItem } from '../../src/core/ops/items';
import { setItemDrawing } from '../../src/core/ops/itemDrawings';
import { autoAssignItemPlaces } from '../../src/editor/autoAssign';
import type { ArekokoDocument, Id } from '../../src/core/types';

describe('autoAssignItemPlaces', () => {
  const ctx: OpContext = { newId, now: () => new Date().toISOString() };

  it('描画とずれているモノ（描画の中心が置き場の外にあるもの）は、描画の中心がある分けていないエリアへ移す案になる（TRS 付録B I-15）', () => {
    let doc = createEmptyDocument();
    const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
      const r = f(doc);
      doc = r.doc;
      return r.created;
    };

    const [room] = run(d => createKuukan(d, { name: '部屋' }, ctx));
    run(d => attachOutline(d, room!, {
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    }, ctx));
    // 部屋を左右に2分割 (x=5000)
    const [leftArea, rightArea] = run(d => splitEven(d, room!, 'x', 2, ctx));

    // 置き場は右のエリアなのに、描画は左のエリアの上（ずれ）
    const [desk] = run(d => addItem(d, { name: '机', place: rightArea! }, ctx));
    run(d => setItemDrawing(d, desk!, {
      shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 2000 },
    }, ctx));

    const res = autoAssignItemPlaces(doc, room!);
    expect(res.doc.membership.items.find(i => i.id === desk)?.place).toBe(leftArea);
    expect(res.relocations).toEqual([{ from: rightArea, to: leftArea, items: [desk] }]);
    // 元の文書は変えない（変えるかは利用者が決める）
    expect(doc.membership.items.find(i => i.id === desk)?.place).toBe(rightArea);
  });

  it('クウカンそのものに置いたモノは、描画がクウカンの中にあればずれではないので、移す案にしない（設計 3章 原則2）', () => {
    let doc = createEmptyDocument();
    const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
      const r = f(doc);
      doc = r.doc;
      return r.created;
    };

    const [room] = run(d => createKuukan(d, { name: '部屋' }, ctx));
    run(d => attachOutline(d, room!, {
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    }, ctx));
    const [bed] = run(d => addItem(d, { name: 'ベッド', place: room! }, ctx));
    run(d => setItemDrawing(d, bed!, {
      shape: { type: 'rect', x: 6000, y: 6000, w: 3000, h: 3000 },
    }, ctx));
    run(d => splitEven(d, room!, 'x', 2, ctx));

    const res = autoAssignItemPlaces(doc, room!);
    expect(res.relocations).toHaveLength(0);
    expect(res.doc).toBe(doc);
  });

  it('描画情報を持たないモノは自動割り当てで移動しない', () => {
    let doc = createEmptyDocument();
    const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
      const r = f(doc);
      doc = r.doc;
      return r.created;
    };

    const [room] = run(d => createKuukan(d, { name: '部屋' }, ctx));
    run(d => attachOutline(d, room!, {
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    }, ctx));

    // 描画なしのモノ
    const [itemNoDrawing] = run(d => addItem(d, { name: '書類', place: room! }, ctx));
    run(d => splitEven(d, room!, 'x', 2, ctx));

    const res = autoAssignItemPlaces(doc, room!);
    const updatedItem = res.doc.membership.items.find(i => i.id === itemNoDrawing);

    expect(updatedItem?.place).toBe(room); // 移動せずそのまま
    expect(res.relocations).toHaveLength(0);
  });

  it('既に正しいエリアに所属しているモノは再移動しない', () => {
    let doc = createEmptyDocument();
    const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
      const r = f(doc);
      doc = r.doc;
      return r.created;
    };

    const [room] = run(d => createKuukan(d, { name: '部屋' }, ctx));
    run(d => attachOutline(d, room!, {
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    }, ctx));
    const [leftArea] = run(d => splitEven(d, room!, 'x', 2, ctx));

    const [desk] = run(d => addItem(d, { name: '机', place: leftArea! }, ctx));
    run(d => setItemDrawing(d, desk!, {
      shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 2000 },
    }, ctx));

    const res = autoAssignItemPlaces(doc, room!);
    expect(res.relocations).toHaveLength(0);
    expect(res.doc).toBe(doc);
  });

  it('編集を出るとき、描画とずれているモノがあれば、置き場を変えるかを聞く。選んだときだけ変わる（TRS 付録B I-15）', async () => {
    const { AppStore } = await import('../../src/app/store');
    const { memoryDeps } = await import('../../src/app/memoryDeps');

    /** 見本を開き、デスク周りの上に描いた（ずれた）モノを Room A の別のエリアに置いて、Room A の編集を開く。 */
    async function setup() {
      const app = new AppStore(memoryDeps());
      await app.openSampleDocument();
      const roomA = app.state.doc!.membership.kuukans.find(k => k.name === 'Room A')!;
      const areas = app.state.doc!.membership.areas.filter(a => a.kuukan === roomA.id);
      const deskArea = areas.find(a => a.name === 'デスク周り')!;
      const other = areas.find(a => a.id !== deskArea.id && !areas.some(c => c.parent === a.id))!;
      const itemId = app.apply((d, c) => addItem(d, { name: 'テスト用デスク用品', place: other.id }, c))!.created[0]!;
      app.apply((d, c) => setItemDrawing(d, itemId, { shape: { type: 'point', at: [1000, 1000] } }, c));
      app.openKuukanEditor(roomA.id);
      const placeOf = () => app.state.doc!.membership.items.find(i => i.id === itemId)?.place;
      return { app, deskArea, other, placeOf };
    }

    // 置き場を変えて出る
    {
      const { app, deskArea, placeOf } = await setup();
      app.leaveEditor();
      const d = app.state.dialog;
      if (d?.kind !== 'confirm') throw new Error('確認が出ていない');
      expect(d.details.some(x => x.includes('テスト用デスク用品'))).toBe(true);
      expect(d.message).toContain('元に戻す'); // 画面を移ると履歴が消えるので、戻せないことを先に知らせる（K-6 と同じ）
      expect(app.state.screen).toBe('editor');
      d.onConfirm();
      expect(placeOf()).toBe(deskArea.id);
      expect(app.state.screen).not.toBe('editor');
      expect(app.state.canUndo).toBe(false);
    }
    // 変えずに出る
    {
      const { app, other, placeOf } = await setup();
      app.leaveEditor();
      const d = app.state.dialog;
      if (d?.kind !== 'confirm' || !d.secondary) throw new Error('「変えずに出る」がない');
      d.secondary.onSelect();
      expect(placeOf()).toBe(other.id);
      expect(app.state.screen).not.toBe('editor');
    }
    // キャンセルなら編集に残る
    {
      const { app, other, placeOf } = await setup();
      app.leaveEditor();
      app.closeDialog();
      expect(placeOf()).toBe(other.id);
      expect(app.state.screen).toBe('editor');
    }
    // 上のタブで別の画面へ移るときも同じく聞き、選んだ画面へ移る
    {
      const { app, deskArea, placeOf } = await setup();
      app.setScreen('search');
      const d = app.state.dialog;
      if (d?.kind !== 'confirm') throw new Error('タブで出るときに確認が出ていない');
      expect(app.state.screen).toBe('editor');
      d.onConfirm();
      expect(placeOf()).toBe(deskArea.id);
      expect(app.state.screen).toBe('search');
    }
    {
      const { app, other, placeOf } = await setup();
      app.setScreen('manage');
      const d = app.state.dialog;
      if (d?.kind !== 'confirm' || !d.secondary) throw new Error('タブで出るときに「変えずに出る」がない');
      d.secondary.onSelect();
      expect(placeOf()).toBe(other.id);
      expect(app.state.screen).toBe('manage');
    }
  });
});
