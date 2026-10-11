import { describe, it, expect } from 'vitest';
import type { ArekokoDocument, Id, Point } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { createBaseDoc, deepFreeze } from '../helpers/ctx';
import {
  itemsInKuukan,
  itemsInScope,
  undrawnCounts,
  drawingOffset,
  offsetText,
  quickSearch,
  kuukanTrail,
} from '../../src/view/model';

describe('view model', () => {
  const rectOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  function createSampleHierarchyDoc(): {
    doc: ArekokoDocument;
    ids: {
      roomA: Id;
      shelfKuukan: Id;
      boxKuukan: Id;
      shelfItem: Id;
      boxItem: Id;
      dan1: Id;
      dan1Left: Id;
      dan1Right: Id;
      dan2: Id;
      itemRoom: Id;
      itemDan1: Id;
      itemDan1Left1: Id;
      itemDan1Left2: Id;
      itemDan1Right: Id;
      itemDan2: Id;
      batteryInBox: Id;
      markerPillar: Id;
    };
  } {
    const base = createBaseDoc();
    const ids = {
      roomA: '01920000-0000-7000-8000-000000000001',
      shelfKuukan: '01920000-0000-7000-8000-000000000002',
      boxKuukan: '01920000-0000-7000-8000-000000000003',
      shelfItem: '01920000-0000-7000-8000-000000000010',
      boxItem: '01920000-0000-7000-8000-000000000020',
      dan1: '01920000-0000-7000-8000-000000000031',
      dan1Left: '01920000-0000-7000-8000-000000000032',
      dan1Right: '01920000-0000-7000-8000-000000000033',
      dan2: '01920000-0000-7000-8000-000000000034',
      itemRoom: '01920000-0000-7000-8000-000000000040',
      itemDan1: '01920000-0000-7000-8000-000000000041',
      itemDan1Left1: '01920000-0000-7000-8000-000000000042',
      itemDan1Left2: '01920000-0000-7000-8000-000000000043',
      itemDan1Right: '01920000-0000-7000-8000-000000000044',
      itemDan2: '01920000-0000-7000-8000-000000000045',
      batteryInBox: '01920000-0000-7000-8000-000000000050',
      markerPillar: '01920000-0000-7000-8000-000000000060',
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
            id: ids.shelfKuukan,
            owner: ids.shelfItem,
            areaLabel: '段',
          },
          {
            id: ids.boxKuukan,
            owner: ids.boxItem,
            areaLabel: 'エリア',
          },
        ],
        areas: [
          {
            id: ids.dan1,
            kuukan: ids.shelfKuukan,
            parent: null,
            name: '段1',
            order: 0,
          },
          {
            id: ids.dan1Left,
            kuukan: ids.shelfKuukan,
            parent: ids.dan1,
            name: '段1左',
            order: 0,
          },
          {
            id: ids.dan1Right,
            kuukan: ids.shelfKuukan,
            parent: ids.dan1,
            name: '段1右',
            order: 1,
          },
          {
            id: ids.dan2,
            kuukan: ids.shelfKuukan,
            parent: null,
            name: '段2',
            order: 1,
          },
        ],
        items: [
          {
            id: ids.shelfItem,
            name: '棚A1',
            place: ids.roomA,
            category: null,
            tags: [],
          },
          {
            id: ids.itemRoom,
            name: 'ほうき',
            place: ids.roomA,
            category: null,
            tags: [],
          },
          {
            id: ids.itemDan1,
            name: 'バインダー',
            place: ids.dan1,
            category: null,
            tags: [],
          },
          {
            id: ids.boxItem,
            name: 'BOX1',
            place: ids.dan1Left,
            category: null,
            tags: [],
          },
          {
            id: ids.itemDan1Left1,
            name: 'アルバム',
            place: ids.dan1Left,
            category: null,
            tags: [],
          },
          {
            id: ids.itemDan1Left2,
            name: 'カメラ',
            place: ids.dan1Left,
            category: null,
            tags: [],
          },
          {
            id: ids.itemDan1Right,
            name: 'ドライバー',
            place: ids.dan1Right,
            category: null,
            tags: [],
          },
          {
            id: ids.itemDan2,
            name: '絵の具',
            place: ids.dan2,
            category: null,
            tags: [],
          },
          {
            id: ids.batteryInBox,
            name: '単3電池 防災',
            place: ids.boxKuukan,
            category: null,
            tags: [],
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
          {
            kuukan: ids.shelfKuukan,
            outline: rectOutline,
            aspect: 1.0,
          },
        ],
        partitions: [
          {
            area: ids.shelfKuukan,
            axis: 'y',
            at: [5000],
            seed: [5000, 5000],
            children: [ids.dan1, ids.dan2],
          },
          {
            area: ids.dan1,
            axis: 'x',
            at: [5000],
            seed: [5000, 2500],
            children: [ids.dan1Left, ids.dan1Right],
          },
        ],
        markers: [
          {
            id: ids.markerPillar,
            kuukan: ids.shelfKuukan,
            name: '柱',
            shape: { type: 'rect', x: 2000, y: 2000, w: 1000, h: 1000 },
            rotation: 0,
            notAPlace: true,
          },
        ],
        items: [
          // shelfKuukan の itemDan1Left1 に描画を設定
          {
            item: ids.itemDan1Left1,
            shape: { type: 'rect', x: 2000, y: 1000, w: 500, h: 500 },
            rotation: 0,
          },
        ],
      },
    };

    return { doc, ids };
  }

  describe('itemsInScope & itemsInKuukan', () => {
    it('エリアを選ぶと子孫のエリアのモノも入り、収納の中身は入らない。並び順は置き場の順かつ名前順', () => {
      const { doc: sampleDoc, ids } = createSampleHierarchyDoc();
      const doc = deepFreeze(sampleDoc);

      // dan1（子孫に dan1Left, dan1Right）を選ぶ
      const scopeDan1 = itemsInScope(doc, ids.shelfKuukan, ids.dan1);
      const scopeIds = scopeDan1.map(it => it.id);

      // dan1 のモノ: itemDan1 ('バインダー')
      // dan1Left のモノ: itemDan1Left1 ('アルバム'), boxItem ('BOX1'), itemDan1Left2 ('カメラ')
      // dan1Right のモノ: itemDan1Right ('ドライバー')
      // dan2 のモノ、roomA のモノ、boxKuukan の単3電池 は入らない
      expect(scopeIds).toContain(ids.itemDan1);
      expect(scopeIds).toContain(ids.itemDan1Left1);
      expect(scopeIds).toContain(ids.boxItem);
      expect(scopeIds).toContain(ids.itemDan1Left2);
      expect(scopeIds).toContain(ids.itemDan1Right);
      expect(scopeIds).not.toContain(ids.itemDan2);
      expect(scopeIds).not.toContain(ids.batteryInBox);
      expect(scopeIds).not.toContain(ids.itemRoom);

      // 置き場の順序: dan1 → dan1Left → dan1Right
      // 同じ置き場の中は名前順（localeCompare 'ja'）
      const dan1Names = scopeDan1.filter(it => it.place === ids.dan1).map(it => it.name);
      expect(dan1Names).toEqual(['バインダー']);

      const dan1LeftNames = scopeDan1.filter(it => it.place === ids.dan1Left).map(it => it.name);
      // 'BOX1', 'アルバム', 'カメラ'
      const sortedDan1Left = [...dan1LeftNames].sort((a, b) => a.localeCompare(b, 'ja'));
      expect(dan1LeftNames).toEqual(sortedDan1Left);

      // 全体（itemsInKuukan）
      const inKuukan = itemsInKuukan(doc, ids.shelfKuukan);
      expect(inKuukan.map(it => it.id)).not.toContain(ids.batteryInBox);
      expect(inKuukan.length).toBe(6); // itemDan1, boxItem, itemDan1Left1, itemDan1Left2, itemDan1Right, itemDan2
    });
  });

  describe('undrawnCounts', () => {
    it('描画したモノは数えず、中を分けたエリアのキーに直接置かれた件数が入る', () => {
      const { doc: sampleDoc, ids } = createSampleHierarchyDoc();
      const doc = deepFreeze(sampleDoc);

      const counts = undrawnCounts(doc, ids.shelfKuukan);

      // itemDan1Left1 は描画されているので数えない
      // dan1: itemDan1 (1件, 中を分けたエリア)
      // dan1Left: boxItem, itemDan1Left2 (2件)
      // dan1Right: itemDan1Right (1件)
      // dan2: itemDan2 (1件)
      expect(counts.get(ids.dan1)).toBe(1);
      expect(counts.get(ids.dan1Left)).toBe(2);
      expect(counts.get(ids.dan1Right)).toBe(1);
      expect(counts.get(ids.dan2)).toBe(1);
    });
  });

  describe('drawingOffset & offsetText', () => {
    it('置き場の内側・辺の上・別の葉・外形の外・中を分けたエリアの中心判定', () => {
      const { doc: sampleDoc, ids } = createSampleHierarchyDoc();
      // shelfKuukan:
      // dan1: y: 0〜5000
      // dan1Left: x: 0〜5000, y: 0〜5000
      // dan1Right: x: 5000〜10000, y: 0〜5000
      // dan2: y: 5000〜10000

      // 1. 置き場の内側 → ok
      // itemDan1Left1 の描画: rect [2000, 1000, 500, 500]、中心 (2250, 1250)
      expect(drawingOffset(sampleDoc, ids.itemDan1Left1)).toEqual({ kind: 'ok' });

      // 2. 辺の上 → ok（中心が x=5000 の境界線上）
      const docOnEdge: ArekokoDocument = {
        ...sampleDoc,
        drawing: {
          ...sampleDoc.drawing,
          items: [
            {
              item: ids.itemDan1Left1,
              shape: { type: 'point', at: [5000, 2500] },
              rotation: 0,
            },
          ],
        },
      };
      expect(drawingOffset(docOnEdge, ids.itemDan1Left1)).toEqual({ kind: 'ok' });

      // 3. 別の葉 → off（drawnIn がその葉）
      // itemDan1Left1（所属：dan1Left）の中心が dan2 (x: 2500, y: 7500) にある
      const docAnotherLeaf: ArekokoDocument = {
        ...sampleDoc,
        drawing: {
          ...sampleDoc.drawing,
          items: [
            {
              item: ids.itemDan1Left1,
              shape: { type: 'point', at: [2500, 7500] },
              rotation: 0,
            },
          ],
        },
      };
      const offLeaf = drawingOffset(docAnotherLeaf, ids.itemDan1Left1);
      expect(offLeaf).toEqual({ kind: 'off', drawnIn: ids.dan2 });
      expect(offsetText(docAnotherLeaf, ids.itemDan1Left1, offLeaf!)).toBe(
        '所属：段1左（描画は段2の上にあります）',
      );

      // 4. 外形の外 → off（drawnIn null）
      const docOutside: ArekokoDocument = {
        ...sampleDoc,
        drawing: {
          ...sampleDoc.drawing,
          items: [
            {
              item: ids.itemDan1Left1,
              shape: { type: 'point', at: [12000, 2500] },
              rotation: 0,
            },
          ],
        },
      };
      const offOutside = drawingOffset(docOutside, ids.itemDan1Left1);
      expect(offOutside).toEqual({ kind: 'off', drawnIn: null });
      expect(offsetText(docOutside, ids.itemDan1Left1, offOutside!)).toBe(
        '所属：段1左（描画はクウカンの外にあります）',
      );

      // 5. 中を分けたエリアに置いたモノの中心が子孫の葉 → ok
      // itemDan1 は dan1（中を分けたエリア、y: 0〜5000）に所属。中心が (2500, 2500)（dan1Left の中）
      const docIntermediate: ArekokoDocument = {
        ...sampleDoc,
        drawing: {
          ...sampleDoc.drawing,
          items: [
            {
              item: ids.itemDan1,
              shape: { type: 'point', at: [2500, 2500] },
              rotation: 0,
            },
          ],
        },
      };
      expect(drawingOffset(docIntermediate, ids.itemDan1)).toEqual({ kind: 'ok' });

      // 6. 回転しても中心が変わらないため結果が同じ
      const docRotated: ArekokoDocument = {
        ...sampleDoc,
        drawing: {
          ...sampleDoc.drawing,
          items: [
            {
              item: ids.itemDan1Left1,
              shape: { type: 'rect', x: 2000, y: 1000, w: 500, h: 500 },
              rotation: 3,
            },
          ],
        },
      };
      expect(drawingOffset(docRotated, ids.itemDan1Left1)).toEqual({ kind: 'ok' });

      // 7. 描画がない → null
      expect(drawingOffset(sampleDoc, ids.itemDan1Right)).toBeNull();
    });
  });

  describe('quickSearch', () => {
    it('直接・収納の中・入れ子の収納の中（入れ子は外側の収納の件数に入る）が集計される', () => {
      const { doc: sampleDoc, ids } = createSampleHierarchyDoc();
      const doc = deepFreeze(sampleDoc);

      // Room A の視点から検索
      // shelfItem ('棚A1') は Room A にある収納
      // その中の dan1Left に boxItem ('BOX1')
      // その中の boxKuukan に batteryInBox ('単3電池 防災')
      // さらに Room A に itemRoom ('ほうき')
      // '防災' で検索 → batteryInBox がヒット
      const res = quickSearch(doc, ids.roomA, '防災');
      expect(res.direct.size).toBe(0);
      // batteryInBox は boxItem の中だが、Room A から見ると shelfItem の中に入る
      expect(res.insideStorage.get(ids.shelfItem)).toBe(1);
      expect(res.perPlace.get(ids.roomA)).toBe(1); // shelfItem の置き場は roomA

      // '棚' で検索 → shelfItem 自体が直接ヒット
      const resShelf = quickSearch(doc, ids.roomA, '棚');
      expect(resShelf.direct.has(ids.shelfItem)).toBe(true);
      expect(resShelf.insideStorage.size).toBe(0);
      expect(resShelf.perPlace.get(ids.roomA)).toBe(1);

      // 文字が空なら direct・insideStorage・perPlace は空集合/空マップ
      const resEmpty = quickSearch(doc, ids.roomA, '');
      expect(resEmpty.direct.size).toBe(0);
      expect(resEmpty.insideStorage.size).toBe(0);
      expect(resEmpty.perPlace.size).toBe(0);
    });
  });

  describe('kuukanTrail', () => {
    it('Room A › 棚A1 › BOX1 のような3段の入れ子で順と via が正しく返る', () => {
      const { doc: sampleDoc, ids } = createSampleHierarchyDoc();
      const doc = deepFreeze(sampleDoc);

      // BOX1 のクウカンからたどる
      const trail = kuukanTrail(doc, ids.boxKuukan);
      expect(trail).toEqual([
        {
          kuukan: ids.roomA,
          name: 'Room A',
          via: ids.roomA, // shelfItem は roomA に直接置かれている
        },
        {
          kuukan: ids.shelfKuukan,
          name: '棚A1',
          via: ids.dan1Left, // boxItem は dan1Left に置かれている
        },
        {
          kuukan: ids.boxKuukan,
          name: 'BOX1',
          via: null,
        },
      ]);

      // 未設定のクウカン
      expect(kuukanTrail(doc, NIL_ID)).toEqual([
        { kuukan: NIL_ID, name: '未設定', via: null },
      ]);

      // どこにも置かれていないクウカン
      expect(kuukanTrail(doc, ids.roomA)).toEqual([
        { kuukan: ids.roomA, name: 'Room A', via: null },
      ]);
    });
  });
});
