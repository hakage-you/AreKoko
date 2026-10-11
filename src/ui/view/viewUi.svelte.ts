import { getContext, setContext } from 'svelte';
import type { Id } from '../../core/types';

/** 配置モードで描画を付けるときの道具。 */
export type AttachTool = 'point' | 'rect';

/** 配置モードで選んだ描画にする操作。'move' はドラッグで動かす（既定）。 */
export type ShapeTool = 'move' | 'edge' | 'step';

/**
 * クウカンビューの図とモノリストで共有する、画面だけの状態（詳細設計 段階6 6.4〜6.6）。
 * 文書やストアには入れない。クウカンビューを開くたびに作り直す。
 */
export interface ViewUi {
  /** 選んだ描画（モノのID）。ふだんは収納の描画を選んで「開く」を出すため、配置モードでは動かす・回すため。 */
  selectedDrawing: Id | null;
  /** 配置モードで、描画を付ける相手のモノ。null なら付けていない。 */
  attachTarget: Id | null;
  /** 描画を付ける道具。 */
  attachTool: AttachTool;
  /** 選んだ描画にする操作。 */
  shapeTool: ShapeTool;
  /** 表示の中心（比率の座標）と拡大率（画面の px / 比率の単位）。編集の図と同じ意味。 */
  view: { cx: number; cy: number; scale: number };
  /** 増やすと図が「全体を表示」する。 */
  fitRequest: number;
  /** 図の上の案内に出す文（断られた理由など）。null なら道具ごとの既定の案内。 */
  message: string | null;
  /** ずれの説明を開いているモノ。 */
  offsetOpen: Id | null;
  /** 配置モード開始前や配置モード中に選択していたモノ。配置終了時に詳細パネルを復帰するために保持。 */
  detailToRestore: Id | null;
}

const KEY = Symbol('arekoko-view-ui');

export function createViewUi(): ViewUi {
  let selectedDrawing = $state<Id | null>(null);
  let attachTarget = $state<Id | null>(null);
  let attachTool = $state<AttachTool>('rect');
  let shapeTool = $state<ShapeTool>('move');
  let view = $state<{ cx: number; cy: number; scale: number }>({ cx: 5000, cy: 5000, scale: 0.05 });
  let fitRequest = $state(0);
  let message = $state<string | null>(null);
  let offsetOpen = $state<Id | null>(null);
  let detailToRestore = $state<Id | null>(null);

  const ui: ViewUi = {
    get selectedDrawing() {
      return selectedDrawing;
    },
    set selectedDrawing(v: Id | null) {
      if (selectedDrawing !== v) {
        selectedDrawing = v;
        shapeTool = 'move';
      }
    },
    get attachTarget() {
      return attachTarget;
    },
    set attachTarget(v: Id | null) {
      attachTarget = v;
      if (v !== null) selectedDrawing = null;
    },
    get attachTool() {
      return attachTool;
    },
    set attachTool(v: AttachTool) {
      attachTool = v;
    },
    get shapeTool() {
      return shapeTool;
    },
    set shapeTool(v: ShapeTool) {
      shapeTool = v;
    },
    get view() {
      return view;
    },
    set view(v: { cx: number; cy: number; scale: number }) {
      view = v;
    },
    get fitRequest() {
      return fitRequest;
    },
    set fitRequest(v: number) {
      fitRequest = v;
    },
    get message() {
      return message;
    },
    set message(v: string | null) {
      message = v;
    },
    get offsetOpen() {
      return offsetOpen;
    },
    set offsetOpen(v: Id | null) {
      offsetOpen = v;
    },
    get detailToRestore() {
      return detailToRestore;
    },
    set detailToRestore(v: Id | null) {
      detailToRestore = v;
    },
  };

  setContext(KEY, ui);
  return ui;
}

export function getViewUi(): ViewUi {
  const ui = getContext<ViewUi | undefined>(KEY);
  if (!ui) throw new Error('ViewUi が見つかりません（ViewScreen の中で使ってください）');
  return ui;
}

export function tryGetViewUi(): ViewUi | null {
  return getContext<ViewUi | undefined>(KEY) ?? null;
}

