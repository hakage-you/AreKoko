<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  let isDraggingOver = $state(false);
  let dragDepth = $state(0);

  function handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    dragDepth++;
    if (e.dataTransfer?.types.includes('Files')) {
      isDraggingOver = true;
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      isDraggingOver = false;
    }
  }

  async function handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    dragDepth = 0;
    isDraggingOver = false;
    if (e.dataTransfer) {
      await app.openDroppedFile(e.dataTransfer);
    }
  }

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="start-screen"
  class:is-dragging={isDraggingOver}
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="start-card">
    {#if isDraggingOver}
      <div class="drop-overlay">
        <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <p class="drop-title">ファイルをドロップして開く</p>
        <p class="drop-subtitle">.json ファイルに対応しています</p>
      </div>
    {/if}

    <header class="app-hero">
      <h1 class="app-title">アレココ</h1>
      <p class="app-tagline">
        物の置き場所を、自分で描いた間取りとリストで管理します。<br />
        データはあなたの端末にのみ保存され、外部送信もされません。
      </p>
    </header>

    <div class="primary-actions-group">
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
      <p class="drop-hint">またはファイルを画面にドラッグ＆ドロップ</p>
    </div>

    <div class="sample-action">
      <button
        type="button"
        class="sample-btn"
        onclick={() => void app.openSampleDocument()}
      >
        <span class="sample-badge">お試し</span>
        <span class="sample-text">見本データですぐ触ってみる</span>
        <span class="sample-subtext">ファイル不要</span>
      </button>
    </div>

    {#if !$app.supportsOverwrite}
      <p class="overwrite-warning">
        このブラウザでは開いたファイルへの直接上書きができません。保存のたびにファイルがダウンロードされます（Chrome・Edge なら上書き保存と自動保存が使えます）
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
    position: relative;
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
    transition: border-color var(--duration-fast);
  }

  .start-screen.is-dragging .start-card {
    border-color: var(--accent);
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    background: var(--surface);
    border: 2px dashed var(--accent);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    z-index: 20;
    pointer-events: none;
    box-shadow: var(--shadow);
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .drop-icon {
    width: 44px;
    height: 44px;
    color: var(--accent);
    margin-bottom: var(--space-1);
  }

  .drop-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--accent);
  }

  .drop-subtitle {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .app-hero {
    text-align: center;
  }

  .app-title {
    margin: 0 0 var(--space-3);
    font-size: 30px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.04em;
  }

  .app-tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-size);
    line-height: 1.6;
  }

  .primary-actions-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .primary-actions {
    display: flex;
    gap: var(--space-3);
  }

  .drop-hint {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
  }

  .sample-action {
    display: flex;
  }

  .sample-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    background: var(--accent-soft);
    border: 1px dashed var(--accent);
    color: var(--accent);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-small);
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .sample-btn:hover {
    background: var(--surface-2);
    transform: translateY(-1px);
  }

  .sample-badge {
    background: var(--accent);
    color: var(--accent-text);
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }

  .sample-text {
    flex: 1;
    text-align: left;
    font-weight: 600;
  }

  .sample-subtext {
    color: var(--text-muted);
    font-size: 11px;
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
