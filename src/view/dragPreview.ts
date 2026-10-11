import type { Id, Point } from '../core/types';
import type { Polygon } from '../geometry/types';
import { locatePoint } from '../geometry/polygon';
import { snap } from '../editor/snap';

/**
 * 長方形配置ドラッグ中の矩形領域を計算する。
 * スナップ目盛りに達していない開始直後でも、カーソルの動きに合わせて最小枠を表示し、
 * スナップ目盛りを超えたらグリッドに吸着した綺麗な矩形を返す。
 */
export function computeAttachRect(
  startP: Point,
  currentP: Point,
  stepX: number,
  stepY: number,
): { x: number; y: number; w: number; h: number } {
  const p1: Point = [snap(currentP[0], stepX), snap(currentP[1], stepY)];

  const wSnap = Math.abs(p1[0] - startP[0]);
  const hSnap = Math.abs(p1[1] - startP[1]);

  const rawW = Math.abs(currentP[0] - startP[0]);
  const rawH = Math.abs(currentP[1] - startP[1]);

  const w = wSnap > 0 ? wSnap : Math.max(rawW, 20);
  const h = hSnap > 0 ? hSnap : Math.max(rawH, 20);

  const isLeft = p1[0] < startP[0] || (wSnap === 0 && currentP[0] < startP[0]);
  const isUp = p1[1] < startP[1] || (hSnap === 0 && currentP[1] < startP[1]);

  const x = isLeft ? startP[0] - w : startP[0];
  const y = isUp ? startP[1] - h : startP[1];

  return { x, y, w, h };
}

/**
 * 指定した点 p が含まれる葉エリアの名前を取得する。
 */
export function getAreaAtPoint(
  p: Point,
  regions: Map<Id, Polygon>,
  leafNodes: Id[],
  areaNames: Map<Id, string>,
): string | null {
  for (const leafId of leafNodes) {
    const poly = regions.get(leafId);
    if (!poly) continue;
    const loc = locatePoint(poly, p);
    if (loc === 'inside' || loc === 'boundary') {
      return areaNames.get(leafId) ?? null;
    }
  }
  return null;
}

/**
 * ホバー時の吸着（スナップ）ガイド座標を計算する。
 */
export function computeHoverGuide(
  cursor: Point,
  stepX: number,
  stepY: number,
): Point {
  return [snap(cursor[0], stepX), snap(cursor[1], stepY)];
}
