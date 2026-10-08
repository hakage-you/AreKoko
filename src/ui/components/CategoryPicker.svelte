<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id } from '../../core/types';
  import { getIndexes } from '../../core/indexes';
  import { createCategory } from '../../core/ops/categories';
  import { normalizeForMatch } from '../../search/normalize';

  interface Props {
    title: string;
    current?: Id | null;
    allowNone: boolean;
    allowCreate: boolean;
    exclude?: Id;
    onSelect: (category: Id | null) => void;
    onClose: () => void;
  }

  let {
    title,
    current = null,
    allowNone,
    allowCreate,
    exclude,
    onSelect,
    onClose,
  }: Props = $props();

  const app = getApp();
  let searchQuery = $state('');

  const isSearching = $derived(searchQuery.trim().length > 0);

  const excludedIds = $derived.by(() => {
    if (!exclude || !$app.doc) return new Set<Id>();
    const indexes = getIndexes($app.doc);
    const result = new Set<Id>([exclude]);
    const queue = [exclude];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = indexes.childCategories.get(parentId) ?? [];
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return result;
  });

  interface CatNode {
    id: Id;
    name: string;
    depth: number;
    isCurrent: boolean;
  }

  const treeNodes = $derived.by(() => {
    const doc = $app.doc;
    if (!doc || isSearching) return [];
    const indexes = getIndexes(doc);
    const nodes: CatNode[] = [];

    function traverse(parentId: Id | null, depth: number) {
      const children = indexes.childCategories.get(parentId) ?? [];
      for (const c of children) {
        if (excludedIds.has(c.id)) continue;
        nodes.push({
          id: c.id,
          name: c.name,
          depth,
          isCurrent: current === c.id,
        });
        traverse(c.id, depth + 1);
      }
    }

    traverse(null, 0);
    return nodes;
  });

  const searchResults = $derived.by(() => {
    const doc = $app.doc;
    if (!doc || !isSearching) return [];
    const q = normalizeForMatch(searchQuery);
    return doc.membership.categories
      .filter((c) => !excludedIds.has(c.id) && normalizeForMatch(c.name).includes(q))
      .map((c) => ({
        id: c.id,
        name: c.name,
        isCurrent: current === c.id,
      }));
  });

  const showNoneOption = $derived.by(() => {
    if (!allowNone) return false;
    if (!isSearching) return true;
    return normalizeForMatch('未分類').includes(normalizeForMatch(searchQuery));
  });

  function handleCreate() {
    const name = searchQuery.trim();
    if (!name) return;
    const res = app.apply((doc, ctx) => createCategory(doc, { name }, ctx));
    const createdId = res?.created[0];
    if (createdId) {
      onSelect(createdId);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="dialog-overlay"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
  role="presentation"
>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cat-picker-title">
    <div class="dialog-header picker-header">
      <span id="cat-picker-title">{title}</span>
      <button type="button" class="ghost small close-btn" onclick={onClose} aria-label="閉じる">
        ✕
      </button>
    </div>

    <div class="dialog-body picker-body">
      <div class="search-input-wrap">
        <input
          use:autofocus
          type="search"
          bind:value={searchQuery}
          placeholder="カテゴリを検索…"
          aria-label="カテゴリを検索"
        />
      </div>

      <div class="items-list">
        {#if showNoneOption}
          <button
            type="button"
            class="list-item"
            onclick={() => onSelect(null)}
          >
            <span class="item-name">未分類</span>
            {#if current === null}
              <span class="chip accent small">現在</span>
            {/if}
          </button>
        {/if}

        {#if isSearching}
          {#each searchResults as item (item.id)}
            <button
              type="button"
              class="list-item"
              onclick={() => onSelect(item.id)}
            >
              <span class="item-name">{item.name}</span>
              {#if item.isCurrent}
                <span class="chip accent small">現在</span>
              {/if}
            </button>
          {/each}
        {:else}
          {#each treeNodes as node (node.id)}
            <button
              type="button"
              class="list-item"
              style="padding-left: calc(var(--space-3) + {node.depth} * 20px);"
              onclick={() => onSelect(node.id)}
            >
              <span class="item-name">{node.name}</span>
              {#if node.isCurrent}
                <span class="chip accent small">現在</span>
              {/if}
            </button>
          {/each}
        {/if}

        {#if allowCreate && isSearching}
          <button
            type="button"
            class="list-item create-item"
            onclick={handleCreate}
          >
            <span>新しいカテゴリ「{searchQuery.trim()}」を作る</span>
          </button>
        {/if}
      </div>
    </div>

    <div class="dialog-footer">
      <button type="button" class="ghost" onclick={onClose}>キャンセル</button>
    </div>
  </div>
</div>

<style>
  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .picker-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 280px;
    max-height: 480px;
  }

  .search-input-wrap {
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-y: auto;
  }

  .list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-small);
    width: 100%;
    text-align: left;
    cursor: pointer;
  }

  .list-item:hover {
    background: var(--surface-2);
  }

  .item-name {
    font-weight: 500;
  }

  .create-item {
    color: var(--accent);
    font-weight: 500;
    border-top: 1px dashed var(--border);
    margin-top: var(--space-2);
  }

  .close-btn {
    min-width: var(--touch);
    min-height: var(--touch);
    padding: 0;
  }
</style>
