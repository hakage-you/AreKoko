<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id } from '../../core/types';
  import { createTag } from '../../core/ops/tags';
  import { normalizeForMatch } from '../../search/normalize';

  interface Props {
    title: string;
    candidates?: Id[];
    exclude?: Id[];
    allowCreate: boolean;
    onSelect: (tag: Id) => void;
    onClose: () => void;
  }

  let {
    title,
    candidates,
    exclude,
    allowCreate,
    onSelect,
    onClose,
  }: Props = $props();

  const app = getApp();
  let searchQuery = $state('');

  const filteredTags = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return [];
    const excludeSet = new Set(exclude ?? []);
    const candidateSet = candidates ? new Set(candidates) : null;

    let list = doc.membership.tags.filter((t) => {
      if (excludeSet.has(t.id)) return false;
      if (candidateSet && !candidateSet.has(t.id)) return false;
      return true;
    });

    const q = normalizeForMatch(searchQuery);
    if (q) {
      list = list.filter((t) => normalizeForMatch(t.name).includes(q));
    }

    return list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  });

  function handleCreate() {
    const name = searchQuery.trim();
    if (!name) return;
    const res = app.apply((doc, ctx) => createTag(doc, { name }, ctx));
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
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tag-picker-title">
    <div class="dialog-header picker-header">
      <span id="tag-picker-title">{title}</span>
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
          placeholder="タグを検索…"
          aria-label="タグを検索"
        />
      </div>

      <div class="items-list">
        {#each filteredTags as tag (tag.id)}
          <button
            type="button"
            class="list-item"
            onclick={() => onSelect(tag.id)}
          >
            <span class="item-name">{tag.name}</span>
          </button>
        {/each}

        {#if filteredTags.length === 0 && (!allowCreate || !searchQuery.trim())}
          <div class="empty muted">該当するタグがありません</div>
        {/if}

        {#if allowCreate && searchQuery.trim().length > 0}
          <button
            type="button"
            class="list-item create-item"
            onclick={handleCreate}
          >
            <span>新しいタグ「{searchQuery.trim()}」を作る</span>
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
