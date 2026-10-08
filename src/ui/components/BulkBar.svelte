<script lang="ts">
  import { getApp } from '../context';
  import {
    addTagToItems,
    deleteItems,
    moveItems,
    planDeleteItems,
    removeTagFromItems,
    setItemsCategory,
  } from '../../core/ops/items';
  import { formatPlacePath } from '../../core/places';
  import type { Id } from '../../core/types';
  import PlacePicker from './PlacePicker.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import TagPicker from './TagPicker.svelte';

  const app = getApp();

  let showPlacePicker = $state(false);
  let showCategoryPicker = $state(false);
  let showAddTagPicker = $state(false);
  let showRemoveTagPicker = $state(false);

  const selectedIds = $derived(Array.from($app.selection));
  const count = $derived(selectedIds.length);

  const candidateTags = $derived.by(() => {
    if (!$app.doc) return [];
    const idSet = new Set(selectedIds);
    const tagSet = new Set<Id>();
    for (const item of $app.doc.membership.items) {
      if (idSet.has(item.id)) {
        for (const tagId of item.tags) {
          tagSet.add(tagId);
        }
      }
    }
    return Array.from(tagSet);
  });

  function handleDelete(): void {
    if (!$app.doc || selectedIds.length === 0) return;
    const doc = $app.doc;
    const relocations = planDeleteItems(doc, selectedIds);
    const details = relocations.map((r) => {
      const fromPath = formatPlacePath(doc, r.from);
      const toPath = formatPlacePath(doc, r.to);
      return `${fromPath} から ${r.items.length}件 → ${toPath}`;
    });

    app.confirm({
      title: 'モノの削除',
      message: `${count}件のモノを削除します。`,
      details,
      confirmLabel: '削除',
      danger: true,
      onConfirm: () => {
        app.apply((d, ctx) => deleteItems(d, selectedIds, ctx));
        app.setSelection([]);
      },
    });
  }
</script>

<div class="bulk-bar" role="toolbar" aria-label="まとめての操作">
  <div class="selection-info">
    <span class="selection-count">{count}件を選択中</span>
  </div>

  <div class="actions">
    <button
      type="button"
      class="action-btn"
      onclick={() => { showPlacePicker = true; }}
    >
      置き場を変更
    </button>

    <button
      type="button"
      class="action-btn"
      onclick={() => { showCategoryPicker = true; }}
    >
      カテゴリを変更
    </button>

    <button
      type="button"
      class="action-btn"
      onclick={() => { showAddTagPicker = true; }}
    >
      タグを付ける
    </button>

    <button
      type="button"
      class="action-btn"
      disabled={candidateTags.length === 0}
      onclick={() => { showRemoveTagPicker = true; }}
    >
      タグを外す
    </button>

    <button
      type="button"
      class="action-btn danger"
      onclick={handleDelete}
    >
      削除
    </button>

    <button
      type="button"
      class="action-btn ghost"
      onclick={() => app.setSelection([])}
    >
      選択を解除
    </button>
  </div>
</div>

{#if showPlacePicker}
  <PlacePicker
    title="置き場を変更"
    itemIds={selectedIds}
    onSelect={(newPlace) => {
      app.apply((doc, ctx) => moveItems(doc, selectedIds, newPlace, ctx));
      showPlacePicker = false;
    }}
    onClose={() => {
      showPlacePicker = false;
    }}
  />
{/if}

{#if showCategoryPicker}
  <CategoryPicker
    title="カテゴリを変更"
    allowNone={true}
    allowCreate={true}
    onSelect={(newCat) => {
      app.apply((doc, ctx) => setItemsCategory(doc, selectedIds, newCat, ctx));
      showCategoryPicker = false;
    }}
    onClose={() => {
      showCategoryPicker = false;
    }}
  />
{/if}

{#if showAddTagPicker}
  <TagPicker
    title="タグを付ける"
    allowCreate={true}
    onSelect={(tagId) => {
      app.apply((doc, ctx) => addTagToItems(doc, selectedIds, tagId, ctx));
      showAddTagPicker = false;
    }}
    onClose={() => {
      showAddTagPicker = false;
    }}
  />
{/if}

{#if showRemoveTagPicker}
  <TagPicker
    title="タグを外す"
    candidates={candidateTags}
    allowCreate={false}
    onSelect={(tagId) => {
      app.apply((doc, ctx) => removeTagFromItems(doc, selectedIds, tagId, ctx));
      showRemoveTagPicker = false;
    }}
    onClose={() => {
      showRemoveTagPicker = false;
    }}
  />
{/if}

<style>
  .bulk-bar {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: var(--space-2) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
    z-index: 30;
    flex-shrink: 0;
  }

  .selection-info {
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .selection-count {
    font-weight: 600;
    font-size: var(--font-size);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    padding: var(--space-1) 0;
  }

  .action-btn {
    min-height: var(--touch);
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
    border-radius: var(--radius);
    white-space: nowrap;
  }

  @media (max-width: 767.98px) {
    .bulk-bar {
      flex-direction: column;
      align-items: stretch;
      padding: var(--space-2);
      gap: var(--space-2);
    }

    .selection-info {
      padding: 0 var(--space-1);
    }

    .actions {
      width: 100%;
    }
  }
</style>
