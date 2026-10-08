import { getContext, setContext } from 'svelte';
import type { Id } from '../../core/types';

export type EditorTool =
  | 'select'
  | 'splitX'
  | 'splitY'
  | 'markerPoint'
  | 'markerRect'
  | 'outlineEdge'
  | 'outlineStep';

export interface EditorUi {
  tool: EditorTool;
  selectedArea: Id | null;                                 // 選んだ節（エリアのID か クウカンのID）
  selectedLine: { node: Id; lineIndex: number } | null;    // 選んだ仕切りの線
  selectedMarkers: Id[];                                   // 選んだマーカー
  view: { cx: number; cy: number; scale: number };         // 表示の中心（比率の座標）と拡大率（画面の px / 比率の単位）
  fitRequest: number;                                      // 増やすと図が「全体を表示」する
}

const KEY = Symbol('arekoko-editor-ui');

export function createEditorUi(): EditorUi {
  let tool = $state<EditorTool>('select');
  let selectedArea = $state<Id | null>(null);
  let selectedLine = $state<{ node: Id; lineIndex: number } | null>(null);
  let selectedMarkers = $state<Id[]>([]);
  let view = $state<{ cx: number; cy: number; scale: number }>({
    cx: 5000,
    cy: 5000,
    scale: 0.05,
  });
  let fitRequest = $state<number>(0);

  const ui: EditorUi = {
    get tool() {
      return tool;
    },
    set tool(t: EditorTool) {
      if (tool !== t) {
        tool = t;
        // 道具を変えたら、選択は消す (8.1.1)
        selectedArea = null;
        selectedLine = null;
        selectedMarkers = [];
      }
    },
    get selectedArea() {
      return selectedArea;
    },
    set selectedArea(val: Id | null) {
      selectedArea = val;
    },
    get selectedLine() {
      return selectedLine;
    },
    set selectedLine(val: { node: Id; lineIndex: number } | null) {
      selectedLine = val;
    },
    get selectedMarkers() {
      return selectedMarkers;
    },
    set selectedMarkers(val: Id[]) {
      selectedMarkers = val;
    },
    get view() {
      return view;
    },
    set view(val: { cx: number; cy: number; scale: number }) {
      view = val;
    },
    get fitRequest() {
      return fitRequest;
    },
    set fitRequest(val: number) {
      fitRequest = val;
    },
  };

  setContext(KEY, ui);
  return ui;
}

export function getEditorUi(): EditorUi {
  const ui = getContext<EditorUi | undefined>(KEY);
  if (!ui) {
    throw new Error('EditorUi が setContext されていません');
  }
  return ui;
}
