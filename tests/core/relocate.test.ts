import type { Point } from '../../src/core/types';
import { describe, it, expect } from 'vitest';
import { relocateItems } from '../../src/core/relocate';
import { validateDocument } from '../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../helpers/ctx';
import { NIL_ID } from '../../src/core/constants';

describe('relocateItems', () => {
  it('mapping に従ってモノを移し、updatedAt を更新し、描画を外す・残す', () => {
    const ctx = createTestContext({ now: '2026-10-08T12:00:00.000Z' });
    const base = createBaseDoc();

    const kuukanA = '01920000-0000-7000-8000-000000000001';
    const kuukanB = '01920000-0000-7000-8000-000000000002';
    const areaA1 = '01920000-0000-7000-8000-000000000011';
    const areaA2 = '01920000-0000-7000-8000-000000000012';

    const item1 = '01920000-0000-7000-8000-000000000101';
    const item2 = '01920000-0000-7000-8000-000000000102';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: kuukanA, name: 'クウカンA', owner: null, areaLabel: 'エリア' },
          { id: kuukanB, name: 'クウカンB', owner: null, areaLabel: 'エリア' },
        ],
        areas: [
          { id: areaA1, kuukan: kuukanA, parent: null, name: 'エリアA1', order: 0 },
          { id: areaA2, kuukan: kuukanA, parent: null, name: 'エリアA2', order: 1 },
        ],
        items: [
          { id: item1, name: 'モノ1', place: areaA1, category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
          { id: item2, name: 'モノ2', place: areaA1, category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
        ],
      },
      drawing: {
        ...base.drawing,
        kuukans: [
          { kuukan: kuukanA, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]] as Point[], aspect: 1 },
          { kuukan: kuukanB, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]] as Point[], aspect: 1 },
        ],
        partitions: [
          { area: kuukanA, axis: 'x' as const, at: [5000], seed: [5000, 5000] as Point, children: [areaA1, areaA2] },
        ],
        items: [
          { item: item1, shape: { type: 'point' as const, at: [1000, 1000] as Point }, rotation: 0 as const },
          { item: item2, shape: { type: 'point' as const, at: [2000, 2000] as Point }, rotation: 0 as const },
        ],
      },
    });

    // areaA1 -> areaA2 （同じクウカン内）への移動
    const mappingSame = new Map([[areaA1, areaA2]]);
    const resSame = relocateItems(doc, mappingSame, ctx);

    expect(resSame.moved).toEqual([item1, item2]);
    expect(resSame.doc.membership.items.find(i => i.id === item1)?.place).toBe(areaA2);
    expect(resSame.doc.membership.items.find(i => i.id === item1)?.updatedAt).toBe('2026-10-08T12:00:00.000Z');
    // 同じクウカン内なら描画は残る
    expect(resSame.doc.drawing.items.map(d => d.item)).toEqual([item1, item2]);
    expect(resSame.relocations).toEqual([
      { from: areaA1, to: areaA2, items: [item1, item2] },
    ]);
    expect(validateDocument(resSame.doc)).toEqual([]);

    // areaA1 -> kuukanB （別のクウカン）への移動
    const mappingDiff = new Map([[areaA1, kuukanB]]);
    const resDiff = relocateItems(doc, mappingDiff, ctx);

    expect(resDiff.moved).toEqual([item1, item2]);
    // 別のクウカンへ移ったので描画が外れる
    expect(resDiff.doc.drawing.items).toEqual([]);
    expect(validateDocument(resDiff.doc)).toEqual([]);
  });

  it('マッピングが連鎖している場合はキーでなくなるまで辿る', () => {
    const ctx = createTestContext();
    const base = createBaseDoc();

    const kuukanA = '01920000-0000-7000-8000-000000000001';
    const area1 = '01920000-0000-7000-8000-000000000011';
    const area2 = '01920000-0000-7000-8000-000000000012';
    const item1 = '01920000-0000-7000-8000-000000000101';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [...base.membership.kuukans, { id: kuukanA, name: '部屋', owner: null, areaLabel: 'エリア' }],
        areas: [
          { id: area1, kuukan: kuukanA, parent: null, name: 'エリア1', order: 0 },
          { id: area2, kuukan: kuukanA, parent: null, name: 'エリア2', order: 1 },
        ],
        items: [{ id: item1, name: '本', place: area1, category: null, tags: [] }],
      },
    });

    // area1 -> area2 -> kuukanA
    const mapping = new Map([
      [area1, area2],
      [area2, kuukanA],
    ]);

    const res = relocateItems(doc, mapping, ctx);
    expect(res.doc.membership.items[0]?.place).toBe(kuukanA);
    expect(res.relocations).toEqual([
      { from: area1, to: kuukanA, items: [item1] },
    ]);
  });
});
