// モノの描画の操作。詳細設計 2章。

import type {
  ArekokoDocument,
  Id,
  ItemDrawing,
  Marker,
  Point,
  Rotation,
  Shape,
} from '../types';
import { OpError, type OpContext, type OpResult } from './common';
import { isValidShape, shapeCenter } from '../../geometry/shape';
import { boundingRect, locatePoint } from '../../geometry/polygon';
import { kuukanOfPlace } from '../places';

/**
 * 形状を (dx, dy) だけ平行移動する。
 */
function translateShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === 'point') {
    return {
      type: 'point',
      at: [shape.at[0]! + dx, shape.at[1]! + dy],
    };
  }
  if (shape.type === 'rect') {
    return {
      type: 'rect',
      x: shape.x + dx,
      y: shape.y + dy,
      w: shape.w,
      h: shape.h,
    };
  }
  if (shape.type === 'poly') {
    return {
      type: 'poly',
      points: shape.points.map(pt => [pt[0]! + dx, pt[1]! + dy] as Point),
    };
  }
  const _exhaustive: never = shape;
  throw new OpError('invalidInput', `未対応の形状です: ${JSON.stringify(_exhaustive)}`);
}

/**
 * 指定した座標 p が「置き場にしない」マーカーの上にあるかを判定する。
 * 詳細設計 4章の onNotAPlace の定義に従い、notAPlace が true の長方形・多角形マーカーの内側または辺の上を上とみなす。
 * 段階6の簡略化として、マーカーの回転は「回転が 0・2・4・6（90度の倍数）のときは回した外接長方形、45度の奇数倍のときは回す前の形」で判定する。
 */
export function notAPlaceMarkerAt(
  doc: ArekokoDocument,
  kuukan: Id,
  p: Point,
): Marker | null {
  // 回転は表示の座標（x に縦横比を掛けた座標）で掛けるので、比率の座標に戻すには縦横比が要る（設計 7.7）
  const aspect = doc.drawing.kuukans.find(k => k.kuukan === kuukan)?.aspect ?? 1;
  for (const marker of doc.drawing.markers) {
    if (marker.kuukan !== kuukan || !marker.notAPlace) {
      continue;
    }
    if (marker.shape.type === 'point') {
      continue;
    }

    const rot = marker.rotation ?? 0;
    if (rot === 0 || rot === 2 || rot === 4 || rot === 6) {
      // 90度の倍数のときは回した外接長方形
      let minX: number;
      let maxX: number;
      let minY: number;
      let maxY: number;

      if (marker.shape.type === 'rect') {
        minX = marker.shape.x;
        maxX = marker.shape.x + marker.shape.w;
        minY = marker.shape.y;
        maxY = marker.shape.y + marker.shape.h;
      } else {
        const br = boundingRect(marker.shape.points);
        minX = br.x0;
        maxX = br.x1;
        minY = br.y0;
        maxY = br.y1;
      }

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const w = maxX - minX;
      const h = maxY - minY;

      let rx0: number;
      let rx1: number;
      let ry0: number;
      let ry1: number;

      if (rot === 2 || rot === 6) {
        // 90度または270度回転：表示の座標で幅（w×縦横比）と高さ（h）が入れ替わる。
        // 比率の座標に戻すと、幅は h / 縦横比、高さは w × 縦横比
        rx0 = cx - h / aspect / 2;
        rx1 = cx + h / aspect / 2;
        ry0 = cy - (w * aspect) / 2;
        ry1 = cy + (w * aspect) / 2;
      } else {
        // 0度または180度回転
        rx0 = minX;
        rx1 = maxX;
        ry0 = minY;
        ry1 = maxY;
      }

      if (p[0] >= rx0 && p[0] <= rx1 && p[1] >= ry0 && p[1] <= ry1) {
        return marker;
      }
    } else {
      // 45度の奇数倍のときは回す前の形
      if (marker.shape.type === 'rect') {
        const s = marker.shape;
        if (p[0] >= s.x && p[0] <= s.x + s.w && p[1] >= s.y && p[1] <= s.y + s.h) {
          return marker;
        }
      } else if (marker.shape.type === 'poly') {
        const loc = locatePoint(marker.shape.points, p);
        if (loc === 'inside' || loc === 'boundary') {
          return marker;
        }
      }
    }
  }

  return null;
}

/**
 * モノに描画を設定する（または置き換える）。
 * 所属の層は変えない（updatedAt も変えない）。
 */
export function setItemDrawing(
  doc: ArekokoDocument,
  item: Id,
  input: {
    shape: Shape;
    rotation?: Rotation;
  },
  _ctx?: OpContext,
): OpResult {
  if (!input || typeof input !== 'object') {
    throw new OpError('invalidInput', '入力が不正です');
  }

  const itemObj = doc.membership.items.find(it => it.id === item);
  if (!itemObj) {
    throw new OpError('notFound', `モノが見つかりません: ${item}`);
  }

  const kuukanId = kuukanOfPlace(doc, itemObj.place);
  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukanId);
  if (!kd) {
    throw new OpError('noDrawing', 'モノの置き場が属するクウカンに描画がありません');
  }

  if (!isValidShape(input.shape)) {
    throw new OpError('invalidInput', 'モノの描画の形状が正しくありません');
  }

  if (
    input.rotation !== undefined &&
    (typeof input.rotation !== 'number' ||
      !Number.isInteger(input.rotation) ||
      input.rotation < 0 ||
      input.rotation > 7)
  ) {
    throw new OpError('invalidInput', '回転は0から7の整数である必要があります');
  }

  const center = shapeCenter(input.shape);
  const blockedMarker = notAPlaceMarkerAt(doc, kuukanId, center);
  if (blockedMarker) {
    throw new OpError('onNotAPlace', `マーカー「${blockedMarker.name}」の上には置けません`);
  }

  const newDrawing: ItemDrawing = {
    item,
    shape: input.shape,
    rotation: input.rotation ?? 0,
  };

  const existingIdx = doc.drawing.items.findIndex(d => d.item === item);
  let newItems: ItemDrawing[];
  if (existingIdx >= 0) {
    newItems = doc.drawing.items.map((d, i) => (i === existingIdx ? newDrawing : d));
  } else {
    newItems = [...doc.drawing.items, newDrawing];
  }

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: newItems,
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * モノの描画を (dx, dy) だけ平行移動する。
 */
export function moveItemDrawing(
  doc: ArekokoDocument,
  item: Id,
  dx: number,
  dy: number,
): OpResult {
  if (
    typeof dx !== 'number' ||
    typeof dy !== 'number' ||
    !Number.isInteger(dx) ||
    !Number.isInteger(dy)
  ) {
    throw new OpError('invalidInput', '移動量は整数である必要があります');
  }

  const existing = doc.drawing.items.find(d => d.item === item);
  if (!existing) {
    throw new OpError('notFound', `モノの描画が見つかりません: ${item}`);
  }

  const itemObj = doc.membership.items.find(it => it.id === item);
  if (!itemObj) {
    throw new OpError('notFound', `モノが見つかりません: ${item}`);
  }

  const newShape = translateShape(existing.shape, dx, dy);
  const newCenter = shapeCenter(newShape);
  const kuukanId = kuukanOfPlace(doc, itemObj.place);
  const blockedMarker = notAPlaceMarkerAt(doc, kuukanId, newCenter);
  if (blockedMarker) {
    throw new OpError('onNotAPlace', `マーカー「${blockedMarker.name}」の上には置けません`);
  }

  const updated: ItemDrawing = {
    ...existing,
    shape: newShape,
  };

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: doc.drawing.items.map(d => (d.item === item ? updated : d)),
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * モノの描画を 45 度単位で回転する（0〜7 を回る）。
 */
export function rotateItemDrawing(
  doc: ArekokoDocument,
  item: Id,
  step: 1 | -1,
): OpResult {
  if (step !== 1 && step !== -1) {
    throw new OpError('invalidInput', '回転ステップは 1 または -1 である必要があります');
  }

  const existing = doc.drawing.items.find(d => d.item === item);
  if (!existing) {
    throw new OpError('notFound', `モノの描画が見つかりません: ${item}`);
  }

  const nextRot = (((existing.rotation + step) % 8) + 8) % 8 as Rotation;
  const updated: ItemDrawing = {
    ...existing,
    rotation: nextRot,
  };

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: doc.drawing.items.map(d => (d.item === item ? updated : d)),
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * モノの描画の形だけを変更する（回転は保つ）。
 */
export function reshapeItemDrawing(
  doc: ArekokoDocument,
  item: Id,
  shape: Shape,
): OpResult {
  const existing = doc.drawing.items.find(d => d.item === item);
  if (!existing) {
    throw new OpError('notFound', `モノの描画が見つかりません: ${item}`);
  }

  const itemObj = doc.membership.items.find(it => it.id === item);
  if (!itemObj) {
    throw new OpError('notFound', `モノが見つかりません: ${item}`);
  }

  if (!isValidShape(shape)) {
    throw new OpError('invalidInput', 'モノの描画の形状が正しくありません');
  }

  const center = shapeCenter(shape);
  const kuukanId = kuukanOfPlace(doc, itemObj.place);
  const blockedMarker = notAPlaceMarkerAt(doc, kuukanId, center);
  if (blockedMarker) {
    throw new OpError('onNotAPlace', `マーカー「${blockedMarker.name}」の上には置けません`);
  }

  const updated: ItemDrawing = {
    ...existing,
    shape,
  };

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: doc.drawing.items.map(d => (d.item === item ? updated : d)),
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * モノの描画を外す。
 */
export function removeItemDrawing(
  doc: ArekokoDocument,
  item: Id,
): OpResult {
  const existing = doc.drawing.items.find(d => d.item === item);
  if (!existing) {
    throw new OpError('notFound', `モノの描画が見つかりません: ${item}`);
  }

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: doc.drawing.items.filter(d => d.item !== item),
      },
    },
    moved: [],
    created: [],
  };
}
