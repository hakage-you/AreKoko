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

export function computeRegions(
  outline: Point[],
  tree: AreaTree,
  partitions: Partition[],
): { ok: true; regions: Map<Id, Polygon> } | { ok: false; reason: string } {
  // 1. 外形の検査
  const outlineRes = validateOutline(outline);
  if (!outlineRes.ok) {
    return { ok: false, reason: `外形が正しくありません: ${outlineRes.reason}` };
  }

  // 重複する仕切りがないか確認
  const partitionMap = new Map<Id, Partition>();
  for (const p of partitions) {
    if (partitionMap.has(p.area)) {
      return { ok: false, reason: `節「${p.area}」に複数の仕切りがあります` };
    }
    partitionMap.set(p.area, p);
  }

  const regions = new Map<Id, Polygon>();
  regions.set(tree.root, outlineRes.polygon);

  if (polygonArea(outlineRes.polygon) <= 0) {
    return { ok: false, reason: `外形の面積が正ではありません` };
  }

  const visited = new Set<Id>();
  visited.add(tree.root);
  const queue: Id[] = [tree.root];
  const usedPartitions = new Set<Id>();

  // 幅優先で木を降り、各節の仕切りで子の領域を作る
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const treeChildren = tree.children.get(currentId) ?? [];

    if (treeChildren.length === 0) {
      continue;
    }

    // 2. 子を持つ節ごとに仕切りがちょうど1つあること
    const partition = partitionMap.get(currentId);
    if (!partition) {
      return { ok: false, reason: `子を持つ節「${currentId}」に仕切りがありません` };
    }
    usedPartitions.add(currentId);

    // children に重複がないこと
    const partChildrenSet = new Set(partition.children);
    if (partChildrenSet.size !== partition.children.length) {
      return { ok: false, reason: `節「${currentId}」の仕切りの children に重複があります` };
    }

    // 木の子の集合と仕切りの children が集合として等しいこと
    const treeChildrenSet = new Set(treeChildren);
    if (
      treeChildrenSet.size !== treeChildren.length ||
      partChildrenSet.size !== treeChildrenSet.size
    ) {
      return { ok: false, reason: `節「${currentId}」の仕切りの children と木の子が一致しません` };
    }
    for (const childId of partition.children) {
      if (!treeChildrenSet.has(childId)) {
        return { ok: false, reason: `節「${currentId}」の仕切りの children と木の子が一致しません` };
      }
    }

    // 3. children.length === at.length + 1、at は狭義の昇順の整数
    if (partition.children.length !== partition.at.length + 1) {
      return {
        ok: false,
        reason: `節「${currentId}」の仕切りの children の数（${partition.children.length}）と at の数（${partition.at.length}）が合いません`,
      };
    }

    if (partition.at.length === 0) {
      return { ok: false, reason: `節「${currentId}」の仕切りの at が空です` };
    }

    for (let i = 0; i < partition.at.length; i++) {
      const val = partition.at[i]!;
      if (!Number.isInteger(val)) {
        return { ok: false, reason: `節「${currentId}」の仕切りの at[${i}]（${val}）が整数ではありません` };
      }
      if (i > 0 && partition.at[i - 1]! >= val) {
        return { ok: false, reason: `節「${currentId}」の仕切りの at が昇順ではありません` };
      }
    }

    const parentPoly = regions.get(currentId)!;

    if (partition.at.length === 1) {
      // 4. 境界で止める仕切り
      if (!partition.seed) {
        return { ok: false, reason: `節「${currentId}」の仕切りに seed がありません` };
      }

      if (!Number.isInteger(partition.seed[0]) || !Number.isInteger(partition.seed[1])) {
        return { ok: false, reason: `節「${currentId}」の仕切りの seed の座標が整数ではありません` };
      }

      const seedCoord = partition.axis === 'x' ? partition.seed[0] : partition.seed[1];
      if (seedCoord !== partition.at[0]) {
        return {
          ok: false,
          reason: `節「${currentId}」の仕切りの seed の${partition.axis}座標（${seedCoord}）が at[0]（${partition.at[0]}）と一致しません`,
        };
      }

      const loc = locatePoint(parentPoly, partition.seed);
      if (loc === 'boundary') {
        return { ok: false, reason: `節「${currentId}」の仕切りの seed が領域の境界上にあります` };
      }
      if (loc !== 'inside') {
        return { ok: false, reason: `節「${currentId}」の仕切りの seed が親の領域の内部にありません` };
      }

      const segment = boundedSegment(parentPoly, partition.axis, partition.seed);
      if (!segment) {
        return { ok: false, reason: `節「${currentId}」の仕切りの線分を計算できませんでした` };
      }

      const [poly0, poly1] = splitPolygon(parentPoly, partition.axis, segment);

      // 6. できた領域の面積が正であること
      if (polygonArea(poly0) <= 0 || polygonArea(poly1) <= 0) {
        return { ok: false, reason: `節「${currentId}」を分割した子の領域の面積が正ではありません` };
      }

      regions.set(partition.children[0]!, poly0);
      regions.set(partition.children[1]!, poly1);
    } else {
      // 5. N等分（at.length >= 2）
      if (partition.seed !== undefined) {
        return { ok: false, reason: `節「${currentId}」のN等分の仕切りに seed が指定されています` };
      }

      if (!isRectangle(parentPoly)) {
        return { ok: false, reason: `節「${currentId}」の領域が長方形ではないためN等分できません` };
      }

      const rect = boundingRect(parentPoly);
      const minCoord = partition.axis === 'x' ? rect.x0 : rect.y0;
      const maxCoord = partition.axis === 'x' ? rect.x1 : rect.y1;

      for (const atVal of partition.at) {
        if (atVal <= minCoord || atVal >= maxCoord) {
          return {
            ok: false,
            reason: `節「${currentId}」の仕切りの at（${atVal}）が領域の内側（${minCoord}〜${maxCoord}）にありません`,
          };
        }
      }

      const bands = splitRect(rect, partition.axis, partition.at);
      for (let i = 0; i < partition.children.length; i++) {
        const childId = partition.children[i]!;
        const childPoly = rectToPolygon(bands[i]!);

        // 6. できた領域の面積が正であること
        if (polygonArea(childPoly) <= 0) {
          return { ok: false, reason: `節「${childId}」の領域の面積が正ではありません` };
        }
        regions.set(childId, childPoly);
      }
    }

    // 次の階層の節をキューに入れる
    for (const childId of partition.children) {
      if (visited.has(childId)) {
        return { ok: false, reason: `木の構造に循環または合流があります（節「${childId}」）` };
      }
      visited.add(childId);
      queue.push(childId);
    }
  }

  // 木にない節を指す仕切り、子を持たない節を指す仕切りの検査
  for (const p of partitions) {
    if (!usedPartitions.has(p.area)) {
      if (!visited.has(p.area)) {
        return { ok: false, reason: `節「${p.area}」は木に存在しません` };
      }
      return { ok: false, reason: `子を持たない節「${p.area}」に仕切りがあります` };
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
