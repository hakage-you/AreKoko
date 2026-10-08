<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();
</script>

<div class="dialog-overlay" role="presentation">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="conflict-dialog-title"
  >
    <div class="dialog-header" id="conflict-dialog-title">
      ファイルが外で変更されました
    </div>
    <div class="dialog-body">
      <p class="conflict-description">
        このファイルは、開いた後に別の場所（別のタブやアプリ）で変更されました。自動保存を止めています。
      </p>
    </div>
    <div class="dialog-footer conflict-actions">
      <button
        type="button"
        onclick={() => void app.resolveConflict('reload')}
      >
        読み込み直す（こちらの変更は捨てる）
      </button>
      <button
        type="button"
        onclick={() => void app.resolveConflict('saveAs')}
      >
        別の名前で保存する
      </button>
      <button
        type="button"
        class="danger"
        onclick={() => void app.resolveConflict('overwrite')}
      >
        それでも上書きする
      </button>
    </div>
  </div>
</div>

<style>
  .conflict-description {
    margin: 0;
    line-height: var(--line-height);
  }

  .conflict-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .conflict-actions button {
    width: 100%;
    justify-content: center;
  }
</style>
