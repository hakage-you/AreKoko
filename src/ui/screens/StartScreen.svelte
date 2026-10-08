<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  function formatOpenedAt(openedAt: number): string {
    try {
      const date = new Date(openedAt);
      if (Number.isNaN(date.getTime())) return '';
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      return `${y}/${m}/${d} ${h}:${min}`;
    } catch {
      return "";
    }
  }
</script>

<div class="start-screen">
  <div class="start-card">
    <header class="app-hero">
      <h1 class="app-title">アレココ</h1>
      <p class="app-tagline">物の置き場所を、自分で描いた間取りとリストで管理します</p>
    </header>

    <div class="primary-actions">
      <button
        type="button"
        class="primary action-btn"
        onclick={() => void app.newDocument()}
      >
        新しく作る
      </button>
      <button
        type="button"
        class="action-btn"
        onclick={() => void app.openFile()}
      >
        ファイルを開く
      </button>
    </div>

    {#if !$app.supportsOverwrite}
      <p class="overwrite-warning">
        このブラウザでは上書き保存ができません。保存はファイルの書き出しになります（Chrome・Edge なら上書き保存と自動保存が使えます）
      </p>
    {/if}

    {#if $app.recent.length > 0}
      <section class="recent-section">
        <h2 class="recent-heading">最近開いたファイル</h2>
        <ul class="recent-list">
          {#each $app.recent as entry}
            <li class="recent-item">
              <button
                type="button"
                class="ghost recent-button"
                onclick={() => void app.openRecent(entry)}
              >
                <span class="recent-name">{entry.name}</span>
                <span class="recent-date">{formatOpenedAt(entry.openedAt)}</span>
              </button>
              <button
                type="button"
                class="ghost remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  void app.removeRecent(entry);
                }}
                title="一覧から外す"
              >
                一覧から外す
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .start-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: var(--space-5) var(--space-4);
    box-sizing: border-box;
  }

  .start-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: var(--space-6);
    max-width: 560px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .app-hero {
    text-align: center;
  }

  .app-title {
    margin: 0 0 var(--space-2);
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
  }

  .app-tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size);
    line-height: var(--line-height);
  }

  .primary-actions {
    display: flex;
    gap: var(--space-3);
  }

  .action-btn {
    flex: 1;
    font-size: var(--font-size-large);
    padding: var(--space-3) var(--space-4);
  }

  .overwrite-warning {
    margin: 0;
    padding: var(--space-3);
    background: var(--warning-soft);
    border: 1px solid var(--warning);
    border-radius: var(--radius-small);
    color: var(--warning);
    font-size: var(--font-size-small);
    line-height: var(--line-height);
  }

  .recent-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .recent-heading {
    margin: 0;
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-muted);
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .recent-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .recent-item:last-child {
    border-bottom: none;
  }

  .recent-button {
    flex: 1;
    justify-content: space-between;
    text-align: left;
    border-radius: 0;
    padding: 0 var(--space-3);
    overflow: hidden;
  }

  .recent-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: var(--space-2);
  }

  .recent-date {
    color: var(--text-muted);
    font-size: var(--font-size-small);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .remove-btn {
    flex-shrink: 0;
    border-radius: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
    padding: 0 var(--space-3);
  }

  .remove-btn:hover:not(:disabled) {
    color: var(--danger);
  }

  @media (max-width: 767px) {
    .start-card {
      padding: var(--space-4);
    }

    .primary-actions {
      flex-direction: column;
    }
  }
</style>
