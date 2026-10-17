<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  const onKuukan = $derived(
    $app.screen === 'kuukans' || $app.screen === 'view'
  );
</script>

<nav class="bottom-nav" aria-label="モバイルナビゲーション">
  <button
    type="button"
    class="nav-item main"
    class:active={onKuukan}
    aria-current={onKuukan ? 'page' : undefined}
    onclick={() => app.setScreen('kuukans')}
  >
    <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
    <span class="nav-label">クウカン</span>
  </button>

  <button
    type="button"
    class="nav-item main"
    class:active={$app.screen === 'search'}
    aria-current={$app.screen === 'search' ? 'page' : undefined}
    onclick={() => app.setScreen('search')}
  >
    <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <span class="nav-label">サガシモノ</span>
  </button>

  <button
    type="button"
    class="nav-item sub sub-first"
    class:active={$app.screen === 'manage'}
    aria-current={$app.screen === 'manage' ? 'page' : undefined}
    onclick={() => app.setScreen('manage')}
  >
    <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
    <span class="nav-label">管理</span>
  </button>

  <button
    type="button"
    class="nav-item sub"
    class:active={$app.screen === 'settings'}
    aria-current={$app.screen === 'settings' ? 'page' : undefined}
    onclick={() => app.setScreen('settings')}
  >
    <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
    <span class="nav-label">設定</span>
  </button>
</nav>

<style>
  .bottom-nav {
    display: none;
  }

  @media (max-width: 767.98px) {
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: calc(56px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--surface);
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-around;
      z-index: 60;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
    }

    .nav-item {
      flex: 1;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 0;
      transition: color var(--duration-fast), transform var(--duration-fast);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .nav-item:active {
      transform: scale(0.94);
    }

    .nav-svg {
      width: 20px;
      height: 20px;
      transition: transform var(--duration-fast);
    }

    .nav-label {
      font-size: 10px;
      font-weight: 500;
      line-height: 1;
    }

    .nav-item.active {
      color: var(--accent);
    }

    /* 主役の「クウカン」「サガシモノ」は広く、「管理」「設定」は狭く控えめに。間を罫線で分ける（レビュー1 R-HD） */
    .nav-item.main {
      flex: 2;
    }

    .nav-item.main .nav-label {
      font-size: 11px;
    }

    .nav-item.sub {
      flex: 1;
    }

    .nav-item.sub .nav-svg {
      width: 17px;
      height: 17px;
    }

    .nav-item.sub-first {
      position: relative;
    }

    .nav-item.sub-first::before {
      content: '';
      position: absolute;
      left: 0;
      top: 20%;
      bottom: 20%;
      border-left: 1px solid var(--border);
    }

    .nav-item.active .nav-svg {
      transform: translateY(-1px);
    }

    .nav-item.active .nav-label {
      font-weight: 700;
    }
  }
</style>
