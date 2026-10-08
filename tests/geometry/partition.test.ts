import { describe, it, expect } from 'vitest';
import type { Point } from '../../src/geometry/types';
import {
  boundedSegment,
  splitPolygon,
  evenSplitPositions,
  splitRect,
  rectToPolygon,
} from '../../src/geometry/partition';
import { polygonArea, isRectangle } from '../../src/geometry/polygon';

describe('partition.ts', () => {
  const lShapePoints: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 5000],
    [5000, 5000],
    [5000, 10000],
    [0, 10000],
  ];

  const uShapePoints: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [7000, 10000],
    [7000, 3000],
    [3000, 3000],
    [3000, 10000],
    [0, 10000],
  ];

  describe('evenSplitPositions', () => {
    it('指定区間を n 等分する位置を昇順で返す', () => {
      expect(evenSplitPositions(0, 10000, 2)).toEqual([5000]);
      expect(evenSplitPositions(0, 10000, 4)).toEqual([2500, 5000, 7500]);
    });

    it('狭義の昇順にならない場合や n < 2 は null を返す', () => {
      expect(evenSplitPositions(0, 10000, 1)).toBeNull();
      expect(evenSplitPositions(10000, 0, 2)).toBeNull();
      expect(evenSplitPositions(0, 1, 2)).toBeNull();
    });
  });

  describe('splitRect and rectToPolygon', () => {
    it('rectToPolygon で時計回りの4点多角形を作る', () => {
      const poly = rectToPolygon({ x0: 0, y0: 0, x1: 1000, y1: 500 });
      expect(poly).toEqual([
        [0, 0],
        [1000, 0],
        [1000, 500],
        [0, 500],
      ]);
      expect(isRectangle(poly)).toBe(true);
    });

    it('splitRect で長方形を帯に分割する', () => {
      const rect = { x0: 0, y0: 0, x1: 1000, y1: 500 };
      const subX = splitRect(rect, 'x', [300, 700]);
      expect(subX).toEqual([
        { x0: 0, y0: 0, x1: 300, y1: 500 },
        { x0: 300, y0: 0, x1: 700, y1: 500 },
        { x0: 700, y0: 0, x1: 1000, y1: 500 },
      ]);

      const subY = splitRect(rect, 'y', [200]);
      expect(subY).toEqual([
        { x0: 0, y0: 0, x1: 1000, y1: 200 },
        { x0: 0, y0: 200, x1: 1000, y1: 500 },
      ]);
    });
  });

  describe('boundedSegment', () => {
    it('L字で反り返った角 (5000,5000) を通る縦線（seed [5000,2000]）で線分 (5000,0)〜(5000,5000) を返す', () => {
      const seg = boundedSegment(lShapePoints, 'x', [5000, 2000]);
      expect(seg).toEqual({
        from: [5000, 0],
        to: [5000, 5000],
      });
    });

    it('L字で y=5000 の横線（seed [2000,5000]）で線分 (0,5000)〜(5000,5000) を返す（辺に重なる手前の角で止まる）', () => {
      const seg = boundedSegment(lShapePoints, 'y', [2000, 5000]);
      expect(seg).toEqual({
        from: [0, 5000],
        to: [5000, 5000],
      });
    });

    it('コの字の腕の中の線（seed [1500,6000], axis: "y"）で腕の中で止まる線分を返す', () => {
      const seg = boundedSegment(uShapePoints, 'y', [1500, 6000]);
      expect(seg).toEqual({
        from: [0, 6000],
        to: [3000, 6000],
      });
    });

    it('seed が境界上の場合は null を返す', () => {
      expect(boundedSegment(lShapePoints, 'x', [5000, 0])).toBeNull();
      expect(boundedSegment(lShapePoints, 'y', [5000, 5000])).toBeNull();
    });
  });

  describe('splitPolygon', () => {
    it('L字を縦線 (5000,0)〜(5000,5000) で2つの長方形に分割し、面積の和が元と等しい', () => {
      const seg = { from: [5000, 0] as Point, to: [5000, 5000] as Point };
      const [p1, p2] = splitPolygon(lShapePoints, 'x', seg);

      // x 座標が小さい側が先
      expect(p1).toEqual([
        [0, 0],
        [5000, 0],
        [5000, 10000],
        [0, 10000],
      ]);
      expect(p2).toEqual([
        [5000, 0],
        [10000, 0],
        [10000, 5000],
        [5000, 5000],
      ]);

      expect(isRectangle(p1)).toBe(true);
      expect(isRectangle(p2)).toBe(true);
      expect(polygonArea(p1) + polygonArea(p2)).toBe(polygonArea(lShapePoints));
    });

    it('L字を横線 (0,5000)〜(5000,5000) で2つの長方形に分割し、面積の和が元と等しい', () => {
      const seg = { from: [0, 5000] as Point, to: [5000, 5000] as Point };
      const [p1, p2] = splitPolygon(lShapePoints, 'y', seg);

      // y 座標が小さい側が先
      expect(p1).toEqual([
        [0, 0],
        [10000, 0],
        [10000, 5000],
        [0, 5000],
      ]);
      expect(p2).toEqual([
        [0, 5000],
        [5000, 5000],
        [5000, 10000],
        [0, 10000],
      ]);

      expect(isRectangle(p1)).toBe(true);
      expect(isRectangle(p2)).toBe(true);
      expect(polygonArea(p1) + polygonArea(p2)).toBe(polygonArea(lShapePoints));
    });
  });
});
