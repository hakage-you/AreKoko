<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  const refusedDialog = $derived(
    $app.dialog?.kind === 'refused' ? $app.dialog : null
  );
</script>

{#if refusedDialog}
  <div class="dialog-overlay" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refused-dialog-title"
    >
      <div class="dialog-header" id="refused-dialog-title">
        このファイルは読み込めません
      </div>
      <div class="dialog-body">
        <p class="file-name">
          対象ファイル: <strong>{refusedDialog.fileName}</strong>
        </p>
        <p class="refused-intro">以下の理由により、ファイルを読み込むことができませんでした：</p>
        <ul class="reason-list">
          {#each refusedDialog.reasons as reason}
            <li class="reason-item">{reason.message}</li>
          {/each}
        </ul>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          onclick={() => app.closeDialog()}
        >
          閉じる
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .file-name {
    margin: 0 0 var(--space-2);
  }

  .refused-intro {
    margin: 0 0 var(--space-2);
    color: var(--danger);
    font-size: var(--font-size-small);
  }

  .reason-list {
    margin: 0;
    padding: var(--space-3) var(--space-5);
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--surface-2);
  }

  .reason-item {
    margin-bottom: var(--space-1);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
  }

  .reason-item:last-child {
    margin-bottom: 0;
  }
</style>
