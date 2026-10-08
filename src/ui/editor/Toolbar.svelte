<script lang="ts">
  import { getApp } from '../context';
  import { getEditorUi, type EditorTool } from './editorUi.svelte';

  const app = getApp();
  const ui = getEditorUi();

  interface ToolDef {
    id: EditorTool;
    label: string;
    /** 16×16 の絵（SVG の path の d）。 */
    icon: string;
    /** 何が起きるか（ボタンの説明と、案内の1行め）。 */
    what: string;
    /** どう使うか（案内の2行め）。 */
    how: string;
  }

  interface ToolGroup {
    title: string;
    tools: ToolDef[];
  }

  const SELECT: ToolDef = {
    id: 'select',
    label: '選ぶ',
    icon: 'M4 2v11l3-3 2.2 4.6 1.6-.8L8.6 9.3H13z',
    what: 'エリア・仕切りの線・マーカーを選びます',
    how: '押すと選ばれ、横（スマホでは下）の欄で名前の変更や削除ができます。線やマーカーはドラッグで動かせます。何もない所をドラッグすると図が動きます。',
  };

  const SPLIT: ToolGroup = {
    title: 'エリアに分ける',
    tools: [
      {
        id: 'splitX',
        label: '左右に分ける',
        icon: 'M2 2h12v12H2zM8 2v12',
        what: '押したエリアを、縦の線で左と右の2つに分けます',
        how: '分けたい所を押してください。線はそのエリアの端で止まります。分けた2つは、元のエリアの中のエリアになります。',
      },
      {
        id: 'splitY',
        label: '上下に分ける',
        icon: 'M2 2h12v12H2zM2 8h12',
        what: '押したエリアを、横の線で上と下の2つに分けます',
        how: '分けたい所を押してください。線はそのエリアの端で止まります。分けた2つは、元のエリアの中のエリアになります。',
      },
    ],
  };

  const MARKER: ToolGroup = {
    title: 'マーカーを置く',
    tools: [
      {
        id: 'markerPoint',
        label: '点',
        icon: 'M8 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6z',
        what: 'ドアやコンセントなどの目印を、点で置きます',
        how: '置きたい所を押してください。名前は横（スマホでは下）の欄で変えられます。',
      },
      {
        id: 'markerRect',
        label: '長方形',
        icon: 'M3 4h10v8H3z',
        what: '柱や窓などの目印を、長方形で置きます',
        how: '図の上をドラッグして範囲を描いてください。「置き場にしない」にすると、その上にはモノを置けなくなります。',
      },
    ],
  };

  const OUTLINE: ToolGroup = {
    title: '外形を変える',
    tools: [
      {
        id: 'outlineEdge',
        label: '辺を動かす',
        icon: 'M2 3h7v10H2zM11 8h3M12.5 6.5L14 8l-1.5 1.5',
        what: '外形の辺を、外や内へ平行に動かします',
        how: '外形の辺を押したまま、動かしたい方へドラッグしてください。',
      },
      {
        id: 'outlineStep',
        label: '段差を足す',
        icon: 'M2 2h12v6H9v6H2z',
        what: '外形の辺に段差を付けて、L字などの形にします',
        how: '段差を付けたい辺の上を押し、辺と直角の向き（内か外）へドラッグしてください。押した位置から、近いほうの角までが動きます。',
      },
    ],
  };

  const MARKER_SHAPE: Record<'markerEdge' | 'markerStep', ToolDef> = {
    markerEdge: {
      id: 'markerEdge',
      label: 'マーカーの辺を動かす',
      icon: '',
      what: '選んだマーカーの辺を動かします',
      how: 'マーカーの辺を押したまま、動かしたい方へドラッグしてください。終わったら横（スマホでは下）の欄の「選ぶに戻る」。',
    },
    markerStep: {
      id: 'markerStep',
      label: 'マーカーに段差を足す',
      icon: '',
      what: '選んだマーカーに段差を付けて、L字などの形にします',
      how: 'マーカーの辺の上を押し、辺と直角の向きへドラッグしてください。終わったら横（スマホでは下）の欄の「選ぶに戻る」。',
    },
  };

  const hasOutline = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind !== 'draft') return false;
    const kd = ed.draft.doc.drawing.kuukans.find((k) => k.kuukan === ed.draft.kuukan);
    return Boolean(kd && kd.outline.length > 0);
  });

  /** 外形だけで、仕切りもマーカーもない下書き（作り方の手順を出す）。 */
  const groups = $derived<ToolGroup[]>(hasOutline ? [SPLIT, MARKER, OUTLINE] : [SPLIT, MARKER]);

  const currentTool = $derived.by((): ToolDef => {
    if (ui.tool === 'markerEdge' || ui.tool === 'markerStep') return MARKER_SHAPE[ui.tool];
    if (ui.tool === 'select') return SELECT;
    for (const g of [SPLIT, MARKER, OUTLINE]) {
      const t = g.tools.find((x) => x.id === ui.tool);
      if (t) return t;
    }
    return SELECT;
  });

  function selectTool(t: EditorTool) {
    ui.tool = t;
    ui.selectedArea = null;
    ui.selectedLine = null;
    ui.selectedMarkers = [];
  }

</script>

{#snippet toolButton(t: ToolDef)}
  <button
    type="button"
    class="tool-btn"
    class:active={ui.tool === t.id}
    aria-pressed={ui.tool === t.id}
    title={t.what}
    onclick={() => selectTool(t.id)}
  >
    <svg class="tool-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={t.icon} />
    </svg>
    <span>{t.label}</span>
  </button>
{/snippet}

<div class="toolbar-root">
  <div class="toolbar-bar" role="toolbar" aria-label="クウカン編集の道具">
    <div class="tool-group">
      <span class="group-title">選ぶ・動かす</span>
      <div class="group-buttons">
        {@render toolButton(SELECT)}
      </div>
    </div>

    {#each groups as g (g.title)}
      <div class="tool-group">
        <span class="group-title">{g.title}{g === OUTLINE ? '（下書きだけ）' : ''}</span>
        <div class="group-buttons">
          {#each g.tools as t (t.id)}
            {@render toolButton(t)}
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="tool-hint" aria-live="polite">
    <div class="hint-what"><span class="hint-tool">{currentTool.label}</span>{currentTool.what}</div>
    <div class="hint-how">{currentTool.how}</div>
  </div>
</div>

<style>
  .toolbar-root {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .toolbar-bar {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .group-title {
    font-size: 11px;
    color: var(--text-muted);
    padding-left: 2px;
    white-space: nowrap;
  }

  .group-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
    border: 1px solid var(--border);
    background: var(--surface-2);
  }

  .tool-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .tool-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .tool-hint {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-small);
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    line-height: var(--line-height);
    font-size: var(--font-size-small);
  }

  .hint-what {
    font-weight: 600;
    color: var(--text);
  }

  .hint-tool {
    display: inline-block;
    margin-right: var(--space-2);
    padding: 0 6px;
    border-radius: var(--radius-small);
    background: var(--accent);
    color: var(--accent-text);
    font-size: 12px;
  }

  .hint-how {
    color: var(--text-muted);
  }


  @media (max-width: 767.98px) {
    .toolbar-root {
      padding: var(--space-2);
    }

    .toolbar-bar {
      gap: var(--space-2);
    }

    .tool-btn {
      padding: 0 var(--space-2);
    }
  }
</style>
