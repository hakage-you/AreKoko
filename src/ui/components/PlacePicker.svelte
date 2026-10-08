<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id } from '../../core/types';
  import { NIL_ID, UNSET_NAME, NAMELESS_NAME } from '../../core/constants';
  import { getIndexes } from '../../core/indexes';
  import { displayName, formatPlacePath, placeCandidates } from '../../core/places';
  import { normalizeForMatch } from '../../search/normalize';

  interface Props {
    title: string;
    itemIds: Id[];
    current?: Id | null;
    onSelect: (place: Id) => void;
    onClose: () => void;
  }

  let { title, itemIds, current = null, onSelect, onClose }: Props = $props();
  const app = getApp();

  let searchQuery = $state('');

  const candidateIds = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return new Set<Id>();
    return new Set(
      itemIds.length === 0
        ? [
            ...doc.membership.kuukans.map((k) => k.id),
            ...doc.membership.areas.map((a) => a.id),
          ]
        : placeCandidates(doc, itemIds),
    );
  });

  const isSearching = $derived(searchQuery.trim().length > 0);

  const searchResults = $derived.by(() => {
    const doc = $app.doc;
    if (!doc || !isSearching) return [];
    const q = normalizeForMatch(searchQuery);
    const results: { id: Id; name: string; path: string; isCurrent: boolean }[] = [];

    for (const id of candidateIds) {
      const name = displayName(doc, id);
      const path = formatPlacePath(doc, id);
      if (normalizeForMatch(name).includes(q) || normalizeForMatch(path).includes(q)) {
        results.push({
          id,
          name,
          path,
          isCurrent: id === current,
        });
      }
    }
    return results;
  });

  interface FlatNode {
    id: Id;
    name: string;
    depth: number;
    isStorage?: boolean;
    isCurrent: boolean;
    isSelectable: boolean;
  }

  const treeNodes = $derived.by(() => {
    const doc = $app.doc;
    if (!doc || isSearching) return [];
    const d = doc;
    const indexes = getIndexes(doc);
    const nodes: FlatNode[] = [];
    const visited = new Set<Id>();

    // 1. 未設定クウカン
    if (candidateIds.has(NIL_ID)) {
      nodes.push({
        id: NIL_ID,
        name: UNSET_NAME,
        depth: 0,
        isCurrent: current === NIL_ID,
        isSelectable: true,
      });
    }

    function traversePlace(placeId: Id, depth: number) {
      // エリア
      const areas =
        indexes.areaById.has(placeId)
          ? (indexes.childAreas.get(placeId) ?? [])
          : d.membership.areas.filter((a) => a.kuukan === placeId && a.parent === null);

      for (const area of areas) {
        if (visited.has(area.id)) continue;
        visited.add(area.id);

        nodes.push({
          id: area.id,
          name: area.name,
          depth,
          isCurrent: current === area.id,
          isSelectable: candidateIds.has(area.id),
        });

        traversePlace(area.id, depth + 1);
      }

      // 置かれた収納
      const itemsInPlace = indexes.itemsByPlace.get(placeId) ?? [];
      for (const it of itemsInPlace) {
        const storageKuukan = indexes.kuukanByOwner.get(it.id);
        if (!storageKuukan) continue;
        if (visited.has(storageKuukan.id)) continue;
        visited.add(storageKuukan.id);

        nodes.push({
          id: storageKuukan.id,
          name: it.name,
          depth,
          isStorage: true,
          isCurrent: current === storageKuukan.id,
          isSelectable: candidateIds.has(storageKuukan.id),
        });

        traversePlace(storageKuukan.id, depth + 1);
      }
    }

    // 2. 最上位クウカン
    const topKuukans = doc.membership.kuukans.filter(
      (k) => k.id !== NIL_ID && k.owner === null,
    );

    for (const k of topKuukans) {
      if (visited.has(k.id)) continue;
      visited.add(k.id);

      nodes.push({
        id: k.id,
        name: k.name ?? NAMELESS_NAME,
        depth: 0,
        isCurrent: current === k.id,
        isSelectable: candidateIds.has(k.id),
      });

      traversePlace(k.id, 1);
    }

    return nodes;
  });

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
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="picker-title">
    <div class="dialog-header picker-header">
      <span id="picker-title">{title}</span>
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
          placeholder="置き場を検索…"
          aria-label="置き場を検索"
        />
      </div>

      <div class="items-list">
        {#if isSearching}
          {#if searchResults.length === 0}
            <div class="empty muted">該当する置き場が見つかりません</div>
          {:else}
            {#each searchResults as item (item.id)}
              <button
                type="button"
                class="list-item"
                onclick={() => onSelect(item.id)}
              >
                <div class="item-info">
                  <span class="item-name">{item.name}</span>
                  <span class="item-path muted small">{item.path}</span>
                </div>
                {#if item.isCurrent}
                  <span class="chip accent small">現在</span>
                {/if}
              </button>
            {/each}
          {/if}
        {:else}
          {#if treeNodes.length === 0}
            <div class="empty muted">候補がありません</div>
          {:else}
            {#each treeNodes as node (node.id)}
              <button
                type="button"
                class="list-item tree-item"
                style="padding-left: calc(var(--space-3) + {node.depth} * 20px);"
                disabled={!node.isSelectable}
                onclick={() => {
                  if (node.isSelectable) onSelect(node.id);
                }}
              >
                <div class="item-info">
                  <span class="item-name">{node.name}</span>
                  {#if node.isStorage}
                    <span class="chip small">収納</span>
                  {/if}
                </div>
                {#if node.isCurrent}
                  <span class="chip accent small">現在</span>
                {/if}
              </button>
            {/each}
          {/if}
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

  .list-item:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .list-item:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .item-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .item-name {
    font-weight: 500;
  }

  .item-path {
    display: block;
    width: 100%;
  }

  .empty {
    padding: var(--space-5);
    text-align: center;
  }

  .close-btn {
    min-width: var(--touch);
    min-height: var(--touch);
    padding: 0;
  }
</style>
