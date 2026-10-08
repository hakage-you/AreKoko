<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  const repairDialog = $derived(
    $app.dialog?.kind === 'repair' ? $app.dialog : null
  );
</script>

{#if repairDialog}
  <div class="dialog-overlay" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-dialog-title"
    >
      <div class="dialog-header" id="repair-dialog-title">
        ファイルに問題が見つかりました
      </div>
      <div class="dialog-body">
        <p class="file-name">
          対象ファイル: <strong>{repairDialog.fileName}</strong>
        </p>
        <p class="repair-intro">以下の問題を自動で修復できます：</p>
        <ul class="repair-list">
          {#each repairDialog.repairs as repair}
            <li class="repair-item">{repair.message}</li>
          {/each}
        </ul>
        <p class="repair-note">
          直して読み込むと、直した内容が保存されます。直したものには修復メモが付きます。
        </p>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          onclick={() => app.rejectRepair()}
        >
          読み込まない
        </button>
        <button
          type="button"
          class="primary"
          onclick={() => app.approveRepair()}
        >
          直して読み込む
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .file-name {
    margin: 0 0 var(--space-2);
  }

  .repair-intro {
    margin: 0 0 var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }

  .repair-list {
    margin: 0 0 var(--space-3);
    padding: var(--space-3) var(--space-5);
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--surface-2);
  }

  .repair-item {
    margin-bottom: var(--space-1);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
  }

  .repair-item:last-child {
    margin-bottom: 0;
  }

  .repair-note {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }
</style>
