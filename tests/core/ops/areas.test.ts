import { describe, it, expect } from 'vitest';
import type { ArekokoDocument, Id, Point } from '../../../src/core/types';
import { NIL_ID } from '../../../src/core/constants';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createBaseDoc, createTestContext, deepFreeze } from '../../helpers/ctx';
import {
  attachOutline,
  splitAt,
  splitEven,
  planDeleteLine,
  deleteLine,
  moveLine,
  renameArea,
} from '../../../src/core/ops/areas';

describe('areas ops', () => {
  const rectOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  const lShapeOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 5000],
    [5000, 5000],
    [5000, 10000],
    [0, 10000],
  ];

  function createDocWithKuukan(kuukanId: Id, opts?: { areaLabel?: string }): ArekokoDocument {
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
            areaLabel: opts?.areaLabel ?? '床',
          },
        ],
      },
    };
  }

  describe('attachOutline', () => {
    it('長方形・L字の外形を付けられる', () => {
      const ctx = createTestContext();
      const k1 = '01920000-0000-7000-8000-000000000010';
      const k2 = '01920000-0000-7000-8000-000000000020';

      let doc = deepFreeze(createDocWithKuukan(k1));
      const res1 = attachOutline(
        doc,
        k1,
        { outline: rectOutline, aspect: 1.333, realSize: { w: 400, d: 300 } },
        ctx,
      );
      expect(validateDocument(res1.doc)).toEqual([]);
      const kd1 = res1.doc.drawing.kuukans.find(kd => kd.kuukan === k1)!;
      expect(kd1.outline).toEqual(rectOutline);
      expect(kd1.aspect).toBe(1.333);
      expect(kd1.realSize).toEqual({ w: 400, d: 300 });

      doc = deepFreeze(createDocWithKuukan(k2));
      const res2 = attachOutline(doc, k2, { outline: lShapeOutline, aspect: 1.0 }, ctx);
      expect(validateDocument(res2.doc)).toEqual([]);
      const kd2 = res2.doc.drawing.kuukans.find(kd => kd.kuukan === k2)!;
      expect(kd2.outline).toEqual(lShapeOutline);
    });

    it('描画がある・エリアがある・未設定・外形不正で OpError', () => {
      const ctx = createTestContext();
      const k1 = '01920000-0000-7000-8000-000000000010';
      const baseWithK = createDocWithKuukan(k1);

      // 未設定
      const docWithUnset = deepFreeze(baseWithK);
      expect(() =>
        attachOutline(docWithUnset, NIL_ID, { outline: rectOutline, aspect: 1 }, ctx),
      ).toThrowError(OpError);
      try {
        attachOutline(docWithUnset, NIL_ID, { outline: rectOutline, aspect: 1 }, ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('reserved');
      }

      // 既に描画がある
      const docWithDrawing = deepFreeze(
        attachOutline(docWithUnset, k1, { outline: rectOutline, aspect: 1 }, ctx).doc,
      );
      expect(() =>
        attachOutline(docWithDrawing, k1, { outline: rectOutline, aspect: 1 }, ctx),
      ).toThrowError(OpError);
      try {
        attachOutline(docWithDrawing, k1, { outline: rectOutline, aspect: 1 }, ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }

      // 既にエリアがある
      const docWithArea = deepFreeze({
        ...baseWithK,
        membership: {
          ...baseWithK.membership,
          areas: [
            {
              id: '01920000-0000-7000-8000-000000000099',
              kuukan: k1,
              parent: null,
              name: '床1',
              order: 0,
            },
          ],
        },
      });
      expect(() =>
        attachOutline(docWithArea, k1, { outline: rectOutline, aspect: 1 }, ctx),
      ).toThrowError(OpError);
      try {
        attachOutline(docWithArea, k1, { outline: rectOutline, aspect: 1 }, ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('hasAreas');
      }

      // 外形が不正（外接長方形が [0,10000] に満たない長方形）
      const invalidOutline: Point[] = [
        [0, 0],
        [5000, 0],
        [5000, 5000],
        [0, 5000],
      ];
      expect(() =>
        attachOutline(docWithUnset, k1, { outline: invalidOutline, aspect: 1 }, ctx),
      ).toThrowError(OpError);
      try {
        attachOutline(docWithUnset, k1, { outline: invalidOutline, aspect: 1 }, ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }
    });
  });

  describe('splitAt', () => {
    it('長方形の根を x=5000 で分ける → 床1・床2、床1 をさらに y=4000 で分ける → 床1-1・床1-2', () => {
      const ctx = createTestContext({ startCount: 100 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '床' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      // x=5000 で分ける
      const res1 = splitAt(doc, k1, 'x', [5000, 2000], ctx);
      expect(validateDocument(res1.doc)).toEqual([]);
      expect(res1.created.length).toBe(2);
      const [idFloor1, idFloor2] = res1.created;
      const floor1 = res1.doc.membership.areas.find(a => a.id === idFloor1)!;
      const floor2 = res1.doc.membership.areas.find(a => a.id === idFloor2)!;
      expect(floor1.name).toBe('床1');
      expect(floor1.order).toBe(0);
      expect(floor1.parent).toBeNull();
      expect(floor2.name).toBe('床2');
      expect(floor2.order).toBe(1);
      expect(floor2.parent).toBeNull();

      const p1 = res1.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p1.axis).toBe('x');
      expect(p1.at).toEqual([5000]);
      expect(p1.seed).toEqual([5000, 2000]);
      expect(p1.children).toEqual([idFloor1, idFloor2]);

      // 床1（x in [0, 5000], y in [0, 10000]）をさらに y=4000 で分ける
      doc = deepFreeze(res1.doc);
      const res2 = splitAt(doc, k1, 'y', [2500, 4000], ctx);
      expect(validateDocument(res2.doc)).toEqual([]);
      expect(res2.created.length).toBe(2);
      const [idSub1, idSub2] = res2.created;
      const sub1 = res2.doc.membership.areas.find(a => a.id === idSub1)!;
      const sub2 = res2.doc.membership.areas.find(a => a.id === idSub2)!;
      expect(sub1.name).toBe('床1-1');
      expect(sub1.order).toBe(0);
      expect(sub1.parent).toBe(idFloor1);
      expect(sub2.name).toBe('床1-2');
      expect(sub2.order).toBe(1);
      expect(sub2.parent).toBe(idFloor1);

      const p2 = res2.doc.drawing.partitions.find(p => p.area === idFloor1)!;
      expect(p2.axis).toBe('y');
      expect(p2.at).toEqual([4000]);
      expect(p2.seed).toEqual([2500, 4000]);
      expect(p2.children).toEqual([idSub1, idSub2]);

      // 線の上をクリックすると OpError('onLine')
      const doc3 = deepFreeze(res2.doc);
      expect(() => splitAt(doc3, k1, 'x', [5000, 2000], ctx)).toThrowError(OpError);
      try {
        splitAt(doc3, k1, 'x', [5000, 2000], ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('onLine');
      }
    });

    it('L字の反り返った角を通る線', () => {
      const ctx = createTestContext({ startCount: 200 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '床' }),
          k1,
          { outline: lShapeOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      // (5000, 5000) は反り返った角。x=5000、seed [5000, 2000] で縦に分ける
      const res = splitAt(doc, k1, 'x', [5000, 2000], ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.created.length).toBe(2);
      const p = res.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p.at).toEqual([5000]);
      expect(p.seed).toEqual([5000, 2000]);
    });
  });

  describe('splitEven', () => {
    it('3等分 → at [3333,6667]、名前 段1〜段3、seed なし', () => {
      const ctx = createTestContext({ startCount: 300 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      const res = splitEven(doc, k1, 'y', 3, ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.created.length).toBe(3);
      const p = res.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p.at).toEqual([3333, 6667]);
      expect(p.seed).toBeUndefined();
      expect('seed' in p).toBe(false);

      const areas = p.children.map(cId => res.doc.membership.areas.find(a => a.id === cId)!);
      expect(areas.map(a => a.name)).toEqual(['段1', '段2', '段3']);
      expect(areas.map(a => a.order)).toEqual([0, 1, 2]);
    });

    it('2等分 → seed あり', () => {
      const ctx = createTestContext({ startCount: 400 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      const res = splitEven(doc, k1, 'y', 2, ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      const p = res.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p.at).toEqual([5000]);
      expect(p.seed).toEqual([5000, 5000]);
    });

    it('L字の根 → OpError("notRectangle")', () => {
      const ctx = createTestContext({ startCount: 500 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: lShapeOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      expect(() => splitEven(doc, k1, 'y', 2, ctx)).toThrowError(OpError);
      try {
        splitEven(doc, k1, 'y', 2, ctx);
      } catch (e) {
        expect((e as OpError).code).toBe('notRectangle');
      }
    });
  });

  describe('deleteLine & planDeleteLine', () => {
    it('deleteLine（at が1つ）：中身が節へ移り、moved に入り、同じクウカンなので描画は残る。子孫のエリアと仕切りも消える', () => {
      const ctx = createTestContext({ startCount: 600 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const item1 = '01920000-0000-7000-8000-000000000088';
      const item2 = '01920000-0000-7000-8000-000000000089';

      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '床' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      // 床1, 床2 に分ける
      const res1 = splitAt(doc, k1, 'x', [5000, 2000], ctx);
      const floor1Id = res1.created[0]!;
      const floor2Id = res1.created[1]!;

      // 床1 をさらに 床1-1, 床1-2 に分ける
      const res2 = splitAt(res1.doc, k1, 'y', [2500, 4000], ctx);
      const floor11Id = res2.created[0]!;

      // 床2 にモノ1、床1-1 にモノ2 を置く（どちらも描画あり）
      doc = deepFreeze({
        ...res2.doc,
        membership: {
          ...res2.doc.membership,
          items: [
            {
              id: item1,
              name: '机',
              place: floor2Id,
              category: null,
              tags: [],
            },
            {
              id: item2,
              name: '椅子',
              place: floor11Id,
              category: null,
              tags: [],
            },
          ],
        },
        drawing: {
          ...res2.doc.drawing,
          items: [
            {
              item: item1,
              shape: { type: 'point', at: [7500, 5000] },
              rotation: 0,
            },
            {
              item: item2,
              shape: { type: 'point', at: [2500, 2000] },
              rotation: 0,
            },
          ],
        },
      });

      // 根の仕切り（at=[5000]）を消す
      const plan = planDeleteLine(doc, k1, 0);
      expect(plan.createsArea).toBe(false);
      expect(new Set(plan.removedAreas)).toEqual(
        new Set([floor1Id, floor2Id, res2.created[0]!, res2.created[1]!]),
      );
      expect(plan.relocations.flatMap(r => r.items).sort()).toEqual([item1, item2].sort());

      const res = deleteLine(doc, k1, 0, ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.moved.sort()).toEqual([item1, item2].sort());

      // 中身はクウカンへ移っている
      const itm1 = res.doc.membership.items.find(i => i.id === item1)!;
      const itm2 = res.doc.membership.items.find(i => i.id === item2)!;
      expect(itm1.place).toBe(k1);
      expect(itm2.place).toBe(k1);

      // 同じクウカンの中の移動なので描画は残る
      expect(res.doc.drawing.items.some(d => d.item === item1)).toBe(true);
      expect(res.doc.drawing.items.some(d => d.item === item2)).toBe(true);

      // エリアと仕切りはすべて消えている
      expect(res.doc.membership.areas.length).toBe(0);
      expect(res.doc.drawing.partitions.length).toBe(0);
      expect(res.created).toEqual([]);
    });

    it('deleteLine（N等分、4段の真ん中の線）：段2・段3 が消え、中身は節へ、空の新しいエリア「段5」ができ、at は2本に', () => {
      const ctx = createTestContext({ startCount: 700 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const itemA = '01920000-0000-7000-8000-000000000081';
      const itemB = '01920000-0000-7000-8000-000000000082';

      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      // 4等分
      const splitRes = splitEven(doc, k1, 'y', 4, ctx);
      const [d1, d2, d3, d4] = splitRes.created;

      // 段2 と 段3 にモノを置く
      doc = deepFreeze({
        ...splitRes.doc,
        membership: {
          ...splitRes.doc.membership,
          items: [
            { id: itemA, name: '本A', place: d2!, category: null, tags: [] },
            { id: itemB, name: '本B', place: d3!, category: null, tags: [] },
          ],
        },
      });

      // 4段の真ん中の線（index 1: at=5000、d2 と d3 の間の線）
      const plan = planDeleteLine(doc, k1, 1);
      expect(plan.createsArea).toBe(true);
      expect(plan.removedAreas).toEqual([d2, d3]);

      const res = deleteLine(doc, k1, 1, ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.moved.sort()).toEqual([itemA, itemB].sort());
      expect(res.created.length).toBe(1);

      const newAreaId = res.created[0]!;
      const newArea = res.doc.membership.areas.find(a => a.id === newAreaId)!;
      expect(newArea.name).toBe('段5');
      expect(newArea.order).toBe(1);

      const p = res.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p.at).toEqual([2500, 7500]);
      expect(p.children).toEqual([d1, newAreaId, d4]);
      expect(p.seed).toBeUndefined();

      // 兄弟の order がそろっている
      const areaD1 = res.doc.membership.areas.find(a => a.id === d1)!;
      const areaD4 = res.doc.membership.areas.find(a => a.id === d4)!;
      expect(areaD1.order).toBe(0);
      expect(newArea.order).toBe(1);
      expect(areaD4.order).toBe(2);
    });

    it('3段の線を消して残りが1本になると seed ができる', () => {
      const ctx = createTestContext({ startCount: 800 });
      const k1 = '01920000-0000-7000-8000-000000000010';

      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      // 3等分
      const splitRes = splitEven(doc, k1, 'y', 3, ctx);
      const [d1, d2, d3] = splitRes.created;

      // 最初の線（index 0: at=3333、d1 と d2 の間）を消す
      doc = deepFreeze(splitRes.doc);
      const res = deleteLine(doc, k1, 0, ctx);
      expect(validateDocument(res.doc)).toEqual([]);
      expect(res.created.length).toBe(1);

      const newAreaId = res.created[0]!;
      const newArea = res.doc.membership.areas.find(a => a.id === newAreaId)!;
      expect(newArea.name).toBe('段4');

      const p = res.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p.at).toEqual([6667]);
      expect(p.children).toEqual([newAreaId, d3]);
      // もう一方の軸（x軸）の外接長方形 [0, 10000] の中点 Math.floor(10000/2) = 5000
      expect(p.seed).toEqual([5000, 6667]);
    });

    it('planDeleteLine が deleteLine の結果と一致する', () => {
      const ctx = createTestContext({ startCount: 900 });
      const k1 = '01920000-0000-7000-8000-000000000010';
      const item1 = '01920000-0000-7000-8000-000000000091';

      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '段' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      const splitRes = splitEven(doc, k1, 'y', 3, ctx);
      const [d1, d2] = splitRes.created;

      doc = deepFreeze({
        ...splitRes.doc,
        membership: {
          ...splitRes.doc.membership,
          items: [{ id: item1, name: '箱', place: d2!, category: null, tags: [] }],
        },
      });

      const plan = planDeleteLine(doc, k1, 0);
      const res = deleteLine(doc, k1, 0, ctx);

      expect(plan.createsArea).toBe(res.created.length > 0);
      expect(plan.removedAreas).toEqual([d1, d2]);
      for (const removedId of plan.removedAreas) {
        expect(res.doc.membership.areas.some(a => a.id === removedId)).toBe(false);
      }
      const plannedMovedItems = plan.relocations.flatMap(r => r.items);
      expect(plannedMovedItems.sort()).toEqual(res.moved.sort());
    });
  });

  describe('moveLine', () => {
    it('範囲内で動く（seed も動く）、範囲外 → OpError("outOfRange")', () => {
      const ctx = createTestContext({ startCount: 1000 });
      const k1 = '01920000-0000-7000-8000-000000000010';

      let doc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '床' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      const splitRes = splitAt(doc, k1, 'x', [5000, 2000], ctx);
      doc = deepFreeze(splitRes.doc);

      // 範囲内での移動（x=4000 へ）
      const res1 = moveLine(doc, k1, 0, 4000);
      expect(validateDocument(res1.doc)).toEqual([]);
      const p1 = res1.doc.drawing.partitions.find(p => p.area === k1)!;
      expect(p1.at).toEqual([4000]);
      expect(p1.seed).toEqual([4000, 2000]);

      // 範囲外への移動
      expect(() => moveLine(doc, k1, 0, 15000)).toThrowError(OpError);
      try {
        moveLine(doc, k1, 0, 15000);
      } catch (e) {
        expect((e as OpError).code).toBe('outOfRange');
      }

      expect(() => moveLine(doc, k1, 0, -500)).toThrowError(OpError);
      try {
        moveLine(doc, k1, 0, -500);
      } catch (e) {
        expect((e as OpError).code).toBe('outOfRange');
      }
    });
  });

  describe('renameArea', () => {
    it('エリアの名前を変更できる', () => {
      const ctx = createTestContext({ startCount: 1100 });
      const k1 = '01920000-0000-7000-8000-000000000010';

      const baseDoc = deepFreeze(
        attachOutline(
          createDocWithKuukan(k1, { areaLabel: '床' }),
          k1,
          { outline: rectOutline, aspect: 1 },
          ctx,
        ).doc,
      );

      const splitRes = splitAt(baseDoc, k1, 'x', [5000, 2000], ctx);
      const floor1Id = splitRes.created[0]!;

      const doc = deepFreeze(splitRes.doc);
      const res = renameArea(doc, floor1Id, '畳スペース');
      expect(validateDocument(res.doc)).toEqual([]);
      const area = res.doc.membership.areas.find(a => a.id === floor1Id)!;
      expect(area.name).toBe('畳スペース');

      // 空の名前も受け付ける（名前は表示専用。設計 原則5。クウカンの名前と同じ扱い）
      const empty = renameArea(doc, floor1Id, '');
      expect(validateDocument(empty.doc)).toEqual([]);

      // 存在しないエリア
      expect(() => renameArea(doc, '01920000-0000-7000-8000-000000009999', '新しい名前')).toThrowError(
        OpError,
      );
      try {
        renameArea(doc, '01920000-0000-7000-8000-000000009999', '新しい名前');
      } catch (e) {
        expect((e as OpError).code).toBe('notFound');
      }
    });
  });
});
