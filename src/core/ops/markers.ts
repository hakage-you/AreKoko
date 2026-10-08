// マーカーの操作。詳細設計 5.1、付録A.13。

import type {
  ArekokoDocument,
  Id,
  Marker,
  Rotation,
  Shape,
} from '../types';
import { OpError, type OpContext, type OpResult } from './common';
import { isValidShape } from '../../geometry/shape';
import { boundingRect } from '../../geometry/polygon';

/**
 * 形状を (dx, dy) だけ平行移動する。
 */
function translateShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === 'point') {
    return {
      type: 'point',
      at: [shape.at[0] + dx, shape.at[1] + dy],
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
      points: shape.points.map(([x, y]) => [x + dx, y + dy]),
    };
  }
  const _exhaustive: never = shape;
  throw new OpError('invalidInput', `未対応の形状です: ${JSON.stringify(_exhaustive)}`);
}

interface MarkerBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * 形状の外接長方形および中心を求める。
 */
function getMarkerBounds(shape: Shape): MarkerBounds {
  if (shape.type === 'point') {
    return {
      left: shape.at[0],
      right: shape.at[0],
      top: shape.at[1],
      bottom: shape.at[1],
      centerX: shape.at[0],
      centerY: shape.at[1],
    };
  }
  if (shape.type === 'rect') {
    return {
      left: shape.x,
      right: shape.x + shape.w,
      top: shape.y,
      bottom: shape.y + shape.h,
      centerX: shape.x + shape.w / 2,
      centerY: shape.y + shape.h / 2,
    };
  }
  if (shape.type === 'poly') {
    const r = boundingRect(shape.points);
    return {
      left: r.x0,
      right: r.x1,
      top: r.y0,
      bottom: r.y1,
      centerX: (r.x0 + r.x1) / 2,
      centerY: (r.y0 + r.y1) / 2,
    };
  }
  const _exhaustive: never = shape;
  throw new OpError('invalidInput', `未対応の形状です: ${JSON.stringify(_exhaustive)}`);
}

/**
 * クウカンにマーカーを追加する。
 */
export function addMarker(
  doc: ArekokoDocument,
  kuukan: Id,
  input: {
    name: string;
    shape: Shape;
    rotation?: Rotation;
    notAPlace?: boolean;
  },
  ctx: OpContext,
): OpResult {
  if (!input || typeof input !== 'object') {
    throw new OpError('invalidInput', '入力が不正です');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === kuukan);
  if (!targetKuukan) {
    throw new OpError('notFound', `クウカンが見つかりません: ${kuukan}`);
  }

  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukan);
  if (!kd) {
    throw new OpError('noDrawing', 'クウカンの描画情報がありません');
  }

  if (typeof input.name !== 'string') {
    throw new OpError('invalidInput', '名前は文字列である必要があります');
  }

  if (!isValidShape(input.shape)) {
    throw new OpError('invalidInput', 'マーカーの形状が正しくありません');
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

  if (input.notAPlace !== undefined && typeof input.notAPlace !== 'boolean') {
    throw new OpError('invalidInput', 'notAPlace は真偽値である必要があります');
  }

  const id = ctx.newId();
  const newMarker: Marker = {
    id,
    kuukan,
    name: input.name,
    shape: input.shape,
    rotation: input.rotation ?? 0,
    notAPlace: input.notAPlace ?? false,
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      markers: [...doc.drawing.markers, newMarker],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id],
  };
}

/**
 * マーカーの属性を更新する。
 */
export function updateMarker(
  doc: ArekokoDocument,
  id: Id,
  patch: {
    name?: string;
    shape?: Shape;
    rotation?: Rotation;
    notAPlace?: boolean;
  },
): OpResult {
  if (!patch || typeof patch !== 'object') {
    throw new OpError('invalidInput', 'パッチが不正です');
  }

  const target = doc.drawing.markers.find(m => m.id === id);
  if (!target) {
    throw new OpError('notFound', `マーカーが見つかりません: ${id}`);
  }

  if (patch.name !== undefined && typeof patch.name !== 'string') {
    throw new OpError('invalidInput', '名前は文字列である必要があります');
  }

  if (patch.shape !== undefined && !isValidShape(patch.shape)) {
    throw new OpError('invalidInput', 'マーカーの形状が正しくありません');
  }

  if (
    patch.rotation !== undefined &&
    (typeof patch.rotation !== 'number' ||
      !Number.isInteger(patch.rotation) ||
      patch.rotation < 0 ||
      patch.rotation > 7)
  ) {
    throw new OpError('invalidInput', '回転は0から7の整数である必要があります');
  }

  if (patch.notAPlace !== undefined && typeof patch.notAPlace !== 'boolean') {
    throw new OpError('invalidInput', 'notAPlace は真偽値である必要があります');
  }

  const updated: Marker = {
    ...target,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.shape !== undefined ? { shape: patch.shape } : {}),
    ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
    ...(patch.notAPlace !== undefined ? { notAPlace: patch.notAPlace } : {}),
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      markers: doc.drawing.markers.map(m => (m.id === id ? updated : m)),
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

/**
 * 指定したマーカーを (dx, dy) だけ平行移動する。
 */
export function moveMarkers(
  doc: ArekokoDocument,
  ids: Id[],
  dx: number,
  dy: number,
): OpResult {
  if (!Array.isArray(ids)) {
    throw new OpError('invalidInput', 'IDの一覧が不正です');
  }

  if (
    typeof dx !== 'number' ||
    typeof dy !== 'number' ||
    !Number.isInteger(dx) ||
    !Number.isInteger(dy)
  ) {
    throw new OpError('invalidInput', '移動量は整数である必要があります');
  }

  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const markerMap = new Map(doc.drawing.markers.map(m => [m.id, m]));
  for (const id of ids) {
    if (!markerMap.has(id)) {
      throw new OpError('notFound', `マーカーが見つかりません: ${id}`);
    }
  }

  if (dx === 0 && dy === 0) {
    return { doc, moved: [], created: [] };
  }

  const targetIdSet = new Set(ids);
  const newMarkers = doc.drawing.markers.map(m => {
    if (targetIdSet.has(m.id)) {
      return {
        ...m,
        shape: translateShape(m.shape, dx, dy),
      };
    }
    return m;
  });

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        markers: newMarkers,
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * 指定したマーカーを削除する。
 */
export function deleteMarkers(doc: ArekokoDocument, ids: Id[]): OpResult {
  if (!Array.isArray(ids)) {
    throw new OpError('invalidInput', 'IDの一覧が不正です');
  }

  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const existingIds = new Set(doc.drawing.markers.map(m => m.id));
  for (const id of ids) {
    if (!existingIds.has(id)) {
      throw new OpError('notFound', `マーカーが見つかりません: ${id}`);
    }
  }

  const toDelete = new Set(ids);
  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        markers: doc.drawing.markers.filter(m => !toDelete.has(m.id)),
      },
    },
    moved: [],
    created: [],
  };
}

/**
 * 指定したマーカー群を整列する。2つ未満なら何もしない。
 */
export function alignMarkers(
  doc: ArekokoDocument,
  ids: Id[],
  mode: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY',
): OpResult {
  if (!Array.isArray(ids)) {
    throw new OpError('invalidInput', 'IDの一覧が不正です');
  }

  if (
    mode !== 'left' &&
    mode !== 'right' &&
    mode !== 'top' &&
    mode !== 'bottom' &&
    mode !== 'centerX' &&
    mode !== 'centerY'
  ) {
    throw new OpError('invalidInput', '無効な整列モードです');
  }

  if (ids.length < 2) {
    return { doc, moved: [], created: [] };
  }

  const markerMap = new Map(doc.drawing.markers.map(m => [m.id, m]));
  for (const id of ids) {
    if (!markerMap.has(id)) {
      throw new OpError('notFound', `マーカーが見つかりません: ${id}`);
    }
  }

  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length < 2) {
    return { doc, moved: [], created: [] };
  }

  const selectedMarkers = uniqueIds.map(id => markerMap.get(id)!);
  const boundsList = selectedMarkers.map(m => getMarkerBounds(m.shape));

  let targetCoord = 0;
  if (mode === 'left') {
    targetCoord = Math.min(...boundsList.map(b => b.left));
  } else if (mode === 'right') {
    targetCoord = Math.max(...boundsList.map(b => b.right));
  } else if (mode === 'top') {
    targetCoord = Math.min(...boundsList.map(b => b.top));
  } else if (mode === 'bottom') {
    targetCoord = Math.max(...boundsList.map(b => b.bottom));
  } else if (mode === 'centerX') {
    const avg = boundsList.reduce((sum, b) => sum + b.centerX, 0) / boundsList.length;
    targetCoord = Math.round(avg);
  } else if (mode === 'centerY') {
    const avg = boundsList.reduce((sum, b) => sum + b.centerY, 0) / boundsList.length;
    targetCoord = Math.round(avg);
  }

  const markerDeltaMap = new Map<Id, { dx: number; dy: number }>();
  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i]!;
    const b = boundsList[i]!;
    let dx = 0;
    let dy = 0;
    if (mode === 'left') {
      dx = targetCoord - b.left;
    } else if (mode === 'right') {
      dx = targetCoord - b.right;
    } else if (mode === 'top') {
      dy = targetCoord - b.top;
    } else if (mode === 'bottom') {
      dy = targetCoord - b.bottom;
    } else if (mode === 'centerX') {
      dx = Math.round(targetCoord - b.centerX);
    } else if (mode === 'centerY') {
      dy = Math.round(targetCoord - b.centerY);
    }
    markerDeltaMap.set(id, { dx, dy });
  }

  const newMarkers = doc.drawing.markers.map(m => {
    const delta = markerDeltaMap.get(m.id);
    if (delta) {
      return {
        ...m,
        shape: translateShape(m.shape, delta.dx, delta.dy),
      };
    }
    return m;
  });

  return {
    doc: {
      ...doc,
      drawing: {
        ...doc.drawing,
        markers: newMarkers,
      },
    },
    moved: [],
    created: [],
  };
}
