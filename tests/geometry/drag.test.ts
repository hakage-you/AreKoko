import { describe, it, expect } from 'vitest';
import type { Partition, Point } from '../../src/core/types';
import type { AreaTree } from '../../src/geometry/regions';
import { dragRange } from '../../src/geometry/drag';

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

describe('dragRange', () => {
  it('長方形を縦に2つ → min 1, max 9999', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['left', 'right']]]),
    };
    const partitions: Partition[] = [
      {
        area: 'room',
        axis: 'x',
        at: [5000],
        seed: [5000, 5000],
        children: ['left', 'right'],
      },
    ];

    const range = dragRange(RECT_OUTLINE, tree, partitions, 'room', 0);
    expect(range).toEqual({ min: 1, max: 9999 });
  });

  it('N等分の真ん中の線 → 隣の線の内側', () => {
    const tree: AreaTree = {
      root: 'shelf',
      children: new Map([['shelf', ['dan1', 'dan2', 'dan3', 'dan4']]]),
    };
    const partitions: Partition[] = [
      {
        area: 'shelf',
        axis: 'y',
        at: [2500, 5000, 7500],
        children: ['dan1', 'dan2', 'dan3', 'dan4'],
      },
    ];

    // 真ん中の線（index 1: 5000）は隣の線 2500 と 7500 の内側
    const rangeMiddle = dragRange(RECT_OUTLINE, tree, partitions, 'shelf', 1);
    expect(rangeMiddle).toEqual({ min: 2501, max: 7499 });

    // 端の線（index 0: 2500）は外形境界 0 と隣の線 5000 の内側
    const rangeFirst = dragRange(RECT_OUTLINE, tree, partitions, 'shelf', 0);
    expect(rangeFirst).toEqual({ min: 1, max: 4999 });
  });

  it('子孫の縦線があると、それを越えられない', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([
        ['room', ['left', 'right']],
        ['left', ['left1', 'left2']],
      ]),
    };
    const partitions: Partition[] = [
      {
        area: 'room',
        axis: 'x',
        at: [5000],
        seed: [5000, 5000],
        children: ['left', 'right'],
      },
      {
        area: 'left',
        axis: 'x',
        at: [2500],
        seed: [2500, 5000],
        children: ['left1', 'left2'],
      },
    ];

    // 親の縦線（5000）を左へ動かすと、子孫の縦線（2500）の手前で止まる
    const range = dragRange(RECT_OUTLINE, tree, partitions, 'room', 0);
    expect(range).toEqual({ min: 2501, max: 9999 });
  });

  it('L字で反り返った角で止まっている線 → min === max', () => {
    const tree: AreaTree = {
      root: 'room',
      children: new Map([['room', ['top', 'bottom']]]),
    };
    // 反り返った角 [5000, 5000] で止まっている横の線
    const partitions: Partition[] = [
      {
        area: 'room',
        axis: 'y',
        at: [5000],
        seed: [2500, 5000],
        children: ['top', 'bottom'],
      },
    ];

    const range = dragRange(L_OUTLINE, tree, partitions, 'room', 0);
    expect(range).toEqual({ min: 5000, max: 5000 });
  });
});
