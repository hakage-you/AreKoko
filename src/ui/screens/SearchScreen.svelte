<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import { searchItems } from '../../search/search';
  import { addItem } from '../../core/ops/items';
  import SearchBar from '../components/SearchBar.svelte';
  import ItemTable from '../components/ItemTable.svelte';
  import BulkBar from '../components/BulkBar.svelte';
  import ItemDetail from '../components/ItemDetail.svelte';

  const app = getApp();

  const results = $derived($app.doc ? searchItems($app.doc, $app.query) : []);

  let isAdding = $state(false);
  let newItemName = $state('');

  function handleAddItem(): void {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    const res = app.apply((doc, ctx) =>
      addItem(doc, { name: trimmed, place: $app.query.place }, ctx)
    );
    const createdId = res?.created[0];
    if (createdId !== undefined) {
      app.showDetail(createdId);
      newItemName = '';
      isAdding = false;
    }
  }

  function handleCancelAdd(): void {
    isAdding = false;
    newItemName = '';
  }
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

        {#if isAdding}
          <div class="add-form">
            <input
              type="text"
              placeholder="モノの名前"
              use:autofocus
              bind:value={newItemName}
              onkeydown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') handleCancelAdd();
              }}
            />
            <button type="button" class="primary" onclick={handleAddItem}>
              追加
            </button>
            <button type="button" onclick={handleCancelAdd}>
              取り消し
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="primary add-button"
            onclick={() => {
              isAdding = true;
              newItemName = '';
            }}
          >
            ＋モノを追加
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
    <aside class="detail-sidebar" aria-label="モノの詳細">
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

  .add-button {
    white-space: nowrap;
  }

  .add-form {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .add-form input {
    width: 180px;
  }

  .table-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-sidebar {
    width: var(--detail-width);
    border-left: 1px solid var(--border);
    background: var(--surface);
    height: 100%;
    overflow-y: auto;
    flex-shrink: 0;
    z-index: 20;
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
      justify-content: space-between;
    }

    .add-form {
      flex: 1;
    }

    .add-form input {
      flex: 1;
      width: auto;
    }

    .detail-sidebar {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      border-left: none;
      z-index: 50;
    }
  }
</style>
