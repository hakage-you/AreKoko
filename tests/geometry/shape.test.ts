import { describe, it, expect } from 'vitest';
import type { Shape } from '../../src/core/types';
import { isValidShape, shapeCenter } from '../../src/geometry/shape';

describe('shape.ts', () => {
  describe('isValidShape', () => {
    it('point 形式を検査する', () => {
      expect(isValidShape({ type: 'point', at: [100, 200] })).toBe(true);
      // 小数は無効
      expect(isValidShape({ type: 'point', at: [100.5, 200] })).toBe(false);
      // 要素数が2でない
      expect(isValidShape({ type: 'point', at: [100] as unknown as [number, number] })).toBe(false);
    });

    it('rect 形式を検査する（整数・w/h >= 1）', () => {
      expect(isValidShape({ type: 'rect', x: 0, y: 0, w: 100, h: 200 })).toBe(true);
      expect(isValidShape({ type: 'rect', x: 0, y: 0, w: 0, h: 200 })).toBe(false);
      expect(isValidShape({ type: 'rect', x: 0, y: 0, w: 100, h: -1 })).toBe(false);
      expect(isValidShape({ type: 'rect', x: 1.5, y: 0, w: 100, h: 200 })).toBe(false);
    });

    it('poly 形式を検査する', () => {
      expect(
        isValidShape({
          type: 'poly',
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        })
      ).toBe(true);

      // 斜めの辺は無効
      expect(
        isValidShape({
          type: 'poly',
          points: [
            [0, 0],
            [10, 0],
            [5, 5],
            [0, 10],
          ],
        })
      ).toBe(false);
    });
  });

  describe('shapeCenter', () => {
    it('point の中心点は at そのもの', () => {
      expect(shapeCenter({ type: 'point', at: [100, 200] })).toEqual([100, 200]);
    });

    it('rect の中心点を半整数も含めて正しく計算する', () => {
      expect(shapeCenter({ type: 'rect', x: 0, y: 0, w: 100, h: 200 })).toEqual([50, 100]);
      // 奇数の寸法による半整数
      expect(shapeCenter({ type: 'rect', x: 10, y: 20, w: 5, h: 7 })).toEqual([12.5, 23.5]);
    });

    it('poly の中心点は外接長方形の中心（半整数を含む）', () => {
      const shape: Shape = {
        type: 'poly',
        points: [
          [0, 0],
          [10000, 0],
          [10000, 5000],
          [5000, 5000],
          [5000, 10000],
          [0, 10000],
        ],
      };
      expect(shapeCenter(shape)).toEqual([5000, 5000]);

      const oddPoly: Shape = {
        type: 'poly',
        points: [
          [0, 0],
          [5, 0],
          [5, 3],
          [0, 3],
        ],
      };
      expect(shapeCenter(oddPoly)).toEqual([2.5, 1.5]);
    });
  });
});
