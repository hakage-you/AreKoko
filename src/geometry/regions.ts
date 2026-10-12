// エリアの領域の計算と検証。詳細設計 9.4、付録A.5。

import type { Id, Point, Partition } from '../core/types';
import type { Polygon } from './types';
import {
  validateOutline,
  locatePoint,
  isRectangle,
  boundingRect,
  polygonArea,
} from './polygon';
import {
  boundedSegment,
  splitPolygon,
  splitRect,
  rectToPolygon,
} from './partition';

export interface AreaTree {
  root: Id;
  children: Map<Id, Id[]>;
}

export type ComputeRegionsResult =
  | { ok: true; regions: Map<Id, Polygon> }
  | { ok: false; reason: string; failedAreaId?: Id };

export function computeRegions(
  outline: Point[],
  tree: AreaTree,
  partitions: Partition[],
): ComputeRegionsResult {
  // 1. 外形の検査
  const outlineRes = validateOutline(outline);
  if (!outlineRes.ok) {
    return { ok: false, reason: `外形が正しくありません: ${outlineRes.reason}` };
  }

  // 重複する仕切りがないか確認
  const partitionMap = new Map<Id, Partition>();
  for (const p of partitions) {
    if (partitionMap.has(p.area)) {
      return { ok: false, reason: '同じエリアに複数の仕切りがあります', failedAreaId: p.area };
    }
    partitionMap.set(p.area, p);
  }

  const regions = new Map<Id, Polygon>();
  regions.set(tree.root, outlineRes.polygon);

  if (polygonArea(outlineRes.polygon) <= 0) {
    return { ok: false, reason: '外形の面積が正ではありません' };
  }

  const visited = new Set<Id>();
  visited.add(tree.root);
  const queue: Id[] = [tree.root];
  const usedPartitions = new Set<Id>();

  // 幅優先で各エリアの仕切りから子の領域を作る
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const treeChildren = tree.children.get(currentId) ?? [];

    if (treeChildren.length === 0) {
      continue;
    }

    // 2. 分割されたエリアごとに仕切りがちょうど1つあること
    const partition = partitionMap.get(currentId);
    if (!partition) {
      return { ok: false, reason: '分割されたエリアに仕切りがありません', failedAreaId: currentId };
    }
    usedPartitions.add(currentId);

    // children に重複がないこと
    const partChildrenSet = new Set(partition.children);
    if (partChildrenSet.size !== partition.children.length) {
      return { ok: false, reason: '仕切りで分けたエリアに重複があります', failedAreaId: currentId };
    }

    // 分割されたエリアの集合と仕切りの children が集合として等しいこと
    const treeChildrenSet = new Set(treeChildren);
    if (
      treeChildrenSet.size !== treeChildren.length ||
      partChildrenSet.size !== treeChildrenSet.size
    ) {
      return { ok: false, reason: '仕切りで分けたエリアの構成が一致しません', failedAreaId: currentId };
    }
    for (const childId of partition.children) {
      if (!treeChildrenSet.has(childId)) {
        return { ok: false, reason: '仕切りで分けたエリアの構成が一致しません', failedAreaId: currentId };
      }
    }

    // 3. children.length === at.length + 1、at は狭義の昇順の整数
    if (partition.children.length !== partition.at.length + 1) {
      return {
        ok: false,
        reason: '仕切り線の数と分割されたエリアの数が合いません',
        failedAreaId: currentId,
      };
    }

    if (partition.at.length === 0) {
      return { ok: false, reason: '仕切り線の位置が指定されていません', failedAreaId: currentId };
    }

    for (let i = 0; i < partition.at.length; i++) {
      const val = partition.at[i]!;
      if (!Number.isInteger(val)) {
        return { ok: false, reason: '仕切り線の位置が整数ではありません', failedAreaId: currentId };
      }
      if (i > 0 && partition.at[i - 1]! >= val) {
        return { ok: false, reason: '仕切り線の位置が昇順ではありません', failedAreaId: currentId };
      }
    }

    const parentPoly = regions.get(currentId)!;

    if (partition.at.length === 1) {
      // 4. 境界で止める仕切り
      if (!partition.seed) {
        return { ok: false, reason: '仕切り線の基準位置がありません', failedAreaId: currentId };
      }

      if (!Number.isInteger(partition.seed[0]) || !Number.isInteger(partition.seed[1])) {
        return { ok: false, reason: '仕切り線の基準位置の座標が整数ではありません', failedAreaId: currentId };
      }

      const seedCoord = partition.axis === 'x' ? partition.seed[0] : partition.seed[1];
      if (seedCoord !== partition.at[0]) {
        return {
          ok: false,
          reason: '仕切り線の基準位置と線の位置が一致しません',
          failedAreaId: currentId,
        };
      }

      const loc = locatePoint(parentPoly, partition.seed);
      if (loc === 'boundary') {
        return { ok: false, reason: '仕切り線がエリアの境界上にあります', failedAreaId: currentId };
      }
      if (loc !== 'inside') {
        return { ok: false, reason: '仕切り線がエリアの内部にありません', failedAreaId: currentId };
      }

      const segment = boundedSegment(parentPoly, partition.axis, partition.seed);
      if (!segment) {
        return { ok: false, reason: '仕切り線をエリア内に引くことができませんでした', failedAreaId: currentId };
      }

      const [poly0, poly1] = splitPolygon(parentPoly, partition.axis, segment);

      // 6. できた領域の面積が正であること
      if (polygonArea(poly0) <= 0 || polygonArea(poly1) <= 0) {
        return { ok: false, reason: '仕切り後のエリアの面積が正ではありません', failedAreaId: currentId };
      }

      regions.set(partition.children[0]!, poly0);
      regions.set(partition.children[1]!, poly1);
    } else {
      // 5. N等分（at.length >= 2）
      if (partition.seed !== undefined) {
        return { ok: false, reason: '等分割の仕切りに基準位置が指定されています', failedAreaId: currentId };
      }

      if (!isRectangle(parentPoly)) {
        return { ok: false, reason: '長方形ではないエリアは等分割できません', failedAreaId: currentId };
      }

      const rect = boundingRect(parentPoly);
      const minCoord = partition.axis === 'x' ? rect.x0 : rect.y0;
      const maxCoord = partition.axis === 'x' ? rect.x1 : rect.y1;

      for (const atVal of partition.at) {
        if (atVal <= minCoord || atVal >= maxCoord) {
          return {
            ok: false,
            reason: '仕切り線の位置がエリアの内側にありません',
            failedAreaId: currentId,
          };
        }
      }

      const bands = splitRect(rect, partition.axis, partition.at);
      for (let i = 0; i < partition.children.length; i++) {
        const childId = partition.children[i]!;
        const childPoly = rectToPolygon(bands[i]!);

        // 6. できた領域の面積が正であること
        if (polygonArea(childPoly) <= 0) {
          return { ok: false, reason: '分割後のエリアの面積が正ではありません', failedAreaId: childId };
        }
        regions.set(childId, childPoly);
      }
    }

    // 次の階層のエリアをキューに入れる
    for (const childId of partition.children) {
      if (visited.has(childId)) {
        return { ok: false, reason: 'エリアの階層構造に循環または重複があります', failedAreaId: childId };
      }
      visited.add(childId);
      queue.push(childId);
    }
  }

  // 構造にないエリアを指す仕切り、分割されていないエリアを指す仕切りの検査
  for (const p of partitions) {
    if (!usedPartitions.has(p.area)) {
      if (!visited.has(p.area)) {
        return { ok: false, reason: '仕切りの対象となるエリアが存在しません', failedAreaId: p.area };
      }
      return { ok: false, reason: '分割されていないエリアに仕切りがあります', failedAreaId: p.area };
    }
  }

  return { ok: true, regions };
}

export function leafAt(
  regions: Map<Id, Polygon>,
  tree: AreaTree,
  p: Point,
): Id | null {
  const rootPoly = regions.get(tree.root);
  if (!rootPoly) {
    return null;
  }

  // 根の領域の内部になければ null
  if (locatePoint(rootPoly, p) !== 'inside') {
    return null;
  }

  let currentId: Id = tree.root;
  while (true) {
    const children = tree.children.get(currentId) ?? [];
    if (children.length === 0) {
      return currentId;
    }

    let foundChild: Id | null = null;
    for (const childId of children) {
      const childPoly = regions.get(childId);
      if (childPoly && locatePoint(childPoly, p) === 'inside') {
        foundChild = childId;
        break;
      }
    }

    // どの子にも 'inside' で含まれなければ仕切りの線の上
    if (foundChild === null) {
      return null;
    }

    currentId = foundChild;
  }
}
