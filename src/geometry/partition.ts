// 境界で止める仕切り、多角形の分割、N等分。詳細設計 9.3、付録A.3。

import type { Point, Axis } from '../core/types';
import type { Polygon, Rect, Segment } from './types';
import { normalizePolygon, locatePoint, boundingRect } from './polygon';

/**
 * seed を通り多角形の内側を走る仕切り線分を計算する。
 * seed が内部でなければ null。
 * 返す線分は from が座標の小さい側。
 */
export function boundedSegment(poly: Polygon, axis: Axis, seed: Point): Segment | null {
  if (locatePoint(poly, seed) !== 'inside') {
    return null;
  }

  const n = poly.length;
  if (axis === 'x') {
    const sx = seed[0];
    const sy = seed[1];
    let yMin = -Infinity;
    let yMax = Infinity;

    for (let i = 0; i < n; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % n]!;
      if (p1[1] === p2[1]) {
        // 横の辺
        const edgeY = p1[1];
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        if (minX <= sx && sx <= maxX) {
          if (edgeY < sy && edgeY > yMin) {
            yMin = edgeY;
          }
          if (edgeY > sy && edgeY < yMax) {
            yMax = edgeY;
          }
        }
      }
    }

    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      return null;
    }

    return {
      from: [sx, yMin],
      to: [sx, yMax],
    };
  } else {
    // axis === 'y'
    const sx = seed[0];
    const sy = seed[1];
    let xMin = -Infinity;
    let xMax = Infinity;

    for (let i = 0; i < n; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % n]!;
      if (p1[0] === p2[0]) {
        // 縦の辺
        const edgeX = p1[0];
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);
        if (minY <= sy && sy <= maxY) {
          if (edgeX < sx && edgeX > xMin) {
            xMin = edgeX;
          }
          if (edgeX > sx && edgeX < xMax) {
            xMax = edgeX;
          }
        }
      }
    }

    if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      return null;
    }

    return {
      from: [xMin, sy],
      to: [xMax, sy],
    };
  }
}

function pointEquals(p1: Point, p2: Point): boolean {
  return p1[0] === p2[0] && p1[1] === p2[1];
}

function isPointStrictlyOnSegment(p: Point, s1: Point, s2: Point): boolean {
  if (pointEquals(p, s1) || pointEquals(p, s2)) {
    return false;
  }
  if (s1[0] === s2[0] && p[0] === s1[0]) {
    return p[1] > Math.min(s1[1], s2[1]) && p[1] < Math.max(s1[1], s2[1]);
  }
  if (s1[1] === s2[1] && p[1] === s1[1]) {
    return p[0] > Math.min(s1[0], s2[0]) && p[0] < Math.max(s1[0], s2[0]);
  }
  return false;
}

/**
 * 線分で多角形を2つに分割する。
 * 線分の両端を多角形の境界に差し込み、境界を2つの鎖に分け、それぞれを線分で閉じる。
 * 軸の座標が線より小さい側を先に返す。
 */
export function splitPolygon(
  poly: Polygon,
  axis: Axis,
  segment: Segment
): [Polygon, Polygon] {
  const A = segment.from;
  const B = segment.to;

  const hasA = poly.some(p => pointEquals(p, A));
  const hasB = poly.some(p => pointEquals(p, B));

  const augmented: Point[] = [];
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const curr = poly[i]!;
    const next = poly[(i + 1) % n]!;
    augmented.push(curr);

    // 既存の頂点と一致しない場合のみ差し込む
    if (!hasA && isPointStrictlyOnSegment(A, curr, next)) {
      augmented.push(A);
    }
    if (!hasB && isPointStrictlyOnSegment(B, curr, next)) {
      augmented.push(B);
    }
  }

  const idxA = augmented.findIndex(p => pointEquals(p, A));
  const idxB = augmented.findIndex(p => pointEquals(p, B));

  if (idxA === -1 || idxB === -1) {
    throw new Error('線分の端点が多角形の境界上に見つかりません');
  }

  // A から B への鎖
  const chain1: Point[] = [];
  let currIdx = idxA;
  while (true) {
    chain1.push(augmented[currIdx]!);
    if (currIdx === idxB) break;
    currIdx = (currIdx + 1) % augmented.length;
  }

  // B から A への鎖
  const chain2: Point[] = [];
  currIdx = idxB;
  while (true) {
    chain2.push(augmented[currIdx]!);
    if (currIdx === idxA) break;
    currIdx = (currIdx + 1) % augmented.length;
  }

  const poly1 = normalizePolygon(chain1);
  const poly2 = normalizePolygon(chain2);

  if (!poly1 || !poly2) {
    throw new Error('分割後の多角形の正規化に失敗しました');
  }

  // 軸の座標が小さい側を先に返す
  const rect1 = boundingRect(poly1);
  const rect2 = boundingRect(poly2);

  const mid1 = axis === 'x' ? (rect1.x0 + rect1.x1) / 2 : (rect1.y0 + rect1.y1) / 2;
  const mid2 = axis === 'x' ? (rect2.x0 + rect2.x1) / 2 : (rect2.y0 + rect2.y1) / 2;

  return mid1 < mid2 ? [poly1, poly2] : [poly2, poly1];
}

/**
 * 区間 [lo, hi] を n 等分する分割座標（i=1..n-1）を返す。
 * 狭義の昇順 lo < p1 < … < hi にならなければ null。n < 2 も null。
 */
export function evenSplitPositions(lo: number, hi: number, n: number): number[] | null {
  if (n < 2 || lo >= hi) {
    return null;
  }

  const result: number[] = [];
  let prev = lo;

  for (let i = 1; i < n; i++) {
    const pos = Math.round(lo + ((hi - lo) * i) / n);
    if (pos <= prev) {
      return null;
    }
    result.push(pos);
    prev = pos;
  }

  if (prev >= hi) {
    return null;
  }

  return result;
}

/** 長方形を指定の軸の座標列 ats で帯に分割する。 */
export function splitRect(rect: Rect, axis: Axis, ats: number[]): Rect[] {
  if (ats.length === 0) {
    return [{ ...rect }];
  }

  const result: Rect[] = [];
  if (axis === 'x') {
    const cuts = [rect.x0, ...ats, rect.x1];
    for (let i = 0; i < cuts.length - 1; i++) {
      result.push({
        x0: cuts[i]!,
        y0: rect.y0,
        x1: cuts[i + 1]!,
        y1: rect.y1,
      });
    }
  } else {
    const cuts = [rect.y0, ...ats, rect.y1];
    for (let i = 0; i < cuts.length - 1; i++) {
      result.push({
        x0: rect.x0,
        y0: cuts[i]!,
        x1: rect.x1,
        y1: cuts[i + 1]!,
      });
    }
  }

  return result;
}

/** 長方形を時計回りの正規化済み多角形に変換する。 */
export function rectToPolygon(rect: Rect): Polygon {
  return [
    [rect.x0, rect.y0],
    [rect.x1, rect.y0],
    [rect.x1, rect.y1],
    [rect.x0, rect.y1],
  ];
}
