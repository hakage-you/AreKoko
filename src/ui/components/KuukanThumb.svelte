<script lang="ts">
  import type { ArekokoDocument, Id, KuukanIcon } from '../../core/types';
  import { NIL_ID, NAMELESS_NAME } from '../../core/constants';
  import { buildAreaTree } from '../../core/indexes';
  import { computeRegions } from '../../geometry/regions';
  import { lineSegments } from '../../editor/view';
  import { getKuukanInitial, getKuukanIconStyle } from '../color';
  import { getBuiltinIcon } from '../icons';

  interface Props {
    doc: ArekokoDocument | null;
    kuukanId: Id;
    isStorage?: boolean;
    size?: number;
    customIcon?: KuukanIcon;
    customName?: string;
    forceCharIcon?: boolean;
  }

  let {
    doc,
    kuukanId,
    isStorage = false,
    size = 48,
    customIcon,
    customName,
    forceCharIcon = false,
  }: Props = $props();

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

  const targetKuukan = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return doc.membership.kuukans.find((k) => k.id === kuukanId) ?? null;
  });

  const effectiveIcon = $derived.by(() => {
    return customIcon ?? targetKuukan?.icon ?? null;
  });

  const kuukanName = $derived.by(() => {
    if (customName !== undefined) return customName;
    if (kuukanId === NIL_ID) return '未設定';
    if (!doc) return '';
    if (isStorage) {
      if (targetKuukan?.owner) {
        const item = doc.membership.items.find((i) => i.id === targetKuukan.owner);
        return item?.name ?? targetKuukan.name ?? NAMELESS_NAME;
      }
    }
    return targetKuukan?.name ?? NAMELESS_NAME;
  });

  const builtinIcon = $derived.by(() => {
    return getBuiltinIcon(effectiveIcon?.svg);
  });

  const displayChar = $derived.by(() => {
    if (effectiveIcon?.char) return effectiveIcon.char;
    return getKuukanInitial(kuukanName);
  });

  const iconStyle = $derived.by(() => {
    return getKuukanIconStyle(effectiveIcon);
  });

  const showDrawing = $derived(Boolean(thumbData && !effectiveIcon && !forceCharIcon));
</script>

<div
  class="kuukan-thumb"
  class:has-drawing={showDrawing}
  class:is-unset={kuukanId === NIL_ID}
  class:is-char={!showDrawing && kuukanId !== NIL_ID}
  style:width="{size}px"
  style:height="{size}px"
  style="{!showDrawing && kuukanId !== NIL_ID ? iconStyle : ''}"
  aria-hidden="true"
>
  {#if showDrawing && thumbData}
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
  {:else if kuukanId === NIL_ID}
    <svg
      viewBox="0 0 24 24"
      class="unset-tray-svg"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    </svg>
  {:else if builtinIcon}
    <svg
      viewBox="0 0 24 24"
      class="builtin-svg-icon"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style:width="{Math.round(size * 0.58)}px"
      style:height="{Math.round(size * 0.58)}px"
    >
      <path d={builtinIcon.path} />
    </svg>
  {:else}
    <span class="char-icon" style:font-size="{Math.round(size * 0.46)}px">
      {displayChar}
    </span>
  {/if}
</div>

<style>
  .kuukan-thumb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    flex-shrink: 0;
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
    line-height: 1;
  }

  .kuukan-thumb.has-drawing {
    padding: 3px;
  }

  .unset-tray-svg {
    width: 60%;
    height: 60%;
    color: var(--text-muted);
  }

  .kuukan-thumb.is-char {
    font-weight: 600;
    color: var(--text);
    transition: background-color var(--duration-fast), color var(--duration-fast);
  }

  .char-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    text-transform: uppercase;
  }

  .builtin-svg-icon {
    display: block;
    color: inherit;
    flex-shrink: 0;
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
</style>
