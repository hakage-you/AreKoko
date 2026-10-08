import { describe, it, expect } from 'vitest';
import type { ArekokoDocument, Id, Point, Shape } from '../../../src/core/types';
import { NIL_ID } from '../../../src/core/constants';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createBaseDoc, createTestContext, deepFreeze } from '../../helpers/ctx';
import {
  setItemDrawing,
  moveItemDrawing,
  rotateItemDrawing,
  reshapeItemDrawing,
  removeItemDrawing,
} from '../../../src/core/ops/itemDrawings';

describe('itemDrawings ops', () => {
  const rectOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  function createTestDoc(): {
    doc: ArekokoDocument;
    ids: {
      roomA: Id;
      roomNoDrawing: Id;
      item1: Id;
      item2: Id;
      item3: Id;
      itemUnset: Id;
      itemInNoDrawing: Id;
      pillarMarker: Id;
      pointMarker: Id;
      passableMarker: Id;
    };
  } {
    const base = createBaseDoc();
    const ids = {
      roomA: '01920000-0000-7000-8000-000000000001',
      roomNoDrawing: '01920000-0000-7000-8000-000000000002',
      item1: '01920000-0000-7000-8000-000000000011',
      item2: '01920000-0000-7000-8000-000000000012',
      item3: '01920000-0000-7000-8000-000000000013',
      itemUnset: '01920000-0000-7000-8000-000000000014',
      itemInNoDrawing: '01920000-0000-7000-8000-000000000015',
      pillarMarker: '01920000-0000-7000-8000-000000000021',
      pointMarker: '01920000-0000-7000-8000-000000000022',
      passableMarker: '01920000-0000-7000-8000-000000000023',
    };

    const doc: ArekokoDocument = {
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          base.membership.kuukans[0]!,
          {
            id: ids.roomA,
            name: 'Room A',
            owner: null,
            areaLabel: 'エリア',
          },
          {
            id: ids.roomNoDrawing,
            name: '描画なし部屋',
            owner: null,
            areaLabel: 'エリア',
          },
        ],
        items: [
          {
            id: ids.item1,
            name: 'ドライバー',
            place: ids.roomA,
            category: null,
            tags: [],
            updatedAt: '2026-10-08T10:00:00.000Z',
          },
          {
            id: ids.item2,
            name: 'ペンチ',
            place: ids.roomA,
            category: null,
            tags: [],
            updatedAt: '2026-10-08T10:00:00.000Z',
          },
          {
            id: ids.item3,
            name: 'ノート',
            place: ids.roomA,
            category: null,
            tags: [],
            updatedAt: '2026-10-08T10:00:00.000Z',
          },
          {
            id: ids.itemUnset,
            name: '未設定モノ',
            place: NIL_ID,
            category: null,
            tags: [],
            updatedAt: '2026-10-08T10:00:00.000Z',
          },
          {
            id: ids.itemInNoDrawing,
            name: '描画なし部屋モノ',
            place: ids.roomNoDrawing,
            category: null,
            tags: [],
            updatedAt: '2026-10-08T10:00:00.000Z',
          },
        ],
      },
      drawing: {
        kuukans: [
          {
            kuukan: ids.roomA,
            outline: rectOutline,
            aspect: 1.0,
          },
        ],
        partitions: [],
        markers: [
          {
            id: ids.pillarMarker,
            kuukan: ids.roomA,
            name: '柱',
            shape: { type: 'rect', x: 2000, y: 2000, w: 1000, h: 1000 },
            rotation: 0,
            notAPlace: true,
          },
          {
            id: ids.pointMarker,
            kuukan: ids.roomA,
            name: '目印点',
            shape: { type: 'point', at: [5000, 5000] },
            rotation: 0,
            notAPlace: true,
          },
          {
            id: ids.passableMarker,
            kuukan: ids.roomA,
            name: '普通のマット',
            shape: { type: 'rect', x: 7000, y: 7000, w: 1000, h: 1000 },
            rotation: 0,
            notAPlace: false,
          },
        ],
        items: [],
      },
    };

    return { doc, ids };
  }

  describe('setItemDrawing', () => {
    it('点・長方形・多角形の描画を付けられ、置き換えもできる', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const ctx = createTestContext();

      // 点の描画
      const doc1 = deepFreeze(initialDoc);
      const res1 = setItemDrawing(
        doc1,
        ids.item1,
        { shape: { type: 'point', at: [1000, 1000] }, rotation: 0 },
        ctx,
      );
      expect(validateDocument(res1.doc)).toEqual([]);
      expect(res1.doc.drawing.items).toHaveLength(1);
      const d1 = res1.doc.drawing.items[0]!;
      expect(d1.item).toBe(ids.item1);
      expect(d1.shape).toEqual({ type: 'point', at: [1000, 1000] });
      expect(d1.rotation).toBe(0);

      // 長方形の描画（回転指定あり）
      const doc2 = deepFreeze(res1.doc);
      const res2 = setItemDrawing(
        doc2,
        ids.item2,
        { shape: { type: 'rect', x: 3500, y: 3500, w: 600, h: 400 }, rotation: 3 },
        ctx,
      );
      expect(validateDocument(res2.doc)).toEqual([]);
      expect(res2.doc.drawing.items).toHaveLength(2);
      const d2 = res2.doc.drawing.items.find(d => d.item === ids.item2)!;
      expect(d2.shape).toEqual({ type: 'rect', x: 3500, y: 3500, w: 600, h: 400 });
      expect(d2.rotation).toBe(3);

      // 多角形の描画（回転省略で既定値 0）
      const doc3 = deepFreeze(res2.doc);
      const polyShape: Shape = {
        type: 'poly',
        points: [
          [1000, 4000],
          [2000, 4000],
          [2000, 5000],
          [1000, 5000],
        ],
      };
      const res3 = setItemDrawing(
        doc3,
        ids.item3,
        { shape: polyShape },
        ctx,
      );
      expect(validateDocument(res3.doc)).toEqual([]);
      expect(res3.doc.drawing.items).toHaveLength(3);
      const d3 = res3.doc.drawing.items.find(d => d.item === ids.item3)!;
      expect(d3.rotation).toBe(0);

      // 置き換え（item1 の点を長方形に更新）
      const doc4 = deepFreeze(res3.doc);
      const res4 = setItemDrawing(
        doc4,
        ids.item1,
        { shape: { type: 'rect', x: 1000, y: 1000, w: 200, h: 200 }, rotation: 4 },
        ctx,
      );
      expect(validateDocument(res4.doc)).toEqual([]);
      expect(res4.doc.drawing.items).toHaveLength(3);
      const d1Updated = res4.doc.drawing.items.find(d => d.item === ids.item1)!;
      expect(d1Updated.shape).toEqual({ type: 'rect', x: 1000, y: 1000, w: 200, h: 200 });
      expect(d1Updated.rotation).toBe(4);
    });

    it('updatedAt が変わらない', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);
      const beforeItem = doc.membership.items.find(it => it.id === ids.item1)!;

      const res = setItemDrawing(
        doc,
        ids.item1,
        { shape: { type: 'point', at: [1000, 1000] } },
      );
      expect(validateDocument(res.doc)).toEqual([]);
      const afterItem = res.doc.membership.items.find(it => it.id === ids.item1)!;
      expect(afterItem.updatedAt).toBe(beforeItem.updatedAt);
    });

    it('未設定のモノには付けられず OpError(noDrawing)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() =>
        setItemDrawing(doc, ids.itemUnset, { shape: { type: 'point', at: [100, 100] } }),
      ).toThrowError(OpError);
      try {
        setItemDrawing(doc, ids.itemUnset, { shape: { type: 'point', at: [100, 100] } });
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }
    });

    it('置き場のクウカンに描画がないと OpError(noDrawing)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() =>
        setItemDrawing(doc, ids.itemInNoDrawing, { shape: { type: 'point', at: [100, 100] } }),
      ).toThrowError(OpError);
      try {
        setItemDrawing(doc, ids.itemInNoDrawing, { shape: { type: 'point', at: [100, 100] } });
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }
    });

    it('不正な形状で OpError(invalidInput)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      // 幅 0 の長方形
      expect(() =>
        setItemDrawing(doc, ids.item1, {
          shape: { type: 'rect', x: 100, y: 100, w: 0, h: 100 },
        }),
      ).toThrowError(OpError);
      try {
        setItemDrawing(doc, ids.item1, {
          shape: { type: 'rect', x: 100, y: 100, w: 0, h: 100 },
        });
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }
    });

    it('マーカーの上にも付けられる（古い文書の notAPlace: true でも。「置き場にしない」は 2026-10-08 になくした）', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      // pillarMarker（rect x: 2000〜3000, y: 2000〜3000, notAPlace: true）の内側と辺の上
      for (const at of [[2500, 2500], [2000, 2500]] as const) {
        const res = setItemDrawing(doc, ids.item1, { shape: { type: 'point', at: [at[0], at[1]] } });
        expect(validateDocument(res.doc)).toEqual([]);
      }

      // pointMarker (at: [5000, 5000], notAPlace: true だが点のマーカー)
      const resPoint = setItemDrawing(doc, ids.item1, {
        shape: { type: 'point', at: [5000, 5000] },
      });
      expect(validateDocument(resPoint.doc)).toEqual([]);

      // passableMarker (x: 7000〜8000, y: 7000〜8000, notAPlace: false)
      const resPass = setItemDrawing(deepFreeze(resPoint.doc), ids.item2, {
        shape: { type: 'point', at: [7500, 7500] },
      });
      expect(validateDocument(resPass.doc)).toEqual([]);
    });
  });

  describe('moveItemDrawing', () => {
    it('3種の形がそれぞれ同じだけ動く', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      let doc = deepFreeze(initialDoc);

      // 点
      doc = deepFreeze(
        setItemDrawing(doc, ids.item1, {
          shape: { type: 'point', at: [1000, 1000] },
        }).doc,
      );
      // 長方形
      doc = deepFreeze(
        setItemDrawing(doc, ids.item2, {
          shape: { type: 'rect', x: 3000, y: 3000, w: 400, h: 400 },
        }).doc,
      );
      // 多角形
      doc = deepFreeze(
        setItemDrawing(doc, ids.item3, {
          shape: {
            type: 'poly',
            points: [
              [4000, 4000],
              [5000, 4000],
              [5000, 5000],
              [4000, 5000],
            ],
          },
        }).doc,
      );

      const dx = 200;
      const dy = 300;

      const resPoint = moveItemDrawing(doc, ids.item1, dx, dy);
      expect(validateDocument(resPoint.doc)).toEqual([]);
      const p1 = resPoint.doc.drawing.items.find(d => d.item === ids.item1)!;
      expect(p1.shape).toEqual({ type: 'point', at: [1200, 1300] });

      const resRect = moveItemDrawing(doc, ids.item2, dx, dy);
      expect(validateDocument(resRect.doc)).toEqual([]);
      const p2 = resRect.doc.drawing.items.find(d => d.item === ids.item2)!;
      expect(p2.shape).toEqual({ type: 'rect', x: 3200, y: 3300, w: 400, h: 400 });

      const resPoly = moveItemDrawing(doc, ids.item3, dx, dy);
      expect(validateDocument(resPoly.doc)).toEqual([]);
      const p3 = resPoly.doc.drawing.items.find(d => d.item === ids.item3)!;
      expect(p3.shape).toEqual({
        type: 'poly',
        points: [
          [4200, 4300],
          [5200, 4300],
          [5200, 5300],
          [4200, 5300],
        ],
      });
    });

    it('マーカーの上へも動かせる（notAPlace: true でも）', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const docWithItem = deepFreeze(
        setItemDrawing(initialDoc, ids.item1, { shape: { type: 'point', at: [1000, 1000] } }).doc,
      );
      const res = moveItemDrawing(docWithItem, ids.item1, 1500, 1500);
      expect(res.doc.drawing.items.find(d => d.item === ids.item1)!.shape).toEqual({ type: 'point', at: [2500, 2500] });
    });

    it('描画がない場合は OpError(notFound)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() => moveItemDrawing(doc, ids.item1, 100, 100)).toThrowError(OpError);
      try {
        moveItemDrawing(doc, ids.item1, 100, 100);
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });

  describe('rotateItemDrawing', () => {
    it('7 → +1 で 0、0 → -1 で 7 に回る', () => {
      const { doc: initialDoc, ids } = createTestDoc();

      // 7 → +1 で 0
      const docWith7 = deepFreeze(
        setItemDrawing(initialDoc, ids.item1, {
          shape: { type: 'point', at: [1000, 1000] },
          rotation: 7,
        }).doc,
      );
      const resPlus = rotateItemDrawing(docWith7, ids.item1, 1);
      expect(validateDocument(resPlus.doc)).toEqual([]);
      expect(resPlus.doc.drawing.items.find(d => d.item === ids.item1)!.rotation).toBe(0);

      // 0 → -1 で 7
      const docWith0 = deepFreeze(
        setItemDrawing(initialDoc, ids.item1, {
          shape: { type: 'point', at: [1000, 1000] },
          rotation: 0,
        }).doc,
      );
      const resMinus = rotateItemDrawing(docWith0, ids.item1, -1);
      expect(validateDocument(resMinus.doc)).toEqual([]);
      expect(resMinus.doc.drawing.items.find(d => d.item === ids.item1)!.rotation).toBe(7);
    });

    it('描画がない場合は OpError(notFound)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() => rotateItemDrawing(doc, ids.item1, 1)).toThrowError(OpError);
      try {
        rotateItemDrawing(doc, ids.item1, 1);
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });

  describe('reshapeItemDrawing', () => {
    it('形が変わり回転は保つ', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const docWithRect = deepFreeze(
        setItemDrawing(initialDoc, ids.item1, {
          shape: { type: 'rect', x: 1000, y: 1000, w: 200, h: 200 },
          rotation: 5,
        }).doc,
      );

      const newShape: Shape = {
        type: 'poly',
        points: [
          [1000, 1000],
          [1500, 1000],
          [1500, 1500],
          [1000, 1500],
        ],
      };

      const res = reshapeItemDrawing(docWithRect, ids.item1, newShape);
      expect(validateDocument(res.doc)).toEqual([]);
      const itemDrawing = res.doc.drawing.items.find(d => d.item === ids.item1)!;
      expect(itemDrawing.shape).toEqual(newShape);
      expect(itemDrawing.rotation).toBe(5);
    });

    it('描画がない場合は OpError(notFound)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() =>
        reshapeItemDrawing(doc, ids.item1, { type: 'point', at: [100, 100] }),
      ).toThrowError(OpError);
      try {
        reshapeItemDrawing(doc, ids.item1, { type: 'point', at: [100, 100] });
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });

  describe('removeItemDrawing', () => {
    it('描画を外すことができる', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const docWithItem = deepFreeze(
        setItemDrawing(initialDoc, ids.item1, {
          shape: { type: 'point', at: [1000, 1000] },
        }).doc,
      );
      expect(docWithItem.drawing.items).toHaveLength(1);

      const res = removeItemDrawing(docWithItem, ids.item1);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.doc.drawing.items).toHaveLength(0);
    });

    it('描画がない場合は OpError(notFound)', () => {
      const { doc: initialDoc, ids } = createTestDoc();
      const doc = deepFreeze(initialDoc);

      expect(() => removeItemDrawing(doc, ids.item1)).toThrowError(OpError);
      try {
        removeItemDrawing(doc, ids.item1);
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });
});
