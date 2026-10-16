<script lang="ts">
  import { NIL_ID } from '../../core/constants';
  import { getApp } from '../context';
  import { getEditorUi } from './editorUi.svelte';
  import { editorDoc, editorKuukan, applyToEditor } from './target';
  import type { Id, Marker, Partition, Point } from '../../core/types';
  import { COORD_MAX } from '../../core/constants';
  import type { Polygon } from '../../geometry/types';
  import { buildAreaTree } from '../../core/indexes';
  import { computeRegions, leafAt, type AreaTree } from '../../geometry/regions';
  import { decomposeToRects, boundingRect, locatePoint } from '../../geometry/polygon';
  import { shapeCenter } from '../../geometry/shape';
  import { dragRange } from '../../geometry/drag';
  import { chooseSnapStep, snap } from '../../editor/snap';
  import {
    toDisplay,
    fromDisplay,
    viewBoxOf,
    fitView,
    lineSegments,
    hitLine,
    hitMarker,
    describePartitionLine,
    describeLineRemoval,
    type PartitionLineInfo,
  } from '../../editor/view';
  import { moveLine, splitAt } from '../../core/ops/areas';
  import { addMarker, moveMarkers, updateMarker, deleteMarkers } from '../../core/ops/markers';
  import { moveEdge, addStep, edgeAt } from '../../editor/outline';

  const app = getApp();
  const ui = getEditorUi();

  let containerEl = $state<HTMLDivElement | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);

  let widthPx = $state(800);
  let heightPx = $state(600);

  const doc = $derived(editorDoc($app));
  const kuukanId = $derived(editorKuukan($app));

  const selectedLineInfo = $derived.by((): PartitionLineInfo | null => {
    if (!doc || !ui.selectedLine) return null;
    return describePartitionLine(doc, ui.selectedLine.node, ui.selectedLine.lineIndex);
  });

  const kuukanDrawing = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return doc.drawing.kuukans.find((k) => k.kuukan === kuukanId) ?? null;
  });

  const kuukanModel = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return doc.membership.kuukans.find((k) => k.id === kuukanId) ?? null;
  });

  // 幾何データ（エリア木・仕切り）
  const kuukanGeometry = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    const tree: AreaTree = buildAreaTree(doc, kuukanId);
    const nodeIds = new Set<Id>([kuukanId, ...[...tree.children.values()].flat()]);
    const partitions: Partition[] = doc.drawing.partitions.filter((p) => nodeIds.has(p.area));
    return { tree, partitions };
  });

  // 領域計算
  const regionsResult = $derived.by(() => {
    if (!kuukanDrawing || !kuukanGeometry) return null;
    return computeRegions(kuukanDrawing.outline, kuukanGeometry.tree, kuukanGeometry.partitions);
  });

  const regions = $derived.by((): Map<Id, Polygon> | null => {
    if (regionsResult && regionsResult.ok) {
      return regionsResult.regions;
    }
    if (kuukanDrawing && kuukanId) {
      return new Map<Id, Polygon>([[kuukanId, kuukanDrawing.outline]]);
    }
    return null;
  });

  // 分けていないエリア一覧
  const leafNodes = $derived.by((): Id[] => {
    if (!kuukanGeometry) return [];
    const { tree } = kuukanGeometry;
    const allNodes = [tree.root, ...[...tree.children.values()].flat()];
    const leaves: Id[] = [];
    for (const id of allNodes) {
      const kids = tree.children.get(id);
      if (!kids || kids.length === 0) {
        leaves.push(id);
      }
    }
    return leaves;
  });

  // クウカンに属するマーカー一覧
  const markers = $derived.by((): Marker[] => {
    if (!doc || !kuukanId) return [];
    return doc.drawing.markers.filter((m) => m.kuukan === kuukanId);
  });

  // ゴースト表示するモノ（配置済みのモノ）
  const ghostItems = $derived.by(() => {
    if (!doc || !kuukanId) return [];
    const areaIds = new Set(doc.membership.areas.filter((a) => a.kuukan === kuukanId).map((a) => a.id));
    const validPlaces = new Set<Id>([kuukanId, ...areaIds]);
    const kuukanItems = doc.membership.items.filter((i) => validPlaces.has(i.place));
    const drawingMap = new Map(doc.drawing.items.map((d) => [d.item, d]));

    return kuukanItems
      .filter((i) => drawingMap.has(i.id))
      .map((i) => ({
        item: i,
        drawing: drawingMap.get(i.id)!,
      }));
  });

  // 仕切り線一覧
  const displayedLineSegments = $derived.by(() => {
    if (!regions || !kuukanGeometry) return [];
    return lineSegments(regions, kuukanGeometry.partitions);
  });

  // アスペクト比
  const aspect = $derived(kuukanDrawing?.aspect ?? 1);

  // viewBox
  const vb = $derived(viewBoxOf(ui.view, aspect, widthPx, heightPx));

  // 吸着の目盛り幅
  const stepX = $derived.by(() => {
    return chooseSnapStep({
      pxPerUnitX: aspect * ui.view.scale,
      realW: kuukanDrawing?.realSize?.w,
      minPx: 12,
    });
  });

  const stepY = $derived.by(() => {
    return chooseSnapStep({
      pxPerUnitX: ui.view.scale,
      realW: kuukanDrawing?.realSize?.d,
      minPx: 12,
    });
  });

  // 目盛り線
  const gridLinesX = $derived.by((): number[] => {
    if (stepX <= 0) return [];
    const list: number[] = [];
    for (let x = stepX; x < COORD_MAX; x += stepX) {
      list.push(x);
    }
    return list;
  });

  const gridLinesY = $derived.by((): number[] => {
    if (stepY <= 0) return [];
    const list: number[] = [];
    for (let y = stepY; y < COORD_MAX; y += stepY) {
      list.push(y);
    }
    return list;
  });

  interface ResizeHandle {
    index: number;
    cx: number;
    cy: number;
    isHoriz: boolean;
  }

  const outlineResizeHandles = $derived.by((): ResizeHandle[] => {
    const isDraft = $app.editor?.kind === 'draft';
    if (!isDraft || !kuukanDrawing || kuukanDrawing.outline.length === 0) return [];
    if (ui.tool !== 'select') return [];
    const pts = kuukanDrawing.outline;
    const n = pts.length;
    const handles: ResizeHandle[] = [];
    for (let i = 0; i < n; i++) {
      const p1 = pts[i]!;
      const p2 = pts[(i + 1) % n]!;
      const isHoriz = p1[1] === p2[1];
      const midX = (p1[0] + p2[0]) / 2;
      const midY = (p1[1] + p2[1]) / 2;
      handles.push({
        index: i,
        cx: midX * aspect,
        cy: midY,
        isHoriz,
      });
    }
    return handles;
  });

  // ResizeObserver でコンテナサイズ測定
  $effect(() => {
    if (!containerEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          widthPx = width;
          heightPx = height;
        }
      }
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  });

  // 全体を表示する。利用者が拡大・移動するまでは、図の大きさや縦横比が変わるたびに合わせ直す
  // （開いた直後に道具の列が折り返して図が縮む、下書きで外形を変えて縦横比が変わる、など）。
  let lastFitRequest = -1;
  let lastFit: { cx: number; cy: number; scale: number } | null = null;

  $effect(() => {
    if (!kuukanDrawing || widthPx <= 0 || heightPx <= 0) return;
    const v = ui.view;
    const untouched = lastFit !== null && v.cx === lastFit.cx && v.cy === lastFit.cy && v.scale === lastFit.scale;
    if (lastFit === null || untouched || ui.fitRequest !== lastFitRequest) {
      lastFitRequest = ui.fitRequest;
      const next = fitView(kuukanDrawing.aspect, widthPx, heightPx, 24);
      lastFit = next;
      // 同じ値を書くと、この $effect 自身がまた動いて止まらなくなる
      if (next.cx !== v.cx || next.cy !== v.cy || next.scale !== v.scale) ui.view = next;
    }
  });

  // ホイールズーム（ポインタ位置中心）
  $effect(() => {
    if (!svgEl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleWheel(e);
    };
    const el = svgEl;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  });

  function isEditableElement(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  }

  // キーボードショートカット（Escapeで選択解除・ツール復帰、Delete/Backspaceで削除）
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return;

      if (e.key === 'Escape') {
        let handled = false;
        if (ui.selectedMarkers.length > 0) {
          ui.selectedMarkers = [];
          handled = true;
        }
        if (ui.selectedLine !== null) {
          ui.selectedLine = null;
          handled = true;
        }
        if (ui.selectedArea !== null) {
          ui.selectedArea = null;
          handled = true;
        }
        if (ui.tool !== 'select') {
          ui.tool = 'select';
          handled = true;
        }
        if (handled) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ui.selectedMarkers.length > 0) {
          e.preventDefault();
          const ids = [...ui.selectedMarkers];
          applyToEditor(app, $app, (d) => deleteMarkers(d, ids));
          ui.selectedMarkers = [];
          return;
        }

        if (ui.selectedLine && doc) {
          e.preventDefault();
          const { node, lineIndex } = ui.selectedLine;
          // 横の欄の「消す」と同じ道を通す（確定したクウカンなら影響と移るモノの名前を見せて確認し、下書きなら確認しない。
          // TRS 付録B I-13・I-18）。確認の文は横の欄と同じ
          const info = selectedLineInfo;
          app.requestDeleteLine(node, lineIndex, 'line', () => {
            ui.selectedLine = null;
          }, info ? describeLineRemoval(info) : undefined);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  // 拡大・縮小の直前に、測った大きさを実際の大きさに合わせる（ResizeObserver の通知が
  // 遅れたり止まったりしても、指した位置を中心に拡大できるように）。
  function syncSize(rect: DOMRect) {
    if (rect.width > 0 && rect.height > 0 && (rect.width !== widthPx || rect.height !== heightPx)) {
      widthPx = rect.width;
      heightPx = rect.height;
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!svgEl || !kuukanDrawing) return;
    const rect = svgEl.getBoundingClientRect();
    syncSize(rect);
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const vx = vb.x + (px / widthPx) * vb.w;
    const vy = vb.y + (py / heightPx) * vb.h;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(0.001, Math.min(10, ui.view.scale * zoomFactor));

    const newW = widthPx / newScale;
    const newH = heightPx / newScale;

    const newCx = (vx - (px / widthPx - 0.5) * newW) / aspect;
    const newCy = vy - (py / heightPx - 0.5) * newH;

    ui.view = { cx: newCx, cy: newCy, scale: newScale };
  }

  // 画面座標から比率の座標へ変換
  function clientToRatio(clientX: number, clientY: number): Point {
    if (!svgEl || !kuukanDrawing) return [0, 0];
    // 実際に描かれている変換を使う（測った大きさが古くても、見えている図と押した位置が合う）
    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const q = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return fromDisplay([q.x, q.y], aspect);
    }
    const rect = svgEl.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const vx = vb.x + (px / widthPx) * vb.w;
    const vy = vb.y + (py / heightPx) * vb.h;
    return fromDisplay([vx, vy], aspect);
  }

  function snapPoint(p: Point): Point {
    return [snap(p[0], stepX), snap(p[1], stepY)];
  }

  // エリア名ラベルの位置（最大長方形の中心）
  function getAreaLabelCenter(poly: Polygon): Point {
    const rects = decomposeToRects(poly);
    if (rects.length === 0) {
      const b = boundingRect(poly);
      return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    }
    let best = rects[0]!;
    let bestArea = (best.x1 - best.x0) * (best.y1 - best.y0);
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i]!;
      const area = (r.x1 - r.x0) * (r.y1 - r.y0);
      if (area > bestArea) {
        bestArea = area;
        best = r;
      }
    }
    return [(best.x0 + best.x1) / 2, (best.y0 + best.y1) / 2];
  }

  function areaDisplayName(nodeId: Id): string {
    if (nodeId === kuukanId) {
      return kuukanModel?.name ?? kuukanModel?.areaLabel ?? 'エリア';
    }
    const a = doc?.membership.areas.find((ar) => ar.id === nodeId);
    return a?.name ?? 'エリア';
  }

  // マーカーの形状を点列として取得する（長方形は時計回りの4点）
  function getMarkerPoints(m: Marker): Point[] | null {
    if (m.shape.type === 'rect') {
      const { x, y, w, h } = m.shape;
      return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    }
    if (m.shape.type === 'poly') {
      return m.shape.points;
    }
    return null;
  }

  // 表示上のポインタ座標を、マーカーの回転前のローカル比率座標に変換する
  function toMarkerLocal(pRatio: Point, m: Marker): Point {
    if (m.rotation === 0) return pRatio;
    const center = shapeCenter(m.shape);
    const cx = center[0] * aspect;
    const cy = center[1];
    const px = pRatio[0] * aspect;
    const py = pRatio[1];
    const rad = (-m.rotation * 45 * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - cx;
    const dy = py - cy;
    const unrotX = dx * cos - dy * sin + cx;
    const unrotY = dx * sin + dy * cos + cy;
    return [unrotX / aspect, unrotY];
  }

  // 塗り分けパレット（薄い塗り）
  const AREA_FILLS = [
    'var(--area-fill-0)',
    'var(--area-fill-1)',
    'var(--area-fill-2)',
    'var(--area-fill-3)',
    'var(--area-fill-4)',
    'var(--area-fill-5)',
  ];

  // ドラッグ操作の状態管理
  type DragMode =
    | { kind: 'pan'; lastX: number; lastY: number }
    | {
        kind: 'dragLine';
        node: Id;
        lineIndex: number;
        axis: 'x' | 'y';
        range: { min: number; max: number };
        initialAt: number;
        poly: Polygon;
      }
    | { kind: 'dragMarkers'; startP: Point; markerStartPositions: Map<Id, Point> }
    | { kind: 'markerRect'; startP: Point }
    | { kind: 'outlineEdge'; edgeIndex: number; startP: Point }
    | { kind: 'outlineStep'; edgeIndex: number; at: number; side: 'start' | 'end'; isHoriz: boolean; startP: Point }
    | {
        kind: 'markerEdge';
        markerId: Id;
        edgeIndex: number;
        startP: Point;
        points: Point[];
      }
    | {
        kind: 'markerStep';
        markerId: Id;
        edgeIndex: number;
        at: number;
        side: 'start' | 'end';
        isHoriz: boolean;
        startP: Point;
        points: Point[];
      };

  let activeDrag = $state<DragMode | null>(null);
  let pointerStartClient = $state<[number, number] | null>(null);
  let hasMoved = $state(false);

  // プレビュー表示用状態
  let previewLineAt = $state<number | null>(null);
  let previewMarkerDelta = $state<{ dx: number; dy: number } | null>(null);
  let previewRectBounds = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let previewOutline = $state<Point[] | null>(null);
  let previewMarkerPoints = $state<{ markerId: Id; points: Point[] } | null>(null);

  // タッチ操作（ピンチ）追跡
  const touchPointers = new Map<number, { x: number; y: number }>();
  let initialPinchDist = 0;
  let initialPinchScale = 0;
  let initialPinchCenter: Point = [0, 0];
  let initialPinchMidClient: [number, number] = [0, 0];

  function handlePointerDown(e: PointerEvent) {
    if (!svgEl || !kuukanDrawing) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPointers.size === 2) {
      const pts = Array.from(touchPointers.values());
      const p1 = pts[0]!;
      const p2 = pts[1]!;
      initialPinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      initialPinchScale = ui.view.scale;
      initialPinchMidClient = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
      initialPinchCenter = clientToRatio(initialPinchMidClient[0], initialPinchMidClient[1]);
      activeDrag = null;
      return;
    }

    pointerStartClient = [e.clientX, e.clientY];
    hasMoved = false;

    const pRatio = clientToRatio(e.clientX, e.clientY);
    const minUnitScale = ui.view.scale * Math.min(1, aspect);
    const tol8 = 8 / minUnitScale;
    const tol12 = 12 / minUnitScale;

    const isDraft = $app.editor?.kind === 'draft';

    if (ui.tool === 'select') {
      // 0a. 選択中の単一マーカーの辺が押された場合、マーカー辺ドラッグ
      if (ui.selectedMarkers.length === 1) {
        const selMId = ui.selectedMarkers[0]!;
        const targetMarker = markers.find((m) => m.id === selMId);
        if (targetMarker && (targetMarker.shape.type === 'rect' || targetMarker.shape.type === 'poly')) {
          const pts = getMarkerPoints(targetMarker);
          if (pts) {
            const pLocal = toMarkerLocal(pRatio, targetMarker);
            const edgeIndex = edgeAt(pts, pLocal, tol12);
            if (edgeIndex !== null) {
              activeDrag = {
                kind: 'markerEdge',
                markerId: selMId,
                edgeIndex,
                startP: pLocal,
                points: pts,
              };
              return;
            }
          }
        }
      }

      // 0b. 下書き時、外形の辺（ツマミ）が押された場合、外形辺ドラッグ
      if (isDraft && kuukanDrawing.outline.length > 0) {
        const edgeIndex = edgeAt(kuukanDrawing.outline, pRatio, tol12);
        const hitMId = hitMarker(markers, pRatio, tol12);
        const lineHit = regions && kuukanGeometry ? hitLine(regions, kuukanGeometry.partitions, pRatio, tol8, kuukanGeometry.tree) : null;
        if (edgeIndex !== null && !hitMId && !lineHit) {
          activeDrag = { kind: 'outlineEdge', edgeIndex, startP: pRatio };
          return;
        }
      }

      // 1. マーカー判定
      const hitMId = hitMarker(markers, pRatio, tol12);
      if (hitMId) {
        if (e.shiftKey) {
          if (ui.selectedMarkers.includes(hitMId)) {
            ui.selectedMarkers = ui.selectedMarkers.filter((id) => id !== hitMId);
          } else {
            ui.selectedMarkers = [...ui.selectedMarkers, hitMId];
          }
        } else {
          if (!ui.selectedMarkers.includes(hitMId)) {
            ui.selectedMarkers = [hitMId];
          }
        }
        ui.selectedLine = null;
        ui.selectedArea = null;

        const posMap = new Map<Id, Point>();
        for (const m of markers) {
          if (ui.selectedMarkers.includes(m.id)) {
            if (m.shape.type === 'point') {
              posMap.set(m.id, [m.shape.at[0], m.shape.at[1]]);
            } else if (m.shape.type === 'rect') {
              posMap.set(m.id, [m.shape.x, m.shape.y]);
            } else if (m.shape.type === 'poly') {
              const b = boundingRect(m.shape.points);
              posMap.set(m.id, [b.x0, b.y0]);
            }
          }
        }
        activeDrag = {
          kind: 'dragMarkers',
          startP: pRatio,
          markerStartPositions: posMap,
        };
        return;
      }

      // 2. 仕切り線判定
      if (regions && kuukanGeometry) {
        const lineHit = hitLine(regions, kuukanGeometry.partitions, pRatio, tol8, kuukanGeometry.tree);
        if (lineHit) {
          ui.selectedLine = lineHit;
          ui.selectedArea = null;
          ui.selectedMarkers = [];

          const targetPart = kuukanGeometry.partitions.find((p) => p.area === lineHit.node);
          const currentAt = targetPart?.at[lineHit.lineIndex] ?? 0;
          const range = dragRange(
            kuukanDrawing.outline,
            kuukanGeometry.tree,
            kuukanGeometry.partitions,
            lineHit.node,
            lineHit.lineIndex,
          );
          const parentPoly = regions.get(lineHit.node) ?? kuukanDrawing.outline;

          activeDrag = {
            kind: 'dragLine',
            node: lineHit.node,
            lineIndex: lineHit.lineIndex,
            axis: targetPart?.axis ?? 'x',
            range,
            initialAt: currentAt,
            poly: parentPoly,
          };
          return;
        }
      }

      // 3. エリア判定（空き領域は pan）
      activeDrag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }

    if (ui.tool === 'splitX' || ui.tool === 'splitY' || ui.tool === 'markerPoint') {
      activeDrag = null;
      return;
    }

    if (ui.tool === 'markerRect') {
      activeDrag = { kind: 'markerRect', startP: snapPoint(pRatio) };
      return;
    }

    if (isDraft && ui.tool === 'outlineEdge') {
      const edgeIndex = edgeAt(kuukanDrawing.outline, pRatio, tol12);
      if (edgeIndex !== null) {
        activeDrag = { kind: 'outlineEdge', edgeIndex, startP: pRatio };
      }
      return;
    }

    if (isDraft && ui.tool === 'outlineStep') {
      const edgeIndex = edgeAt(kuukanDrawing.outline, pRatio, tol12);
      if (edgeIndex !== null) {
        const pts = kuukanDrawing.outline;
        const p1 = pts[edgeIndex]!;
        const p2 = pts[(edgeIndex + 1) % pts.length]!;
        const isHoriz = p1[1] === p2[1];
        const at = isHoriz ? snap(pRatio[0], stepX) : snap(pRatio[1], stepY);
        const side: 'start' | 'end' = isHoriz
          ? Math.abs(at - p2[0]) < Math.abs(at - p1[0]) ? 'end' : 'start'
          : Math.abs(at - p2[1]) < Math.abs(at - p1[1]) ? 'end' : 'start';

        activeDrag = {
          kind: 'outlineStep',
          edgeIndex,
          at,
          side,
          isHoriz,
          startP: pRatio,
        };
      }
      return;
    }

    if (ui.tool === 'markerEdge' || ui.tool === 'markerStep') {
      if (ui.selectedMarkers.length === 1) {
        const markerId = ui.selectedMarkers[0]!;
        const targetMarker = markers.find((m) => m.id === markerId);
        if (targetMarker && (targetMarker.shape.type === 'rect' || targetMarker.shape.type === 'poly')) {
          const pts = getMarkerPoints(targetMarker);
          if (pts) {
            const pLocal = toMarkerLocal(pRatio, targetMarker);
            const edgeIndex = edgeAt(pts, pLocal, tol12);
            if (edgeIndex !== null) {
              if (ui.tool === 'markerEdge') {
                activeDrag = {
                  kind: 'markerEdge',
                  markerId,
                  edgeIndex,
                  startP: pLocal,
                  points: pts,
                };
                return;
              } else {
                const p1 = pts[edgeIndex]!;
                const p2 = pts[(edgeIndex + 1) % pts.length]!;
                const isHoriz = p1[1] === p2[1];
                const at = isHoriz ? snap(pLocal[0], stepX) : snap(pLocal[1], stepY);
                const side: 'start' | 'end' = isHoriz
                  ? Math.abs(at - p2[0]) < Math.abs(at - p1[0]) ? 'end' : 'start'
                  : Math.abs(at - p2[1]) < Math.abs(at - p1[1]) ? 'end' : 'start';

                activeDrag = {
                  kind: 'markerStep',
                  markerId,
                  edgeIndex,
                  at,
                  side,
                  isHoriz,
                  startP: pLocal,
                  points: pts,
                };
                return;
              }
            }
          }
        }
      }
      // 選んだマーカーの辺でない所を押した：形の編集を終え、ふつうに押したのと同じに扱う
      // （別のマーカーならそれを選び、何もない所ならエリアを選ぶか選択を外す。レビュー2）
      ui.tool = 'select';
      handlePointerDown(e);
      return;
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (touchPointers.has(e.pointerId)) {
      touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // 2本指ピンチズーム・移動
    if (touchPointers.size === 2) {
      const pts = Array.from(touchPointers.values());
      const p1 = pts[0]!;
      const p2 = pts[1]!;
      const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (initialPinchDist > 0) {
        const factor = currentDist / initialPinchDist;
        const newScale = Math.max(0.001, Math.min(10, initialPinchScale * factor));
        const midClientX = (p1.x + p2.x) / 2;
        const midClientY = (p1.y + p2.y) / 2;
        const newW = widthPx / newScale;
        const newH = heightPx / newScale;
        const newCx = initialPinchCenter[0] - (midClientX - initialPinchMidClient[0]) / (newScale * aspect);
        const newCy = initialPinchCenter[1] - (midClientY - initialPinchMidClient[1]) / newScale;
        ui.view = { cx: newCx, cy: newCy, scale: newScale };
      }
      return;
    }

    if (!pointerStartClient) return;

    if (!hasMoved) {
      const dist = Math.hypot(e.clientX - pointerStartClient[0], e.clientY - pointerStartClient[1]);
      if (dist >= 3) {
        hasMoved = true;
      }
    }

    if (!activeDrag || !kuukanDrawing) return;

    const pRatio = clientToRatio(e.clientX, e.clientY);

    if (activeDrag.kind === 'pan') {
      const dxPx = e.clientX - activeDrag.lastX;
      const dyPx = e.clientY - activeDrag.lastY;
      const dxDisp = dxPx / ui.view.scale;
      const dyDisp = dyPx / ui.view.scale;
      ui.view = {
        ...ui.view,
        cx: ui.view.cx - dxDisp / aspect,
        cy: ui.view.cy - dyDisp,
      };
      activeDrag = { ...activeDrag, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    if (activeDrag.kind === 'dragLine') {
      const rawVal = activeDrag.axis === 'x' ? pRatio[0] : pRatio[1];
      const step = activeDrag.axis === 'x' ? stepX : stepY;
      const snappedVal = snap(rawVal, step);
      const clampedVal = Math.max(activeDrag.range.min, Math.min(activeDrag.range.max, snappedVal));
      previewLineAt = clampedVal;
      return;
    }

    if (activeDrag.kind === 'dragMarkers') {
      const rawDx = pRatio[0] - activeDrag.startP[0];
      const rawDy = pRatio[1] - activeDrag.startP[1];
      const dx = snap(rawDx, stepX);
      const dy = snap(rawDy, stepY);
      previewMarkerDelta = { dx, dy };
      return;
    }

    if (activeDrag.kind === 'markerRect') {
      const p1 = snapPoint(pRatio);
      const p0 = activeDrag.startP;
      const x = Math.min(p0[0], p1[0]);
      const y = Math.min(p0[1], p1[1]);
      const w = Math.abs(p1[0] - p0[0]);
      const h = Math.abs(p1[1] - p0[1]);
      previewRectBounds = { x, y, w, h };
      return;
    }

    if (activeDrag.kind === 'outlineEdge') {
      const pts = kuukanDrawing.outline;
      const p1 = pts[activeDrag.edgeIndex]!;
      const p2 = pts[(activeDrag.edgeIndex + 1) % pts.length]!;
      const isHoriz = p1[1] === p2[1];
      const rawDelta = isHoriz ? pRatio[1] - activeDrag.startP[1] : pRatio[0] - activeDrag.startP[0];
      const delta = snap(rawDelta, isHoriz ? stepY : stepX);
      previewOutline = delta !== 0 ? moveEdge(kuukanDrawing.outline, activeDrag.edgeIndex, delta) : null;
      return;
    }

    if (activeDrag.kind === 'outlineStep') {
      const rawDepth = activeDrag.isHoriz
        ? pRatio[1] - activeDrag.startP[1]
        : pRatio[0] - activeDrag.startP[0];
      const depth = snap(rawDepth, activeDrag.isHoriz ? stepY : stepX);
      previewOutline =
        depth !== 0
          ? addStep(
              kuukanDrawing.outline,
              activeDrag.edgeIndex,
              activeDrag.at,
              depth,
              activeDrag.side,
            )
          : null;
      return;
    }

    if (activeDrag.kind === 'markerEdge') {
      const drag = activeDrag;
      const targetMarker = markers.find((m) => m.id === drag.markerId);
      if (!targetMarker) return;
      const pLocal = toMarkerLocal(pRatio, targetMarker);
      const pts = activeDrag.points;
      const p1 = pts[activeDrag.edgeIndex]!;
      const p2 = pts[(activeDrag.edgeIndex + 1) % pts.length]!;
      const isHoriz = p1[1] === p2[1];
      const rawDelta = isHoriz ? pLocal[1] - activeDrag.startP[1] : pLocal[0] - activeDrag.startP[0];
      const delta = snap(rawDelta, isHoriz ? stepY : stepX);
      const nextPoints = delta !== 0 ? moveEdge(pts, activeDrag.edgeIndex, delta) : null;
      previewMarkerPoints = nextPoints ? { markerId: activeDrag.markerId, points: nextPoints } : null;
      return;
    }

    if (activeDrag.kind === 'markerStep') {
      const drag = activeDrag;
      const targetMarker = markers.find((m) => m.id === drag.markerId);
      if (!targetMarker) return;
      const pLocal = toMarkerLocal(pRatio, targetMarker);
      const rawDepth = activeDrag.isHoriz
        ? pLocal[1] - activeDrag.startP[1]
        : pLocal[0] - activeDrag.startP[0];
      const depth = snap(rawDepth, activeDrag.isHoriz ? stepY : stepX);
      const nextPoints =
        depth !== 0
          ? addStep(
              activeDrag.points,
              activeDrag.edgeIndex,
              activeDrag.at,
              depth,
              activeDrag.side,
            )
          : null;
      previewMarkerPoints = nextPoints ? { markerId: activeDrag.markerId, points: nextPoints } : null;
      return;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    touchPointers.delete(e.pointerId);

    if (touchPointers.size > 0) {
      activeDrag = null;
      return;
    }

    const wasMoved = hasMoved;
    const currentDrag = activeDrag;
    const pRatio = clientToRatio(e.clientX, e.clientY);

    activeDrag = null;
    pointerStartClient = null;
    previewLineAt = null;
    previewMarkerDelta = null;
    previewRectBounds = null;
    previewOutline = null;
    previewMarkerPoints = null;

    if (!kuukanDrawing || !kuukanId) return;

    // クリック・タップ操作（3px 未満の移動）
    if (!wasMoved) {
      if (ui.tool === 'markerEdge' || ui.tool === 'markerStep') {
        return;
      }

      if (ui.tool === 'select') {
        // 押した瞬間に線やマーカーに当たっていたら、その選択のまま（エリアで上書きしない）
        if (currentDrag?.kind === 'dragLine' || currentDrag?.kind === 'dragMarkers') return;
        if (regions && kuukanGeometry) {
          const leafId = leafAt(regions, kuukanGeometry.tree, pRatio);
          if (leafId) {
            ui.selectedArea = leafId;
            ui.selectedLine = null;
            ui.selectedMarkers = [];
            return;
          }
          const rootPoly = regions.get(kuukanGeometry.tree.root);
          if (rootPoly && locatePoint(rootPoly, pRatio) !== 'outside') {
            ui.selectedArea = kuukanGeometry.tree.root;
            ui.selectedLine = null;
            ui.selectedMarkers = [];
            return;
          }
        }
        // 外側を押したときは選択解除
        ui.selectedArea = null;
        ui.selectedLine = null;
        ui.selectedMarkers = [];
        return;
      }

      if (ui.tool === 'splitX' || ui.tool === 'splitY') {
        const p = snapPoint(pRatio);
        const axis = ui.tool === 'splitX' ? 'x' : 'y';
        applyToEditor(app, $app, (d, ctx) => splitAt(d, kuukanId, axis, p, ctx));
        return;
      }

      if (ui.tool === 'markerPoint') {
        const p = snapPoint(pRatio);
        const res = applyToEditor(app, $app, (d, ctx) =>
          addMarker(d, kuukanId, { name: 'マーカー', shape: { type: 'point', at: p } }, ctx),
        );
        if (res && res.created[0]) {
          ui.selectedMarkers = [res.created[0]];
          ui.selectedLine = null;
          ui.selectedArea = null;
        }
        return;
      }
      return;
    }

    // ドラッグ完了操作（3px 以上の移動）
    if (currentDrag) {
      if (currentDrag.kind === 'dragLine') {
        const rawVal = currentDrag.axis === 'x' ? pRatio[0] : pRatio[1];
        const step = currentDrag.axis === 'x' ? stepX : stepY;
        const snappedVal = snap(rawVal, step);
        const clampedVal = Math.max(currentDrag.range.min, Math.min(currentDrag.range.max, snappedVal));
        if (clampedVal !== currentDrag.initialAt) {
          applyToEditor(app, $app, (d) =>
            moveLine(d, currentDrag.node, currentDrag.lineIndex, clampedVal),
          );
        }
        return;
      }

      if (currentDrag.kind === 'dragMarkers') {
        const rawDx = pRatio[0] - currentDrag.startP[0];
        const rawDy = pRatio[1] - currentDrag.startP[1];
        const dx = snap(rawDx, stepX);
        const dy = snap(rawDy, stepY);
        if ((dx !== 0 || dy !== 0) && ui.selectedMarkers.length > 0) {
          applyToEditor(app, $app, (d) => moveMarkers(d, ui.selectedMarkers, dx, dy));
        }
        return;
      }

      if (currentDrag.kind === 'markerRect') {
        const p1 = snapPoint(pRatio);
        const p0 = currentDrag.startP;
        const x = Math.min(p0[0], p1[0]);
        const y = Math.min(p0[1], p1[1]);
        const w = Math.abs(p1[0] - p0[0]);
        const h = Math.abs(p1[1] - p0[1]);
        if (w >= stepX && h >= stepY) {
          const res = applyToEditor(app, $app, (d, ctx) =>
            addMarker(d, kuukanId, { name: 'マーカー', shape: { type: 'rect', x, y, w, h } }, ctx),
          );
          if (res && res.created[0]) {
            ui.selectedMarkers = [res.created[0]];
            ui.selectedLine = null;
            ui.selectedArea = null;
          }
        }
        return;
      }

      if (currentDrag.kind === 'outlineEdge') {
        const pts = kuukanDrawing.outline;
        const p1 = pts[currentDrag.edgeIndex]!;
        const p2 = pts[(currentDrag.edgeIndex + 1) % pts.length]!;
        const isHoriz = p1[1] === p2[1];
        const rawDelta = isHoriz
          ? pRatio[1] - currentDrag.startP[1]
          : pRatio[0] - currentDrag.startP[0];
        const delta = snap(rawDelta, isHoriz ? stepY : stepX);
        if (delta !== 0) {
          const nextOutline = moveEdge(kuukanDrawing.outline, currentDrag.edgeIndex, delta);
          if (nextOutline) {
            app.draftSetOutline(nextOutline);
          }
        }
        return;
      }

      if (currentDrag.kind === 'outlineStep') {
        const rawDepth = currentDrag.isHoriz
          ? pRatio[1] - currentDrag.startP[1]
          : pRatio[0] - currentDrag.startP[0];
        const depth = snap(rawDepth, currentDrag.isHoriz ? stepY : stepX);
        if (depth !== 0) {
          const nextOutline = addStep(
            kuukanDrawing.outline,
            currentDrag.edgeIndex,
            currentDrag.at,
            depth,
            currentDrag.side,
          );
          if (nextOutline) {
            app.draftSetOutline(nextOutline);
          }
        }
        return;
      }

      if (currentDrag.kind === 'markerEdge') {
        const targetMarker = markers.find((m) => m.id === currentDrag.markerId);
        if (targetMarker) {
          const pLocal = toMarkerLocal(pRatio, targetMarker);
          const pts = currentDrag.points;
          const p1 = pts[currentDrag.edgeIndex]!;
          const p2 = pts[(currentDrag.edgeIndex + 1) % pts.length]!;
          const isHoriz = p1[1] === p2[1];
          const rawDelta = isHoriz
            ? pLocal[1] - currentDrag.startP[1]
            : pLocal[0] - currentDrag.startP[0];
          const delta = snap(rawDelta, isHoriz ? stepY : stepX);
          if (delta !== 0) {
            const nextPoints = moveEdge(pts, currentDrag.edgeIndex, delta);
            if (nextPoints) {
              applyToEditor(app, $app, (d) =>
                updateMarker(d, currentDrag.markerId, {
                  shape: { type: 'poly', points: nextPoints },
                }),
              );
            }
          }
        }
        return;
      }

      if (currentDrag.kind === 'markerStep') {
        const targetMarker = markers.find((m) => m.id === currentDrag.markerId);
        if (targetMarker) {
          const pLocal = toMarkerLocal(pRatio, targetMarker);
          const rawDepth = currentDrag.isHoriz
            ? pLocal[1] - currentDrag.startP[1]
            : pLocal[0] - currentDrag.startP[0];
          const depth = snap(rawDepth, currentDrag.isHoriz ? stepY : stepX);
          if (depth !== 0) {
            const nextPoints = addStep(
              currentDrag.points,
              currentDrag.edgeIndex,
              currentDrag.at,
              depth,
              currentDrag.side,
            );
            if (nextPoints) {
              applyToEditor(app, $app, (d) =>
                updateMarker(d, currentDrag.markerId, {
                  shape: { type: 'poly', points: nextPoints },
                }),
              );
            }
          }
        }
        return;
      }
    }
  }

  function handlePointerCancel(e: PointerEvent) {
    touchPointers.delete(e.pointerId);
    activeDrag = null;
    pointerStartClient = null;
    previewLineAt = null;
    previewMarkerDelta = null;
    previewRectBounds = null;
    previewOutline = null;
    previewMarkerPoints = null;
  }
</script>

<div
  class="canvas-container"
  class:tool-select={ui.tool === 'select'}
  class:tool-split-x={ui.tool === 'splitX'}
  class:tool-split-y={ui.tool === 'splitY'}
  class:tool-marker-point={ui.tool === 'markerPoint'}
  class:tool-marker-rect={ui.tool === 'markerRect'}
  class:tool-outline-edge={ui.tool === 'outlineEdge'}
  class:tool-outline-step={ui.tool === 'outlineStep'}
  class:tool-marker-edge={ui.tool === 'markerEdge'}
  class:tool-marker-step={ui.tool === 'markerStep'}
  bind:this={containerEl}
>
  {#if !kuukanDrawing}
    <div class="no-drawing-placeholder">
      <p class="no-drawing-text">このクウカンにはまだかたちがありません</p>
      {#if $app.editor?.kind === 'kuukan' && $app.editor.kuukan !== NIL_ID}
        {@const source = $app.editor.kuukan}
        <button type="button" class="primary" onclick={() => app.openDraft({ kind: 'redraw', source })}>かたちを作る</button>
        <p class="no-drawing-note">下書きが開きます。確定すると、このクウカンにかたちが付きます（中のモノはそのまま）。</p>
      {/if}
    </div>
  {:else}
    <svg
      role="application"
      aria-label="クウカンのかたち"
      bind:this={svgEl}
      viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
      style:--u={1 / ui.view.scale}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
    >

      <!-- 1. 吸着の目盛り -->
      <g class="grid-layer">
        {#each gridLinesX as x}
          <line
            x1={x * aspect}
            y1={0}
            x2={x * aspect}
            y2={COORD_MAX}
            class="grid-line"
            vector-effect="non-scaling-stroke"
          />
        {/each}
        {#each gridLinesY as y}
          <line
            x1={0}
            y1={y}
            x2={COORD_MAX * aspect}
            y2={y}
            class="grid-line"
            vector-effect="non-scaling-stroke"
          />
        {/each}
      </g>

      <!-- 2. エリアの領域 -->
      <g class="areas-layer">
        {#if regions}
          {#each leafNodes as leafId, idx}
            {@const poly = regions.get(leafId)}
            {#if poly}
              {@const ptsStr = poly.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
              {@const center = getAreaLabelCenter(poly)}
              <polygon
                points={ptsStr}
                class="area-polygon"
                class:selected={ui.selectedArea === leafId}
                style="fill: {AREA_FILLS[idx % AREA_FILLS.length]};"
                vector-effect="non-scaling-stroke"
              />
              <text
                x={center[0] * aspect}
                y={center[1]}
                class="area-label"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {areaDisplayName(leafId)}
              </text>
            {/if}
          {/each}

          <!-- 選択された節の強調輪郭 -->
          {#if ui.selectedArea && regions.get(ui.selectedArea)}
            {@const selPoly = regions.get(ui.selectedArea)!}
            <polygon
              points={selPoly.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
              class="selected-area-outline"
              vector-effect="non-scaling-stroke"
            />
          {/if}

          <!-- 選択された仕切り線で分断されているエリアの強調オーバーレイ -->
          {#if selectedLineInfo && regions}
            {#each selectedLineInfo.allRemovedAreas as aId}
              {@const aPoly = regions.get(aId)}
              {#if aPoly}
                <polygon
                  points={aPoly.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                  class="line-affected-area"
                  vector-effect="non-scaling-stroke"
                />
              {/if}
            {/each}
          {/if}
        {/if}
      </g>

      <!-- 3. 外形 -->
      <g class="outline-layer">
        <polygon
          points={kuukanDrawing.outline.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
          class="kuukan-outline"
          vector-effect="non-scaling-stroke"
        />
        {#if outlineResizeHandles.length > 0}
          <g class="outline-handles-layer">
            {#each outlineResizeHandles as h (h.index)}
              {@const hw = (h.isHoriz ? 18 : 6) / ui.view.scale}
              {@const hh = (h.isHoriz ? 6 : 18) / ui.view.scale}
              <rect
                x={h.cx - hw / 2}
                y={h.cy - hh / 2}
                width={hw}
                height={hh}
                rx={3 / ui.view.scale}
                ry={3 / ui.view.scale}
                class="edge-resize-handle"
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </g>
        {/if}
      </g>

      <!-- 3.5. モノのゴースト描画（配置済みモノの参考表示） -->
      {#if ghostItems.length > 0}
        <g class="ghost-items-layer" aria-hidden="true">
          {#each ghostItems as { item, drawing }}
            {#if drawing.shape.type === 'point'}
              {@const [gx, gy] = drawing.shape.at}
              <circle
                cx={gx * aspect}
                cy={gy}
                r={6 / ui.view.scale}
                class="ghost-item-point"
                vector-effect="non-scaling-stroke"
              />
              <text
                x={gx * aspect}
                y={gy + 13 / ui.view.scale}
                class="ghost-item-label"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {item.name}
              </text>
            {:else if drawing.shape.type === 'rect'}
              {@const { x, y, w, h } = drawing.shape}
              {@const cx = (x + w / 2) * aspect}
              {@const cy = y + h / 2}
              {@const rotDeg = (drawing.rotation ?? 0) * 45}
              <g transform={rotDeg !== 0 ? `rotate(${rotDeg}, ${cx}, ${cy})` : undefined}>
                <rect
                  x={x * aspect}
                  y={y}
                  width={w * aspect}
                  height={h}
                  class="ghost-item-rect"
                  vector-effect="non-scaling-stroke"
                />
                <text
                  x={cx}
                  y={cy}
                  class="ghost-item-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {item.name}
                </text>
              </g>
            {:else if drawing.shape.type === 'poly'}
              {@const center = shapeCenter(drawing.shape)}
              {@const cx = center[0] * aspect}
              {@const cy = center[1]}
              {@const rotDeg = (drawing.rotation ?? 0) * 45}
              <g transform={rotDeg !== 0 ? `rotate(${rotDeg}, ${cx}, ${cy})` : undefined}>
                <polygon
                  points={drawing.shape.points.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                  class="ghost-item-poly"
                  vector-effect="non-scaling-stroke"
                />
                <text
                  x={cx}
                  y={cy}
                  class="ghost-item-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {item.name}
                </text>
              </g>
            {/if}
          {/each}
        </g>
      {/if}

      <!-- 4. 仕切りの線 -->
      <g class="partitions-layer">
        {#each displayedLineSegments as seg}
          {@const isLineSelected =
            ui.selectedLine?.node === seg.node && ui.selectedLine?.lineIndex === seg.lineIndex}
          {#if isLineSelected}
            <line
              x1={seg.from[0] * aspect}
              y1={seg.from[1]}
              x2={seg.to[0] * aspect}
              y2={seg.to[1]}
              class="partition-line-glow"
              vector-effect="non-scaling-stroke"
            />
          {/if}
          <line
            x1={seg.from[0] * aspect}
            y1={seg.from[1]}
            x2={seg.to[0] * aspect}
            y2={seg.to[1]}
            class="partition-line"
            class:selected={isLineSelected}
            vector-effect="non-scaling-stroke"
          />
        {/each}
      </g>

      <!-- 5. マーカー -->
      <g class="markers-layer">
        {#each markers as m}
          {@const isMarkerSelected = ui.selectedMarkers.includes(m.id)}
          {#if m.shape.type === 'point'}
            {@const [mx, my] = m.shape.at}
            <circle
              cx={mx * aspect}
              cy={my}
              r={7 / ui.view.scale}
              class="marker-point"
              class:selected={isMarkerSelected}
              vector-effect="non-scaling-stroke"
            />
            <text
              x={mx * aspect}
              y={my + 14 / ui.view.scale}
              class="marker-label"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {m.name}
            </text>
          {:else if m.shape.type === 'rect'}
            {@const { x, y, w, h } = m.shape}
            {@const cx = (x + w / 2) * aspect}
            {@const cy = y + h / 2}
            {@const rotDeg = m.rotation * 45}
            <g transform="rotate({rotDeg}, {cx}, {cy})">
              <rect
                x={x * aspect}
                y={y}
                width={w * aspect}
                height={h}
                class="marker-rect"
                class:selected={isMarkerSelected}
                vector-effect="non-scaling-stroke"
              />
              <text
                x={cx}
                y={cy}
                class="marker-label"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {m.name}
              </text>
              {#if isMarkerSelected && ui.selectedMarkers.length === 1 && ui.tool === 'select'}
                {@const mPts = getMarkerPoints(m)}
                {#if mPts}
                  {#each mPts as p1, i}
                    {@const p2 = mPts[(i + 1) % mPts.length]!}
                    {@const isHoriz = p1[1] === p2[1]}
                    {@const midX = ((p1[0] + p2[0]) / 2) * aspect}
                    {@const midY = (p1[1] + p2[1]) / 2}
                    {@const hw = (isHoriz ? 16 : 6) / ui.view.scale}
                    {@const hh = (isHoriz ? 6 : 16) / ui.view.scale}
                    <rect
                      x={midX - hw / 2}
                      y={midY - hh / 2}
                      width={hw}
                      height={hh}
                      rx={3 / ui.view.scale}
                      ry={3 / ui.view.scale}
                      class="edge-resize-handle marker-handle"
                      vector-effect="non-scaling-stroke"
                    />
                  {/each}
                {/if}
              {/if}
            </g>
          {:else if m.shape.type === 'poly'}
            {@const center = shapeCenter(m.shape)}
            {@const cx = center[0] * aspect}
            {@const cy = center[1]}
            {@const rotDeg = m.rotation * 45}
            <g transform="rotate({rotDeg}, {cx}, {cy})">
              <polygon
                points={m.shape.points.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                class="marker-poly"
                class:selected={isMarkerSelected}
                vector-effect="non-scaling-stroke"
              />
              <text
                x={cx}
                y={cy}
                class="marker-label"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {m.name}
              </text>
              {#if isMarkerSelected && ui.selectedMarkers.length === 1 && ui.tool === 'select'}
                {#each m.shape.points as p1, i}
                  {@const p2 = m.shape.points[(i + 1) % m.shape.points.length]!}
                  {@const isHoriz = p1[1] === p2[1]}
                  {@const midX = ((p1[0] + p2[0]) / 2) * aspect}
                  {@const midY = (p1[1] + p2[1]) / 2}
                  {@const hw = (isHoriz ? 16 : 6) / ui.view.scale}
                  {@const hh = (isHoriz ? 6 : 16) / ui.view.scale}
                  <rect
                    x={midX - hw / 2}
                    y={midY - hh / 2}
                    width={hw}
                    height={hh}
                    rx={3 / ui.view.scale}
                    ry={3 / ui.view.scale}
                    class="edge-resize-handle marker-handle"
                    vector-effect="non-scaling-stroke"
                  />
                {/each}
              {/if}
            </g>
          {/if}
        {/each}
      </g>

      <!-- プレビュー層（ドラッグ中の仮描画） -->
      <g class="preview-layer">
        <!-- 仕切り移動プレビュー -->
        {#if previewLineAt !== null && activeDrag?.kind === 'dragLine'}
          {@const r = boundingRect(activeDrag.poly)}
          {#if activeDrag.axis === 'x'}
            <line
              x1={previewLineAt * aspect}
              y1={r.y0}
              x2={previewLineAt * aspect}
              y2={r.y1}
              class="preview-line"
              vector-effect="non-scaling-stroke"
            />
          {:else}
            <line
              x1={r.x0 * aspect}
              y1={previewLineAt}
              x2={r.x1 * aspect}
              y2={previewLineAt}
              class="preview-line"
              vector-effect="non-scaling-stroke"
            />
          {/if}
        {/if}

        <!-- マーカー移動プレビュー -->
        {#if previewMarkerDelta && (previewMarkerDelta.dx !== 0 || previewMarkerDelta.dy !== 0)}
          {#each markers as m}
            {#if ui.selectedMarkers.includes(m.id)}
              {#if m.shape.type === 'point'}
                {@const px = (m.shape.at[0] + previewMarkerDelta.dx) * aspect}
                {@const py = m.shape.at[1] + previewMarkerDelta.dy}
                <circle
                  cx={px}
                  cy={py}
                  r={7 / ui.view.scale}
                  class="preview-marker-point"
                  vector-effect="non-scaling-stroke"
                />
              {:else if m.shape.type === 'rect'}
                {@const rx = (m.shape.x + previewMarkerDelta.dx) * aspect}
                {@const ry = m.shape.y + previewMarkerDelta.dy}
                {@const rw = m.shape.w * aspect}
                {@const rh = m.shape.h}
                {@const cx = rx + rw / 2}
                {@const cy = ry + rh / 2}
                {@const rotDeg = m.rotation * 45}
                <g transform="rotate({rotDeg}, {cx}, {cy})">
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    class="preview-marker-rect"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
              {:else if m.shape.type === 'poly'}
                {@const movedPoints = m.shape.points.map((p) => [p[0] + previewMarkerDelta!.dx, p[1] + previewMarkerDelta!.dy] as Point)}
                {@const center = shapeCenter({ type: 'poly', points: movedPoints })}
                {@const cx = center[0] * aspect}
                {@const cy = center[1]}
                {@const rotDeg = m.rotation * 45}
                <g transform="rotate({rotDeg}, {cx}, {cy})">
                  <polygon
                    points={movedPoints.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                    class="preview-marker-poly"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
              {/if}
            {/if}
          {/each}
        {/if}

        <!-- markerRect ドラッグ範囲プレビュー -->
        {#if previewRectBounds && (previewRectBounds.w > 0 || previewRectBounds.h > 0)}
          <rect
            x={previewRectBounds.x * aspect}
            y={previewRectBounds.y}
            width={previewRectBounds.w * aspect}
            height={previewRectBounds.h}
            class="preview-rect"
            vector-effect="non-scaling-stroke"
          />
        {/if}

        <!-- 外形編集プレビュー（半透明） -->
        {#if previewOutline}
          <polygon
            points={previewOutline.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
            class="preview-outline"
            vector-effect="non-scaling-stroke"
          />
        {/if}

        <!-- マーカー形編集プレビュー（半透明） -->
        {#if previewMarkerPoints}
          {@const targetM = markers.find((m) => m.id === previewMarkerPoints?.markerId)}
          {#if targetM}
            {@const center = shapeCenter({ type: 'poly', points: previewMarkerPoints.points })}
            {@const cx = center[0] * aspect}
            {@const cy = center[1]}
            {@const rotDeg = targetM.rotation * 45}
            <g transform="rotate({rotDeg}, {cx}, {cy})">
              <polygon
                points={previewMarkerPoints.points.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                class="preview-marker-poly"
                vector-effect="non-scaling-stroke"
              />
            </g>
          {/if}
        {/if}
      </g>
    </svg>
  {/if}
</div>

<style>
  .canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    touch-action: none;
  }

  .tool-select {
    cursor: default;
  }
  .tool-split-x {
    cursor: col-resize;
  }
  .tool-split-y {
    cursor: row-resize;
  }
  .tool-marker-point,
  .tool-marker-rect {
    cursor: crosshair;
  }
  .tool-outline-edge,
  .tool-marker-edge {
    cursor: grab;
  }
  .tool-outline-step,
  .tool-marker-step {
    cursor: crosshair;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-select: none;
  }

  .no-drawing-placeholder {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: var(--space-4);
    background: var(--bg);
  }

  .no-drawing-text {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size);
  }

  .no-drawing-note {
    margin: 0;
    max-width: 360px;
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }

  /* 目盛り */
  .grid-line {
    stroke: var(--border);
    stroke-opacity: 0.35;
    stroke-width: 1px;
  }

  /* エリア */
  .area-polygon {
    stroke: var(--border);
    stroke-width: 1px;
  }

  /* 図の中の文字は、拡大率にかかわらず画面の上で同じ大きさにする（--u は画面の1pxに当たる図の座標の長さ） */
  .area-label {
    font-family: var(--font);
    font-size: calc(16px * var(--u, 1));
    fill: var(--text);
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  .selected-area-outline {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5px;
    stroke-dasharray: 6 3;
    pointer-events: none;
  }

  .line-affected-area {
    fill: var(--accent);
    fill-opacity: 0.12;
    stroke: var(--accent);
    stroke-width: 1.5px;
    stroke-dasharray: 6 3;
    pointer-events: none;
  }

  /* 外形 */
  .kuukan-outline {
    fill: none;
    stroke: var(--text);
    stroke-width: 3px;
    pointer-events: none;
  }

  /* 仕切り線 */
  .partition-line {
    stroke: var(--text);
    stroke-width: 1.5px;
    cursor: pointer;
  }

  .partition-line.selected {
    stroke: var(--accent);
    stroke-width: 3.5px;
  }

  .partition-line-glow {
    stroke: var(--accent);
    stroke-width: 9px;
    stroke-opacity: 0.35;
    stroke-linecap: round;
    pointer-events: none;
  }

  /* マーカー */
  .marker-point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2px;
    cursor: pointer;
  }

  .marker-point.selected {
    fill: var(--focus);
    stroke: var(--surface);
    stroke-width: 2.5px;
  }


  .marker-rect,
  .marker-poly {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1.5px;
    cursor: pointer;
  }

  .marker-rect.selected,
  .marker-poly.selected {
    stroke: var(--focus);
    stroke-width: 2.5px;
  }


  .marker-label {
    font-family: var(--font);
    font-size: calc(12px * var(--u, 1));
    fill: var(--text);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
  }

  /* プレビュー */
  .preview-line {
    stroke: var(--accent);
    stroke-width: 2.5px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  .preview-marker-point {
    fill: var(--focus);
    stroke: var(--surface);
    stroke-width: 2px;
    opacity: 0.7;
    pointer-events: none;
  }

  .preview-marker-rect {
    fill: var(--accent-soft);
    stroke: var(--focus);
    stroke-width: 2px;
    stroke-dasharray: 4 4;
    opacity: 0.7;
    pointer-events: none;
  }

  .preview-marker-poly {
    fill: var(--accent-soft);
    fill-opacity: 0.35;
    stroke: var(--focus);
    stroke-width: 2px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  .preview-rect {
    fill: var(--accent-soft);
    fill-opacity: 0.35;
    stroke: var(--accent);
    stroke-width: 1.5px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  .preview-outline {
    fill: var(--accent-soft);
    fill-opacity: 0.35;
    stroke: var(--accent);
    stroke-width: 2.5px;
    stroke-dasharray: 6 3;
    pointer-events: none;
  }

  .edge-resize-handle {
    fill: var(--accent);
    stroke: #ffffff;
    stroke-width: 1.5px;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
    transition: transform var(--duration-fast);
  }

  .edge-resize-handle.marker-handle {
    fill: #2563eb;
  }

  /* ゴースト表示（配置済みモノの参考表示） */
  .ghost-items-layer {
    pointer-events: none;
    user-select: none;
  }
  .ghost-item-rect {
    fill: var(--surface);
    fill-opacity: 0.45;
    stroke: var(--text-muted);
    stroke-width: 1.5px;
    stroke-dasharray: 4 3;
    opacity: 0.7;
  }
  .ghost-item-poly {
    fill: var(--surface);
    fill-opacity: 0.45;
    stroke: var(--text-muted);
    stroke-width: 1.5px;
    stroke-dasharray: 4 3;
    opacity: 0.7;
  }
  .ghost-item-point {
    fill: var(--text-muted);
    stroke: var(--surface);
    stroke-width: 1.5px;
    opacity: 0.7;
  }
  .ghost-item-label {
    font-family: var(--font);
    font-size: calc(11px * var(--u, 1));
    fill: var(--text-muted);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
    opacity: 0.85;
  }
</style>
