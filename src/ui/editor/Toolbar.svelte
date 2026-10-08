<script lang="ts">
  import { getApp } from '../context';
  import { getEditorUi, type EditorTool } from './editorUi.svelte';

  const app = getApp();
  const ui = getEditorUi();

  const hasOutline = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind !== 'draft') return false;
    const kd = ed.draft.doc.drawing.kuukans.find((k) => k.kuukan === ed.draft.kuukan);
    return Boolean(kd && kd.outline.length > 0);
  });

  const canUndo = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind === 'draft') return ed.canUndo;
    return $app.canUndo;
  });

  const canRedo = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind === 'draft') return ed.canRedo;
    return $app.canRedo;
  });

  const toolHint = $derived.by(() => {
    switch (ui.tool) {
      case 'select':
        return 'エリア、仕切りの線、マーカーを押して選びます。ドラッグで動かせます。';
      case 'splitX':
        return '図を押した位置に、縦の仕切りを入れます。';
      case 'splitY':
        return '図を押した位置に、横の仕切りを入れます。';
      case 'markerPoint':
        return '図を押した位置に、点のマーカーを置きます。';
      case 'markerRect':
        return '図の上をドラッグして、長方形のマーカーを置きます。';
      case 'outlineEdge':
        return '外形の辺を押してドラッグし、辺を動かします。';
      case 'outlineStep':
        return '外形の辺の上を押して垂直にドラッグし、段差を足します。';
      case 'markerEdge':
        return 'マーカーの辺を押してドラッグし、辺を動かします。';
      case 'markerStep':
        return 'マーカーの辺の上を押して垂直にドラッグし、段差を足します。';
    }
  });

  function selectTool(t: EditorTool) {
    ui.tool = t;
    ui.selectedArea = null;
    ui.selectedLine = null;
    ui.selectedMarkers = [];
  }

  function zoomIn() {
    ui.view.scale = Math.round(ui.view.scale * 1.25 * 1000) / 1000;
  }

  function zoomOut() {
    ui.view.scale = Math.round(ui.view.scale * 0.8 * 1000) / 1000;
  }

  function fitAll() {
    ui.fitRequest++;
  }

  function handleUndo() {
    const ed = $app.editor;
    if (ed?.kind === 'draft') {
      app.draftUndo();
    } else {
      app.undo();
    }
  }

  function handleRedo() {
    const ed = $app.editor;
    if (ed?.kind === 'draft') {
      app.draftRedo();
    } else {
      app.redo();
    }
  }
</script>

<div class="toolbar-root">
  <div class="toolbar-bar" role="toolbar" aria-label="クウカン編集の道具">
    <div class="tool-group">
      <button
        type="button"
        class="tool-btn small ghost"
        class:active={ui.tool === 'select'}
        aria-pressed={ui.tool === 'select'}
        onclick={() => selectTool('select')}
      >
        選ぶ
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        class:active={ui.tool === 'splitX'}
        aria-pressed={ui.tool === 'splitX'}
        onclick={() => selectTool('splitX')}
      >
        仕切り（縦）
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        class:active={ui.tool === 'splitY'}
        aria-pressed={ui.tool === 'splitY'}
        onclick={() => selectTool('splitY')}
      >
        仕切り（横）
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        class:active={ui.tool === 'markerPoint'}
        aria-pressed={ui.tool === 'markerPoint'}
        onclick={() => selectTool('markerPoint')}
      >
        マーカー（点）
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        class:active={ui.tool === 'markerRect'}
        aria-pressed={ui.tool === 'markerRect'}
        onclick={() => selectTool('markerRect')}
      >
        マーカー（長方形）
      </button>
      {#if hasOutline}
        <button
          type="button"
          class="tool-btn small ghost"
          class:active={ui.tool === 'outlineEdge'}
          aria-pressed={ui.tool === 'outlineEdge'}
          onclick={() => selectTool('outlineEdge')}
        >
          外形・辺を動かす
        </button>
        <button
          type="button"
          class="tool-btn small ghost"
          class:active={ui.tool === 'outlineStep'}
          aria-pressed={ui.tool === 'outlineStep'}
          onclick={() => selectTool('outlineStep')}
        >
          外形・段差を足す
        </button>
      {/if}
    </div>

    <div class="separator" role="separator" aria-orientation="vertical"></div>

    <div class="tool-group">
      <button
        type="button"
        class="tool-btn small ghost"
        onclick={zoomIn}
        title="拡大"
        aria-label="拡大"
      >
        ＋
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        onclick={zoomOut}
        title="縮小"
        aria-label="縮小"
      >
        −
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        onclick={fitAll}
      >
        全体を表示
      </button>
    </div>

    <div class="separator" role="separator" aria-orientation="vertical"></div>

    <div class="tool-group">
      <button
        type="button"
        class="tool-btn small ghost"
        disabled={!canUndo}
        onclick={handleUndo}
        aria-label="元に戻す"
      >
        元に戻す
      </button>
      <button
        type="button"
        class="tool-btn small ghost"
        disabled={!canRedo}
        onclick={handleRedo}
        aria-label="やり直す"
      >
        やり直す
      </button>
    </div>
  </div>

  <div class="tool-hint muted small" aria-live="polite">
    {toolHint}
  </div>
</div>

<style>
  .toolbar-root {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .toolbar-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 var(--space-1);
    flex-shrink: 0;
  }

  .tool-btn {
    min-height: 32px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
  }

  .tool-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .tool-hint {
    min-height: 1.4em;
    line-height: var(--line-height);
  }
</style>
