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

  it('クウカン直下に置かれていた図面付きモノが、エリア分割後に対応する葉エリアに自動割り当てされる', () => {
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

    // クウカン直下にモノを作成
    const [desk] = run(d => addItem(d, { name: '机', place: room! }, ctx));
    run(d => setItemDrawing(d, desk!, {
      shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 2000 }, // 左上 (x: 1000~3000, y: 1000~3000)
    }, ctx));

    const [bed] = run(d => addItem(d, { name: 'ベッド', place: room! }, ctx));
    run(d => setItemDrawing(d, bed!, {
      shape: { type: 'rect', x: 6000, y: 6000, w: 3000, h: 3000 }, // 右下 (x: 6000~9000, y: 6000~9000)
    }, ctx));

    // 部屋を左右に2分割 (x=5000)
    const [leftArea, rightArea] = run(d => splitEven(d, room!, 'x', 2, ctx));

    // 自動割り当てを実行
    const res = autoAssignItemPlaces(doc, room!);

    const updatedDesk = res.doc.membership.items.find(i => i.id === desk);
    const updatedBed = res.doc.membership.items.find(i => i.id === bed);

    expect(updatedDesk?.place).toBe(leftArea);
    expect(updatedBed?.place).toBe(rightArea);
    expect(res.relocations).toHaveLength(2);
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

  it('間取り編集終了時（leaveEditor）に自動割り当てが実行されトーストが表示される', async () => {
    const { AppStore } = await import('../../src/app/store');
    const { memoryDeps } = await import('../../src/app/memoryDeps');

    const app = new AppStore(memoryDeps());
    await app.openSampleDocument();

    const roomA = app.state.doc!.membership.kuukans.find(k => k.name === 'Room A')!;
    const areas = app.state.doc!.membership.areas.filter(a => a.kuukan === roomA.id);
    const deskArea = areas.find(a => a.name === 'デスク周り')!;

    // 新規モノをRoom A直下に置く（デスク周りの座標 x: 1000, y: 1000）
    const itemRes = app.apply((d, c) => addItem(d, { name: 'テスト用デスク用品', place: roomA.id }, c));
    const itemId = itemRes!.created[0]!;
    app.apply((d, c) => setItemDrawing(d, itemId, { shape: { type: 'point', at: [1000, 1000] } }, c));

    // 最初はRoom A直下にある
    expect(app.state.doc!.membership.items.find(i => i.id === itemId)?.place).toBe(roomA.id);

    // 間取り編集を開く
    app.openKuukanEditor(roomA.id);
    expect(app.state.editor?.kind).toBe('kuukan');

    // 間取り編集を終了する
    app.leaveEditor();

    // デスク周りに自動割り当てされ、トーストが出ていることを確認
    expect(app.state.doc!.membership.items.find(i => i.id === itemId)?.place).toBe(deskArea.id);
    expect(app.state.toast?.text).toContain('1件のモノの所属エリアを間取りに合わせて更新しました');
  });
});
