import { describe, it, expect } from 'vitest';
import type { Id, Point } from '../../src/core/types';
import type { Polygon } from '../../src/geometry/types';
import {
  computeAttachRect,
  getAreaAtPoint,
  computeHoverGuide,
} from '../../src/view/dragPreview';

describe('課題2: モノ配置中のドラッグ追随プレビュー ロジックテスト', () => {
  describe('computeAttachRect (配置ドラッグ時の矩形計算)', () => {
    it('ドラッグ移動量がスナップグリッド未満でも、0x0にならず最小プレビューサイズを返して即座に枠が見えること', () => {
      const startP: Point = [1000, 1000];
      const currentP: Point = [1020, 1030]; // スナップステップ（例: 200）未満の微小移動
      const stepX = 200;
      const stepY = 200;

      const rect = computeAttachRect(startP, currentP, stepX, stepY);

      // 幅と高さが0ではなく、正の値を持っていること（無反応区間がない）
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
      expect(rect.x).toBe(1000);
      expect(rect.y).toBe(1000);
    });

    it('スナップ幅を超えたドラッグでは、指定グリッドに吸着した矩形サイズを返すこと', () => {
      const startP: Point = [1000, 1000];
      const currentP: Point = [1850, 2430];
      const stepX = 200;
      const stepY = 200;

      const rect = computeAttachRect(startP, currentP, stepX, stepY);

      // 1000 から 1850 -> スナップ後 1800 (幅 800)
      // 1000 から 2430 -> スナップ後 2400 (高さ 1400)
      expect(rect.x).toBe(1000);
      expect(rect.y).toBe(1000);
      expect(rect.w).toBe(800);
      expect(rect.h).toBe(1400);
    });

    it('左上方向へのドラッグでも正しい左上座標 (x, y) と正の幅・高さを返すこと', () => {
      const startP: Point = [2000, 2000];
      const currentP: Point = [1180, 1390];
      const stepX = 200;
      const stepY = 200;

      const rect = computeAttachRect(startP, currentP, stepX, stepY);

      expect(rect.x).toBe(1200);
      expect(rect.y).toBe(1400);
      expect(rect.w).toBe(800);
      expect(rect.h).toBe(600);
    });
  });

  describe('getAreaAtPoint (中心点の所属エリア判定)', () => {
    const regions = new Map<Id, Polygon>([
      [
        'area-1',
        [
          [0, 0],
          [5000, 0],
          [5000, 10000],
          [0, 10000],
        ],
      ],
      [
        'area-2',
        [
          [5000, 0],
          [10000, 0],
          [10000, 10000],
          [5000, 10000],
        ],
      ],
    ]);
    const leafNodes: Id[] = ['area-1', 'area-2'];
    const areaNames = new Map<Id, string>([
      ['area-1', '床1'],
      ['area-2', '床2'],
    ]);

    it('指定した点が含まれるエリアの名前を返すこと', () => {
      const pLeft: Point = [2500, 3000];
      const pRight: Point = [7500, 3000];

      expect(getAreaAtPoint(pLeft, regions, leafNodes, areaNames)).toBe('床1');
      expect(getAreaAtPoint(pRight, regions, leafNodes, areaNames)).toBe('床2');
    });

    it('エリア外の点の場合は null を返すこと', () => {
      const pOutside: Point = [-100, 5000];
      expect(getAreaAtPoint(pOutside, regions, leafNodes, areaNames)).toBeNull();
    });
  });

  describe('computeHoverGuide (ホバー時のガイド位置計算)', () => {
    it('マウス座標からスナップされた吸着ガイド座標を返すこと', () => {
      const cursor: Point = [1234, 5678];
      const stepX = 100;
      const stepY = 100;

      const guide = computeHoverGuide(cursor, stepX, stepY);

      expect(guide).toEqual([1200, 5700]);
    });
  });
});
