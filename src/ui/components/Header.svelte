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

  // クウカン編集の間は、編集画面の見出しの「元に戻す・やり直す」を使う（レビュー1 R-B8）
  const showHistory = $derived($app.screen !== 'editor');
  const onKuukan = $derived($app.screen === 'kuukans' || $app.screen === 'view' || $app.screen === 'editor');

  // ファイル名のメニュー（R-HD）
  let fileMenuOpen = $state(false);
  let fileMenuEl = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!fileMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (fileMenuEl && !fileMenuEl.contains(e.target as Node)) fileMenuOpen = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fileMenuOpen = false;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  });

  function menuSaveAs(): void {
    fileMenuOpen = false;
    void app.saveAs();
  }

  function menuClose(): void {
    fileMenuOpen = false;
    void app.closeDocument();
  }

</script>

{#snippet tab(label: string, active: boolean, onclick: () => void, sub = false)}
  <button
    type="button"
    class="nav-tab ghost"
    class:sub
    class:active
    aria-current={active ? 'page' : undefined}
    {onclick}
  >
    {label}
  </button>
{/snippet}

<header class="header">
  <div class="header-bar">
    <div class="header-left">
      <div class="file-block" bind:this={fileMenuEl}>
        <button
          type="button"
          class="file-name"
          title="{$app.fileName ?? '名称未設定'}（押すとファイルのメニュー）"
          aria-haspopup="menu"
          aria-expanded={fileMenuOpen}
          onclick={() => (fileMenuOpen = !fileMenuOpen)}
        >
          {$app.fileName ?? '名称未設定'}
        </button>
        {#if fileMenuOpen}
          <div class="file-menu" role="menu">
            <button type="button" role="menuitem" onclick={menuSaveAs}>別の名前で保存</button>
            <button type="button" role="menuitem" onclick={menuClose}>閉じる（最初の画面へ）</button>
          </div>
        {/if}
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
        <button type="button" class="primary small" onclick={() => void app.save()}>
          {saveButtonLabel}
        </button>
      {/if}

      {#if showHistory}
        <div class="history-actions" role="group" aria-label="元に戻す・やり直す">
          <button type="button" class="ghost small" disabled={!$app.canUndo} onclick={() => app.undo()} title="直前の操作を取り消します">元に戻す</button>
          <button type="button" class="ghost small" disabled={!$app.canRedo} onclick={() => app.redo()} title="取り消した操作をやり直します">やり直す</button>
        </div>
      {/if}
    </div>

    <nav class="nav nav-main nav-pc" aria-label="画面の切り替え">
      {@render tab('クウカン', onKuukan, () => app.setScreen('kuukans'))}
      {@render tab('サガシモノ', $app.screen === 'search', () => app.setScreen('search'))}
    </nav>

    <div class="header-right">
      <nav class="nav nav-sub nav-pc" aria-label="管理と設定">
        {@render tab('管理', $app.screen === 'manage', () => app.setScreen('manage'), true)}
        {@render tab('設定', $app.screen === 'settings', () => app.setScreen('settings'), true)}
      </nav>
      <button type="button" class="help-btn" onclick={() => app.openHelp()} title="この画面の使い方">
        <span aria-hidden="true">？</span><span class="help-label">ヘルプ</span>
      </button>
    </div>
  </div>

  <nav class="nav nav-mobile" aria-label="画面の切り替え（スマホ）">
    <div class="mobile-main">
      {@render tab('クウカン', onKuukan, () => app.setScreen('kuukans'))}
      {@render tab('サガシモノ', $app.screen === 'search', () => app.setScreen('search'))}
    </div>
    <div class="mobile-sub">
      {@render tab('管理', $app.screen === 'manage', () => app.setScreen('manage'), true)}
      {@render tab('設定', $app.screen === 'settings', () => app.setScreen('settings'), true)}
    </div>
  </nav>
</header>

<style>
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--header-height);
    padding: var(--space-1) var(--space-4);
  }

  /* ファイル（名前と保存の状態）と、操作（元に戻す・やり直す）は別のまとまり。罫線と間隔で分ける */
  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
  }

  .file-block {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  /* ファイル名は押せる（メニュー）。下線と、乗せたときの色だけで示す */
  .file-name {
    font-weight: 600;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: none;
    background: transparent;
    padding: 0;
    min-height: auto;
    color: var(--text);
    text-decoration: underline;
    text-decoration-color: var(--border);
    text-underline-offset: 4px;
    cursor: pointer;
  }

  .file-name:hover,
  .file-name[aria-expanded='true'] {
    color: var(--accent);
    text-decoration-color: var(--accent);
    background: transparent;
  }

  .file-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    padding: var(--space-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .file-menu button {
    justify-content: flex-start;
    border: none;
    background: transparent;
    text-align: left;
  }

  .file-menu button:hover {
    background: var(--surface-2);
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
    padding-left: var(--space-4);
    border-left: 1px solid var(--border);
  }

  .nav {
    display: flex;
    gap: var(--space-1);
  }

  .nav-tab {
    position: relative;
    border-radius: var(--radius);
  }

  .nav-main .nav-tab {
    min-width: 112px;
    font-size: var(--font-size);
  }

  .nav-tab.active {
    background: var(--surface-2);
    font-weight: 600;
  }

  .nav-main .nav-tab.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .nav-tab.sub {
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .nav-tab.sub.active {
    color: var(--text);
  }

  .header-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .help-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
  }

  .help-btn > span:first-child {
    font-weight: 700;
    color: var(--accent);
  }

  .nav-mobile {
    display: none;
    border-top: 1px solid var(--border);
    padding: var(--space-1) var(--space-2);
    gap: var(--space-2);
  }

  @media (max-width: 767px) {
    .nav-pc {
      display: none;
    }

    .header-bar {
      display: flex;
      justify-content: space-between;
      padding: var(--space-1) var(--space-2);
    }

    .header-left {
      gap: var(--space-2);
    }

    .history-actions {
      padding-left: var(--space-2);
    }

    .file-name {
      max-width: 120px;
    }

    .help-label {
      display: none;
    }

    .help-btn {
      padding: 0 var(--space-2);
      min-width: 36px;
      justify-content: center;
    }

    .nav-mobile {
      display: flex;
    }

    .mobile-main {
      display: flex;
      flex: 2;
      gap: var(--space-1);
    }

    .mobile-main .nav-tab {
      flex: 1;
    }

    .mobile-main .nav-tab.active {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .mobile-sub {
      display: flex;
      flex: 1;
      gap: var(--space-1);
    }

    .mobile-sub .nav-tab {
      flex: 1;
      padding: 0 var(--space-1);
    }
  }
</style>
