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
