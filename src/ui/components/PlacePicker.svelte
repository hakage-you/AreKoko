<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id } from '../../core/types';
  import { placeCandidates } from '../../core/places';
  import {
    groupPlaceTreeNodes,
    searchPlaceCandidates,
    type PlaceSection,
    type PlaceSearchResult,
  } from './placeTree';

  interface Props {
    title: string;
    itemIds: Id[];
    current?: Id | null;
    activeKuukan?: Id | null;
    onSelect: (place: Id) => void;
    onClose: () => void;
  }

  let {
    title,
    itemIds,
    current = null,
    activeKuukan = null,
    onSelect,
    onClose,
  }: Props = $props();
  const app = getApp();

  // 指定がなければ現在の表示中クウカンを使用
  const effectiveActiveKuukan = $derived(activeKuukan ?? $app.view?.kuukan ?? null);

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

  const searchResults = $derived.by((): PlaceSearchResult[] => {
    const doc = $app.doc;
    if (!doc || !isSearching) return [];
    return searchPlaceCandidates(
      doc,
      candidateIds,
      searchQuery,
      current,
      effectiveActiveKuukan,
    );
  });

  const treeSections = $derived.by((): PlaceSection[] => {
    const doc = $app.doc;
    if (!doc || isSearching) return [];
    return groupPlaceTreeNodes({
      doc,
      candidateIds,
      current,
      activeKuukanId: effectiveActiveKuukan,
    });
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
                class:active-kuukan-item={item.isActiveKuukan}
                onclick={() => onSelect(item.id)}
              >
                <div class="item-info">
                  <span class="item-name">{item.name}</span>
                  <span class="item-path muted small">{item.path}</span>
                </div>
                <div class="item-badges">
                  {#if item.isActiveKuukan}
                    <span class="chip accent-subtle small">表示中</span>
                  {/if}
                  {#if item.isCurrent}
                    <span class="chip accent small">現在</span>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        {:else}
          {#if treeSections.length === 0}
            <div class="empty muted">候補がありません</div>
          {:else}
            {#each treeSections as section (section.id)}
              <div
                class="tree-section"
                class:is-active-section={section.type === 'active'}
                class:is-unset-section={section.type === 'unset'}
              >
                {#if section.title}
                  <div class="section-header">
                    <span class="section-title">{section.title}</span>
                    {#if section.badge}
                      <span class="chip accent small section-badge">{section.badge}</span>
                    {/if}
                  </div>
                {/if}
                <div class="section-nodes">
                  {#each section.nodes as node (node.id)}
                    <button
                      type="button"
                      class="list-item tree-item"
                      class:is-active-root={section.type === 'active' && node.depth === 0}
                      style="padding-left: calc(var(--space-3) + {node.depth} * 16px);"
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
                </div>
              </div>
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

  .tree-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tree-section.is-active-section {
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .tree-section.is-active-section .list-item:hover:not(:disabled) {
    background: var(--surface);
  }

  .tree-section.is-unset-section {
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-2);
    border-bottom: 1px dashed var(--border);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    margin-bottom: 2px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  .is-active-section .section-title {
    color: var(--accent);
  }

  .section-nodes {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .is-active-root {
    font-weight: 600;
  }

  .item-badges {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .chip.accent-subtle {
    background: var(--surface);
    color: var(--accent);
    border: 1px solid var(--accent);
  }

  .active-kuukan-item {
    background: var(--accent-soft);
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
