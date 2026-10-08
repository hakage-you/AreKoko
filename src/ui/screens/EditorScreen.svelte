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
  createEditorUi();

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
    if (modes.length === 1 && modes[0] === 'create') {
      app.confirmDraft('create');
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
        <button type="button" class="ghost small" onclick={handleCancelDraft}>
          取り消し
        </button>
      {:else}
        <button type="button" class="ghost small" onclick={handleLeaveEditor}>
          一覧へ戻る
        </button>
      {/if}
      <h2 class="editor-title">{title}</h2>
    </div>

    <div class="editor-header-right">
      {#if $app.editor?.kind === 'draft'}
        {#if draftViolations.length > 0 && cannotConfirmReason}
          <span class="confirm-error-message" title={cannotConfirmReason}>
            {cannotConfirmReason}
          </span>
        {/if}
        <button
          type="button"
          class="primary small"
          disabled={draftViolations.length > 0}
          onclick={handleConfirmClick}
        >
          確定
        </button>
      {/if}
    </div>
  </header>

  <div class="editor-body">
    <div class="editor-center">
      <Toolbar />
      <div class="canvas-wrapper">
        <Canvas />
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
    }

    .side-panel-wrapper {
      width: 100%;
      height: 320px;
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }
</style>
