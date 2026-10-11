import type { Id, Marker, Partition, Point } from '../core/types';
import { COORD_MAX, NAMELESS_NAME } from '../core/constants';
import type { Polygon } from '../geometry/types';
import type { AreaTree } from '../geometry/regions';
import { boundedSegment } from '../geometry/partition';
import { boundingRect } from '../geometry/polygon';

/**
 * 比率の座標を表示の座標に変換する。
 * x_表示 = x × aspect, y_表示 = y
 */
export function toDisplay(p: Point, aspect: number): [number, number] {
  return [p[0] * aspect, p[1]];
}

/**
 * 表示の座標を比率の座標に変換する（丸めない）。
 */
export function fromDisplay(d: [number, number], aspect: number): Point {
  const x = aspect !== 0 ? d[0] / aspect : d[0];
  return [x, d[1]];
}

/**
 * 表示の中心と拡大率、画面の幅・高さから SVG の viewBox を計算する。
 */
export function viewBoxOf(
  view: { cx: number; cy: number; scale: number },
  aspect: number,
  widthPx: number,
  heightPx: number,
): { x: number; y: number; w: number; h: number } {
  const scale = view.scale > 0 ? view.scale : 1;
  const safeAspect = aspect > 0 ? aspect : 1;
  const w = widthPx / scale;
  const h = heightPx / scale;
  const x = view.cx * safeAspect - w / 2;
  const y = view.cy - h / 2;
  return { x, y, w, h };
}

/**
 * クウカン全体（比率 0〜10000）が画面に収まる表示中心と拡大率を計算する。
 */
export function fitView(
  aspect: number,
  widthPx: number,
  heightPx: number,
  marginPx: number,
): { cx: number; cy: number; scale: number } {
  const safeAspect = aspect > 0 ? aspect : 1;
  const availW = Math.max(1, widthPx - 2 * marginPx);
  const availH = Math.max(1, heightPx - 2 * marginPx);

  const scaleX = availW / (COORD_MAX * safeAspect);
  const scaleY = availH / COORD_MAX;
  const scale = Math.min(scaleX, scaleY);

  return {
    cx: COORD_MAX / 2,
    cy: COORD_MAX / 2,
    scale: Math.max(1e-6, scale),
  };
}

/**
 * 仕切りの線分の一覧を計算する。
 * 境界で止める仕切りは boundedSegment、N等分は節の領域の外接長方形を横切る線分。
 */
export function lineSegments(
  regions: Map<Id, Polygon>,
  partitions: Partition[],
): { node: Id; lineIndex: number; from: Point; to: Point }[] {
  const segments: { node: Id; lineIndex: number; from: Point; to: Point }[] = [];

  for (const partition of partitions) {
    const poly = regions.get(partition.area);
    if (!poly) continue;

    if (partition.at.length === 1 && partition.seed) {
      const seg = boundedSegment(poly, partition.axis, partition.seed);
      if (seg) {
        segments.push({
          node: partition.area,
          lineIndex: 0,
          from: seg.from,
          to: seg.to,
        });
        continue;
      }
    }

    // N等分（または boundedSegment が取れなかった場合のフォールバック）
    const rect = boundingRect(poly);
    for (let i = 0; i < partition.at.length; i++) {
      const val = partition.at[i];
      if (val === undefined) continue;

      if (partition.axis === 'x') {
        const midY = Math.floor((rect.y0 + rect.y1) / 2);
        const seg = boundedSegment(poly, 'x', [val, midY]);
        if (seg) {
          segments.push({
            node: partition.area,
            lineIndex: i,
            from: seg.from,
            to: seg.to,
          });
        } else {
          segments.push({
            node: partition.area,
            lineIndex: i,
            from: [val, rect.y0],
            to: [val, rect.y1],
          });
        }
      } else {
        const midX = Math.floor((rect.x0 + rect.x1) / 2);
        const seg = boundedSegment(poly, 'y', [midX, val]);
        if (seg) {
          segments.push({
            node: partition.area,
            lineIndex: i,
            from: seg.from,
            to: seg.to,
          });
        } else {
          segments.push({
            node: partition.area,
            lineIndex: i,
            from: [rect.x0, val],
            to: [rect.x1, val],
          });
        }
      }
    }
  }

  return segments;
}

/** 点と軸平行線分の最短距離を計算する。 */
function distToSegment(p: Point, seg: { from: Point; to: Point }): number {
  const [px, py] = p;
  const [x1, y1] = seg.from;
  const [x2, y2] = seg.to;

  if (y1 === y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    if (px >= minX && px <= maxX) {
      return Math.abs(py - y1);
    }
    if (px < minX) {
      return Math.hypot(px - minX, py - y1);
    }
    return Math.hypot(px - maxX, py - y1);
  } else if (x1 === x2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (py >= minY && py <= maxY) {
      return Math.abs(px - x1);
    }
    if (py < minY) {
      return Math.hypot(px - x1, py - minY);
    }
    return Math.hypot(px - x1, py - maxY);
  }

  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY);
}

/** 木構造におけるノードの深さ（root は 0、子は 1、孫は 2 ...）を計算する。 */
function getNodeDepth(tree: AreaTree, target: Id): number {
  if (tree.root === target) return 0;
  const queue: [Id, number][] = [[tree.root, 0]];
  const visited = new Set<Id>([tree.root]);
  while (queue.length > 0) {
    const [curr, d] = queue.shift()!;
    const kids = tree.children.get(curr) ?? [];
    for (const kid of kids) {
      if (kid === target) return d + 1;
      if (!visited.has(kid)) {
        visited.add(kid);
        queue.push([kid, d + 1]);
      }
    }
  }
  return 0;
}

/** 線分の長さを計算する。 */
function segmentLength(seg: { from: Point; to: Point }): number {
  return Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
}

/**
 * 指定した点 p に tolerance 以内で最も近い仕切りの線分を判定する。
 * 許容誤差の範囲内において、より深い階層（子の線）および局所的な線分（短い線）を優先してスコアリングする。
 */
export function hitLine(
  regions: Map<Id, Polygon>,
  partitions: Partition[],
  p: Point,
  tolerance: number,
  tree?: AreaTree,
): { node: Id; lineIndex: number } | null {
  const segments = lineSegments(regions, partitions);
  let bestResult: {
    node: Id;
    lineIndex: number;
    score: number;
    dist: number;
  } | null = null;

  for (const seg of segments) {
    const dist = distToSegment(p, seg);
    if (dist > tolerance) continue;

    const depth = tree ? getNodeDepth(tree, seg.node) : 0;
    const length = segmentLength(seg);

    // 許容誤差範囲内において、より深い階層（子の線）と短い線分を優先するスコアリング
    // 深さ1あたり tolerance の 25% の距離アドバンテージを付与
    const lengthPenalty = (length / 10000) * (tolerance * 0.05);
    const depthAdvantage = depth * (tolerance * 0.25);
    const score = dist - depthAdvantage + lengthPenalty;

    if (!bestResult || score < bestResult.score) {
      bestResult = { node: seg.node, lineIndex: seg.lineIndex, score, dist };
    }
  }

  return bestResult ? { node: bestResult.node, lineIndex: bestResult.lineIndex } : null;
}

export interface PartitionLineInfo {
  childAreas: [Id, Id];
  childNames: [string, string];
  parentArea: Id;
  parentName: string;
  summary: string;
  /**
   * 消した後に何になるか（設計 7.2）。
   * false：線が1本だけで、両側が合わさって親のエリア（parentName）に戻る。
   * true：等分した兄弟の間の線で、両側はなくなり、合わさった範囲は中身のない新しいエリアになる。
   */
  newEmptyArea: boolean;
  /** なくなるエリア（両側と、その中のエリア）。 */
  allRemovedAreas: Id[];
  allRemovedAreaNames: string[];
  /** 両側の中にあって、一緒になくなるエリアの名前。 */
  innerAreaNames: string[];
}

/**
 * 選択された仕切り線について、両隣のエリア名、親の名前、消した後に何になるかを算出する。
 * rootName：親がクウカンそのもののときの名前（収納なら持ち主のモノの名前。画面が決めて渡す。詳細 D3）。
 */
export function describePartitionLine(
  doc: { membership: { kuukans: any[]; areas: any[]; items: any[] }; drawing: { partitions: Partition[] } },
  node: Id,
  lineIndex: number,
  rootName?: string,
): PartitionLineInfo | null {
  const partition = doc.drawing.partitions.find((p) => p.area === node);
  if (!partition || lineIndex < 0 || lineIndex >= partition.at.length) {
    return null;
  }

  const childA = partition.children[lineIndex];
  const childB = partition.children[lineIndex + 1];
  if (!childA || !childB) return null;

  const findAreaName = (id: Id): string => {
    const area = doc.membership.areas.find((a) => a.id === id);
    if (area) return area.name;
    const kuukan = doc.membership.kuukans.find((k) => k.id === id);
    if (kuukan) {
      if (rootName) return rootName;
      const owner = kuukan.owner ? doc.membership.items.find((i) => i.id === kuukan.owner) : undefined;
      return owner?.name || kuukan.name || NAMELESS_NAME;
    }
    return 'エリア';
  };

  const childNameA = findAreaName(childA);
  const childNameB = findAreaName(childB);
  const parentName = findAreaName(node);

  // 子の subtree 全体（影響を受けるエリア）を再帰探索
  function getSubtree(areaId: Id): Id[] {
    const res: Id[] = [areaId];
    const childPart = doc.drawing.partitions.find((p) => p.area === areaId);
    if (childPart) {
      for (const cid of childPart.children) {
        res.push(...getSubtree(cid));
      }
    }
    return res;
  }

  const allRemovedAreas = [...getSubtree(childA), ...getSubtree(childB)];
  const allRemovedAreaNames = allRemovedAreas.map(findAreaName);
  const innerAreaNames = allRemovedAreas.filter((id) => id !== childA && id !== childB).map(findAreaName);

  return {
    childAreas: [childA, childB],
    childNames: [childNameA, childNameB],
    parentArea: node,
    parentName,
    summary: `「${childNameA}」と「${childNameB}」を分ける線`,
    newEmptyArea: partition.children.length > 2,
    allRemovedAreas,
    allRemovedAreaNames,
    innerAreaNames,
  };
}

/** 線を消したら何になるかの文（横の欄と、消す前の確認で同じ文を使う。設計 7.2、TRS 付録B I-18）。 */
export function describeLineRemoval(info: PartitionLineInfo): string {
  const [a, b] = info.childNames;
  const head = info.newEmptyArea
    ? `この線を消すと、「${a}」と「${b}」はなくなり、合わさった範囲は中身のない新しいエリアになります。`
    : `この線を消すと、「${a}」と「${b}」が合わさって「${info.parentName}」に戻ります。`;
  const inner = info.innerAreaNames.length > 0
    ? `中のエリア（${info.innerAreaNames.join('、')}）もなくなります。`
    : '';
  return head + inner;
}

/** 点とマーカーの最短距離を計算する。 */
function distToMarker(m: Marker, p: Point): number {
  const [px, py] = p;
  if (m.shape.type === 'point') {
    return Math.hypot(px - m.shape.at[0], py - m.shape.at[1]);
  }

  if (m.shape.type === 'rect') {
    const { x, y, w, h } = m.shape;
    const cx = x + w / 2;
    const cy = y + h / 2;

    let testX = px;
    let testY = py;

    if (m.rotation !== 0) {
      const rad = (-m.rotation * 45 * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = px - cx;
      const dy = py - cy;
      testX = dx * cos - dy * sin + cx;
      testY = dx * sin + dy * cos + cy;
    }

    const distX = Math.max(0, x - testX, testX - (x + w));
    const distY = Math.max(0, y - testY, testY - (y + h));
    return Math.hypot(distX, distY);
  }

  if (m.shape.type === 'poly') {
    const bounds = boundingRect(m.shape.points);
    const distX = Math.max(0, bounds.x0 - px, px - bounds.x1);
    const distY = Math.max(0, bounds.y0 - py, py - bounds.y1);
    return Math.hypot(distX, distY);
  }

  return Infinity;
}

/**
 * 指定した点 p に tolerance 以内のマーカーを判定する。
 * 重なりがある場合は、後から追加されたもの（配列の後ろ）を優先する。
 */
export function hitMarker(markers: Marker[], p: Point, tolerance: number): Id | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    if (!marker) continue;
    const dist = distToMarker(marker, p);
    if (dist <= tolerance) {
      return marker.id;
    }
  }
  return null;
}
