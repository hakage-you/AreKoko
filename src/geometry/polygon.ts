// 直角多角形の検査、正規化、点の位置、長方形への分解。詳細設計 9.2、付録A.2。

import type { Point } from '../core/types';
import { COORD_MAX } from '../core/constants';
import type { Polygon, Rect, PointLocation } from './types';

/** 靴ひも公式による符号付き面積の2倍を計算する（整数計算）。 */
function signedArea2(poly: Point[]): number {
  const n = poly.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const curr = poly[i]!;
    const next = poly[(i + 1) % n]!;
    sum += curr[0] * next[1] - next[0] * curr[1];
  }
  return sum;
}

/** 多角形の面積（絶対値）。 */
export function polygonArea(poly: Point[]): number {
  return Math.abs(signedArea2(poly)) / 2;
}

/** 多角形の外接長方形を計算する。 */
export function boundingRect(poly: Point[]): Rect {
  if (poly.length === 0) {
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * 連続する同じ点（始点と終点の重複を含む）と、一直線上の途中の点を除き、
 * 符号付き面積が正の向き（SVG座標系で時計回り）にそろえる。
 * 点が4未満または面積0なら null。
 */
export function normalizePolygon(points: Point[]): Polygon | null {
  if (points.length < 3) {
    return null;
  }

  let pts = points.map((p): Point => [p[0], p[1]]);
  let changed = true;

  while (changed) {
    changed = false;

    // 1. 連続する同一座標の点を除去
    const dedup: Point[] = [];
    for (const p of pts) {
      if (
        dedup.length === 0 ||
        !(dedup[dedup.length - 1]![0] === p[0] && dedup[dedup.length - 1]![1] === p[1])
      ) {
        dedup.push(p);
      }
    }
    // 始点と終点の重複を除去
    if (
      dedup.length > 1 &&
      dedup[0]![0] === dedup[dedup.length - 1]![0] &&
      dedup[0]![1] === dedup[dedup.length - 1]![1]
    ) {
      dedup.pop();
    }

    if (dedup.length < pts.length) {
      changed = true;
    }
    if (dedup.length < 4) {
      return null;
    }

    // 2. 一直線上の途中の点（前後と同じ x、または同じ y）を除去
    const n = dedup.length;
    const filtered: Point[] = [];
    for (let i = 0; i < n; i++) {
      const prev = dedup[(i - 1 + n) % n]!;
      const curr = dedup[i]!;
      const next = dedup[(i + 1) % n]!;

      const isCollinearX = prev[0] === curr[0] && curr[0] === next[0];
      const isCollinearY = prev[1] === curr[1] && curr[1] === next[1];

      if (isCollinearX || isCollinearY) {
        changed = true;
      } else {
        filtered.push(curr);
      }
    }

    pts = filtered;
    if (pts.length < 4) {
      return null;
    }
  }

  // 3. 面積と向きの確認
  const area2 = signedArea2(pts);
  if (area2 === 0) {
    return null;
  }

  // 靴ひも公式の符号付き面積が正になる向きにそろえる
  if (area2 < 0) {
    pts.reverse();
  }

  // 始点を決めておくと、同じ形はいつも同じ並びになり、比較やテストが素直になる。
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    const s = pts[start]!;
    if (p[1] < s[1] || (p[1] === s[1] && p[0] < s[0])) {
      start = i;
    }
  }
  return [...pts.slice(start), ...pts.slice(0, start)];
}

/**
 * unknown を受けて直角多角形として正しいか検証する。
 * 整数、正規化後4点以上、辺はすべて縦か横、自己交差・接触なし、面積正を検査する。
 */
export function validateRectilinearPolygon(
  points: unknown
): { ok: true; polygon: Polygon } | { ok: false; reason: string } {
  if (!Array.isArray(points)) {
    return { ok: false, reason: '頂点の一覧が配列ではありません' };
  }

  for (const p of points) {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      typeof p[0] !== 'number' ||
      typeof p[1] !== 'number' ||
      !Number.isInteger(p[0]) ||
      !Number.isInteger(p[1])
    ) {
      return { ok: false, reason: '頂点の座標は整数である必要があります' };
    }
  }

  if (points.length < 4) {
    return { ok: false, reason: '頂点が4つ未満です' };
  }

  const typedPoints = points as Point[];

  // 各辺が縦か横か（斜めの辺がないか）
  for (let i = 0; i < typedPoints.length; i++) {
    const curr = typedPoints[i]!;
    const next = typedPoints[(i + 1) % typedPoints.length]!;
    if (curr[0] !== next[0] && curr[1] !== next[1]) {
      return { ok: false, reason: '斜めの辺が含まれています' };
    }
  }

  const poly = normalizePolygon(typedPoints);
  if (!poly || poly.length < 4) {
    return { ok: false, reason: '多角形として成り立っていません（正規化後に4点未満、または面積が0です）' };
  }

  // 隣り合わない辺どうしが共有点を持たないか（交差も接触も不可）
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;

    for (let j = i + 1; j < n; j++) {
      // 隣り合う辺は共有頂点を持つためスキップ
      if (j === (i + 1) % n || i === (j + 1) % n) {
        continue;
      }

      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;

      const isAHoriz = a1[1] === a2[1];
      const isBHoriz = b1[1] === b2[1];

      if (isAHoriz && isBHoriz) {
        // 同一水平線上での接触・重複
        if (a1[1] === b1[1]) {
          const aMinX = Math.min(a1[0], a2[0]);
          const aMaxX = Math.max(a1[0], a2[0]);
          const bMinX = Math.min(b1[0], b2[0]);
          const bMaxX = Math.max(b1[0], b2[0]);
          if (Math.max(aMinX, bMinX) <= Math.min(aMaxX, bMaxX)) {
            return { ok: false, reason: '辺どうしが接触しています' };
          }
        }
      } else if (!isAHoriz && !isBHoriz) {
        // 同一鉛直線上での接触・重複
        if (a1[0] === b1[0]) {
          const aMinY = Math.min(a1[1], a2[1]);
          const aMaxY = Math.max(a1[1], a2[1]);
          const bMinY = Math.min(b1[1], b2[1]);
          const bMaxY = Math.max(b1[1], b2[1]);
          if (Math.max(aMinY, bMinY) <= Math.min(aMaxY, bMaxY)) {
            return { ok: false, reason: '辺どうしが接触しています' };
          }
        }
      } else {
        // 水平な辺と垂直な辺の交差または接触
        const horiz = isAHoriz ? { p1: a1, p2: a2 } : { p1: b1, p2: b2 };
        const vert = isAHoriz ? { p1: b1, p2: b2 } : { p1: a1, p2: a2 };

        const hY = horiz.p1[1];
        const hMinX = Math.min(horiz.p1[0], horiz.p2[0]);
        const hMaxX = Math.max(horiz.p1[0], horiz.p2[0]);

        const vX = vert.p1[0];
        const vMinY = Math.min(vert.p1[1], vert.p2[1]);
        const vMaxY = Math.max(vert.p1[1], vert.p2[1]);

        if (hMinX <= vX && vX <= hMaxX && vMinY <= hY && hY <= vMaxY) {
          // 内部どうしの交差か、端点・T字での接触か
          if (hMinX < vX && vX < hMaxX && vMinY < hY && hY < vMaxY) {
            return { ok: false, reason: '辺が自己交差しています' };
          } else {
            return { ok: false, reason: '辺どうしが接触しています' };
          }
        }
      }
    }
  }

  return { ok: true, polygon: poly };
}

/**
 * 外形としての妥当性を検査する。
 * validateRectilinearPolygon に加え、外接長方形がちょうど [0,COORD_MAX]×[0,COORD_MAX] であることを確かめる。
 */
export function validateOutline(
  points: unknown
): { ok: true; polygon: Polygon } | { ok: false; reason: string } {
  const result = validateRectilinearPolygon(points);
  if (!result.ok) {
    return result;
  }
  const rect = boundingRect(result.polygon);
  if (rect.x0 !== 0 || rect.y0 !== 0 || rect.x1 !== COORD_MAX || rect.y1 !== COORD_MAX) {
    return {
      ok: false,
      reason: `外接長方形がちょうど [0,${COORD_MAX}]×[0,${COORD_MAX}] ではありません`,
    };
  }
  return result;
}

/** 正規化された直角多角形が長方形かどうかを判定する。 */
export function isRectangle(poly: Polygon): boolean {
  if (poly.length !== 4) {
    return false;
  }
  const rect = boundingRect(poly);
  const expectedArea = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
  return expectedArea > 0 && polygonArea(poly) === expectedArea;
}

/**
 * 点の位置を判定する（'inside' | 'boundary' | 'outside'）。
 * p の座標は半整数も許容する。
 */
export function locatePoint(poly: Polygon, p: Point): PointLocation {
  const px = p[0];
  const py = p[1];
  const n = poly.length;

  // 1. 境界上の判定
  for (let i = 0; i < n; i++) {
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;

    if (p1[1] === p2[1]) {
      // 横の辺
      if (py === p1[1] && px >= Math.min(p1[0], p2[0]) && px <= Math.max(p1[0], p2[0])) {
        return 'boundary';
      }
    } else {
      // 縦の辺
      if (px === p1[0] && py >= Math.min(p1[1], p2[1]) && py <= Math.max(p1[1], p2[1])) {
        return 'boundary';
      }
    }
  }

  // 2. 水平の半直線（x > px, y = py）と縦の辺の交差回数
  // 半開区間 [minY, maxY) で数えて頂点上での二重計数を避ける
  let count = 0;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;

    if (p1[0] === p2[0]) {
      const vx = p1[0];
      if (vx > px) {
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);
        if (py >= minY && py < maxY) {
          count++;
        }
      }
    }
  }

  return count % 2 === 1 ? 'inside' : 'outside';
}

/**
 * 多角形を重なり合わない長方形の並びに分解する。
 * y 座標で横の帯に切り、帯ごとに内側の x 区間を求め、上下に隣り合う帯で同じ区間をまとめる。
 */
export function decomposeToRects(poly: Polygon): Rect[] {
  const yCoords = Array.from(new Set(poly.map(p => p[1]))).sort((a, b) => a - b);
  if (yCoords.length < 2) {
    return [];
  }

  const n = poly.length;
  const verticalEdges: Array<{ x: number; minY: number; maxY: number }> = [];
  for (let i = 0; i < n; i++) {
    const p1 = poly[i]!;
    const p2 = poly[(i + 1) % n]!;
    if (p1[0] === p2[0]) {
      verticalEdges.push({
        x: p1[0],
        minY: Math.min(p1[1], p2[1]),
        maxY: Math.max(p1[1], p2[1]),
      });
    }
  }

  const finishedRects: Rect[] = [];
  let activeRects: Rect[] = [];

  for (let i = 0; i < yCoords.length - 1; i++) {
    const y0 = yCoords[i]!;
    const y1 = yCoords[i + 1]!;

    // 帯 [y0, y1] の内部を横切る縦の辺の x 座標を収集
    const slabXs: number[] = [];
    for (const edge of verticalEdges) {
      if (edge.minY <= y0 && edge.maxY >= y1) {
        slabXs.push(edge.x);
      }
    }
    slabXs.sort((a, b) => a - b);

    // 帯内の内側区間 [x0, x1]
    const intervals: Array<{ x0: number; x1: number }> = [];
    for (let j = 0; j < slabXs.length; j += 2) {
      const left = slabXs[j];
      const right = slabXs[j + 1];
      if (left !== undefined && right !== undefined && left < right) {
        intervals.push({ x0: left, x1: right });
      }
    }

    // 上下に隣り合う帯で同じ x 区間を持つ長方形をまとめる
    const nextActiveRects: Rect[] = [];
    const usedIntervalIndices = new Set<number>();

    for (const rect of activeRects) {
      const matchingIndex = intervals.findIndex(
        (it, idx) => !usedIntervalIndices.has(idx) && it.x0 === rect.x0 && it.x1 === rect.x1
      );
      if (matchingIndex !== -1) {
        usedIntervalIndices.add(matchingIndex);
        nextActiveRects.push({
          x0: rect.x0,
          y0: rect.y0,
          x1: rect.x1,
          y1: y1,
        });
      } else {
        finishedRects.push(rect);
      }
    }

    for (let k = 0; k < intervals.length; k++) {
      if (!usedIntervalIndices.has(k)) {
        const it = intervals[k]!;
        nextActiveRects.push({
          x0: it.x0,
          y0: y0,
          x1: it.x1,
          y1: y1,
        });
      }
    }

    activeRects = nextActiveRects;
  }

  finishedRects.push(...activeRects);
  return finishedRects;
}
