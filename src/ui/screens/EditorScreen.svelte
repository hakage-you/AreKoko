<script lang="ts">
  import { getApp } from '../context';
  import { createEditorUi } from '../editor/editorUi.svelte';
  import Canvas from '../editor/Canvas.svelte';
  import Toolbar from '../editor/Toolbar.svelte';
  import SidePanel from '../editor/SidePanel.svelte';
  import { confirmModes } from '../../editor/confirm';
  import { validateDraft } from '../../editor/draft';
  import { TEMPLATE_LIST } from '../../editor/templates';
  import { displayName, formatPlacePath } from '../../core/places';

  const app = getApp();
  const ui = createEditorUi();

  // 何も描いていない下書きで出す手順のカード（閉じたら、この下書きの間は出さない）
  let guideClosed = $state(false);
  const showGuide = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind !== 'draft' || guideClosed) return false;
    const d = ed.draft.doc.drawing;
    return d.partitions.length === 0;
  });
  const draftHasOutline = $derived.by(() => {
    const ed = $app.editor;
    return ed?.kind === 'draft' && ed.draft.doc.drawing.kuukans.some((k) => k.kuukan === ed.draft.kuukan);
  });
  const canUndo = $derived($app.editor?.kind === 'draft' ? $app.editor.canUndo : $app.canUndo);
  const canRedo = $derived($app.editor?.kind === 'draft' ? $app.editor.canRedo : $app.canRedo);

  function handleUndo() {
    if ($app.editor?.kind === 'draft') app.draftUndo();
    else app.undo();
  }

  function handleRedo() {
    if ($app.editor?.kind === 'draft') app.draftRedo();
    else app.redo();
  }

  function zoomBy(f: number) {
    ui.view = { ...ui.view, scale: ui.view.scale * f };
  }

  let showDuplicateChoice = $state(false);

  const title = $derived.by(() => {
    const ed = $app.editor;
    if (!ed) return '';
    if (ed.kind === 'kuukan') {
      const doc = $app.doc;
      const name = doc ? displayName(doc, ed.kuukan) : '';
      return `${name}の編集`;
    }
    const draft = ed.draft;
    const origin = draft.origin;
    switch (origin.kind) {
      case 'new':
        return '新しいクウカン（下書き）';
      case 'template': {
        const t = TEMPLATE_LIST.find((item) => item.id === origin.template);
        return `テンプレート：${t?.name ?? origin.template}（下書き）`;
      }
      case 'duplicate': {
        const doc = $app.doc;
        const name = doc ? displayName(doc, origin.source) : '';
        return `${name}の複製（下書き）`;
      }
      case 'storage': {
        const doc = $app.doc;
        const name = doc ? displayName(doc, origin.item) : '';
        return `${name}を収納にする（下書き）`;
      }
      case 'redraw': {
        const doc = $app.doc;
        const name = doc ? displayName(doc, origin.source) : '';
        return `${name}に図を描く（下書き）`;
      }
    }
  });

  const draftViolations = $derived.by(() => {
    const ed = $app.editor;
    if (ed?.kind !== 'draft') return [];
    return validateDraft(ed.draft);
  });

  const cannotConfirmReason = $derived(draftViolations[0]?.message ?? '');

  function handleConfirmClick() {
    const ed = $app.editor;
    if (ed?.kind !== 'draft') return;
    if (draftViolations.length > 0) return;

    const modes = confirmModes(ed.draft);
    if (modes.length === 1 && modes[0]) {
      app.confirmDraft(modes[0]);
      return;
    }

    if (ed.draft.origin.kind === 'duplicate') {
      showDuplicateChoice = true;
    }
  }

  function handleConfirmKeep() {
    showDuplicateChoice = false;
    app.confirmDraft('keep');
  }

  function handleConfirmReplace() {
    showDuplicateChoice = false;
    const ed = $app.editor;
    if (ed?.kind !== 'draft' || !$app.doc) return;

    const plan = app.planDraftConfirm('replace');
    const details: string[] = [];

    if (plan) {
      for (const aId of plan.removedAreas) {
        const aName = displayName($app.doc, aId);
        details.push(`消えるエリア: ${aName}`);
      }
      for (const r of plan.relocations) {
        const fromPath = formatPlacePath($app.doc, r.from);
        const toPath = formatPlacePath($app.doc, r.to);
        details.push(`${fromPath} から ${r.items.length}件 → ${toPath}`);
      }
    }

    app.confirm({
      title: 'クウカンを置き換えますか？',
      message: '元のクウカンをこの下書きの内容で置き換えます。',
      details,
      confirmLabel: '置き換える',
      danger: true,
      onConfirm: () => {
        app.confirmDraft('replace');
      },
    });
  }

  function handleCancelDraft() {
    app.cancelDraft();
  }

  function handleLeaveEditor() {
    app.leaveEditor();
  }
</script>

<div class="editor-screen">
  <header class="editor-header">
    <div class="editor-header-left">
      {#if $app.editor?.kind === 'draft'}
        <button type="button" class="ghost small" onclick={handleCancelDraft} title="下書きを捨てて、開く前の画面に戻ります">
          下書きを捨てる
        </button>
      {:else}
        <button type="button" class="ghost small" onclick={handleLeaveEditor} title="編集を終えて、開く前の画面に戻ります（変更はもう文書に入っています）">
          ← 戻る
        </button>
      {/if}
      <h2 class="editor-title">{title}</h2>
      <div class="history-buttons">
        <button type="button" class="ghost small" disabled={!canUndo} onclick={handleUndo} title="直前の操作を取り消します">元に戻す</button>
        <button type="button" class="ghost small" disabled={!canRedo} onclick={handleRedo} title="取り消した操作をやり直します">やり直す</button>
      </div>
    </div>

    <div class="editor-header-right">
      {#if $app.editor?.kind === 'draft'}
        {#if draftViolations.length === 0}
          <span class="confirm-note muted small">確定するまで文書は変わりません</span>
        {/if}
        {#if draftViolations.length > 0 && cannotConfirmReason}
          <span class="confirm-error-message" title={cannotConfirmReason}>
            {cannotConfirmReason}
          </span>
        {/if}
        <button
          type="button"
          class="primary"
          disabled={draftViolations.length > 0}
          onclick={handleConfirmClick}
          title="下書きを文書に入れます"
        >
          確定する
        </button>
      {/if}
    </div>
  </header>

  <div class="editor-body">
    <div class="editor-center">
      <Toolbar />
      <div class="canvas-wrapper">
        <Canvas />
        <div class="zoom-float" role="group" aria-label="表示">
          <button type="button" class="small" onclick={() => zoomBy(1.25)} title="拡大します（ホイール・2本指でも）" aria-label="拡大">＋</button>
          <button type="button" class="small" onclick={() => zoomBy(0.8)} title="縮小します" aria-label="縮小">−</button>
          <button type="button" class="small" onclick={() => ui.fitRequest++} title="図の全体が見えるように戻します"><span class="fit-long">全体を表示</span><span class="fit-short">全体</span></button>
        </div>
        {#if showGuide}
          <div class="guide-card" role="note">
            <div class="guide-head">
              <strong>下書きの作り方</strong>
              <button type="button" class="ghost small" onclick={() => (guideClosed = true)} aria-label="作り方を閉じる">閉じる</button>
            </div>
            <ol>
              {#if draftHasOutline}
                <li><b>形を整える</b>：上の「辺を動かす」「段差を足す」で、L字などにできます（長方形のままでもかまいません）。</li>
                <li><b>エリアに分ける</b>：「左右に分ける」「上下に分ける」を選んで、分けたい所を押します。</li>
                <li><b>目印を置く</b>（なくてもよい）：ドアや柱は「マーカーを置く」で。</li>
              {:else}
                <li>外形のない下書きです。このまま確定すると、描画なしのクウカンになります。</li>
              {/if}
              <li>できたら右上の<b>「確定する」</b>。確定するまで文書は変わりません。</li>
            </ol>
          </div>
        {/if}
      </div>
    </div>
    <aside class="side-panel-wrapper">
      <SidePanel />
    </aside>
  </div>
</div>

{#if showDuplicateChoice}
  <div class="dialog-overlay" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-choice-title"
    >
      <div class="dialog-header" id="duplicate-choice-title">
        下書きの確定
      </div>
      <div class="dialog-body">
        <p class="choice-intro">複製した下書きの確定方法を選んでください。</p>
        <div class="choice-list">
          <button
            type="button"
            class="choice-card"
            onclick={handleConfirmKeep}
          >
            <div class="choice-title">元を残す（複製）</div>
            <div class="choice-desc muted small">
              元のクウカンを残したまま、新しいクウカンとして保存します。
            </div>
          </button>
          <button
            type="button"
            class="choice-card choice-danger"
            onclick={handleConfirmReplace}
          >
            <div class="choice-title">元と置き換える（作り直し）</div>
            <div class="choice-desc muted small">
              元のクウカンをこの下書きで置き換えます。消えるエリアの中身は引き継がれます。
            </div>
          </button>
        </div>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          onclick={() => {
            showDuplicateChoice = false;
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    min-height: var(--header-height);
    flex-shrink: 0;
  }

  .editor-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .editor-title {
    margin: 0;
    font-size: var(--font-size-large);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .confirm-error-message {
    color: var(--danger);
    font-size: var(--font-size-small);
    white-space: nowrap;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-body {
    display: flex;
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .editor-center {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  .canvas-wrapper {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .side-panel-wrapper {
    width: 320px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .choice-intro {
    margin: 0 0 var(--space-3);
    line-height: var(--line-height);
  }

  .choice-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .choice-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: left;
    gap: var(--space-1);
    cursor: pointer;
  }

  .choice-card:hover {
    background: var(--surface-2);
  }

  .choice-card.choice-danger {
    border-color: var(--border);
  }

  .choice-card.choice-danger:hover {
    border-color: var(--danger);
    background: var(--danger-soft);
  }

  .choice-title {
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .editor-body {
      flex-direction: column;
      overflow-y: auto;
    }

    .editor-center {
      flex: none;
    }

    .canvas-wrapper {
      flex: none;
      height: 52vh;
      min-height: 320px;
    }

    .side-panel-wrapper {
      width: 100%;
      height: auto;
      overflow-y: visible;
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }

  .confirm-note {
    white-space: nowrap;
  }

  @media (max-width: 767.98px) {
    .confirm-note {
      display: none;
    }
  }

  .history-buttons {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .zoom-float {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .fit-short {
    display: none;
  }

  @media (max-width: 767.98px) {
    .zoom-float {
      right: var(--space-2);
      bottom: var(--space-2);
    }

    .zoom-float button {
      min-height: 32px;
      min-width: 32px;
      padding: 0 var(--space-2);
    }

    .fit-long {
      display: none;
    }

    .fit-short {
      display: inline;
    }
  }

  .guide-card {
    position: absolute;
    left: var(--space-3);
    top: var(--space-3);
    max-width: min(420px, calc(100% - 2 * var(--space-3)));
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
  }

  .guide-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .guide-card ol {
    margin: 0;
    padding-left: 1.4em;
  }
</style>
