<script lang="ts">
  import { getApp } from '../context';
  import { getViewUi } from './viewUi.svelte';
  import type { Id, Item, ItemDrawing, Marker, Partition, Point, Shape } from '../../core/types';
  import { COORD_MAX } from '../../core/constants';
  import type { Polygon, Rect } from '../../geometry/types';
  import { buildAreaTree } from '../../core/indexes';
  import { computeRegions, leafAt, type AreaTree } from '../../geometry/regions';
  import { decomposeToRects, boundingRect, locatePoint } from '../../geometry/polygon';
  import { shapeCenter } from '../../geometry/shape';
  import { chooseSnapStep, snap } from '../../editor/snap';
  import {
    toDisplay,
    fromDisplay,
    viewBoxOf,
    fitView,
    lineSegments,
  } from '../../editor/view';
  import { moveEdge, addStep, edgeAt } from '../../editor/outline';
  import { OpError, type OpContext } from '../../core/ops/common';
  import { kuukanOfPlace } from '../../core/places';
  import {
    setItemDrawing,
    moveItemDrawing,
    rotateItemDrawing,
    reshapeItemDrawing,
    removeItemDrawing,
  } from '../../core/ops/itemDrawings';
  import {
    undrawnCounts,
    drawingOffset,
    offsetText,
    quickSearch,
    type QuickResult,
  } from '../../view/model';

  const app = getApp();
  const ui = getViewUi();

  let containerEl = $state<HTMLDivElement | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);

  let widthPx = $state(800);
  let heightPx = $state(600);

  const doc = $derived($app.doc);
  const kuukanId = $derived($app.view?.kuukan ?? null);
  const isPlacing = $derived(Boolean($app.view?.placing));

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

  // 葉のエリア一覧
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

  // 簡易検索の結果
  const quickText = $derived(($app.view?.quick ?? '').trim());
  const quickResult = $derived.by((): QuickResult | null => {
    if (!doc || !kuukanId || !quickText) return null;
    return quickSearch(doc, kuukanId, quickText);
  });

  // 件数のマップ（簡易検索中は perPlace、通常時は undrawnCounts）
  const placeCounts = $derived.by((): Map<Id, number> => {
    if (!doc || !kuukanId) return new Map();
    if (quickResult) {
      return quickResult.perPlace;
    }
    return undrawnCounts(doc, kuukanId);
  });

  // このクウカンに置かれているモノの描画一覧
  interface KuukanItemDrawingEntry {
    drawing: ItemDrawing;
    item: Item;
    isStorage: boolean;
    storageKuukanId: Id | null;
  }

  const kuukanItemDrawings = $derived.by((): KuukanItemDrawingEntry[] => {
    if (!doc || !kuukanId) return [];
    const itemMap = new Map(doc.membership.items.map((it) => [it.id, it]));
    const list: KuukanItemDrawingEntry[] = [];
    for (const d of doc.drawing.items) {
      const it = itemMap.get(d.item);
      if (!it) continue;
      if (kuukanOfPlace(doc, it.place) === kuukanId) {
        const storageKuukan = doc.membership.kuukans.find((k) => k.owner === it.id);
        list.push({
          drawing: d,
          item: it,
          isStorage: Boolean(storageKuukan),
          storageKuukanId: storageKuukan?.id ?? null,
        });
      }
    }
    return list;
  });

  // 選ばれている描画の情報
  const selectedDrawingEntry = $derived.by(() => {
    if (!ui.selectedDrawing) return null;
    return kuukanItemDrawings.find((entry) => entry.drawing.item === ui.selectedDrawing) ?? null;
  });

  // 収納の「開く」ボタンの位置計算
  const openButtonPos = $derived.by((): { x: number; y: number } | null => {
    if (isPlacing || !selectedDrawingEntry || !selectedDrawingEntry.isStorage || !selectedDrawingEntry.storageKuukanId) {
      return null;
    }
    const shape = selectedDrawingEntry.drawing.shape;
    const center = shapeCenter(shape);
    const disp = toDisplay(center, aspect);
    const px = ((disp[0] - vb.x) / vb.w) * widthPx;
    const py = ((disp[1] - vb.y) / vb.h) * heightPx;
    return { x: px, y: py };
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

  // 全体を表示する（Canvas.svelte と同一ロジック）
  let lastFitRequest = -1;
  let lastFit: { cx: number; cy: number; scale: number } | null = null;

  $effect(() => {
    if (!kuukanDrawing || widthPx <= 0 || heightPx <= 0) return;
    const v = ui.view;
    const untouched =
      lastFit !== null && v.cx === lastFit.cx && v.cy === lastFit.cy && v.scale === lastFit.scale;
    if (lastFit === null || untouched || ui.fitRequest !== lastFitRequest) {
      lastFitRequest = ui.fitRequest;
      const next = fitView(kuukanDrawing.aspect, widthPx, heightPx, 24);
      lastFit = next;
      if (next.cx !== v.cx || next.cy !== v.cy || next.scale !== v.scale) {
        ui.view = next;
      }
    }
  });

  // クウカンが切り替わったら選択とメッセージを初期化
  let lastKuukanId = $state<Id | null>(null);
  $effect(() => {
    if (kuukanId !== lastKuukanId) {
      lastKuukanId = kuukanId;
      if (ui.selectedDrawing !== null) ui.selectedDrawing = null;
      if (ui.attachTarget !== null) ui.attachTarget = null;
      if (ui.message !== null) ui.message = null;
    }
  });

  // 文書が変わって選んでいる描画や付ける相手が消えたら null に戻す
  $effect(() => {
    if (!doc) {
      if (ui.selectedDrawing !== null) ui.selectedDrawing = null;
      if (ui.attachTarget !== null) ui.attachTarget = null;
      return;
    }
    if (ui.selectedDrawing !== null) {
      const exists = doc.drawing.items.some((d) => d.item === ui.selectedDrawing);
      if (!exists) {
        ui.selectedDrawing = null;
      }
    }
    if (ui.attachTarget !== null) {
      const exists = doc.membership.items.some((it) => it.id === ui.attachTarget);
      if (!exists) {
        ui.attachTarget = null;
      }
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
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  });

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

  // エリア名ラベルの位置（最も左上の長方形）
  function getTopLeftRect(poly: Polygon): Rect {
    const rects = decomposeToRects(poly);
    if (rects.length === 0) {
      return boundingRect(poly);
    }
    let best = rects[0]!;
    for (let i = 1; i < rects.length; i++) {
      const r = rects[i]!;
      if (r.y0 < best.y0 || (r.y0 === best.y0 && r.x0 < best.x0)) {
        best = r;
      }
    }
    return best;
  }

  function areaDisplayName(nodeId: Id): string {
    if (nodeId === kuukanId) {
      return kuukanModel?.name ?? kuukanModel?.areaLabel ?? 'エリア';
    }
    const a = doc?.membership.areas.find((ar) => ar.id === nodeId);
    return a?.name ?? 'エリア';
  }

  const AREA_FILLS = [
    'rgba(47, 111, 94, 0.08)',
    'rgba(61, 139, 253, 0.08)',
    'rgba(138, 90, 0, 0.08)',
    'rgba(179, 65, 46, 0.08)',
    'rgba(120, 80, 180, 0.08)',
    'rgba(30, 150, 150, 0.08)',
  ];

  // 描画の形を多角形の頂点列に変換（長方形は4点の多角形として扱う）
  function shapeToPolyPoints(shape: Shape): Point[] | null {
    if (shape.type === 'poly') return shape.points;
    if (shape.type === 'rect') {
      return [
        [shape.x, shape.y],
        [shape.x + shape.w, shape.y],
        [shape.x + shape.w, shape.y + shape.h],
        [shape.x, shape.y + shape.h],
      ];
    }
    return null;
  }

  // 表示座標での中心まわりの逆回転を適用して比率座標に戻す
  function toLocalRatio(p: Point, shape: Shape, rot: number): Point {
    if (rot === 0) return p;
    const c = shapeCenter(shape);
    const cDispX = c[0] * aspect;
    const cDispY = c[1];
    const pDispX = p[0] * aspect;
    const pDispY = p[1];
    const rad = (-rot * 45 * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = pDispX - cDispX;
    const dy = pDispY - cDispY;
    const unrotDispX = cDispX + dx * cos - dy * sin;
    const unrotDispY = cDispY + dx * sin + dy * cos;
    return [unrotDispX / aspect, unrotDispY];
  }

  // 描画の当たり判定
  function hitDrawing(entry: KuukanItemDrawingEntry, pRatio: Point): boolean {
    const d = entry.drawing;
    const shape = d.shape;
    const rot = d.rotation ?? 0;

    if (shape.type === 'point') {
      const [atX, atY] = shape.at;
      const distDisp = Math.hypot((pRatio[0] - atX) * aspect, pRatio[1] - atY);
      return distDisp <= 12 / ui.view.scale;
    }

    const unrotP = toLocalRatio(pRatio, shape, rot);
    if (shape.type === 'rect') {
      return (
        unrotP[0] >= shape.x &&
        unrotP[0] <= shape.x + shape.w &&
        unrotP[1] >= shape.y &&
        unrotP[1] <= shape.y + shape.h
      );
    }
    if (shape.type === 'poly') {
      return locatePoint(shape.points, unrotP) !== 'outside';
    }
    return false;
  }

  // ドラッグ操作の状態管理
  type DragMode =
    | { kind: 'pan'; lastX: number; lastY: number }
    | { kind: 'attachRect'; startP: Point }
    | { kind: 'moveDrawing'; id: Id; startP: Point }
    | {
        kind: 'drawingEdge';
        id: Id;
        edgeIndex: number;
        startP: Point;
        points: Point[];
        rotation: number;
      }
    | {
        kind: 'drawingStep';
        id: Id;
        edgeIndex: number;
        at: number;
        side: 'start' | 'end';
        isHoriz: boolean;
        startP: Point;
        points: Point[];
        rotation: number;
      };

  let activeDrag = $state<DragMode | null>(null);
  let pointerStartClient = $state<[number, number] | null>(null);
  let hasMoved = $state(false);

  // プレビュー表示用状態
  let previewRectBounds = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let previewDrawingDelta = $state<{ dx: number; dy: number } | null>(null);
  let previewReshapePoints = $state<Point[] | null>(null);

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
    const tol12 = 12 / minUnitScale;

    if (isPlacing) {
      // 1. 付ける相手がいるとき
      if (ui.attachTarget !== null) {
        if (ui.attachTool === 'rect') {
          activeDrag = { kind: 'attachRect', startP: snapPoint(pRatio) };
        } else {
          activeDrag = null;
        }
        return;
      }

      // 2. 既存の描画を押したか判定
      const hitEntry = kuukanItemDrawings
        .slice()
        .reverse()
        .find((entry) => hitDrawing(entry, pRatio));

      if (hitEntry) {
        ui.selectedDrawing = hitEntry.drawing.item;
        ui.message = null;

        if (ui.shapeTool === 'move') {
          activeDrag = { kind: 'moveDrawing', id: hitEntry.drawing.item, startP: pRatio };
          return;
        }

        const pts = shapeToPolyPoints(hitEntry.drawing.shape);
        if (pts) {
          const rot = hitEntry.drawing.rotation ?? 0;
          const unrotP = toLocalRatio(pRatio, hitEntry.drawing.shape, rot);
          const edgeIndex = edgeAt(pts, unrotP, tol12);

          if (edgeIndex !== null) {
            if (ui.shapeTool === 'edge') {
              activeDrag = {
                kind: 'drawingEdge',
                id: hitEntry.drawing.item,
                edgeIndex,
                startP: unrotP,
                points: pts,
                rotation: rot,
              };
              return;
            }
            if (ui.shapeTool === 'step') {
              const p1 = pts[edgeIndex]!;
              const p2 = pts[(edgeIndex + 1) % pts.length]!;
              const isHoriz = p1[1] === p2[1];
              const at = isHoriz ? snap(unrotP[0], stepX) : snap(unrotP[1], stepY);
              const side: 'start' | 'end' = isHoriz
                ? Math.abs(at - p2[0]) < Math.abs(at - p1[0]) ? 'end' : 'start'
                : Math.abs(at - p2[1]) < Math.abs(at - p1[1]) ? 'end' : 'start';

              activeDrag = {
                kind: 'drawingStep',
                id: hitEntry.drawing.item,
                edgeIndex,
                at,
                side,
                isHoriz,
                startP: unrotP,
                points: pts,
                rotation: rot,
              };
              return;
            }
          }
        }
        activeDrag = null;
        return;
      }

      // 空白領域なら pan
      activeDrag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }

    // 配置モードでないときは移動（3px以上動けば pan）
    activeDrag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
  }

  function handlePointerMove(e: PointerEvent) {
    if (touchPointers.has(e.pointerId)) {
      touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

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

    if (activeDrag.kind === 'attachRect') {
      const p1 = snapPoint(pRatio);
      const p0 = activeDrag.startP;
      const x = Math.min(p0[0], p1[0]);
      const y = Math.min(p0[1], p1[1]);
      const w = Math.abs(p1[0] - p0[0]);
      const h = Math.abs(p1[1] - p0[1]);
      previewRectBounds = { x, y, w, h };
      return;
    }

    if (activeDrag.kind === 'moveDrawing') {
      const rawDx = pRatio[0] - activeDrag.startP[0];
      const rawDy = pRatio[1] - activeDrag.startP[1];
      const dx = snap(rawDx, stepX);
      const dy = snap(rawDy, stepY);
      previewDrawingDelta = { dx, dy };
      return;
    }

    if (activeDrag.kind === 'drawingEdge') {
      const unrotP = toLocalRatio(pRatio, { type: 'poly', points: activeDrag.points }, activeDrag.rotation);
      const pts = activeDrag.points;
      const p1 = pts[activeDrag.edgeIndex]!;
      const p2 = pts[(activeDrag.edgeIndex + 1) % pts.length]!;
      const isHoriz = p1[1] === p2[1];
      const rawDelta = isHoriz ? unrotP[1] - activeDrag.startP[1] : unrotP[0] - activeDrag.startP[0];
      const delta = snap(rawDelta, isHoriz ? stepY : stepX);
      previewReshapePoints = delta !== 0 ? moveEdge(pts, activeDrag.edgeIndex, delta) : null;
      return;
    }

    if (activeDrag.kind === 'drawingStep') {
      const unrotP = toLocalRatio(pRatio, { type: 'poly', points: activeDrag.points }, activeDrag.rotation);
      const rawDepth = activeDrag.isHoriz
        ? unrotP[1] - activeDrag.startP[1]
        : unrotP[0] - activeDrag.startP[0];
      const depth = snap(rawDepth, activeDrag.isHoriz ? stepY : stepX);
      previewReshapePoints =
        depth !== 0
          ? addStep(
              activeDrag.points,
              activeDrag.edgeIndex,
              activeDrag.at,
              depth,
              activeDrag.side,
            )
          : null;
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
    previewRectBounds = null;
    previewDrawingDelta = null;
    previewReshapePoints = null;

    if (!kuukanDrawing || !kuukanId || !doc) return;

    // クリック・タップ操作（3px 未満の移動）
    if (!wasMoved) {
      if (isPlacing) {
        if (ui.attachTarget !== null && ui.attachTool === 'point') {
          const p = snapPoint(pRatio);
          applySetItemDrawing(ui.attachTarget, { type: 'point', at: p });
          return;
        }

        const hitEntry = kuukanItemDrawings
          .slice()
          .reverse()
          .find((entry) => hitDrawing(entry, pRatio));

        if (hitEntry) {
          ui.selectedDrawing = hitEntry.drawing.item;
        } else {
          ui.selectedDrawing = null;
        }
        return;
      }

      // 通常モードでのクリック判定
      const hitEntry = kuukanItemDrawings
        .slice()
        .reverse()
        .find((entry) => hitDrawing(entry, pRatio));

      if (hitEntry) {
        if (hitEntry.isStorage) {
          ui.selectedDrawing = hitEntry.drawing.item;
        } else {
          ui.selectedDrawing = null;
          app.showDetail(hitEntry.item.id);
        }
        return;
      }

      // エリア判定
      if (regions && kuukanGeometry) {
        const leafId = leafAt(regions, kuukanGeometry.tree, pRatio);
        if (leafId) {
          app.selectViewArea($app.view?.area === leafId ? null : leafId);
          ui.selectedDrawing = null;
          return;
        }
        // 葉に当たらない（線の上など）ときは、選択を変えない。クウカンそのものはエリアではないので選ばない
        const rootPoly = regions.get(kuukanGeometry.tree.root);
        if (rootPoly && locatePoint(rootPoly, pRatio) !== 'outside') {
          ui.selectedDrawing = null;
          return;
        }
      }

      // 外形の外
      app.selectViewArea(null);
      ui.selectedDrawing = null;
      return;
    }

    // ドラッグ完了操作（3px 以上の移動）
    if (currentDrag) {
      if (currentDrag.kind === 'attachRect' && ui.attachTarget !== null) {
        const p1 = snapPoint(pRatio);
        const p0 = currentDrag.startP;
        const x = Math.min(p0[0], p1[0]);
        const y = Math.min(p0[1], p1[1]);
        const w = Math.abs(p1[0] - p0[0]);
        const h = Math.abs(p1[1] - p0[1]);
        if (w >= stepX && h >= stepY) {
          applySetItemDrawing(ui.attachTarget, { type: 'rect', x, y, w, h });
        }
        return;
      }

      if (currentDrag.kind === 'moveDrawing') {
        const rawDx = pRatio[0] - currentDrag.startP[0];
        const rawDy = pRatio[1] - currentDrag.startP[1];
        const dx = snap(rawDx, stepX);
        const dy = snap(rawDy, stepY);
        if (dx !== 0 || dy !== 0) {
          applyMoveItemDrawing(currentDrag.id, dx, dy);
        }
        return;
      }

      if (currentDrag.kind === 'drawingEdge') {
        const unrotP = toLocalRatio(pRatio, { type: 'poly', points: currentDrag.points }, currentDrag.rotation);
        const pts = currentDrag.points;
        const p1 = pts[currentDrag.edgeIndex]!;
        const p2 = pts[(currentDrag.edgeIndex + 1) % pts.length]!;
        const isHoriz = p1[1] === p2[1];
        const rawDelta = isHoriz ? unrotP[1] - currentDrag.startP[1] : unrotP[0] - currentDrag.startP[0];
        const delta = snap(rawDelta, isHoriz ? stepY : stepX);
        if (delta !== 0) {
          const nextPoly = moveEdge(pts, currentDrag.edgeIndex, delta);
          if (nextPoly) {
            applyReshapeItemDrawing(currentDrag.id, { type: 'poly', points: nextPoly });
          }
        }
        return;
      }

      if (currentDrag.kind === 'drawingStep') {
        const unrotP = toLocalRatio(pRatio, { type: 'poly', points: currentDrag.points }, currentDrag.rotation);
        const rawDepth = currentDrag.isHoriz
          ? unrotP[1] - currentDrag.startP[1]
          : unrotP[0] - currentDrag.startP[0];
        const depth = snap(rawDepth, currentDrag.isHoriz ? stepY : stepX);
        if (depth !== 0) {
          const nextPoly = addStep(
            currentDrag.points,
            currentDrag.edgeIndex,
            currentDrag.at,
            depth,
            currentDrag.side,
          );
          if (nextPoly) {
            applyReshapeItemDrawing(currentDrag.id, { type: 'poly', points: nextPoly });
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
    previewRectBounds = null;
    previewDrawingDelta = null;
    previewReshapePoints = null;
  }

  // 操作実行ヘルパー（OpError を受け取って ui.message に反映）
  function applySetItemDrawing(targetId: Id, shape: Shape) {
    if (!doc) return;
    const dummyCtx: OpContext = { newId: () => '', now: () => '' };
    try {
      setItemDrawing(doc, targetId, { shape }, dummyCtx);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        ui.message = err.message;
        return;
      }
      throw err;
    }
    const res = app.apply((d, ctx) => setItemDrawing(d, targetId, { shape }, ctx));
    if (res) {
      ui.attachTarget = null;
      ui.selectedDrawing = targetId;
      ui.message = null;
    }
  }

  function applyMoveItemDrawing(itemId: Id, dx: number, dy: number) {
    if (!doc) return;
    try {
      moveItemDrawing(doc, itemId, dx, dy);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        ui.message = err.message;
        return;
      }
      throw err;
    }
    const res = app.apply((d) => moveItemDrawing(d, itemId, dx, dy));
    if (res) {
      ui.message = null;
    }
  }

  function applyRotateItemDrawing(step: 1 | -1) {
    if (!doc || !ui.selectedDrawing) return;
    const itemId = ui.selectedDrawing;
    try {
      rotateItemDrawing(doc, itemId, step);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        ui.message = err.message;
        return;
      }
      throw err;
    }
    const res = app.apply((d) => rotateItemDrawing(d, itemId, step));
    if (res) {
      ui.message = null;
    }
  }

  function applyReshapeItemDrawing(itemId: Id, shape: Shape) {
    if (!doc) return;
    try {
      reshapeItemDrawing(doc, itemId, shape);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        ui.message = err.message;
        return;
      }
      throw err;
    }
    const res = app.apply((d) => reshapeItemDrawing(d, itemId, shape));
    if (res) {
      ui.message = null;
    }
  }

  function applyRemoveItemDrawing() {
    if (!doc || !ui.selectedDrawing) return;
    const itemId = ui.selectedDrawing;
    try {
      removeItemDrawing(doc, itemId);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        ui.message = err.message;
        return;
      }
      throw err;
    }
    const res = app.apply((d) => removeItemDrawing(d, itemId));
    if (res) {
      ui.selectedDrawing = null;
      ui.message = null;
    }
  }

  // 道具バーのズーム操作
  function zoomIn() {
    ui.view.scale = Math.round(ui.view.scale * 1.25 * 1000) / 1000;
  }

  function zoomOut() {
    ui.view.scale = Math.round(ui.view.scale * 0.8 * 1000) / 1000;
  }

  function fitAll() {
    ui.fitRequest++;
  }

  // 収納の「開く」ボタンを押したときの処理
  function handleOpenStorage(e: MouseEvent) {
    e.stopPropagation();
    if (selectedDrawingEntry?.storageKuukanId) {
      app.openView(selectedDrawingEntry.storageKuukanId);
      ui.selectedDrawing = null;
    }
  }

  function itemNameOf(id: Id | null): string {
    if (!id || !doc) return '';
    return doc.membership.items.find((it) => it.id === id)?.name ?? '';
  }

  // 案内の帯：何をする所か（what）と、どう使うか（how）
  const hint = $derived.by((): { what: string; how: string } => {
    if (!isPlacing) {
      return {
        what: 'エリアを押すと、そのエリアのモノがリストに並びます',
        how: 'もう一度押すと元に戻ります。収納の描画を押すと「開く」が出ます。描画を付けたり動かしたりするには、上の「配置モード」へ。',
      };
    }
    if (ui.attachTarget !== null) {
      return ui.attachTool === 'point'
        ? { what: `「${itemNameOf(ui.attachTarget)}」を点で描きます`, how: '置きたい所を押してください。' }
        : { what: `「${itemNameOf(ui.attachTarget)}」を長方形で描きます`, how: '図の上をドラッグして範囲を描いてください。' };
    }
    if (ui.selectedDrawing !== null) {
      const name = itemNameOf(ui.selectedDrawing);
      if (ui.shapeTool === 'edge') return { what: `「${name}」の辺を動かします`, how: '辺を押したまま、動かしたい方へドラッグしてください。' };
      if (ui.shapeTool === 'step') return { what: `「${name}」に段差を足します`, how: '辺の上を押し、辺と直角の向きへドラッグしてください。' };
      return { what: `「${name}」を動かします`, how: '描画をドラッグしてください。置き場の外に出すと「ずれ」の印が付きます（置き場は変わりません）。' };
    }
    return {
      what: '配置モード：モノの描画を付ける・動かす・回す・外す',
      how: '右のリストで「描画を付ける」を押すか、図の上の描画を押して選んでください。',
    };
  });

  const selectedShapeIsRectOrPoly = $derived.by(() => {
    if (!selectedDrawingEntry) return false;
    const t = selectedDrawingEntry.drawing.shape.type;
    return t === 'rect' || t === 'poly';
  });
</script>

<div class="view-canvas-container" bind:this={containerEl}>
  <!-- 道具の列（配置モードの間はいつも出す） -->
  {#if isPlacing}
    <div class="view-toolbar" role="toolbar" aria-label="配置モードの道具">
      {#if ui.attachTarget !== null}
        <div class="tool-group">
          <span class="group-title">描画を付ける：{itemNameOf(ui.attachTarget)}</span>
          <div class="group-buttons">
            <button type="button" class="tool-btn" class:active={ui.attachTool === 'point'} aria-pressed={ui.attachTool === 'point'} title="図を押した位置に、点で描きます" onclick={() => { ui.attachTool = 'point'; }}>点で描く</button>
            <button type="button" class="tool-btn" class:active={ui.attachTool === 'rect'} aria-pressed={ui.attachTool === 'rect'} title="図の上をドラッグして、長方形で描きます" onclick={() => { ui.attachTool = 'rect'; }}>長方形で描く</button>
            <button type="button" class="tool-btn" title="描画を付けるのをやめます" onclick={() => { ui.attachTarget = null; ui.message = null; }}>やめる</button>
          </div>
        </div>
      {:else if ui.selectedDrawing !== null}
        <div class="tool-group">
          <span class="group-title">選んだ描画：{itemNameOf(ui.selectedDrawing)}</span>
          <div class="group-buttons">
            <button type="button" class="tool-btn" class:active={ui.shapeTool === 'move'} aria-pressed={ui.shapeTool === 'move'} title="描画をドラッグして動かします" onclick={() => { ui.shapeTool = 'move'; }}>動かす</button>
            {#if selectedShapeIsRectOrPoly}
              <button type="button" class="tool-btn" class:active={ui.shapeTool === 'edge'} aria-pressed={ui.shapeTool === 'edge'} title="描画の辺をドラッグして、大きさを変えます" onclick={() => { ui.shapeTool = 'edge'; }}>辺を動かす</button>
              <button type="button" class="tool-btn" class:active={ui.shapeTool === 'step'} aria-pressed={ui.shapeTool === 'step'} title="描画の辺に段差を付けて、L字などにします" onclick={() => { ui.shapeTool = 'step'; }}>段差を足す</button>
            {/if}
          </div>
        </div>
        <div class="tool-group">
          <span class="group-title">向き</span>
          <div class="group-buttons">
            <button type="button" class="tool-btn" onclick={() => applyRotateItemDrawing(-1)} title="左に45度回します">⟲ 左に回す</button>
            <button type="button" class="tool-btn" onclick={() => applyRotateItemDrawing(1)} title="右に45度回します">⟳ 右に回す</button>
          </div>
        </div>
        <div class="tool-group">
          <span class="group-title">&nbsp;</span>
          <div class="group-buttons">
            <button type="button" class="tool-btn danger" onclick={applyRemoveItemDrawing} title="このモノの描画を外します（モノと置き場はそのまま）">描画を外す</button>
            <button type="button" class="tool-btn" onclick={() => { ui.selectedDrawing = null; ui.message = null; }} title="選ぶのをやめます">選ぶのをやめる</button>
          </div>
        </div>
      {:else}
        <div class="toolbar-placeholder">
          右（スマホでは下）のリストで『描画を付ける』を押すか、図の描画を押して選びます
        </div>
      {/if}
    </div>
  {/if}

  <!-- 案内の帯（1行表示。how は title に入れ、右端に「？」ボタン） -->
  <div
    class="view-message-bar"
    class:has-error={ui.message !== null}
    aria-live="polite"
    title={ui.message ?? (hint.how ? `${hint.what} — ${hint.how}` : hint.what)}
  >
    <span class="hint-what">{ui.message ?? hint.what}</span>
    <button
      type="button"
      class="hint-help-btn"
      onclick={() => app.openHelp()}
      title="ヘルプを見る"
      aria-label="ヘルプ"
    >
      ？
    </button>
  </div>

  <!-- 図の表示領域 -->
  <div class="svg-wrapper">
    {#if kuukanDrawing}
      <div class="zoom-float" role="group" aria-label="表示">
        <button type="button" class="small" onclick={zoomIn} title="拡大します（ホイール・2本指でも）" aria-label="拡大">＋</button>
        <button type="button" class="small" onclick={zoomOut} title="縮小します" aria-label="縮小">−</button>
        <button type="button" class="small" onclick={fitAll} title="図の全体が見えるように戻します">
          <span class="fit-label-full">全体を表示</span>
          <span class="fit-label-short">全体</span>
        </button>
      </div>
    {/if}
    {#if !kuukanDrawing}
      <div class="no-drawing-placeholder">
        <p class="no-drawing-text">このクウカンには描画情報が設定されていません</p>
      </div>
    {:else}
      <svg
        role="application"
        aria-label="クウカンビューの図"
        bind:this={svgEl}
        viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
        style:--u={1 / ui.view.scale}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerCancel}
      >

        <!-- 1. エリアの領域 -->
        <g class="areas-layer">
          {#if regions}
            {#each leafNodes as leafId, idx}
              {@const poly = regions.get(leafId)}
              {#if poly}
                {@const ptsStr = poly.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                {@const rect = getTopLeftRect(poly)}
                {@const labelX = rect.x0 * aspect + 8 / ui.view.scale}
                {@const labelY = rect.y0 + 8 / ui.view.scale}
                {@const isAreaHighlighted = Boolean(quickResult && (quickResult.perPlace.get(leafId) ?? 0) > 0)}
                <polygon
                  points={ptsStr}
                  class="area-polygon"
                  class:selected={$app.view?.area === leafId}
                  class:highlighted={isAreaHighlighted}
                  style="fill: {isAreaHighlighted ? 'var(--accent-soft)' : AREA_FILLS[idx % AREA_FILLS.length]};"
                  vector-effect="non-scaling-stroke"
                />
                <text
                  x={labelX}
                  y={labelY}
                  class="area-label"
                  text-anchor="start"
                  dominant-baseline="hanging"
                >
                  {areaDisplayName(leafId)}
                </text>
              {/if}
            {/each}

            <!-- 選択されたエリアの強調枠線 -->
            {#if $app.view?.area && regions.get($app.view.area)}
              {@const selPoly = regions.get($app.view.area)!}
              <polygon
                points={selPoly.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                class="selected-area-outline"
                vector-effect="non-scaling-stroke"
              />
            {/if}
          {/if}
        </g>

        <!-- 2. 外形 -->
        <g class="outline-layer">
          <polygon
            points={kuukanDrawing.outline.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
            class="kuukan-outline"
            vector-effect="non-scaling-stroke"
          />
        </g>

        <!-- 3. 仕切りの線 -->
        <g class="partitions-layer">
          {#each displayedLineSegments as seg}
            <line
              x1={seg.from[0] * aspect}
              y1={seg.from[1]}
              x2={seg.to[0] * aspect}
              y2={seg.to[1]}
              class="partition-line"
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </g>

        <!-- 4. マーカー -->
        <g class="markers-layer">
          {#each markers as m}
            {#if m.shape.type === 'point'}
              {@const [mx, my] = m.shape.at}
              <circle
                cx={mx * aspect}
                cy={my}
                r={7 / ui.view.scale}
                class="marker-point"
                vector-effect="non-scaling-stroke"
              >
              </circle>
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
                  vector-effect="non-scaling-stroke"
                >
                </rect>
                <text
                  x={cx}
                  y={cy}
                  class="marker-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {m.name}
                </text>
              </g>
            {/if}
          {/each}
        </g>

        <!-- 5. 件数表示（V4・R-B6） -->
        <g class="counts-layer">
          <!-- 葉のエリアの件数（エリア名のすぐ下に背景つきの小さな札） -->
          {#if regions}
            {#each leafNodes as leafId}
              {@const count = placeCounts.get(leafId) ?? 0}
              {#if count > 0}
                {@const poly = regions.get(leafId)}
                {#if poly}
                  {@const rect = getTopLeftRect(poly)}
                  {@const badgeX = rect.x0 * aspect + 8 / ui.view.scale}
                  {@const badgeY = rect.y0 + 8 / ui.view.scale + 20 / ui.view.scale}
                  {@const countStr = `${count}件`}
                  {@const badgeW = (16 + countStr.length * 8) / ui.view.scale}
                  {@const badgeH = 18 / ui.view.scale}
                  <g class="area-count-badge">
                    <rect
                      x={badgeX}
                      y={badgeY}
                      width={badgeW}
                      height={badgeH}
                      rx={4 / ui.view.scale}
                      class="area-count-rect"
                      vector-effect="non-scaling-stroke"
                    />
                    <text
                      x={badgeX + badgeW / 2}
                      y={badgeY + badgeH / 2}
                      class="area-count-text"
                      text-anchor="middle"
                      dominant-baseline="central"
                    >
                      {countStr}
                    </text>
                  </g>
                {/if}
              {/if}
            {/each}
          {/if}

          <!-- 途中のエリアとクウカンそのもの（仕切りがあるとき）の件数：仕切り線の中点の小さな札 -->
          {#if kuukanGeometry}
            {#each [kuukanId, ...[...kuukanGeometry.tree.children.keys()]] as nodeId}
              {#if nodeId}
                {@const count = placeCounts.get(nodeId) ?? 0}
                {#if count > 0 && (kuukanGeometry.tree.children.get(nodeId)?.length ?? 0) > 0}
                  {@const nodeSeg = displayedLineSegments.find((s) => s.node === nodeId)}
                  {#if nodeSeg}
                    {@const midX = ((nodeSeg.from[0] + nodeSeg.to[0]) / 2) * aspect}
                    {@const midY = (nodeSeg.from[1] + nodeSeg.to[1]) / 2}
                    {@const badgeW = 34 / ui.view.scale}
                    {@const badgeH = 18 / ui.view.scale}
                    <g class="partition-count-badge">
                      <rect
                        x={midX - badgeW / 2}
                        y={midY - badgeH / 2}
                        width={badgeW}
                        height={badgeH}
                        rx={4 / ui.view.scale}
                        class="partition-count-rect"
                        vector-effect="non-scaling-stroke"
                      />
                      <text
                        x={midX}
                        y={midY}
                        class="partition-count-text"
                        text-anchor="middle"
                        dominant-baseline="central"
                      >
                        {count}件
                      </text>
                    </g>
                  {/if}
                {/if}
              {/if}
            {/each}
          {/if}

          <!-- 仕切りがないクウカンそのものの件数：外形の中央 -->
          {#if (!kuukanGeometry || displayedLineSegments.length === 0) && kuukanId}
            {@const count = placeCounts.get(kuukanId) ?? 0}
            {#if count > 0}
              {@const b = boundingRect(kuukanDrawing.outline)}
              {@const cx = ((b.x0 + b.x1) / 2) * aspect}
              {@const cy = (b.y0 + b.y1) / 2}
              <text
                x={cx}
                y={cy}
                class="kuukan-count-text"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {count}件
              </text>
            {/if}
          {/if}
        </g>

        <!-- 6. モノと収納の描画 -->
        <g class="items-layer">
          {#each kuukanItemDrawings as entry}
            {@const d = entry.drawing}
            {@const it = entry.item}
            {@const isSelected = ui.selectedDrawing === it.id}
            {@const isFocus = $app.view?.focus === it.id}
            {@const isHighlight = $app.highlights.has(it.id)}
            {@const isDirect = Boolean(quickResult?.direct.has(it.id))}
            {@const insideCount = entry.isStorage ? quickResult?.insideStorage.get(it.id) ?? 0 : 0}
            {@const isQuickStorage = insideCount > 0}
            {@const off = doc ? drawingOffset(doc, it.id) : null}
            {@const isOff = off?.kind === 'off'}
            {@const center = shapeCenter(d.shape)}
            {@const cxDisp = center[0] * aspect}
            {@const cy = center[1]}
            {@const rotDeg = (d.rotation ?? 0) * 45}

            <g
              class="item-drawing-group"
              class:selected={isSelected}
              class:focus={isFocus}
              class:highlight={isHighlight}
              class:quick-direct={isDirect}
              class:quick-storage={isQuickStorage}
              transform={rotDeg !== 0 ? `rotate(${rotDeg}, ${cxDisp}, ${cy})` : undefined}
            >
              {#if d.shape.type === 'point'}
                {@const px = d.shape.at[0] * aspect}
                {@const py = d.shape.at[1]}
                {@const r = 8 / ui.view.scale}
                <circle
                  cx={px}
                  cy={py}
                  r={r}
                  class="item-point"
                  class:storage={entry.isStorage}
                  vector-effect="non-scaling-stroke"
                />
                {#if entry.isStorage}
                  <circle
                    cx={px}
                    cy={py}
                    r={r * 0.55}
                    class="item-point-inner"
                    vector-effect="non-scaling-stroke"
                  />
                {/if}
                <text
                  x={px}
                  y={py + r + 10 / ui.view.scale}
                  class="item-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {it.name}
                </text>
                {#if entry.isStorage && insideCount > 0}
                  <text
                    x={px}
                    y={py + r + 22 / ui.view.scale}
                    class="item-inside-count"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    中に{insideCount}件
                  </text>
                {/if}

                {#if isOff && off}
                  <g class="offset-badge" transform="translate({px + r}, {py - r})">
                    <circle r={6 / ui.view.scale} class="offset-badge-bg" />
                    <text class="offset-badge-text" text-anchor="middle" dominant-baseline="central">!</text>
                    <title>{doc ? offsetText(doc, it.id, off) : ''}</title>
                  </g>
                {/if}
              {:else if d.shape.type === 'rect'}
                {@const rx = d.shape.x * aspect}
                {@const ry = d.shape.y}
                {@const rw = d.shape.w * aspect}
                {@const rh = d.shape.h}
                <rect
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  class="item-rect"
                  class:storage={entry.isStorage}
                  vector-effect="non-scaling-stroke"
                />
                {#if entry.isStorage}
                  {@const gap = Math.min(rw * 0.12, rh * 0.12, 4 / ui.view.scale)}
                  <rect
                    x={rx + gap}
                    y={ry + gap}
                    width={Math.max(1, rw - 2 * gap)}
                    height={Math.max(1, rh - 2 * gap)}
                    class="item-rect-inner"
                    vector-effect="non-scaling-stroke"
                  />
                {/if}
                <text
                  x={rx + rw / 2}
                  y={entry.isStorage && insideCount > 0 ? ry + rh / 2 - 6 / ui.view.scale : ry + rh / 2}
                  class="item-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {it.name}
                </text>
                {#if entry.isStorage && insideCount > 0}
                  <text
                    x={rx + rw / 2}
                    y={ry + rh / 2 + 8 / ui.view.scale}
                    class="item-inside-count"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    中に{insideCount}件
                  </text>
                {/if}

                {#if isOff && off}
                  <g class="offset-badge" transform="translate({rx + rw}, {ry})">
                    <circle r={6 / ui.view.scale} class="offset-badge-bg" />
                    <text class="offset-badge-text" text-anchor="middle" dominant-baseline="central">!</text>
                    <title>{doc ? offsetText(doc, it.id, off) : ''}</title>
                  </g>
                {/if}
              {:else if d.shape.type === 'poly'}
                {@const ptsStr = d.shape.points.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                {@const b = boundingRect(d.shape.points)}
                <polygon
                  points={ptsStr}
                  class="item-poly"
                  class:storage={entry.isStorage}
                  vector-effect="non-scaling-stroke"
                />
                {#if entry.isStorage}
                  <polygon
                    points={ptsStr}
                    class="item-poly-inner"
                    vector-effect="non-scaling-stroke"
                  />
                {/if}
                <text
                  x={cxDisp}
                  y={entry.isStorage && insideCount > 0 ? cy - 6 / ui.view.scale : cy}
                  class="item-label"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {it.name}
                </text>
                {#if entry.isStorage && insideCount > 0}
                  <text
                    x={cxDisp}
                    y={cy + 8 / ui.view.scale}
                    class="item-inside-count"
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    中に{insideCount}件
                  </text>
                {/if}

                {#if isOff && off}
                  <g class="offset-badge" transform="translate({b.x1 * aspect}, {b.y0})">
                    <circle r={6 / ui.view.scale} class="offset-badge-bg" />
                    <text class="offset-badge-text" text-anchor="middle" dominant-baseline="central">!</text>
                    <title>{doc ? offsetText(doc, it.id, off) : ''}</title>
                  </g>
                {/if}
              {/if}
            </g>
          {/each}
        </g>

        <!-- 7. プレビュー層（ドラッグ操作中） -->
        <g class="preview-layer">
          <!-- 長方形の追加プレビュー -->
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

          <!-- 描画の移動プレビュー -->
          {#if previewDrawingDelta && selectedDrawingEntry}
            {@const d = selectedDrawingEntry.drawing}
            {@const dx = previewDrawingDelta.dx}
            {@const dy = previewDrawingDelta.dy}
            {@const center = shapeCenter(d.shape)}
            {@const cxDisp = (center[0] + dx) * aspect}
            {@const cy = center[1] + dy}
            {@const rotDeg = (d.rotation ?? 0) * 45}

            <g transform={rotDeg !== 0 ? `rotate(${rotDeg}, ${cxDisp}, ${cy})` : undefined}>
              {#if d.shape.type === 'point'}
                <circle
                  cx={(d.shape.at[0] + dx) * aspect}
                  cy={d.shape.at[1] + dy}
                  r={8 / ui.view.scale}
                  class="preview-drawing"
                  vector-effect="non-scaling-stroke"
                />
              {:else if d.shape.type === 'rect'}
                <rect
                  x={(d.shape.x + dx) * aspect}
                  y={d.shape.y + dy}
                  width={d.shape.w * aspect}
                  height={d.shape.h}
                  class="preview-drawing"
                  vector-effect="non-scaling-stroke"
                />
              {:else if d.shape.type === 'poly'}
                <polygon
                  points={d.shape.points
                    .map((p) => `${(p[0] + dx) * aspect},${p[1] + dy}`)
                    .join(' ')}
                  class="preview-drawing"
                  vector-effect="non-scaling-stroke"
                />
              {/if}
            </g>
          {/if}

          <!-- 辺の移動・段差追加のプレビュー -->
          {#if previewReshapePoints && selectedDrawingEntry}
            {@const d = selectedDrawingEntry.drawing}
            {@const center = shapeCenter(d.shape)}
            {@const cxDisp = center[0] * aspect}
            {@const cy = center[1]}
            {@const rotDeg = (d.rotation ?? 0) * 45}
            <g transform={rotDeg !== 0 ? `rotate(${rotDeg}, ${cxDisp}, ${cy})` : undefined}>
              <polygon
                points={previewReshapePoints.map((p) => `${p[0] * aspect},${p[1]}`).join(' ')}
                class="preview-reshape"
                vector-effect="non-scaling-stroke"
              />
            </g>
          {/if}
        </g>
      </svg>

      <!-- 収納の「開く」ボタン（図の上に絶対位置で重ねる） -->
      {#if openButtonPos}
        <button
          type="button"
          class="primary small storage-open-btn"
          style="left: {openButtonPos.x}px; top: {openButtonPos.y - 20}px;"
          onclick={handleOpenStorage}
        >
          開く
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .view-canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  /* 道具の列（配置モードの間はいつも1行固定の高さで出す） */
  .view-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-3);
    height: 52px;
    min-height: 52px;
    max-height: 52px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    flex-shrink: 0;
    z-index: 5;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .group-title {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .group-buttons {
    display: flex;
    gap: var(--space-1);
    flex-wrap: nowrap;
  }

  .tool-btn {
    min-height: 30px;
    height: 30px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
    border: 1px solid var(--border);
    background: var(--surface-2);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tool-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .toolbar-placeholder {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    white-space: nowrap;
    line-height: 52px;
  }

  .zoom-float {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    z-index: 4;
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .fit-label-full {
    display: inline;
  }

  .fit-label-short {
    display: none;
  }

  /* 案内の1行（what だけ。how は title、右端に「？」ボタン） */
  .view-message-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    border-bottom: 1px solid var(--border);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .hint-what {
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .hint-help-btn {
    min-height: 24px;
    height: 24px;
    width: 24px;
    min-width: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-small);
    font-weight: 600;
    border-radius: var(--radius-small);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    flex-shrink: 0;
  }

  .hint-help-btn:hover {
    background: var(--surface-2);
  }

  .view-message-bar.has-error {
    background: var(--warning-soft);
    border-left-color: var(--warning);
  }

  .view-message-bar.has-error .hint-what {
    color: var(--warning);
  }

  /* SVG ラッパー */
  .svg-wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    touch-action: none;
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

  /* エリア */
  .area-polygon {
    stroke: var(--border);
    stroke-width: 1px;
    cursor: pointer;
  }

  /* エリア名は領域の最も左上の長方形の左上から画面で 8px 内側に左寄せ */
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
    stroke-width: 3px;
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
    pointer-events: none;
  }

  /* マーカー */
  .marker-point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2px;
  }


  .marker-rect {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 1.5px;
  }


  .marker-label {
    font-family: var(--font);
    font-size: calc(12px * var(--u, 1));
    fill: var(--text);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
  }

  /* 件数表示（V4・R-B6） */
  .area-count-badge {
    pointer-events: none;
    user-select: none;
  }

  .area-count-rect {
    fill: var(--surface);
    stroke: var(--border);
    stroke-width: 1px;
  }

  .area-count-text {
    font-family: var(--font);
    font-size: calc(11px * var(--u, 1));
    fill: var(--text-muted);
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  .partition-count-badge {
    pointer-events: none;
    user-select: none;
  }

  .partition-count-rect {
    fill: var(--surface);
    stroke: var(--border);
    stroke-width: 1px;
  }

  .partition-count-text {
    font-family: var(--font);
    font-size: calc(12px * var(--u, 1));
    fill: var(--text-muted);
    font-weight: 600;
    pointer-events: none;
  }

  .kuukan-count-text {
    font-family: var(--font);
    font-size: calc(13px * var(--u, 1));
    fill: var(--text-muted);
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  /* モノと収納の描画 */
  .item-drawing-group {
    cursor: pointer;
  }

  .item-point {
    fill: var(--text);
    stroke: var(--surface);
    stroke-width: 2px;
  }

  .item-point.storage {
    fill: var(--text);
    stroke: var(--surface);
    stroke-width: 2px;
  }

  .item-point-inner {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 1.5px;
    pointer-events: none;
  }

  .item-rect {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 1.5px;
  }

  .item-rect.storage {
    stroke-width: 2px;
  }

  .item-rect-inner {
    fill: none;
    stroke: var(--text);
    stroke-width: 1px;
    pointer-events: none;
  }

  .item-poly {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 1.5px;
  }

  .item-poly.storage {
    stroke-width: 3px;
  }

  .item-poly-inner {
    fill: none;
    stroke: var(--surface);
    stroke-width: 1px;
    pointer-events: none;
  }

  .item-label {
    font-family: var(--font);
    font-size: calc(12px * var(--u, 1));
    fill: var(--text);
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  .item-inside-count {
    font-family: var(--font);
    font-size: calc(11px * var(--u, 1));
    fill: var(--accent);
    font-weight: 600;
    pointer-events: none;
    user-select: none;
  }

  /* ハイライトと選択状態 */
  .item-drawing-group.selected .item-point,
  .item-drawing-group.selected .item-rect,
  .item-drawing-group.selected .item-poly {
    stroke: var(--focus);
    stroke-width: 2.5px;
  }

  .item-drawing-group.highlight .item-rect,
  .item-drawing-group.highlight .item-poly {
    fill: var(--highlight);
  }

  .item-drawing-group.highlight .item-point {
    fill: var(--warning);
  }

  .item-drawing-group.quick-direct .item-rect,
  .item-drawing-group.quick-direct .item-poly,
  .item-drawing-group.quick-storage .item-rect,
  .item-drawing-group.quick-storage .item-poly {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 2px;
  }

  .item-drawing-group.quick-direct .item-point,
  .item-drawing-group.quick-storage .item-point {
    fill: var(--accent);
  }

  .item-drawing-group.focus .item-rect,
  .item-drawing-group.focus .item-poly {
    fill: var(--warning-soft);
    stroke: var(--warning);
    stroke-width: 3px;
  }

  .item-drawing-group.focus .item-point {
    fill: var(--warning);
    stroke-width: 3px;
  }

  /* ずれの印（!） */
  .offset-badge {
    pointer-events: auto;
    cursor: help;
  }

  .offset-badge-bg {
    fill: var(--danger);
  }

  .offset-badge-text {
    font-family: var(--font);
    font-size: calc(10px * var(--u, 1));
    fill: var(--surface);
    font-weight: 800;
    pointer-events: none;
  }

  /* 収納の「開く」ボタン */
  .storage-open-btn {
    position: absolute;
    transform: translate(-50%, -100%);
    z-index: 10;
    box-shadow: var(--shadow);
    cursor: pointer;
  }

  /* プレビュー表示 */
  .preview-rect {
    fill: var(--accent-soft);
    fill-opacity: 0.35;
    stroke: var(--accent);
    stroke-width: 1.5px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  .preview-drawing {
    fill: var(--accent-soft);
    fill-opacity: 0.4;
    stroke: var(--focus);
    stroke-width: 2px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  .preview-reshape {
    fill: var(--accent-soft);
    fill-opacity: 0.35;
    stroke: var(--focus);
    stroke-width: 2px;
    stroke-dasharray: 4 4;
    pointer-events: none;
  }

  @media (max-width: 767.98px) {
    .zoom-float {
      padding: 2px;
      gap: 2px;
    }

    .zoom-float button {
      min-height: 32px;
      height: 32px;
      padding: 0 var(--space-2);
      font-size: var(--font-size-small);
    }

    .zoom-float button:not(:last-child) {
      width: 32px;
      min-width: 32px;
      padding: 0;
    }

    .fit-label-full {
      display: none;
    }

    .fit-label-short {
      display: inline;
    }
  }
</style>
