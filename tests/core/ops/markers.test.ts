import { describe, it, expect } from 'vitest';
import type { ArekokoDocument, Id, Point } from '../../../src/core/types';
import { NIL_ID } from '../../../src/core/constants';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createBaseDoc, createTestContext, deepFreeze } from '../../helpers/ctx';
import {
  addMarker,
  updateMarker,
  moveMarkers,
  deleteMarkers,
  alignMarkers,
} from '../../../src/core/ops/markers';

describe('markers ops', () => {
  const rectOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  function createDocWithDrawing(kuukanId: Id): ArekokoDocument {
    const base = createBaseDoc();
    return {
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          {
            id: kuukanId,
            name: '部屋A',
            owner: null,
            areaLabel: '床',
          },
        ],
      },
      drawing: {
        ...base.drawing,
        kuukans: [
          {
            kuukan: kuukanId,
            outline: rectOutline,
            aspect: 1.333,
          },
        ],
      },
    };
  }

  describe('addMarker', () => {
    it('点と長方形のマーカー、回転、notAPlace を追加できる', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      // 点のマーカー
      const res1 = addMarker(
        doc,
        kId,
        {
          name: '目印1',
          shape: { type: 'point', at: [1000, 2000] },
        },
        ctx,
      );
      expect(validateDocument(res1.doc)).toEqual([]);
      expect(res1.created).toHaveLength(1);
      const m1 = res1.doc.drawing.markers.find(m => m.id === res1.created[0])!;
      expect(m1.name).toBe('目印1');
      expect(m1.shape).toEqual({ type: 'point', at: [1000, 2000] });
      expect(m1.rotation).toBe(0);
      expect(m1.notAPlace).toBe(false);

      // 長方形のマーカー（回転と notAPlace を指定）
      const doc2 = deepFreeze(res1.doc);
      const res2 = addMarker(
        doc2,
        kId,
        {
          name: '柱',
          shape: { type: 'rect', x: 2000, y: 3000, w: 1000, h: 500 },
          rotation: 3,
          notAPlace: true,
        },
        ctx,
      );
      expect(validateDocument(res2.doc)).toEqual([]);
      expect(res2.created).toHaveLength(1);
      const m2 = res2.doc.drawing.markers.find(m => m.id === res2.created[0])!;
      expect(m2.name).toBe('柱');
      expect(m2.shape).toEqual({ type: 'rect', x: 2000, y: 3000, w: 1000, h: 500 });
      expect(m2.rotation).toBe(3);
      expect(m2.notAPlace).toBe(true);
    });

    it('描画のないクウカンにマーカーを追加しようとすると OpError(noDrawing)', () => {
      const ctx = createTestContext();
      const base = createBaseDoc();
      const noDrawingKuukanId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze({
        ...base,
        membership: {
          ...base.membership,
          kuukans: [
            ...base.membership.kuukans,
            {
              id: noDrawingKuukanId,
              name: '描画なし部屋',
              owner: null,
              areaLabel: '床',
            },
          ],
        },
      });

      expect(() =>
        addMarker(
          doc,
          noDrawingKuukanId,
          { name: 'マーカー', shape: { type: 'point', at: [100, 100] } },
          ctx,
        ),
      ).toThrowError(OpError);
      try {
        addMarker(
          doc,
          noDrawingKuukanId,
          { name: 'マーカー', shape: { type: 'point', at: [100, 100] } },
          ctx,
        );
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }

      // 未設定のクウカン（描画なし）
      expect(() =>
        addMarker(
          doc,
          NIL_ID,
          { name: 'マーカー', shape: { type: 'point', at: [100, 100] } },
          ctx,
        ),
      ).toThrowError(OpError);
      try {
        addMarker(
          doc,
          NIL_ID,
          { name: 'マーカー', shape: { type: 'point', at: [100, 100] } },
          ctx,
        );
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }
    });

    it('不正な形状（w が 0）や回転 8 で OpError(invalidInput)', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      // w が 0
      expect(() =>
        addMarker(
          doc,
          kId,
          { name: '不正長方形', shape: { type: 'rect', x: 100, y: 100, w: 0, h: 100 } },
          ctx,
        ),
      ).toThrowError(OpError);
      try {
        addMarker(
          doc,
          kId,
          { name: '不正長方形', shape: { type: 'rect', x: 100, y: 100, w: 0, h: 100 } },
          ctx,
        );
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }

      // 回転 8
      expect(() =>
        addMarker(
          doc,
          kId,
          {
            name: '回転不正',
            shape: { type: 'point', at: [100, 100] },
            rotation: 8 as any,
          },
          ctx,
        ),
      ).toThrowError(OpError);
      try {
        addMarker(
          doc,
          kId,
          {
            name: '回転不正',
            shape: { type: 'point', at: [100, 100] },
            rotation: 8 as any,
          },
          ctx,
        );
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }
    });
  });

  describe('updateMarker', () => {
    it('名前・形・回転・notAPlace を更新できる', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      const baseDoc = deepFreeze(createDocWithDrawing(kId));
      const addRes = addMarker(
        baseDoc,
        kId,
        {
          name: '元マーカー',
          shape: { type: 'point', at: [100, 200] },
          rotation: 0,
          notAPlace: false,
        },
        ctx,
      );
      const mId = addRes.created[0]!;

      const doc = deepFreeze(addRes.doc);
      const updateRes = updateMarker(doc, mId, {
        name: '更新マーカー',
        shape: { type: 'rect', x: 500, y: 600, w: 200, h: 300 },
        rotation: 4,
        notAPlace: true,
      });

      expect(validateDocument(updateRes.doc)).toEqual([]);
      const updated = updateRes.doc.drawing.markers.find(m => m.id === mId)!;
      expect(updated.name).toBe('更新マーカー');
      expect(updated.shape).toEqual({ type: 'rect', x: 500, y: 600, w: 200, h: 300 });
      expect(updated.rotation).toBe(4);
      expect(updated.notAPlace).toBe(true);
    });

    it('存在しないIDで OpError(notFound)', () => {
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      expect(() =>
        updateMarker(doc, '01920000-0000-7000-8000-999999999999', { name: 'テスト' }),
      ).toThrowError(OpError);
      try {
        updateMarker(doc, '01920000-0000-7000-8000-999999999999', { name: 'テスト' });
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });

  describe('moveMarkers', () => {
    it('点と長方形が同じだけ動く', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      let doc = deepFreeze(createDocWithDrawing(kId));

      const resPoint = addMarker(
        doc,
        kId,
        { name: '点', shape: { type: 'point', at: [1000, 2000] } },
        ctx,
      );
      doc = deepFreeze(resPoint.doc);
      const pointId = resPoint.created[0]!;

      const resRect = addMarker(
        doc,
        kId,
        { name: '長方形', shape: { type: 'rect', x: 3000, y: 4000, w: 500, h: 600 } },
        ctx,
      );
      doc = deepFreeze(resRect.doc);
      const rectId = resRect.created[0]!;

      // 2つを同時に (dx: 200, dy: -300) 動かす
      const moveRes = moveMarkers(doc, [pointId, rectId], 200, -300);
      expect(validateDocument(moveRes.doc)).toEqual([]);

      const mPoint = moveRes.doc.drawing.markers.find(m => m.id === pointId)!;
      const mRect = moveRes.doc.drawing.markers.find(m => m.id === rectId)!;

      expect(mPoint.shape).toEqual({ type: 'point', at: [1200, 1700] });
      expect(mRect.shape).toEqual({ type: 'rect', x: 3200, y: 3700, w: 500, h: 600 });
    });

    it('移動量が非整数の場合は OpError(invalidInput)', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));
      const res = addMarker(
        doc,
        kId,
        { name: '点', shape: { type: 'point', at: [1000, 2000] } },
        ctx,
      );
      const pointId = res.created[0]!;

      expect(() => moveMarkers(deepFreeze(res.doc), [pointId], 10.5, 20)).toThrowError(OpError);
      try {
        moveMarkers(deepFreeze(res.doc), [pointId], 10.5, 20);
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }
    });
  });

  describe('deleteMarkers', () => {
    it('マーカーを削除できる', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      let doc = deepFreeze(createDocWithDrawing(kId));

      const res1 = addMarker(
        doc,
        kId,
        { name: 'm1', shape: { type: 'point', at: [100, 100] } },
        ctx,
      );
      doc = deepFreeze(res1.doc);
      const m1Id = res1.created[0]!;

      const res2 = addMarker(
        doc,
        kId,
        { name: 'm2', shape: { type: 'rect', x: 200, y: 200, w: 100, h: 100 } },
        ctx,
      );
      doc = deepFreeze(res2.doc);
      const m2Id = res2.created[0]!;

      const delRes = deleteMarkers(doc, [m1Id]);
      expect(validateDocument(delRes.doc)).toEqual([]);
      expect(delRes.doc.drawing.markers).toHaveLength(1);
      expect(delRes.doc.drawing.markers[0]?.id).toBe(m2Id);

      const delAll = deleteMarkers(deepFreeze(delRes.doc), [m2Id]);
      expect(validateDocument(delAll.doc)).toEqual([]);
      expect(delAll.doc.drawing.markers).toHaveLength(0);
    });

    it('存在しないIDで OpError(notFound)', () => {
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      expect(() =>
        deleteMarkers(doc, ['01920000-0000-7000-8000-999999999999']),
      ).toThrowError(OpError);
      try {
        deleteMarkers(doc, ['01920000-0000-7000-8000-999999999999']);
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });

  describe('alignMarkers', () => {
    it('点と長方形の混在で left・right・top・bottom・centerX・centerY に整列できる', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      let doc = deepFreeze(createDocWithDrawing(kId));

      // m1 (Point): at = [1000, 2000] -> left 1000, right 1000, top 2000, bottom 2000, cx 1000, cy 2000
      const r1 = addMarker(doc, kId, { name: 'p1', shape: { type: 'point', at: [1000, 2000] } }, ctx);
      doc = deepFreeze(r1.doc);
      const id1 = r1.created[0]!;

      // m2 (Rect): x = 3000, y = 1500, w = 2000, h = 1000 -> left 3000, right 5000, top 1500, bottom 2500, cx 4000, cy 2000
      const r2 = addMarker(doc, kId, { name: 'r1', shape: { type: 'rect', x: 3000, y: 1500, w: 2000, h: 1000 } }, ctx);
      doc = deepFreeze(r2.doc);
      const id2 = r2.created[0]!;

      // m3 (Rect): x = 2000, y = 4000, w = 1000, h = 2000 -> left 2000, right 3000, top 4000, bottom 6000, cx 2500, cy 5000
      const r3 = addMarker(doc, kId, { name: 'r2', shape: { type: 'rect', x: 2000, y: 4000, w: 1000, h: 2000 } }, ctx);
      doc = deepFreeze(r3.doc);
      const id3 = r3.created[0]!;

      const ids = [id1, id2, id3];

      // left: 最小の left は 1000
      const resLeft = alignMarkers(doc, ids, 'left');
      expect(validateDocument(resLeft.doc)).toEqual([]);
      const ml1 = resLeft.doc.drawing.markers.find(m => m.id === id1)!;
      const ml2 = resLeft.doc.drawing.markers.find(m => m.id === id2)!;
      const ml3 = resLeft.doc.drawing.markers.find(m => m.id === id3)!;
      expect(ml1.shape).toEqual({ type: 'point', at: [1000, 2000] });
      expect(ml2.shape).toEqual({ type: 'rect', x: 1000, y: 1500, w: 2000, h: 1000 });
      expect(ml3.shape).toEqual({ type: 'rect', x: 1000, y: 4000, w: 1000, h: 2000 });

      // right: 最大の right は 5000
      const resRight = alignMarkers(doc, ids, 'right');
      expect(validateDocument(resRight.doc)).toEqual([]);
      const mr1 = resRight.doc.drawing.markers.find(m => m.id === id1)!;
      const mr2 = resRight.doc.drawing.markers.find(m => m.id === id2)!;
      const mr3 = resRight.doc.drawing.markers.find(m => m.id === id3)!;
      expect(mr1.shape).toEqual({ type: 'point', at: [5000, 2000] });
      expect(mr2.shape).toEqual({ type: 'rect', x: 3000, y: 1500, w: 2000, h: 1000 });
      expect(mr3.shape).toEqual({ type: 'rect', x: 4000, y: 4000, w: 1000, h: 2000 });

      // top: 最小の top は 1500
      const resTop = alignMarkers(doc, ids, 'top');
      expect(validateDocument(resTop.doc)).toEqual([]);
      const mt1 = resTop.doc.drawing.markers.find(m => m.id === id1)!;
      const mt2 = resTop.doc.drawing.markers.find(m => m.id === id2)!;
      const mt3 = resTop.doc.drawing.markers.find(m => m.id === id3)!;
      expect(mt1.shape).toEqual({ type: 'point', at: [1000, 1500] });
      expect(mt2.shape).toEqual({ type: 'rect', x: 3000, y: 1500, w: 2000, h: 1000 });
      expect(mt3.shape).toEqual({ type: 'rect', x: 2000, y: 1500, w: 1000, h: 2000 });

      // bottom: 最大の bottom は 6000
      const resBottom = alignMarkers(doc, ids, 'bottom');
      expect(validateDocument(resBottom.doc)).toEqual([]);
      const mb1 = resBottom.doc.drawing.markers.find(m => m.id === id1)!;
      const mb2 = resBottom.doc.drawing.markers.find(m => m.id === id2)!;
      const mb3 = resBottom.doc.drawing.markers.find(m => m.id === id3)!;
      expect(mb1.shape).toEqual({ type: 'point', at: [1000, 6000] });
      expect(mb2.shape).toEqual({ type: 'rect', x: 3000, y: 5000, w: 2000, h: 1000 });
      expect(mb3.shape).toEqual({ type: 'rect', x: 2000, y: 4000, w: 1000, h: 2000 });

      // centerX: cx は 1000, 4000, 2500。平均は (1000 + 4000 + 2500) / 3 = 2500
      const resCx = alignMarkers(doc, ids, 'centerX');
      expect(validateDocument(resCx.doc)).toEqual([]);
      const mcx1 = resCx.doc.drawing.markers.find(m => m.id === id1)!;
      const mcx2 = resCx.doc.drawing.markers.find(m => m.id === id2)!;
      const mcx3 = resCx.doc.drawing.markers.find(m => m.id === id3)!;
      expect(mcx1.shape).toEqual({ type: 'point', at: [2500, 2000] });
      expect(mcx2.shape).toEqual({ type: 'rect', x: 1500, y: 1500, w: 2000, h: 1000 });
      expect(mcx3.shape).toEqual({ type: 'rect', x: 2000, y: 4000, w: 1000, h: 2000 });

      // centerY: cy は 2000, 2000, 5000。平均は 9000 / 3 = 3000
      const resCy = alignMarkers(doc, ids, 'centerY');
      expect(validateDocument(resCy.doc)).toEqual([]);
      const mcy1 = resCy.doc.drawing.markers.find(m => m.id === id1)!;
      const mcy2 = resCy.doc.drawing.markers.find(m => m.id === id2)!;
      const mcy3 = resCy.doc.drawing.markers.find(m => m.id === id3)!;
      expect(mcy1.shape).toEqual({ type: 'point', at: [1000, 3000] });
      expect(mcy2.shape).toEqual({ type: 'rect', x: 3000, y: 2500, w: 2000, h: 1000 });
      expect(mcy3.shape).toEqual({ type: 'rect', x: 2000, y: 2000, w: 1000, h: 2000 });
    });

    it('1つだけなら変わらない', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));
      const r1 = addMarker(doc, kId, { name: 'p1', shape: { type: 'point', at: [1000, 2000] } }, ctx);
      const frozenDoc = deepFreeze(r1.doc);
      const id1 = r1.created[0]!;

      const res = alignMarkers(frozenDoc, [id1], 'left');
      expect(res.doc).toBe(frozenDoc);
      expect(validateDocument(res.doc)).toEqual([]);
    });
  });
});
