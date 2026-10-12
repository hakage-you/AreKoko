import { describe, it, expect } from 'vitest';
import type { Partition, Point } from '../../src/core/types';
import { computeRegions, leafAt } from '../../src/geometry/regions';
import type { AreaTree } from '../../src/geometry/regions';
import { boundingRect } from '../../src/geometry/polygon';

const RECT_OUTLINE: Point[] = [
  [0, 0],
  [10000, 0],
  [10000, 10000],
  [0, 10000],
];

const L_OUTLINE: Point[] = [
  [0, 0],
  [10000, 0],
  [10000, 5000],
  [5000, 5000],
  [5000, 10000],
  [0, 10000],
];

describe('computeRegions', () => {
  it('長方形のクウカンを縦に2つ分ける（境界で止める仕切り）', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['left', 'right']]]),
    };
    const partitions: Partition[] = [
      { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['left', 'right'] },
    ];

    const res = computeRegions(RECT_OUTLINE, tree, partitions);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(boundingRect(res.regions.get('left')!)).toEqual({ x0: 0, y0: 0, x1: 5000, y1: 10000 });
    expect(boundingRect(res.regions.get('right')!)).toEqual({ x0: 5000, y0: 0, x1: 10000, y1: 10000 });
  });

  it('入れ子：押し入れ（上段・下段に分け、上段をさらに左右に分ける）', () => {
    const tree: AreaTree = {
      root: 'closet',
      children: new Map([
        ['closet', ['top', 'bottom']],
        ['top', ['top-left', 'top-right']],
      ]),
    };
    const partitions: Partition[] = [
      { area: 'closet', axis: 'y', at: [5000], seed: [5000, 5000], children: ['top', 'bottom'] },
      { area: 'top', axis: 'x', at: [5000], seed: [5000, 2500], children: ['top-left', 'top-right'] },
    ];

    const res = computeRegions(RECT_OUTLINE, tree, partitions);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(boundingRect(res.regions.get('top')!)).toEqual({ x0: 0, y0: 0, x1: 10000, y1: 5000 });
    expect(boundingRect(res.regions.get('bottom')!)).toEqual({ x0: 0, y0: 5000, x1: 10000, y1: 10000 });
    expect(boundingRect(res.regions.get('top-left')!)).toEqual({ x0: 0, y0: 0, x1: 5000, y1: 5000 });
    expect(boundingRect(res.regions.get('top-right')!)).toEqual({ x0: 5000, y0: 0, x1: 10000, y1: 5000 });
  });

  it('N等分：3段の棚（axis "y", at [3333,6667]）', () => {
    const tree: AreaTree = {
      root: 'shelf',
      children: new Map([['shelf', ['dan1', 'dan2', 'dan3']]]),
    };
    const partitions: Partition[] = [
      { area: 'shelf', axis: 'y', at: [3333, 6667], children: ['dan1', 'dan2', 'dan3'] },
    ];

    const res = computeRegions(RECT_OUTLINE, tree, partitions);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(boundingRect(res.regions.get('dan1')!)).toEqual({ x0: 0, y0: 0, x1: 10000, y1: 3333 });
    expect(boundingRect(res.regions.get('dan2')!)).toEqual({ x0: 0, y0: 3333, x1: 10000, y1: 6667 });
    expect(boundingRect(res.regions.get('dan3')!)).toEqual({ x0: 0, y0: 6667, x1: 10000, y1: 10000 });
  });

  it('長方形でない領域の N等分は失敗する', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['d1', 'd2', 'd3']]]),
    };
    const partitions: Partition[] = [
      { area: 'room', axis: 'y', at: [3333, 6667], children: ['d1', 'd2', 'd3'] },
    ];

    const res = computeRegions(L_OUTLINE, tree, partitions);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/長方形/);
  });

  it('L字の外形で、反り返った角を通る仕切り', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['top', 'bottom']]]),
    };
    const partitions: Partition[] = [
      { area: 'room', axis: 'y', at: [5000], seed: [2500, 5000], children: ['top', 'bottom'] },
    ];

    const res = computeRegions(L_OUTLINE, tree, partitions);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(boundingRect(res.regions.get('top')!)).toEqual({ x0: 0, y0: 0, x1: 10000, y1: 5000 });
    expect(boundingRect(res.regions.get('bottom')!)).toEqual({ x0: 0, y0: 5000, x1: 5000, y1: 10000 });
  });

  describe('検査による失敗ケース', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['a1', 'a2']]]),
    };

    it('子を持つ節に仕切りがない', () => {
      const res = computeRegions(RECT_OUTLINE, tree, []);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/仕切りがありません/);
    });

    it('仕切りの children と木の子が違う（過不足・重複）', () => {
      const res1 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['a1', 'a3'] },
      ]);
      expect(res1.ok).toBe(false);
      if (!res1.ok) expect(res1.reason).toMatch(/一致しません/);

      const res2 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['a1', 'a1'] },
      ]);
      expect(res2.ok).toBe(false);
      if (!res2.ok) expect(res2.reason).toMatch(/重複/);
    });

    it('children の数と at の数が合わない', () => {
      const res = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [3000, 6000], children: ['a1', 'a2'] },
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/合いません/);
    });

    it('at が昇順でない、または整数でない', () => {
      const tree3: AreaTree = {
        root: 'room',
        children: new Map([['room', ['a1', 'a2', 'a3']]]),
      };
      const res1 = computeRegions(RECT_OUTLINE, tree3, [
        { area: 'room', axis: 'y', at: [6000, 3000], children: ['a1', 'a2', 'a3'] },
      ]);
      expect(res1.ok).toBe(false);
      if (!res1.ok) expect(res1.reason).toMatch(/昇順/);

      const res2 = computeRegions(RECT_OUTLINE, tree3, [
        { area: 'room', axis: 'y', at: [4000, 4000], children: ['a1', 'a2', 'a3'] },
      ]);
      expect(res2.ok).toBe(false);

      const res3 = computeRegions(RECT_OUTLINE, tree3, [
        { area: 'room', axis: 'y', at: [3000.5, 6000], children: ['a1', 'a2', 'a3'] },
      ]);
      expect(res3.ok).toBe(false);
      if (!res3.ok) expect(res3.reason).toMatch(/整数/);
    });

    it('seed[軸] !== at[0]', () => {
      const res = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [4000, 5000], children: ['a1', 'a2'] },
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/一致しません/);
    });

    it('seed が境界上、または親の領域の内部にない', () => {
      const res1 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [0], seed: [0, 5000], children: ['a1', 'a2'] },
      ]);
      expect(res1.ok).toBe(false);
      if (!res1.ok) expect(res1.reason).toMatch(/境界上/);

      const res2 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [5000, -500], children: ['a1', 'a2'] },
      ]);
      expect(res2.ok).toBe(false);
      if (!res2.ok) expect(res2.reason).toMatch(/内部にありません/);
    });

    it('存在しないエリアの仕切り、または分割されていないエリアの仕切り', () => {
      const res1 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['a1', 'a2'] },
        { area: 'unknown', axis: 'x', at: [3000], seed: [3000, 3000], children: ['x1', 'x2'] },
      ]);
      expect(res1.ok).toBe(false);
      if (!res1.ok) expect(res1.reason).toMatch(/存在しません/);

      const res2 = computeRegions(RECT_OUTLINE, tree, [
        { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['a1', 'a2'] },
        { area: 'a1', axis: 'x', at: [2500], seed: [2500, 2500], children: ['sub1', 'sub2'] },
      ]);
      expect(res2.ok).toBe(false);
      if (!res2.ok) expect(res2.reason).toMatch(/分割されていないエリア/);
    });
  });

  describe('leafAt', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['left', 'right']]]),
    };
    const partitions: Partition[] = [
      { area: 'room', axis: 'x', at: [5000], seed: [5000, 5000], children: ['left', 'right'] },
    ];

    it('葉の中、仕切りの線の上、外形の外', () => {
      const res = computeRegions(RECT_OUTLINE, tree, partitions);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(leafAt(res.regions, tree, [2500, 5000])).toBe('left');
      expect(leafAt(res.regions, tree, [7500, 5000])).toBe('right');
      expect(leafAt(res.regions, tree, [5000, 5000])).toBeNull();
      expect(leafAt(res.regions, tree, [-100, 5000])).toBeNull();
      expect(leafAt(res.regions, tree, [10500, 5000])).toBeNull();
      expect(leafAt(res.regions, tree, [0, 5000])).toBeNull();
    });
  });
});
