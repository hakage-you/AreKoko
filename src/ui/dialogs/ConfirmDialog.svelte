<script lang="ts">
  import type { ConfirmDialog as ConfirmDialogType } from '../../app/store';
  import { getApp } from '../context';

  let { dialog }: { dialog: ConfirmDialogType } = $props();

  const app = getApp();

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      app.closeDialog();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="dialog-overlay" role="presentation">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
  >
    <div class="dialog-header" id="confirm-dialog-title">
      {dialog.title}
    </div>
    <div class="dialog-body">
      <p class="confirm-message">{dialog.message}</p>
      {#if dialog.details.length > 0}
        <ul class="details-list">
          {#each dialog.details as detail}
            <li class="detail-item">{detail}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="dialog-footer">
      <button
        type="button"
        onclick={() => app.closeDialog()}
      >
        キャンセル
      </button>
      {#if dialog.secondary}
        <button type="button" onclick={() => dialog.secondary?.onSelect()}>
          {dialog.secondary.label}
        </button>
      {/if}
      <button
        type="button"
        class={dialog.danger ? 'danger primary' : 'primary'}
        onclick={() => dialog.onConfirm()}
      >
        {dialog.confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .confirm-message {
    margin: 0 0 var(--space-3);
    line-height: var(--line-height);
  }

  .details-list {
    margin: 0;
    padding: var(--space-3) var(--space-5);
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--surface-2);
  }

  .detail-item {
    margin-bottom: var(--space-1);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
  }

  .detail-item:last-child {
    margin-bottom: 0;
  }
</style>
