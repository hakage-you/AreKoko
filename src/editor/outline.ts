import type { Point } from '../core/types';
import { COORD_MAX } from '../core/constants';
import {
  boundingRect,
  normalizePolygon,
  validateRectilinearPolygon,
} from '../geometry/polygon';
import type { Draft } from './draft';


/** 靴ひも公式の符号付き面積の2倍。 */
function signedArea2(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

/**
 * 編集した直後の（正規化する前の）形を確かめる。正規化は、長さ0の辺や折り返し（とげ）を
 * 黙って消してしまい、別の正しい形に見せてしまうので、その前に弾く。
 * また、辺を反対側まで動かすと形が裏返ったまま正しく見えるので、向きが変わったものも弾く。
 */
function checkEdited(original: Point[], raw: Point[]): Point[] | null {
  const n = raw.length;
  for (let i = 0; i < n; i++) {
    const a = raw[(i - 1 + n) % n]!;
    const b = raw[i]!;
    const c = raw[(i + 1) % n]!;
    if (b[0] === c[0] && b[1] === c[1]) return null; // 長さ0の辺
    const d1: Point = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
    const d2: Point = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
    if (d1[0] === -d2[0] && d1[1] === -d2[1]) return null; // 折り返し
  }
  if (Math.sign(signedArea2(raw)) !== Math.sign(signedArea2(original))) return null; // 裏返り
  const res = validateRectilinearPolygon(raw);
  return res.ok ? res.polygon : null;
}

/**
 * 辺を平行移動する。横の辺は y、縦の辺は x を delta だけ動かす。
 * 結果が正しい直角多角形でなければ null。
 */
export function moveEdge(points: Point[], edgeIndex: number, delta: number): Point[] | null {
  const n = points.length;
  if (n < 4 || edgeIndex < 0 || edgeIndex >= n) {
    return null;
  }

  const p1 = points[edgeIndex]!;
  const p2 = points[(edgeIndex + 1) % n]!;

  const isHoriz = p1[1] === p2[1];
  const isVert = p1[0] === p2[0];
  if (!isHoriz && !isVert) {
    return null;
  }

  const nextPoints: Point[] = points.map((p, idx) => {
    if (idx === edgeIndex || idx === (edgeIndex + 1) % n) {
      if (isHoriz) {
        return [p[0], p[1] + delta];
      } else {
        return [p[0] + delta, p[1]];
      }
    }
    return [p[0], p[1]];
  });

  return checkEdited(points, nextPoints);
}

/**
 * 辺の上に段差を足す。
 * 辺上の座標 at で辺を分け、side 側を辺に垂直に depth だけ動かす。
 * 分ける位置が端点である場合や、結果が不正な多角形になる場合は null。
 */
export function addStep(
  points: Point[],
  edgeIndex: number,
  at: number,
  depth: number,
  side: 'start' | 'end',
): Point[] | null {
  const n = points.length;
  if (n < 4 || edgeIndex < 0 || edgeIndex >= n || depth === 0) {
    return null;
  }

  const p1 = points[edgeIndex]!;
  const p2 = points[(edgeIndex + 1) % n]!;

  const isHoriz = p1[1] === p2[1];
  const isVert = p1[0] === p2[0];
  if (!isHoriz && !isVert) {
    return null;
  }

  if (isHoriz) {
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    if (at <= minX || at >= maxX) {
      return null;
    }
  } else {
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);
    if (at <= minY || at >= maxY) {
      return null;
    }
  }

  const pts = points.map(p => [p[0], p[1]] as Point);

  if (side === 'start') {
    if (isHoriz) {
      const newP1: Point = [p1[0], p1[1] + depth];
      const step1: Point = [at, p1[1] + depth];
      const step2: Point = [at, p1[1]];
      pts.splice(edgeIndex, 1, newP1, step1, step2);
    } else {
      const newP1: Point = [p1[0] + depth, p1[1]];
      const step1: Point = [p1[0] + depth, at];
      const step2: Point = [p1[0], at];
      pts.splice(edgeIndex, 1, newP1, step1, step2);
    }
  } else {
    const targetIdx = (edgeIndex + 1) % n;
    if (isHoriz) {
      pts[targetIdx] = [p2[0], p2[1] + depth];
      const step1: Point = [at, p1[1]];
      const step2: Point = [at, p1[1] + depth];
      pts.splice(edgeIndex + 1, 0, step1, step2);
    } else {
      pts[targetIdx] = [p2[0] + depth, p2[1]];
      const step1: Point = [p1[0], at];
      const step2: Point = [p1[0] + depth, at];
      pts.splice(edgeIndex + 1, 0, step1, step2);
    }
  }

  return checkEdited(points, pts);
}

/**
 * 点 p に最も近い辺の番号を返す。tolerance を超える距離なら null。
 */
export function edgeAt(points: Point[], p: Point, tolerance: number): number | null {
  const n = points.length;
  if (n < 2) {
    return null;
  }

  let minDistance = Infinity;
  let bestEdge: number | null = null;

  for (let i = 0; i < n; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;

    let dist: number;
    if (p1[1] === p2[1]) {
      const y = p1[1];
      const minX = Math.min(p1[0], p2[0]);
      const maxX = Math.max(p1[0], p2[0]);
      if (p[0] >= minX && p[0] <= maxX) {
        dist = Math.abs(p[1] - y);
      } else {
        const d1 = Math.hypot(p[0] - p1[0], p[1] - p1[1]);
        const d2 = Math.hypot(p[0] - p2[0], p[1] - p2[1]);
        dist = Math.min(d1, d2);
      }
    } else if (p1[0] === p2[0]) {
      const x = p1[0];
      const minY = Math.min(p1[1], p2[1]);
      const maxY = Math.max(p1[1], p2[1]);
      if (p[1] >= minY && p[1] <= maxY) {
        dist = Math.abs(p[0] - x);
      } else {
        const d1 = Math.hypot(p[0] - p1[0], p[1] - p1[1]);
        const d2 = Math.hypot(p[0] - p2[0], p[1] - p2[1]);
        dist = Math.min(d1, d2);
      }
    } else {
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) {
        dist = Math.hypot(p[0] - p1[0], p[1] - p1[1]);
      } else {
        const t = Math.max(0, Math.min(1, ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / lenSq));
        const projX = p1[0] + t * dx;
        const projY = p1[1] + t * dy;
        dist = Math.hypot(p[0] - projX, p[1] - projY);
      }
    }

    if (dist < minDistance) {
      minDistance = dist;
      bestEdge = i;
    }
  }

  if (minDistance <= tolerance && bestEdge !== null) {
    return bestEdge;
  }
  return null;
}

/**
 * 外接長方形の付け直し。
 * 新しい外形の外接長方形が 0〜10000 になるよう、下書きの全座標・aspect・realSize を写す。
 * 外形そのものが正しくない場合は error。
 */
export function reframeDraft(draft: Draft, newOutline: Point[]): Draft | { error: string } {
  const polyRes = validateRectilinearPolygon(newOutline);
  if (!polyRes.ok) {
    return { error: `外形が不正です: ${polyRes.reason}` };
  }

  const b = boundingRect(polyRes.polygon);
  const spanX = b.x1 - b.x0;
  const spanY = b.y1 - b.y0;
  if (spanX <= 0 || spanY <= 0) {
    return { error: '外形の幅または高さが0です' };
  }

  const transformX = (x: number): number => {
    return Math.round(((x - b.x0) * COORD_MAX) / spanX);
  };
  const transformY = (y: number): number => {
    return Math.round(((y - b.y0) * COORD_MAX) / spanY);
  };

  const reframedOutlineRaw: Point[] = polyRes.polygon.map(p => [transformX(p[0]), transformY(p[1])]);
  const normalizedOutline = normalizePolygon(reframedOutlineRaw);
  if (!normalizedOutline) {
    return { error: '外形の正規化に失敗しました' };
  }

  const targetKd = draft.doc.drawing.kuukans.find(k => k.kuukan === draft.kuukan);
  let updatedKuukanDrawings = draft.doc.drawing.kuukans;

  if (targetKd) {
    const newAspect = targetKd.aspect * (spanX / spanY);
    let newRealSize: { w?: number; d?: number } | undefined;
    if (targetKd.realSize) {
      newRealSize = {};
      if (targetKd.realSize.w !== undefined) {
        newRealSize.w = Math.round(((targetKd.realSize.w * spanX) / COORD_MAX) * 10) / 10;
      }
      if (targetKd.realSize.d !== undefined) {
        newRealSize.d = Math.round(((targetKd.realSize.d * spanY) / COORD_MAX) * 10) / 10;
      }
    }

    const updatedKd = {
      ...targetKd,
      outline: normalizedOutline,
      aspect: newAspect,
      ...(newRealSize !== undefined ? { realSize: newRealSize } : {}),
    };
    if (newRealSize === undefined) {
      delete (updatedKd as { realSize?: { w?: number; d?: number } }).realSize;
    }

    updatedKuukanDrawings = draft.doc.drawing.kuukans.map(k =>
      k.kuukan === draft.kuukan ? updatedKd : k,
    );
  }

  const updatedPartitions = draft.doc.drawing.partitions.map(p => {
    const newAt = p.axis === 'x'
      ? p.at.map(x => transformX(x))
      : p.at.map(y => transformY(y));
    const newSeed: Point | undefined = p.seed
      ? [transformX(p.seed[0]), transformY(p.seed[1])]
      : undefined;

    const res = {
      ...p,
      at: newAt,
      ...(newSeed ? { seed: newSeed } : {}),
    };
    if (!newSeed) {
      delete (res as { seed?: Point }).seed;
    }
    return res;
  });

  const updatedMarkers = draft.doc.drawing.markers.map(m => {
    if (m.kuukan !== draft.kuukan) {
      return m;
    }
    if (m.shape.type === 'point') {
      return {
        ...m,
        shape: {
          type: 'point' as const,
          at: [transformX(m.shape.at[0]), transformY(m.shape.at[1])] as Point,
        },
      };
    }
    if (m.shape.type === 'rect') {
      const x0 = transformX(m.shape.x);
      const y0 = transformY(m.shape.y);
      const x1 = transformX(m.shape.x + m.shape.w);
      const y1 = transformY(m.shape.y + m.shape.h);
      const minX = Math.min(x0, x1);
      const minY = Math.min(y0, y1);
      const w = Math.max(1, Math.abs(x1 - x0));
      const h = Math.max(1, Math.abs(y1 - y0));
      return {
        ...m,
        shape: {
          type: 'rect' as const,
          x: minX,
          y: minY,
          w,
          h,
        },
      };
    }
    if (m.shape.type === 'poly') {
      return {
        ...m,
        shape: {
          type: 'poly' as const,
          points: m.shape.points.map(p => [transformX(p[0]), transformY(p[1])] as Point),
        },
      };
    }
    return m;
  });

  return {
    ...draft,
    doc: {
      ...draft.doc,
      drawing: {
        ...draft.doc.drawing,
        kuukans: updatedKuukanDrawings,
        partitions: updatedPartitions,
        markers: updatedMarkers,
      },
    },
  };
}
