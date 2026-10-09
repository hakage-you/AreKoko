<script lang="ts">
  import { getApp } from '../context';
  import { searchItems } from '../../search/search';
  import SearchBar from '../components/SearchBar.svelte';
  import ItemTable from '../components/ItemTable.svelte';
  import BulkBar from '../components/BulkBar.svelte';
  import ItemDetail from '../components/ItemDetail.svelte';

  const app = getApp();

  const results = $derived($app.doc ? searchItems($app.doc, $app.query) : []);

  function handleSelectAll(): void {
    const next = new Set($app.selection);
    for (const it of results) {
      next.add(it.id);
    }
    app.setSelection(next);
  }

  function handleDeselectAll(): void {
    app.setSelection([]);
  }

  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && $app.detail) {
        app.showDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="search-screen">
  <div class="main-content">
    <SearchBar />

    <div class="toolbar">
      <div class="grouping-controls">
        <span class="toolbar-label">まとめ方:</span>
        <div class="button-group" role="group" aria-label="まとめ方">
          <button
            type="button"
            class="group-btn"
            class:active={$app.grouping === 'none'}
            onclick={() => app.setGrouping('none')}
          >
            なし
          </button>
          <button
            type="button"
            class="group-btn"
            class:active={$app.grouping === 'category'}
            onclick={() => app.setGrouping('category')}
          >
            カテゴリ
          </button>
          <button
            type="button"
            class="group-btn"
            class:active={$app.grouping === 'place'}
            onclick={() => app.setGrouping('place')}
          >
            置き場
          </button>
          <button
            type="button"
            class="group-btn"
            class:active={$app.grouping === 'tag'}
            onclick={() => app.setGrouping('tag')}
          >
            タグ
          </button>
        </div>
      </div>

      <div class="toolbar-actions">
        <span class="count-label">{results.length}件</span>
        <button
          type="button"
          class="small mobile-select-btn"
          disabled={results.length === 0}
          onclick={handleSelectAll}
        >
          すべて選ぶ
        </button>
        {#if $app.selection.size > 0}
          <button
            type="button"
            class="small ghost mobile-select-btn"
            onclick={handleDeselectAll}
          >
            選択を外す
          </button>
        {/if}
      </div>
    </div>

    <div class="table-area">
      <ItemTable items={results} />
    </div>

    {#if $app.selection.size > 0}
      <BulkBar />
    {/if}
  </div>

  {#if $app.detail}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="detail-backdrop"
      role="presentation"
      onclick={() => app.showDetail(null)}
    ></div>
    <aside class="detail-drawer" aria-label="モノの詳細">
      <ItemDetail id={$app.detail} onClose={() => app.showDetail(null)} />
    </aside>
  {/if}
</div>

<style>
  .search-screen {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: var(--bg);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    gap: var(--space-3);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .grouping-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .toolbar-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .button-group {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface);
  }

  .group-btn {
    min-height: var(--touch);
    padding: 0 var(--space-3);
    border: none;
    border-right: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--font-size-small);
    cursor: pointer;
  }

  .group-btn:last-child {
    border-right: none;
  }

  .group-btn:hover:not(.active) {
    background: var(--surface-2);
  }

  .group-btn.active {
    background: var(--accent);
    color: var(--accent-text);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
  }

  .count-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    font-weight: 500;
    white-space: nowrap;
  }

  .mobile-select-btn {
    display: none;
  }

  .table-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-backdrop {
    position: absolute;
    inset: 0;
    background: var(--overlay);
    z-index: 40;
    opacity: 0.5;
    animation: fadeIn 0.15s ease;
  }

  .detail-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 100vw);
    z-index: 50;
    border-left: 1px solid var(--border);
    background: var(--surface);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
    overflow-y: auto;
    overflow-x: hidden;
    animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 0.5;
    }
  }

  @media (max-width: 767.98px) {
    .toolbar {
      padding: var(--space-2);
    }

    .grouping-controls {
      width: 100%;
      justify-content: space-between;
    }

    .toolbar-actions {
      width: 100%;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    .mobile-select-btn {
      display: inline-flex;
    }

    .detail-drawer {
      width: 100%;
      border-left: none;
    }
  }
</style>
