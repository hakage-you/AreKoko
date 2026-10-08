// クウカンの描画の伸び縮み、実際の長さ。詳細設計 5.2、付録A.13。

import type {
  ArekokoDocument,
  Id,
  KuukanDrawing,
  RealSize,
} from '../types';
import { OpError, type OpResult } from './common';

/**
 * クウカンの幅または奥行を倍率に応じて伸び縮みさせる。
 * 比率の座標（外形・仕切り・マーカー）は書き換えない。
 */
export function stretchKuukan(
  doc: ArekokoDocument,
  kuukan: Id,
  input: { axis: 'x' | 'y'; factor: number },
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

  if (input.axis !== 'x' && input.axis !== 'y') {
    throw new OpError('invalidInput', '軸は x または y である必要があります');
  }

  if (
    typeof input.factor !== 'number' ||
    !Number.isFinite(input.factor) ||
    input.factor <= 0
  ) {
    throw new OpError('invalidInput', '倍率は正の有限数である必要があります');
  }

  const newAspect = input.axis === 'x' ? kd.aspect * input.factor : kd.aspect / input.factor;

  let newRealSize: RealSize | undefined;
  if (kd.realSize) {
    newRealSize = {};
    if (kd.realSize.w !== undefined) {
      newRealSize.w =
        input.axis === 'x'
          ? Math.round(kd.realSize.w * input.factor * 10) / 10
          : kd.realSize.w;
    }
    if (kd.realSize.d !== undefined) {
      newRealSize.d =
        input.axis === 'y'
          ? Math.round(kd.realSize.d * input.factor * 10) / 10
          : kd.realSize.d;
    }
    if (newRealSize.w === undefined && newRealSize.d === undefined) {
      newRealSize = undefined;
    }
  }

  const updatedKd: KuukanDrawing = {
    ...kd,
    aspect: newAspect,
    ...(newRealSize !== undefined ? { realSize: newRealSize } : {}),
  };
  if (newRealSize === undefined) {
    delete (updatedKd as { realSize?: RealSize }).realSize;
  }

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      kuukans: doc.drawing.kuukans.map(k => (k.kuukan === kuukan ? updatedKd : k)),
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

/**
 * クウカンの実際の長さ（幅・奥行）を設定する。
 * 両方指定された場合は aspect = w / d に更新し、片方の場合は aspect を維持する。
 * undefined の項目は削除される。
 */
export function setRealSize(
  doc: ArekokoDocument,
  kuukan: Id,
  realSize: { w?: number; d?: number },
): OpResult {
  if (!realSize || typeof realSize !== 'object') {
    throw new OpError('invalidInput', '実際の長さが不正です');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === kuukan);
  if (!targetKuukan) {
    throw new OpError('notFound', `クウカンが見つかりません: ${kuukan}`);
  }

  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukan);
  if (!kd) {
    throw new OpError('noDrawing', 'クウカンの描画情報がありません');
  }

  if (
    realSize.w !== undefined &&
    (typeof realSize.w !== 'number' || !Number.isFinite(realSize.w) || realSize.w <= 0)
  ) {
    throw new OpError('invalidInput', '幅は正の数である必要があります');
  }

  if (
    realSize.d !== undefined &&
    (typeof realSize.d !== 'number' || !Number.isFinite(realSize.d) || realSize.d <= 0)
  ) {
    throw new OpError('invalidInput', '奥行は正の数である必要があります');
  }

  const aspect =
    realSize.w !== undefined && realSize.d !== undefined
      ? realSize.w / realSize.d
      : kd.aspect;

  const newRealSize: RealSize = {};
  if (realSize.w !== undefined) {
    newRealSize.w = realSize.w;
  }
  if (realSize.d !== undefined) {
    newRealSize.d = realSize.d;
  }
  const hasRealSize = Object.keys(newRealSize).length > 0;

  const updatedKd: KuukanDrawing = {
    ...kd,
    aspect,
    ...(hasRealSize ? { realSize: newRealSize } : {}),
  };
  if (!hasRealSize) {
    delete (updatedKd as { realSize?: RealSize }).realSize;
  }

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      kuukans: doc.drawing.kuukans.map(k => (k.kuukan === kuukan ? updatedKd : k)),
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}
