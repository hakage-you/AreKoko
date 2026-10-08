// 幾何の型。詳細設計 9.1。

import type { Point } from '../core/types';

export type { Point };

/** 正規化済みの直角多角形：重複点と一直線上の途中の点がなく、符号付き面積が正の向き。 */
export type Polygon = Point[];

/** 軸に平行な長方形。x0 < x1, y0 < y1。 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 軸に平行な線分。 */
export interface Segment {
  from: Point;
  to: Point;
}

export type PointLocation = 'inside' | 'boundary' | 'outside';
