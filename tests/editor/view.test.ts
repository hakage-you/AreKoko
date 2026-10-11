import { describe, it, expect } from 'vitest';
import type { Id, Marker, Partition, Point } from '../../src/core/types';
import type { Polygon } from '../../src/geometry/types';
import {
  toDisplay,
  fromDisplay,
  viewBoxOf,
  fitView,
  lineSegments,
  hitLine,
  hitMarker,
} from '../../src/editor/view';

describe('view', () => {
  describe('toDisplay / fromDisplay の往復', () => {
    it('toDisplay と fromDisplay で比率と表示の座標が正しく往復する', () => {
      const aspects = [1.0, 4 / 3, 0.75, 2.0];
      const points: Point[] = [
        [0, 0],
        [5000, 3000],
        [10000, 10000],
        [1234, 5678],
      ];

      for (const aspect of aspects) {
        for (const p of points) {
          const display = toDisplay(p, aspect);
          expect(display[0]).toBeCloseTo(p[0] * aspect);
          expect(display[1]).toBe(p[1]);

          const back = fromDisplay(display, aspect);
          expect(back[0]).toBeCloseTo(p[0]);
          expect(back[1]).toBeCloseTo(p[1]);
        }
      }
    });

    it('fromDisplay は丸めを行わない', () => {
      const display: [number, number] = [1000.5, 2000.5];
      const aspect = 1.5;
      const p = fromDisplay(display, aspect);
      expect(p[0]).toBeCloseTo(1000.5 / 1.5);
      expect(p[1]).toBe(2000.5);
    });
  });

  describe('fitView（全体が収まる）', () => {
    it('中心が 5000, 5000 で全体が収まり余白が確保される', () => {
      const aspect = 1.0;
      const widthPx = 800;
      const heightPx = 600;
      const marginPx = 20;

      const view = fitView(aspect, widthPx, heightPx, marginPx);
      expect(view.cx).toBe(5000);
      expect(view.cy).toBe(5000);

      const vb = viewBoxOf(view, aspect, widthPx, heightPx);
      // 余白を除いた利用可能領域: 幅 760, 高さ 560
      // 縦横比 1.0 の 10000x10000 を収めるため、高さ制限 scale = 560 / 10000 = 0.056
      expect(view.scale).toBeCloseTo(560 / 10000);

      // [0, 0] から [10000, 10000] の領域が表示範囲に収まること
      expect(vb.x).toBeLessThanOrEqual(0);
      expect(vb.y).toBeLessThanOrEqual(0);
      expect(vb.x + vb.w).toBeGreaterThanOrEqual(10000 * aspect);
      expect(vb.y + vb.h).toBeGreaterThanOrEqual(10000);
    });

    it('横長のアスペクト比でも全体が収まる', () => {
      const aspect = 2.0;
      const widthPx = 800;
      const heightPx = 600;
      const marginPx = 30;

      const view = fitView(aspect, widthPx, heightPx, marginPx);
      const vb = viewBoxOf(view, aspect, widthPx, heightPx);

      expect(vb.x).toBeLessThanOrEqual(0);
      expect(vb.y).toBeLessThanOrEqual(0);
      expect(vb.x + vb.w).toBeGreaterThanOrEqual(10000 * aspect);
      expect(vb.y + vb.h).toBeGreaterThanOrEqual(10000);
    });

    it('縦長のアスペクト比でも全体が収まる', () => {
      const aspect = 0.5;
      const widthPx = 800;
      const heightPx = 600;
      const marginPx = 20;

      const view = fitView(aspect, widthPx, heightPx, marginPx);
      const vb = viewBoxOf(view, aspect, widthPx, heightPx);

      expect(vb.x).toBeLessThanOrEqual(0);
      expect(vb.y).toBeLessThanOrEqual(0);
      expect(vb.x + vb.w).toBeGreaterThanOrEqual(10000 * aspect);
      expect(vb.y + vb.h).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('viewBoxOf', () => {
    it('view の中心・拡大率から正しい viewBox を返す', () => {
      const view = { cx: 5000, cy: 5000, scale: 0.1 };
      const aspect = 1.5;
      const widthPx = 800;
      const heightPx = 600;

      const vb = viewBoxOf(view, aspect, widthPx, heightPx);
      expect(vb.w).toBe(8000);
      expect(vb.h).toBe(6000);
      expect(vb.x).toBe(5000 * 1.5 - 4000);
      expect(vb.y).toBe(5000 - 3000);
    });
  });

  describe('lineSegments', () => {
    const rootPoly: Polygon = [
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000],
    ];
    const regions = new Map<string, Polygon>([['kuukan-1', rootPoly]]);

    it('境界で止める仕切りの線分を boundedSegment で取得する', () => {
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'x',
          at: [4000],
          seed: [4000, 5000],
          children: ['area-1', 'area-2'],
        },
      ];

      const segs = lineSegments(regions, partitions);
      expect(segs).toHaveLength(1);
      expect(segs[0]).toEqual({
        node: 'kuukan-1',
        lineIndex: 0,
        from: [4000, 0],
        to: [4000, 10000],
      });
    });

    it('N等分の線分を節領域の外接長方形を横切る線として取得する', () => {
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'y',
          at: [3000, 6000],
          children: ['area-1', 'area-2', 'area-3'],
        },
      ];

      const segs = lineSegments(regions, partitions);
      expect(segs).toHaveLength(2);
      expect(segs[0]).toEqual({
        node: 'kuukan-1',
        lineIndex: 0,
        from: [0, 3000],
        to: [10000, 3000],
      });
      expect(segs[1]).toEqual({
        node: 'kuukan-1',
        lineIndex: 1,
        from: [0, 6000],
        to: [10000, 6000],
      });
    });
  });

  describe('hitLine', () => {
    const rootPoly: Polygon = [
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000],
    ];
    const regions = new Map<string, Polygon>([['kuukan-1', rootPoly]]);

    it('境界で止める仕切りの線に tolerance 以内で当たると判定される', () => {
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'x',
          at: [5000],
          seed: [5000, 5000],
          children: ['area-1', 'area-2'],
        },
      ];

      const hit = hitLine(regions, partitions, [5020, 3000], 50);
      expect(hit).toEqual({ node: 'kuukan-1', lineIndex: 0 });
    });

    it('N等分の仕切り線に tolerance 以内で当たると判定される', () => {
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'y',
          at: [3333, 6667],
          children: ['area-1', 'area-2', 'area-3'],
        },
      ];

      const hit = hitLine(regions, partitions, [2000, 6670], 50);
      expect(hit).toEqual({ node: 'kuukan-1', lineIndex: 1 });
    });

    it('tolerance の外にある場合は null を返す', () => {
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'x',
          at: [5000],
          seed: [5000, 5000],
          children: ['area-1', 'area-2'],
        },
      ];

      const hit = hitLine(regions, partitions, [5100, 3000], 50);
      expect(hit).toBeNull();
    });

    it('親の仕切り線と子の仕切り線のT字交点では、AreaTree を渡すことでより深い子の仕切り線が優先される', () => {
      // 根クウカン（10000x10000）を x=5000 で左右（area-1, area-2）に分割
      // area-1（左側: 0..5000, 0..10000）を y=4000 で上下（area-1-1, area-1-2）に分割
      const customRegions = new Map<Id, Polygon>([
        [
          'kuukan-1',
          [
            [0, 0],
            [10000, 0],
            [10000, 10000],
            [0, 10000],
          ],
        ],
        [
          'area-1',
          [
            [0, 0],
            [5000, 0],
            [5000, 10000],
            [0, 10000],
          ],
        ],
      ]);

      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'x',
          at: [5000],
          seed: [5000, 2000],
          children: ['area-1', 'area-2'],
        },
        {
          area: 'area-1',
          axis: 'y',
          at: [4000],
          seed: [2500, 4000],
          children: ['area-1-1', 'area-1-2'],
        },
      ];

      const tree = {
        root: 'kuukan-1',
        children: new Map<Id, Id[]>([
          ['kuukan-1', ['area-1', 'area-2']],
          ['area-1', ['area-1-1', 'area-1-2']],
        ]),
      };

      // T字交点 (5000, 4000)（両方の線までの距離が 0 の点）
      // 親の線（x=5000）までの距離: 0、子の線（y=4000）までの距離: 0
      const hit = hitLine(customRegions, partitions, [5000, 4000], 50, tree);
      expect(hit).toEqual({ node: 'area-1', lineIndex: 0 });
    });

    it('複数等分されたエリアの中で、特定の一本の仕切り線が正確にヒットする', () => {
      const customRegions = new Map<Id, Polygon>([
        [
          'kuukan-1',
          [
            [0, 0],
            [10000, 0],
            [10000, 10000],
            [0, 10000],
          ],
        ],
      ]);
      const partitions: Partition[] = [
        {
          area: 'kuukan-1',
          axis: 'y',
          at: [2500, 5000, 7500],
          children: ['d1', 'd2', 'd3', 'd4'],
        },
      ];

      // lineIndex 0 (y=2500) 付近
      expect(hitLine(customRegions, partitions, [5000, 2510], 50)).toEqual({
        node: 'kuukan-1',
        lineIndex: 0,
      });
      // lineIndex 1 (y=5000) 付近
      expect(hitLine(customRegions, partitions, [5000, 4995], 50)).toEqual({
        node: 'kuukan-1',
        lineIndex: 1,
      });
      // lineIndex 2 (y=7500) 付近
      expect(hitLine(customRegions, partitions, [5000, 7505], 50)).toEqual({
        node: 'kuukan-1',
        lineIndex: 2,
      });
    });
  });

  describe('hitMarker', () => {
    it('点のマーカーの当たり判定', () => {
      const markers: Marker[] = [
        {
          id: 'marker-point',
          kuukan: 'k1',
          name: '点マーカー',
          shape: { type: 'point', at: [2000, 3000] },
          rotation: 0,
          notAPlace: false,
        },
      ];

      expect(hitMarker(markers, [2010, 3000], 20)).toBe('marker-point');
      expect(hitMarker(markers, [2050, 3000], 20)).toBeNull();
    });

    it('長方形のマーカーの当たり判定', () => {
      const markers: Marker[] = [
        {
          id: 'marker-rect',
          kuukan: 'k1',
          name: '長方形マーカー',
          shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 },
          rotation: 0,
          notAPlace: false,
        },
      ];

      // 内部
      expect(hitMarker(markers, [1500, 1500], 10)).toBe('marker-rect');
      // 境界付近（外側 8 離れた位置、許容 10）
      expect(hitMarker(markers, [992, 1500], 10)).toBe('marker-rect');
      // 完全に外れ
      expect(hitMarker(markers, [500, 500], 10)).toBeNull();
    });

    it('重なりがある場合は後ろのマーカーが優先される', () => {
      const markers: Marker[] = [
        {
          id: 'm1',
          kuukan: 'k1',
          name: '下のマーカー',
          shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 2000 },
          rotation: 0,
          notAPlace: false,
        },
        {
          id: 'm2',
          kuukan: 'k1',
          name: '上のマーカー',
          shape: { type: 'rect', x: 1500, y: 1500, w: 1000, h: 1000 },
          rotation: 0,
          notAPlace: false,
        },
      ];

      expect(hitMarker(markers, [1600, 1600], 10)).toBe('m2');
      expect(hitMarker(markers, [1100, 1100], 10)).toBe('m1');
    });

    it('回転した長方形マーカーの当たり判定', () => {
      const markers: Marker[] = [
        {
          id: 'm-rot',
          kuukan: 'k1',
          name: '回転マーカー',
          shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 },
          rotation: 2, // 90度回転。中心 (2000, 1500) まわり
          notAPlace: false,
        },
      ];

      // 回転後の長方形の内部に当たる
      expect(hitMarker(markers, [2000, 2000], 10)).toBe('m-rot');
      // 回転前の端付近（回転後は外れている点）
      expect(hitMarker(markers, [2800, 1500], 10)).toBeNull();
    });
  });
});
