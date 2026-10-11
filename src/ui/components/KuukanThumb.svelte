<script lang="ts">
  import type { ArekokoDocument, Id } from '../../core/types';
  import { NIL_ID } from '../../core/constants';
  import { buildAreaTree } from '../../core/indexes';
  import { computeRegions } from '../../geometry/regions';
  import { lineSegments } from '../../editor/view';

  interface Props {
    doc: ArekokoDocument | null;
    kuukanId: Id;
    isStorage?: boolean;
    size?: number;
  }

  let { doc, kuukanId, isStorage = false, size = 48 }: Props = $props();

  interface ThumbLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  interface ThumbMarker {
    type: 'rect' | 'poly' | 'point';
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    cx?: number;
    cy?: number;
    rot?: number;
    points?: string;
    r?: number;
  }

  interface ThumbData {
    viewBox: string;
    outlinePoints: string;
    lines: ThumbLine[];
    markers: ThumbMarker[];
  }

  const thumbData = $derived.by<ThumbData | null>(() => {
    if (!doc) return null;
    const kd = doc.drawing.kuukans.find((k) => k.kuukan === kuukanId);
    if (!kd || !kd.outline || kd.outline.length < 3) return null;

    const aspect = kd.aspect > 0 ? kd.aspect : 1;
    const outlinePoints = kd.outline.map((p) => `${p[0] * aspect},${p[1]}`).join(' ');

    const tree = buildAreaTree(doc, kuukanId);
    const nodeIds = new Set([kuukanId, ...[...tree.children.values()].flat()]);
    const partitions = doc.drawing.partitions.filter((p) => nodeIds.has(p.area));
    const regionsRes = computeRegions(kd.outline, tree, partitions);

    const lines: ThumbLine[] = [];
    if (regionsRes.ok) {
      const segs = lineSegments(regionsRes.regions, partitions);
      for (const seg of segs) {
        lines.push({
          x1: seg.from[0] * aspect,
          y1: seg.from[1],
          x2: seg.to[0] * aspect,
          y2: seg.to[1],
        });
      }
    }

    const markers: ThumbMarker[] = [];
    const docMarkers = doc.drawing.markers.filter((m) => m.kuukan === kuukanId);
    for (const m of docMarkers) {
      if (m.shape.type === 'rect') {
        const { x, y, w, h } = m.shape;
        const cx = (x + w / 2) * aspect;
        const cy = y + h / 2;
        const rot = (m.rotation || 0) * 45;
        markers.push({
          type: 'rect',
          x: x * aspect,
          y,
          w: w * aspect,
          h,
          cx,
          cy,
          rot,
        });
      } else if (m.shape.type === 'poly') {
        const rot = (m.rotation || 0) * 45;
        const pts = m.shape.points.map((p) => `${p[0] * aspect},${p[1]}`).join(' ');
        const xs = m.shape.points.map((p) => p[0]);
        const ys = m.shape.points.map((p) => p[1]);
        const minX = (xs.length > 0 ? Math.min(...xs) : 0) * aspect;
        const maxX = (xs.length > 0 ? Math.max(...xs) : 0) * aspect;
        const minY = ys.length > 0 ? Math.min(...ys) : 0;
        const maxY = ys.length > 0 ? Math.max(...ys) : 0;
        markers.push({
          type: 'poly',
          points: pts,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          rot,
        });
      } else if (m.shape.type === 'point') {
        markers.push({
          type: 'point',
          cx: m.shape.at[0] * aspect,
          cy: m.shape.at[1],
          r: 300,
        });
      }
    }

    const xs = kd.outline.map((p) => p[0] * aspect);
    const ys = kd.outline.map((p) => p[1]);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 10000;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxY = ys.length > 0 ? Math.max(...ys) : 10000;

    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const pad = Math.max(w, h) * 0.08;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = w + pad * 2;
    const vbH = h + pad * 2;

    return {
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      outlinePoints,
      lines,
      markers,
    };
  });

  const fallbackIcon = $derived.by(() => {
    if (kuukanId === NIL_ID) return '📥';
    if (isStorage) return '🗄️';
    return '🏠';
  });
</script>

<div
  class="kuukan-thumb"
  class:has-drawing={Boolean(thumbData)}
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
>
  {#if thumbData}
    <svg
      viewBox={thumbData.viewBox}
      preserveAspectRatio="xMidYMid meet"
      class="thumb-svg"
    >
      <polygon
        points={thumbData.outlinePoints}
        class="thumb-outline"
        vector-effect="non-scaling-stroke"
      />
      {#each thumbData.lines as line}
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          class="thumb-line"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      {#each thumbData.markers as marker}
        {#if marker.type === 'rect' && marker.x !== undefined && marker.y !== undefined && marker.w !== undefined && marker.h !== undefined}
          <g transform={marker.rot ? `rotate(${marker.rot}, ${marker.cx}, ${marker.cy})` : undefined}>
            <rect
              x={marker.x}
              y={marker.y}
              width={marker.w}
              height={marker.h}
              class="thumb-marker"
              vector-effect="non-scaling-stroke"
            />
          </g>
        {:else if marker.type === 'poly' && marker.points}
          <g transform={marker.rot ? `rotate(${marker.rot}, ${marker.cx}, ${marker.cy})` : undefined}>
            <polygon
              points={marker.points}
              class="thumb-marker"
              vector-effect="non-scaling-stroke"
            />
          </g>
        {:else if marker.type === 'point' && marker.cx !== undefined && marker.cy !== undefined}
          <circle
            cx={marker.cx}
            cy={marker.cy}
            r={marker.r ?? 300}
            class="thumb-marker-point"
            vector-effect="non-scaling-stroke"
          />
        {/if}
      {/each}
    </svg>
  {:else}
    <span class="fallback-icon">{fallbackIcon}</span>
  {/if}
</div>

<style>
  .kuukan-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    flex-shrink: 0;
    padding: 3px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .thumb-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .thumb-outline {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 1.5px;
  }

  .thumb-line {
    stroke: var(--text);
    stroke-width: 1.5px;
  }

  .thumb-marker {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1px;
  }

  .thumb-marker-point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 1px;
  }

  .fallback-icon {
    font-size: 20px;
    line-height: 1;
    user-select: none;
  }
</style>
