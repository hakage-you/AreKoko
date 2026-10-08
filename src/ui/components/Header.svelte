<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  type StatusKind = 'saved' | 'pending' | 'saving' | 'dirty' | 'conflict' | 'error';

  interface StatusDisplay {
    text: string;
    kind: StatusKind;
  }

  const statusInfo = $derived.by<StatusDisplay>(() => {
    if ($app.saveStatus === 'conflict') {
      return { text: '外で変更されました', kind: 'conflict' };
    }
    if ($app.saveStatus === 'invalid') {
      return { text: '保存できません（アプリの不具合）', kind: 'error' };
    }
    if ($app.saveStatus === 'error') {
      return { text: '保存に失敗しました', kind: 'error' };
    }
    if ($app.saveStatus === 'saving') {
      return { text: '保存中…', kind: 'saving' };
    }
    if ($app.saveStatus === 'pending') {
      return { text: '保存待ち…', kind: 'pending' };
    }
    if ($app.dirty || $app.saveStatus === 'dirty') {
      if (!$app.hasBackend) {
        return { text: '保存先なし', kind: 'dirty' };
      }
      if (!$app.canOverwrite) {
        return { text: '書き出していない変更あり', kind: 'dirty' };
      }
      return { text: '未保存の変更あり（自動保存オフ）', kind: 'dirty' };
    }
    if ($app.saveStatus === 'saved') {
      return { text: '保存済み', kind: 'saved' };
    }
    return { text: '', kind: 'saved' };
  });

  const showSaveButton = $derived(
    $app.dirty &&
      (!$app.autosave || !$app.canOverwrite || !$app.hasBackend || $app.saveStatus === 'error')
  );

  const saveButtonLabel = $derived($app.canOverwrite ? '保存' : '書き出す');
</script>

<header class="header">
  <div class="header-bar">
    <div class="header-left">
      <div class="file-block">
        <span class="file-name" title={$app.fileName ?? '名称未設定'}>
          {$app.fileName ?? '名称未設定'}
        </span>
        {#if statusInfo.kind === 'conflict'}
          <!-- ダイアログを閉じた後でも、ここから選び直せる -->
          <button type="button" class="save-status conflict small" onclick={() => app.openConflictDialog()}>
            {statusInfo.text}（選ぶ）
          </button>
        {:else if statusInfo.text}
          <span class="save-status {statusInfo.kind}">
            {statusInfo.text}
          </span>
        {/if}
      </div>

      {#if showSaveButton}
        <button
          type="button"
          class="primary"
          onclick={() => void app.save()}
        >
          {saveButtonLabel}
        </button>
      {/if}

      <div class="history-actions">
        <button
          type="button"
          class="ghost"
          disabled={!$app.canUndo}
          onclick={() => app.undo()}
          aria-label="元に戻す"
        >
          元に戻す
        </button>
        <button
          type="button"
          class="ghost"
          disabled={!$app.canRedo}
          onclick={() => app.redo()}
          aria-label="やり直す"
        >
          やり直す
        </button>
      </div>
    </div>

    <nav class="nav nav-pc" aria-label="画面の切り替え">
      <button
        type="button"
        class="nav-tab ghost"
        class:active={$app.screen === 'search'}
        aria-current={$app.screen === 'search' ? 'page' : undefined}
        onclick={() => app.setScreen('search')}
      >
        サガシモノ
      </button>
      <button
        type="button"
        class="nav-tab ghost"
        class:active={$app.screen === 'kuukans' || $app.screen === 'editor'}
        aria-current={$app.screen === 'kuukans' || $app.screen === 'editor' ? 'page' : undefined}
        onclick={() => app.setScreen('kuukans')}
      >
        クウカン
      </button>
      <button
        type="button"
        class="nav-tab ghost"
        class:active={$app.screen === 'manage'}
        aria-current={$app.screen === 'manage' ? 'page' : undefined}
        onclick={() => app.setScreen('manage')}
      >
        管理
      </button>
      <button
        type="button"
        class="nav-tab ghost"
        class:active={$app.screen === 'settings'}
        aria-current={$app.screen === 'settings' ? 'page' : undefined}
        onclick={() => app.setScreen('settings')}
      >
        設定
      </button>
    </nav>

    <div class="header-right">
      <button
        type="button"
        class="ghost"
        onclick={() => void app.closeDocument()}
      >
        閉じる
      </button>
    </div>
  </div>

  <nav class="nav nav-mobile" aria-label="画面の切り替え（スマホ）">
    <button
      type="button"
      class="nav-tab ghost"
      class:active={$app.screen === 'search'}
      aria-current={$app.screen === 'search' ? 'page' : undefined}
      onclick={() => app.setScreen('search')}
    >
      サガシモノ
    </button>
    <button
      type="button"
      class="nav-tab ghost"
      class:active={$app.screen === 'kuukans' || $app.screen === 'editor'}
      aria-current={$app.screen === 'kuukans' || $app.screen === 'editor' ? 'page' : undefined}
      onclick={() => app.setScreen('kuukans')}
    >
      クウカン
    </button>
    <button
      type="button"
      class="nav-tab ghost"
      class:active={$app.screen === 'manage'}
      aria-current={$app.screen === 'manage' ? 'page' : undefined}
      onclick={() => app.setScreen('manage')}
    >
      管理
    </button>
    <button
      type="button"
      class="nav-tab ghost"
      class:active={$app.screen === 'settings'}
      aria-current={$app.screen === 'settings' ? 'page' : undefined}
      onclick={() => app.setScreen('settings')}
    >
      設定
    </button>
  </nav>
</header>

<style>
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--header-height);
    padding: var(--space-1) var(--space-4);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .file-block {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .file-name {
    font-weight: 600;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-status {
    font-size: var(--font-size-small);
    white-space: nowrap;
  }

  .save-status.saved {
    color: var(--text-muted);
  }

  .save-status.pending,
  .save-status.saving {
    color: var(--accent);
  }

  .save-status.dirty {
    color: var(--warning);
  }

  .save-status.conflict,
  .save-status.error {
    color: var(--danger);
  }

  .save-status.conflict {
    cursor: pointer;
    text-decoration: underline;
  }

  .history-actions {
    display: flex;
    gap: var(--space-1);
  }

  .nav {
    display: flex;
    gap: var(--space-1);
  }

  .nav-tab {
    position: relative;
    border-radius: var(--radius);
  }

  .nav-tab.active {
    background: var(--surface-2);
    font-weight: 600;
  }

  .header-right {
    display: flex;
    align-items: center;
  }

  .nav-mobile {
    display: none;
    border-top: 1px solid var(--border);
    padding: var(--space-1) var(--space-2);
    overflow-x: auto;
  }

  @media (max-width: 767px) {
    .nav-pc {
      display: none;
    }

    .nav-mobile {
      display: flex;
      justify-content: space-around;
    }

    .header-bar {
      padding: var(--space-1) var(--space-2);
    }

    .file-name {
      max-width: 140px;
    }
  }
</style>
