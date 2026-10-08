// 仕切りのドラッグ範囲の計算。詳細設計 9.5、付録A.6。

import type { Id, Point, Partition } from '../core/types';
import { computeRegions } from './regions';
import type { AreaTree } from './regions';
import { boundedSegment } from './partition';

interface Signature {
  ok: boolean;
  span?: [number, number];
  subtreeVertexCounts?: number[];
}

function signaturesMatch(s1: Signature, s2: Signature): boolean {
  if (s1.ok !== s2.ok) return false;
  if (!s1.ok) return true;

  if (s1.span && s2.span) {
    if (s1.span[0] !== s2.span[0] || s1.span[1] !== s2.span[1]) {
      return false;
    }
  } else if (s1.span || s2.span) {
    return false;
  }

  if (!s1.subtreeVertexCounts || !s2.subtreeVertexCounts) {
    return s1.subtreeVertexCounts === s2.subtreeVertexCounts;
  }
  if (s1.subtreeVertexCounts.length !== s2.subtreeVertexCounts.length) {
    return false;
  }
  for (let i = 0; i < s1.subtreeVertexCounts.length; i++) {
    if (s1.subtreeVertexCounts[i]! !== s2.subtreeVertexCounts[i]!) {
      return false;
    }
  }

  return true;
}

function getSubtreeDescendants(tree: AreaTree, rootNode: Id): Id[] {
  const descendants: Id[] = [];
  const queue: Id[] = [...(tree.children.get(rootNode) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    descendants.push(id);
    const ch = tree.children.get(id);
    if (ch) {
      queue.push(...ch);
    }
  }
  return descendants;
}

export function dragRange(
  outline: Point[],
  tree: AreaTree,
  partitions: Partition[],
  node: Id,
  lineIndex: number,
): { min: number; max: number } {
  const targetPartition = partitions.find(p => p.area === node);
  if (!targetPartition || lineIndex < 0 || lineIndex >= targetPartition.at.length) {
    return { min: 0, max: 0 };
  }
  // 関数宣言は巻き上げられて絞り込みが効かないので、絞り込んだ値を定数に置く。
  const tp: Partition = targetPartition;

  const currentAt = tp.at[lineIndex]!;
  const initialRes = computeRegions(outline, tree, partitions);
  if (!initialRes.ok) {
    return { min: currentAt, max: currentAt };
  }

  const descendants = getSubtreeDescendants(tree, node);

  function getSignature(val: number): Signature {
    const modifiedPartitions: Partition[] = partitions.map(p => {
      if (p.area !== node) {
        return p;
      }
      const newAt = [...p.at];
      newAt[lineIndex] = val;
      let newSeed = p.seed;
      if (p.at.length === 1 && p.seed) {
        newSeed = p.axis === 'x' ? [val, p.seed[1]] : [p.seed[0], val];
      }
      return {
        ...p,
        at: newAt,
        seed: newSeed,
      };
    });

    const res = computeRegions(outline, tree, modifiedPartitions);
    if (!res.ok) {
      return { ok: false };
    }

    let span: [number, number] | undefined;
    if (tp.at.length === 1 && tp.seed) {
      const parentPoly = res.regions.get(node);
      if (!parentPoly) {
        return { ok: false };
      }
      const seed: Point = tp.axis === 'x'
        ? [val, tp.seed[1]]
        : [tp.seed[0], val];
      const seg = boundedSegment(parentPoly, tp.axis, seed);
      if (!seg) {
        return { ok: false };
      }
      if (tp.axis === 'x') {
        span = [Math.min(seg.from[1], seg.to[1]), Math.max(seg.from[1], seg.to[1])];
      } else {
        span = [Math.min(seg.from[0], seg.to[0]), Math.max(seg.from[0], seg.to[0])];
      }
    }

    const subtreeVertexCounts = descendants.map(d => res.regions.get(d)?.length ?? 0);

    return {
      ok: true,
      span,
      subtreeVertexCounts,
    };
  }

  const sig0 = getSignature(currentAt);
  if (!sig0.ok) {
    return { min: currentAt, max: currentAt };
  }

  // 臨界値の収集
  const criticalSet = new Set<number>();

  // 1. その節の領域の頂点の、動かす軸の座標
  const nodePoly = initialRes.regions.get(node);
  if (nodePoly) {
    for (const pt of nodePoly) {
      criticalSet.add(tp.axis === 'x' ? pt[0] : pt[1]);
    }
  }

  // 2. 同じ仕切りの隣の線（N等分のとき）
  if (tp.at.length >= 2) {
    if (lineIndex > 0) {
      criticalSet.add(tp.at[lineIndex - 1]!);
    }
    if (lineIndex < tp.at.length - 1) {
      criticalSet.add(tp.at[lineIndex + 1]!);
    }
  }

  // 3. 部分木の中の、同じ軸の仕切りの at の値と、別の軸の仕切りの seed の動かす軸の座標
  const descendantSet = new Set(descendants);
  for (const p of partitions) {
    if (descendantSet.has(p.area)) {
      if (p.axis === tp.axis) {
        for (const a of p.at) {
          criticalSet.add(a);
        }
      } else {
        if (p.seed) {
          criticalSet.add(tp.axis === 'x' ? p.seed[0] : p.seed[1]);
        }
      }
    }
  }

  const criticalValues = Array.from(criticalSet).sort((a, b) => a - b);
  if (criticalValues.length === 0) {
    return { min: currentAt, max: currentAt };
  }

  const cache = new Map<number, Signature>();
  function getCachedSignature(val: number): Signature {
    let s = cache.get(val);
    if (!s) {
      s = getSignature(val);
      cache.set(val, s);
    }
    return s;
  }

  let min = currentAt;
  let max = currentAt;

  const exactIndex = criticalValues.indexOf(currentAt);

  // ---- 左方向（減少方向）の探索 ----
  if (exactIndex !== -1) {
    let k = exactIndex;
    while (k > 0) {
      const leftCrit = criticalValues[k - 1]!;
      const rightCrit = criticalValues[k]!;
      // 臨界値の間の整数1点
      if (rightCrit - leftCrit > 1) {
        const mid = Math.floor((leftCrit + rightCrit) / 2);
        if (!signaturesMatch(sig0, getCachedSignature(mid))) {
          break;
        }
        min = leftCrit + 1;
      }
      // 臨界値そのもの
      if (!signaturesMatch(sig0, getCachedSignature(leftCrit))) {
        break;
      }
      min = leftCrit;
      k--;
    }
  } else {
    let k = -1;
    for (let i = 0; i < criticalValues.length; i++) {
      if (criticalValues[i]! < currentAt) {
        k = i;
      } else {
        break;
      }
    }
    if (k >= 0) {
      // currentAt は (criticalValues[k], criticalValues[k+1]) の間にあり、署名は一致している
      min = criticalValues[k]! + 1;
      while (k >= 0) {
        const crit = criticalValues[k]!;
        if (!signaturesMatch(sig0, getCachedSignature(crit))) {
          break;
        }
        min = crit;
        if (k > 0) {
          const prevCrit = criticalValues[k - 1]!;
          if (crit - prevCrit > 1) {
            const mid = Math.floor((prevCrit + crit) / 2);
            if (!signaturesMatch(sig0, getCachedSignature(mid))) {
              break;
            }
            min = prevCrit + 1;
          }
        }
        k--;
      }
    }
  }

  // ---- 右方向（増加方向）の探索 ----
  if (exactIndex !== -1) {
    let k = exactIndex;
    while (k < criticalValues.length - 1) {
      const leftCrit = criticalValues[k]!;
      const rightCrit = criticalValues[k + 1]!;
      // 臨界値の間の整数1点
      if (rightCrit - leftCrit > 1) {
        const mid = Math.floor((leftCrit + rightCrit) / 2);
        if (!signaturesMatch(sig0, getCachedSignature(mid))) {
          break;
        }
        max = rightCrit - 1;
      }
      // 臨界値そのもの
      if (!signaturesMatch(sig0, getCachedSignature(rightCrit))) {
        break;
      }
      max = rightCrit;
      k++;
    }
  } else {
    let k = -1;
    for (let i = 0; i < criticalValues.length; i++) {
      if (criticalValues[i]! > currentAt) {
        k = i;
        break;
      }
    }
    if (k !== -1) {
      // currentAt は (criticalValues[k-1], criticalValues[k]) の間にあり、署名は一致している
      max = criticalValues[k]! - 1;
      while (k < criticalValues.length) {
        const crit = criticalValues[k]!;
        if (!signaturesMatch(sig0, getCachedSignature(crit))) {
          break;
        }
        max = crit;
        if (k < criticalValues.length - 1) {
          const nextCrit = criticalValues[k + 1]!;
          if (nextCrit - crit > 1) {
            const mid = Math.floor((crit + nextCrit) / 2);
            if (!signaturesMatch(sig0, getCachedSignature(mid))) {
              break;
            }
            max = nextCrit - 1;
          }
        }
        k++;
      }
    }
  }

  return { min, max };
}
