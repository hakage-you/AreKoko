// 仕切りとエリアの操作。詳細設計 9.6、付録A.13。

import type {
  Area,
  ArekokoDocument,
  Axis,
  Id,
  KuukanDrawing,
  Partition,
  Point,
  RealSize,
} from '../types';
import { NIL_ID } from '../constants';
import { OpError, type OpContext, type OpResult, type Relocation } from './common';
import { buildAreaTree } from '../indexes';
import { areaSubtree } from '../places';
import { relocateItems } from '../relocate';
import { boundingRect, isRectangle, validateOutline } from '../../geometry/polygon';
import { boundedSegment, evenSplitPositions } from '../../geometry/partition';
import { computeRegions, leafAt, type AreaTree } from '../../geometry/regions';
import { dragRange } from '../../geometry/drag';

/** クウカンの領域の計算に要るもの（木と、そのクウカンの仕切り）。 */
function kuukanGeometry(doc: ArekokoDocument, kuukan: Id): { tree: AreaTree; partitions: Partition[] } {
  const tree = buildAreaTree(doc, kuukan);
  const nodeIds = new Set<Id>([kuukan, ...[...tree.children.values()].flat()]);
  return { tree, partitions: doc.drawing.partitions.filter(p => nodeIds.has(p.area)) };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 描画のない、エリアのないクウカンに外形を設定する。
 */
export function attachOutline(
  doc: ArekokoDocument,
  kuukan: Id,
  input: { outline: Point[]; aspect: number; realSize?: RealSize },
  _ctx: OpContext,
): OpResult {
  if (kuukan === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンには外形を設定できません');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === kuukan);
  if (!targetKuukan) {
    throw new OpError('notFound', `クウカンが見つかりません: ${kuukan}`);
  }

  const hasDrawing = doc.drawing.kuukans.some(kd => kd.kuukan === kuukan);
  if (hasDrawing) {
    throw new OpError('invalidInput', '既に描画情報が存在します');
  }

  const hasAreas = doc.membership.areas.some(a => a.kuukan === kuukan);
  if (hasAreas) {
    throw new OpError('hasAreas', '既にエリアが存在します');
  }

  const outlineRes = validateOutline(input.outline);
  if (!outlineRes.ok) {
    throw new OpError('invalidInput', `外形が不正です: ${outlineRes.reason}`);
  }

  if (typeof input.aspect !== 'number' || input.aspect <= 0 || !Number.isFinite(input.aspect)) {
    throw new OpError('invalidInput', 'アスペクト比は正の有限数である必要があります');
  }
  const rs = input.realSize;
  if (rs !== undefined && [rs.w, rs.d].some(v => v !== undefined && !(Number.isFinite(v) && v > 0))) {
    throw new OpError('invalidInput', '実際の長さは正の数にしてください');
  }

  const newDrawing: KuukanDrawing = {
    kuukan,
    outline: outlineRes.polygon,
    aspect: input.aspect,
    ...(input.realSize !== undefined ? { realSize: input.realSize } : {}),
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      kuukans: [...doc.drawing.kuukans, newDrawing],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

/**
 * 指定した点を境界で止める仕切りで2つに分ける。
 */
export function splitAt(
  doc: ArekokoDocument,
  kuukan: Id,
  axis: Axis,
  point: Point,
  ctx: OpContext,
): OpResult {
  if (kuukan === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンは分割できません');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === kuukan);
  if (!targetKuukan) {
    throw new OpError('notFound', `クウカンが見つかりません: ${kuukan}`);
  }

  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukan);
  if (!kd) {
    throw new OpError('noDrawing', 'クウカンの描画がありません');
  }

  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !Number.isInteger(point[0]) ||
    !Number.isInteger(point[1])
  ) {
    throw new OpError('invalidInput', '座標は整数のペアである必要があります');
  }

  if (axis !== 'x' && axis !== 'y') {
    throw new OpError('invalidInput', '軸は x または y である必要があります');
  }

  const { tree, partitions: kuukanPartitions } = kuukanGeometry(doc, kuukan);

  const regionsRes = computeRegions(kd.outline, tree, kuukanPartitions);
  if (!regionsRes.ok) {
    throw new OpError('invalidInput', `領域の計算に失敗しました: ${regionsRes.reason}`);
  }

  const leafNode = leafAt(regionsRes.regions, tree, point);
  if (leafNode === null) {
    throw new OpError('onLine', '指定された点が境界または仕切りの線上にあります');
  }

  const leafPoly = regionsRes.regions.get(leafNode);
  if (!leafPoly) {
    throw new OpError('notFound', `葉の領域が見つかりません: ${leafNode}`);
  }

  const segment = boundedSegment(leafPoly, axis, point);
  if (segment === null) {
    throw new OpError('onLine', '仕切り線が領域の境界上にあるか計算できません');
  }

  const isRoot = leafNode === kuukan;
  let name1: string;
  let name2: string;
  let parent: Id | null;

  if (isRoot) {
    parent = null;
    name1 = `${targetKuukan.areaLabel}1`;
    name2 = `${targetKuukan.areaLabel}2`;
  } else {
    parent = leafNode;
    const parentArea = doc.membership.areas.find(a => a.id === leafNode);
    if (!parentArea) {
      throw new OpError('notFound', `親エリアが見つかりません: ${leafNode}`);
    }
    name1 = `${parentArea.name}-1`;
    name2 = `${parentArea.name}-2`;
  }

  const id1 = ctx.newId();
  const id2 = ctx.newId();

  const area1: Area = {
    id: id1,
    kuukan,
    parent,
    name: name1,
    order: 0,
  };

  const area2: Area = {
    id: id2,
    kuukan,
    parent,
    name: name2,
    order: 1,
  };

  const atCoord = axis === 'x' ? point[0]! : point[1]!;
  const newPartition: Partition = {
    area: leafNode,
    axis,
    at: [atCoord],
    seed: [point[0]!, point[1]!],
    children: [id1, id2],
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      areas: [...doc.membership.areas, area1, area2],
    },
    drawing: {
      ...doc.drawing,
      partitions: [...doc.drawing.partitions, newPartition],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id1, id2],
  };
}

/**
 * 子のない長方形の節を N 等分する。
 */
export function splitEven(
  doc: ArekokoDocument,
  node: Id,
  axis: Axis,
  n: number,
  ctx: OpContext,
): OpResult {
  if (node === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンは分割できません');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === node);
  const targetArea = targetKuukan ? undefined : doc.membership.areas.find(a => a.id === node);

  if (!targetKuukan && !targetArea) {
    throw new OpError('notFound', `節が見つかりません: ${node}`);
  }

  const isRoot = targetKuukan !== undefined;
  const kuukanId = isRoot ? targetKuukan.id : targetArea!.kuukan;
  const parent = isRoot ? null : targetArea!.id;

  const kuukanObj = doc.membership.kuukans.find(k => k.id === kuukanId);
  if (!kuukanObj) {
    throw new OpError('notFound', `所属クウカンが見つかりません: ${kuukanId}`);
  }

  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukanId);
  if (!kd) {
    throw new OpError('noDrawing', 'クウカンの描画がありません');
  }

  // 子のない節であることを確認
  const hasChildAreas = isRoot
    ? doc.membership.areas.some(a => a.kuukan === kuukanId && a.parent === null)
    : doc.membership.areas.some(a => a.parent === node);
  const hasPartition = doc.drawing.partitions.some(p => p.area === node);
  if (hasChildAreas || hasPartition) {
    throw new OpError('notLeaf', '子のない節ではありません');
  }

  if (axis !== 'x' && axis !== 'y') {
    throw new OpError('invalidInput', '軸は x または y である必要があります');
  }

  if (!Number.isInteger(n) || n < 2) {
    throw new OpError('tooSmall', '分割数は2以上の整数である必要があります');
  }

  const { tree, partitions: kuukanPartitions } = kuukanGeometry(doc, kuukanId);

  const regionsRes = computeRegions(kd.outline, tree, kuukanPartitions);
  if (!regionsRes.ok) {
    throw new OpError('invalidInput', `領域の計算に失敗しました: ${regionsRes.reason}`);
  }

  const poly = regionsRes.regions.get(node);
  if (!poly) {
    throw new OpError('notFound', `節の領域が見つかりません: ${node}`);
  }

  if (!isRectangle(poly)) {
    throw new OpError('notRectangle', '領域が長方形ではありません');
  }

  const rect = boundingRect(poly);
  const lo = axis === 'x' ? rect.x0 : rect.y0;
  const hi = axis === 'x' ? rect.x1 : rect.y1;
  const ats = evenSplitPositions(lo, hi, n);
  if (ats === null) {
    throw new OpError('tooSmall', '均等分割するには領域が狭すぎます');
  }

  let seed: Point | undefined;
  if (n === 2) {
    const otherLo = axis === 'x' ? rect.y0 : rect.x0;
    const otherHi = axis === 'x' ? rect.y1 : rect.x1;
    const mid = Math.floor((otherLo + otherHi) / 2);
    if (mid <= otherLo || mid >= otherHi) {
      throw new OpError('tooSmall', '中点が領域の内側にありません');
    }
    seed = axis === 'x' ? [ats[0]!, mid] : [mid, ats[0]!];
  }

  const childIds: Id[] = [];
  const newAreas: Area[] = [];

  for (let i = 0; i < n; i++) {
    const childId = ctx.newId();
    childIds.push(childId);
    const name = isRoot ? `${kuukanObj.areaLabel}${i + 1}` : `${targetArea!.name}-${i + 1}`;
    newAreas.push({
      id: childId,
      kuukan: kuukanId,
      parent,
      name,
      order: i,
    });
  }

  const newPartition: Partition = {
    area: node,
    axis,
    at: ats,
    children: childIds,
    ...(seed !== undefined ? { seed } : {}),
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      areas: [...doc.membership.areas, ...newAreas],
    },
    drawing: {
      ...doc.drawing,
      partitions: [...doc.drawing.partitions, newPartition],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: childIds,
  };
}

/**
 * 線を消したときの影響（消えるエリア、モノの移動、新エリア作成の有無）を計算する。
 */
export function planDeleteLine(
  doc: ArekokoDocument,
  node: Id,
  lineIndex: number,
): { removedAreas: Id[]; relocations: Relocation[]; createsArea: boolean } {
  if (node === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンには仕切りがありません');
  }

  const partition = doc.drawing.partitions.find(p => p.area === node);
  if (!partition) {
    throw new OpError('notFound', `節「${node}」の仕切りが見つかりません`);
  }

  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= partition.at.length) {
    throw new OpError('outOfRange', `線の番号「${lineIndex}」が範囲外です`);
  }

  const childA = partition.children[lineIndex]!;
  const childB = partition.children[lineIndex + 1]!;

  const subtreeA = areaSubtree(doc, childA);
  const subtreeB = areaSubtree(doc, childB);
  const removedAreas = [...subtreeA, ...subtreeB];
  const removedSet = new Set(removedAreas);

  const relocMap = new Map<Id, Relocation>();
  for (const item of doc.membership.items) {
    if (removedSet.has(item.place)) {
      let r = relocMap.get(item.place);
      if (!r) {
        r = { from: item.place, to: node, items: [] };
        relocMap.set(item.place, r);
      }
      r.items.push(item.id);
    }
  }

  return {
    removedAreas,
    relocations: Array.from(relocMap.values()),
    createsArea: partition.at.length >= 2,
  };
}

/**
 * 仕切りの線を消す。
 */
export function deleteLine(
  doc: ArekokoDocument,
  node: Id,
  lineIndex: number,
  ctx: OpContext,
): OpResult {
  if (node === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンには仕切りがありません');
  }

  const partition = doc.drawing.partitions.find(p => p.area === node);
  if (!partition) {
    throw new OpError('notFound', `節「${node}」の仕切りが見つかりません`);
  }

  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= partition.at.length) {
    throw new OpError('outOfRange', `線の番号「${lineIndex}」が範囲外です`);
  }

  const childA = partition.children[lineIndex]!;
  const childB = partition.children[lineIndex + 1]!;

  const subtreeA = areaSubtree(doc, childA);
  const subtreeB = areaSubtree(doc, childB);
  const removedAreas = [...subtreeA, ...subtreeB];
  const removedSet = new Set(removedAreas);

  // 1. 中身を節へ移す（統一規則）
  const mapping = new Map<Id, Id>();
  for (const aId of removedAreas) {
    mapping.set(aId, node);
  }
  const relocateResult = relocateItems(doc, mapping, ctx);
  const docAfterRelocate = relocateResult.doc;

  // Case 1: at.length === 1
  if (partition.at.length === 1) {
    const newAreas = docAfterRelocate.membership.areas.filter(a => !removedSet.has(a.id));
    const newPartitions = docAfterRelocate.drawing.partitions.filter(
      p => p.area !== node && !removedSet.has(p.area),
    );

    const newDoc: ArekokoDocument = {
      ...docAfterRelocate,
      membership: {
        ...docAfterRelocate.membership,
        areas: newAreas,
      },
      drawing: {
        ...docAfterRelocate.drawing,
        partitions: newPartitions,
      },
    };

    return {
      doc: newDoc,
      moved: relocateResult.moved,
      created: [],
    };
  }

  // Case 2: at.length >= 2
  const targetKuukan = doc.membership.kuukans.find(k => k.id === node);
  const isRoot = targetKuukan !== undefined;
  let kuukanId: Id;
  let parent: Id | null;
  let prefix: string;

  if (isRoot) {
    kuukanId = node;
    parent = null;
    prefix = targetKuukan.areaLabel;
  } else {
    const targetArea = doc.membership.areas.find(a => a.id === node)!;
    kuukanId = targetArea.kuukan;
    parent = node;
    prefix = `${targetArea.name}-`;
  }

  // 消す前の兄弟の名前から次の番号を決定する
  const regex = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`);
  let maxNum = -1;
  for (const childId of partition.children) {
    const sibling = doc.membership.areas.find(a => a.id === childId);
    if (sibling) {
      const m = sibling.name.match(regex);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum >= 0 ? maxNum + 1 : partition.children.length + 1;
  const newAreaName = `${prefix}${nextNum}`;

  const newAreaId = ctx.newId();
  const newAt = partition.at.filter((_, i) => i !== lineIndex);
  const newChildren = [
    ...partition.children.slice(0, lineIndex),
    newAreaId,
    ...partition.children.slice(lineIndex + 2),
  ];

  // 残りの線が1本になったら seed を線の中点（外接長方形の中点）にする
  let seed: Point | undefined;
  if (newAt.length === 1) {
    const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukanId);
    if (!kd) {
      throw new OpError('noDrawing', 'クウカンの描画がありません');
    }
    const { tree, partitions: kuukanPartitions } = kuukanGeometry(doc, kuukanId);
    const regionsRes = computeRegions(kd.outline, tree, kuukanPartitions);
    if (!regionsRes.ok) {
      throw new OpError('invalidInput', `領域の計算に失敗しました: ${regionsRes.reason}`);
    }
    const nodePoly = regionsRes.regions.get(node);
    if (!nodePoly) {
      throw new OpError('notFound', `節の領域が見つかりません: ${node}`);
    }
    const rect = boundingRect(nodePoly);
    if (partition.axis === 'x') {
      seed = [newAt[0]!, Math.floor((rect.y0 + rect.y1) / 2)];
    } else {
      seed = [Math.floor((rect.x0 + rect.x1) / 2), newAt[0]!];
    }
  }

  const updatedPartition: Partition = {
    ...partition,
    at: newAt,
    children: newChildren,
    ...(seed !== undefined ? { seed } : {}),
  };
  if (seed === undefined) {
    delete (updatedPartition as { seed?: Point }).seed;
  }

  const childOrderMap = new Map<Id, number>();
  for (let i = 0; i < newChildren.length; i++) {
    childOrderMap.set(newChildren[i]!, i);
  }

  const newArea: Area = {
    id: newAreaId,
    kuukan: kuukanId,
    parent,
    name: newAreaName,
    order: lineIndex,
  };

  const newAreas = docAfterRelocate.membership.areas
    .filter(a => !removedSet.has(a.id))
    .map(a => {
      const newOrder = childOrderMap.get(a.id);
      if (newOrder !== undefined) {
        return { ...a, order: newOrder };
      }
      return a;
    });
  newAreas.push(newArea);

  const newPartitions = docAfterRelocate.drawing.partitions
    .filter(p => !removedSet.has(p.area))
    .map(p => (p.area === node ? updatedPartition : p));

  const newDoc: ArekokoDocument = {
    ...docAfterRelocate,
    membership: {
      ...docAfterRelocate.membership,
      areas: newAreas,
    },
    drawing: {
      ...docAfterRelocate.drawing,
      partitions: newPartitions,
    },
  };

  return {
    doc: newDoc,
    moved: relocateResult.moved,
    created: [newAreaId],
  };
}

/**
 * 仕切りの線を指定位置へ移動する。
 */
export function moveLine(
  doc: ArekokoDocument,
  node: Id,
  lineIndex: number,
  at: number,
): OpResult {
  if (node === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンには仕切りがありません');
  }

  const partition = doc.drawing.partitions.find(p => p.area === node);
  if (!partition) {
    throw new OpError('notFound', `節「${node}」の仕切りが見つかりません`);
  }

  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= partition.at.length) {
    throw new OpError('outOfRange', `線の番号「${lineIndex}」が範囲外です`);
  }

  if (!Number.isInteger(at)) {
    throw new OpError('invalidInput', '座標は整数である必要があります');
  }

  const targetKuukan = doc.membership.kuukans.find(k => k.id === node);
  const targetArea = targetKuukan ? undefined : doc.membership.areas.find(a => a.id === node);
  if (!targetKuukan && !targetArea) {
    throw new OpError('notFound', `節が見つかりません: ${node}`);
  }

  const kuukanId = targetKuukan !== undefined ? targetKuukan.id : targetArea!.kuukan;
  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukanId);
  if (!kd) {
    throw new OpError('noDrawing', 'クウカンの描画がありません');
  }

  const { tree, partitions: kuukanPartitions } = kuukanGeometry(doc, kuukanId);

  const range = dragRange(kd.outline, tree, kuukanPartitions, node, lineIndex);
  if (at < range.min || at > range.max) {
    throw new OpError(
      'outOfRange',
      `移動先の座標「${at}」が移動可能範囲 [${range.min}, ${range.max}] の外です`,
    );
  }

  if (at === partition.at[lineIndex]) {
    return { doc, moved: [], created: [] };
  }

  const newAt = [...partition.at];
  newAt[lineIndex] = at;

  let newSeed = partition.seed;
  if (newAt.length === 1 && partition.seed) {
    newSeed = partition.axis === 'x'
      ? [at, partition.seed[1]!]
      : [partition.seed[0]!, at];
  }

  const updatedPartition: Partition = {
    ...partition,
    at: newAt,
    ...(newSeed !== undefined ? { seed: newSeed } : {}),
  };
  if (newSeed === undefined) {
    delete (updatedPartition as { seed?: Point }).seed;
  }

  const newPartitions = doc.drawing.partitions.map(p =>
    p.area === node ? updatedPartition : p,
  );

  const newDoc: ArekokoDocument = {
    ...doc,
    drawing: {
      ...doc.drawing,
      partitions: newPartitions,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

/**
 * エリアの名前を変更する。
 */
export function renameArea(doc: ArekokoDocument, id: Id, name: string): OpResult {
  const target = doc.membership.areas.find(a => a.id === id);
  if (!target) {
    throw new OpError('notFound', `エリアが見つかりません: ${id}`);
  }

  if (target.name === name) {
    return { doc, moved: [], created: [] };
  }

  const newAreas = doc.membership.areas.map(a => (a.id === id ? { ...a, name } : a));

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      areas: newAreas,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}
