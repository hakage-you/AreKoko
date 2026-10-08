// 描画の形状の検査と中心点。詳細設計 4.5、付録A.4。

import type { Point, Shape } from '../core/types';
import { boundingRect, validateRectilinearPolygon } from './polygon';

/**
 * 形状が形式どおりか検証する。
 * point/rect は形式（整数・寸法）を、poly は validateRectilinearPolygon を調べる。
 */
export function isValidShape(shape: Shape): boolean {
  if (!shape || typeof shape !== 'object') {
    return false;
  }

  if (shape.type === 'point') {
    return (
      Array.isArray(shape.at) &&
      shape.at.length === 2 &&
      typeof shape.at[0] === 'number' &&
      typeof shape.at[1] === 'number' &&
      Number.isInteger(shape.at[0]) &&
      Number.isInteger(shape.at[1])
    );
  }

  if (shape.type === 'rect') {
    return (
      typeof shape.x === 'number' &&
      typeof shape.y === 'number' &&
      typeof shape.w === 'number' &&
      typeof shape.h === 'number' &&
      Number.isInteger(shape.x) &&
      Number.isInteger(shape.y) &&
      Number.isInteger(shape.w) &&
      Number.isInteger(shape.h) &&
      shape.w >= 1 &&
      shape.h >= 1
    );
  }

  if (shape.type === 'poly') {
    return validateRectilinearPolygon(shape.points).ok;
  }

  return false;
}

/**
 * 形状の中心点を計算する。
 * point は at、rect は中心、poly は外接長方形の中心。
 * 座標は半整数になりうる。
 */
export function shapeCenter(shape: Shape): Point {
  if (shape.type === 'point') {
    return [shape.at[0], shape.at[1]];
  }

  if (shape.type === 'rect') {
    return [shape.x + shape.w / 2, shape.y + shape.h / 2];
  }

  if (shape.type === 'poly') {
    const rect = boundingRect(shape.points);
    return [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2];
  }

  const _exhaustive: never = shape;
  throw new Error(`未対応の形状です: ${JSON.stringify(_exhaustive)}`);
}
