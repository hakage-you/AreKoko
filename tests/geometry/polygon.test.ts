import { describe, it, expect } from 'vitest';
import type { Point } from '../../src/geometry/types';
import {
  normalizePolygon,
  validateRectilinearPolygon,
  validateOutline,
  boundingRect,
  polygonArea,
  isRectangle,
  locatePoint,
  decomposeToRects,
} from '../../src/geometry/polygon';

describe('polygon.ts', () => {
  // 長方形
  const rectPoints: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  // L字
  const lShapePoints: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 5000],
    [5000, 5000],
    [5000, 10000],
    [0, 10000],
  ];

  // コの字
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

  // 凸凹（階段状）
  const steppedPoints: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 3000],
    [7000, 3000],
    [7000, 6000],
    [4000, 6000],
    [4000, 10000],
    [0, 10000],
  ];

  describe('normalizePolygon', () => {
    it('一直線上の途中の点を除去する', () => {
      const withCollinear: Point[] = [
        [0, 0],
        [5000, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ];
      const normalized = normalizePolygon(withCollinear);
      expect(normalized).toEqual([
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ]);
    });

    it('連続する重複点および始点終点の重複を除去する', () => {
      const withDuplicates: Point[] = [
        [0, 0],
        [10000, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
        [0, 0],
      ];
      const normalized = normalizePolygon(withDuplicates);
      expect(normalized).toEqual([
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ]);
    });

    it('逆向き（反時計回り）の多角形の向きを反転して正の面積にそろえる', () => {
      const ccw: Point[] = [
        [0, 0],
        [0, 10000],
        [10000, 10000],
        [10000, 0],
      ];
      const normalized = normalizePolygon(ccw);
      expect(normalized).not.toBeNull();
      expect(polygonArea(normalized!)).toBe(100000000);
      expect(normalized).toEqual([
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ]);
    });

    it('正規化後に点が4未満になる、または面積0なら null を返す', () => {
      expect(normalizePolygon([[0, 0], [10, 0]])).toBeNull();
      expect(normalizePolygon([[0, 0], [10, 0], [0, 0]])).toBeNull();
      expect(normalizePolygon([[0, 0], [10, 0], [10, 0], [0, 0]])).toBeNull();
    });
  });

  describe('validateRectilinearPolygon', () => {
    it('正しい長方形・L字・コの字・階段状を受け入れる', () => {
      expect(validateRectilinearPolygon(rectPoints).ok).toBe(true);
      expect(validateRectilinearPolygon(lShapePoints).ok).toBe(true);
      expect(validateRectilinearPolygon(uShapePoints).ok).toBe(true);
      expect(validateRectilinearPolygon(steppedPoints).ok).toBe(true);
    });

    it('不正な入力：配列でない', () => {
      const res = validateRectilinearPolygon('not-array');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('配列ではありません');
    });

    it('不正な入力：整数でない座標', () => {
      const res = validateRectilinearPolygon([
        [0, 0],
        [10.5, 0],
        [10.5, 10],
        [0, 10],
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('整数');
    });

    it('不正な入力：点が3つ', () => {
      const res = validateRectilinearPolygon([
        [0, 0],
        [10, 0],
        [10, 10],
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('4つ未満');
    });

    it('不正な入力：斜めの辺', () => {
      const res = validateRectilinearPolygon([
        [0, 0],
        [10, 0],
        [5, 5],
        [0, 10],
      ]);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('斜めの辺');
    });

    it('不正な入力：自己交差（8の字）', () => {
      // 辺 (0,2)-(6,2) と (2,6)-(2,0) が (2,2) で内部交差する
      const figureEight: Point[] = [
        [0, 2],
        [6, 2],
        [6, 6],
        [2, 6],
        [2, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ];
      const res = validateRectilinearPolygon(figureEight);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('自己交差');
    });

    it('不正な入力：辺の接触（頂点での接触）', () => {
      // 2つの四角形が (4,4) で接触
      const pinched: Point[] = [
        [0, 0],
        [4, 0],
        [4, 4],
        [8, 4],
        [8, 8],
        [4, 8],
        [4, 4],
        [0, 4],
      ];
      const res = validateRectilinearPolygon(pinched);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('接触');
    });
  });

  describe('validateOutline', () => {
    it('外接長方形が [0,10000]×[0,10000] のときのみ受け入れる', () => {
      expect(validateOutline(rectPoints).ok).toBe(true);
      expect(validateOutline(lShapePoints).ok).toBe(true);
      expect(validateOutline(uShapePoints).ok).toBe(true);
      expect(validateOutline(steppedPoints).ok).toBe(true);
    });

    it('外接長方形が 0〜10000 でない場合は拒否する', () => {
      const smallRect: Point[] = [
        [0, 0],
        [5000, 0],
        [5000, 5000],
        [0, 5000],
      ];
      const res = validateOutline(smallRect);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('[0,10000]×[0,10000]');
    });
  });

  describe('locatePoint', () => {
    it('L字の内側、辺の上、頂点の上、外側、凹みの外側、半整数を正しく判定する', () => {
      // 内側
      expect(locatePoint(lShapePoints, [2500, 2500])).toBe('inside');
      expect(locatePoint(lShapePoints, [2500, 7500])).toBe('inside');

      // 辺の上
      expect(locatePoint(lShapePoints, [5000, 0])).toBe('boundary');
      expect(locatePoint(lShapePoints, [0, 5000])).toBe('boundary');
      expect(locatePoint(lShapePoints, [5000, 7500])).toBe('boundary');

      // 頂点の上（外側の角および反り返った凹み角）
      expect(locatePoint(lShapePoints, [0, 0])).toBe('boundary');
      expect(locatePoint(lShapePoints, [5000, 5000])).toBe('boundary');

      // 明確な外側
      expect(locatePoint(lShapePoints, [-100, 5000])).toBe('outside');
      expect(locatePoint(lShapePoints, [12000, 5000])).toBe('outside');

      // 凹みの中（外形長方形の範囲内だが多角形の外側）
      expect(locatePoint(lShapePoints, [7500, 7500])).toBe('outside');

      // 半整数
      expect(locatePoint(lShapePoints, [2500.5, 2500.5])).toBe('inside');
      expect(locatePoint(lShapePoints, [7500.5, 7500.5])).toBe('outside');
    });
  });

  describe('decomposeToRects', () => {
    it('L字を面積の和が一致し重ならない長方形に分解する', () => {
      const rects = decomposeToRects(lShapePoints);
      expect(rects.length).toBe(2);

      const totalArea = rects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      expect(totalArea).toBe(polygonArea(lShapePoints));
      expect(totalArea).toBe(75000000);

      // 長方形どうしの重なりがないことを確認
      const [r1, r2] = rects;
      const overlaps = !(
        r1!.x1 <= r2!.x0 ||
        r2!.x1 <= r1!.x0 ||
        r1!.y1 <= r2!.y0 ||
        r2!.y1 <= r1!.y0
      );
      expect(overlaps).toBe(false);
    });

    it('コの字を面積の和が一致し重ならない長方形に分解する', () => {
      const rects = decomposeToRects(uShapePoints);
      expect(rects.length).toBe(3);

      const totalArea = rects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      expect(totalArea).toBe(polygonArea(uShapePoints));
      expect(totalArea).toBe(72000000);

      // 全ペアで重なりがないことを確認
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          const overlaps = !(
            a.x1 <= b.x0 ||
            b.x1 <= a.x0 ||
            a.y1 <= b.y0 ||
            b.y1 <= a.y0
          );
          expect(overlaps).toBe(false);
        }
      }
    });
  });

  describe('boundingRect / isRectangle', () => {
    it('外接長方形と長方形判定が正しく動作する', () => {
      expect(boundingRect(rectPoints)).toEqual({ x0: 0, y0: 0, x1: 10000, y1: 10000 });
      expect(isRectangle(rectPoints)).toBe(true);
      expect(isRectangle(lShapePoints)).toBe(false);
    });
  });
});
