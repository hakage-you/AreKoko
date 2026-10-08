<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id, Tag } from '../../core/types';
  import { getIndexes } from '../../core/indexes';
  import { createTag, renameTag, deleteTag } from '../../core/ops/tags';
  import {
    createCategory,
    renameCategory,
    moveCategory,
    deleteCategory,
  } from '../../core/ops/categories';
  import CategoryPicker from '../components/CategoryPicker.svelte';

  const app = getApp();

  // タグ関連
  let newTagName = $state('');
  let editingTagId = $state<Id | null>(null);
  let editingTagName = $state('');

  const tags = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return [];
    return doc.membership.tags.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  });

  const indexes = $derived($app.doc ? getIndexes($app.doc) : null);

  function handleCreateTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    app.apply((doc, ctx) => createTag(doc, { name: trimmed }, ctx));
    newTagName = '';
  }

  function startTagRename(tag: Tag) {
    editingTagId = tag.id;
    editingTagName = tag.name;
  }

  function commitTagRename(tag: Tag) {
    if (editingTagId !== tag.id) return;
    const trimmed = editingTagName.trim();
    if (trimmed && trimmed !== tag.name) {
      app.apply((doc) => renameTag(doc, tag.id, trimmed));
    }
    editingTagId = null;
  }

  function handleDeleteTag(tag: Tag) {
    if (!indexes) return;
    const count = indexes.itemsByTag.get(tag.id)?.length ?? 0;
    app.confirm({
      title: 'タグの削除',
      message: `タグ「${tag.name}」を削除します。付いている ${count}件のモノから外れます。`,
      details: [],
      confirmLabel: '削除する',
      danger: true,
      onConfirm: () => {
        app.apply((doc, ctx) => deleteTag(doc, tag.id, ctx));
      },
    });
  }

  // カテゴリ関連
  let newTopCategoryName = $state('');
  let editingCatId = $state<Id | null>(null);
  let editingCatName = $state('');
  let addingChildParentId = $state<Id | null>(null);
  let newChildCategoryName = $state('');
  let movingCategoryCatId = $state<Id | null>(null);

  interface FlatCategoryItem {
    id: Id;
    name: string;
    depth: number;
    parent: Id | null;
    directCount: number;
  }

  const categoryTree = $derived.by(() => {
    if (!$app.doc || !indexes) return [];
    const list: FlatCategoryItem[] = [];

    function traverse(parentId: Id | null, depth: number) {
      const children = indexes?.childCategories.get(parentId) ?? [];
      for (const cat of children) {
        const directCount = indexes?.itemsByCategory.get(cat.id)?.length ?? 0;
        list.push({
          id: cat.id,
          name: cat.name,
          depth,
          parent: cat.parent,
          directCount,
        });
        traverse(cat.id, depth + 1);
      }
    }

    traverse(null, 0);
    return list;
  });

  function handleCreateTopCategory() {
    const trimmed = newTopCategoryName.trim();
    if (!trimmed) return;
    app.apply((doc, ctx) => createCategory(doc, { name: trimmed }, ctx));
    newTopCategoryName = '';
  }

  function startCatRename(cat: FlatCategoryItem) {
    editingCatId = cat.id;
    editingCatName = cat.name;
  }

  function commitCatRename(cat: FlatCategoryItem) {
    if (editingCatId !== cat.id) return;
    const trimmed = editingCatName.trim();
    if (trimmed && trimmed !== cat.name) {
      app.apply((doc) => renameCategory(doc, cat.id, trimmed));
    }
    editingCatId = null;
  }

  function handleCreateChildCategory(parentId: Id) {
    const trimmed = newChildCategoryName.trim();
    if (!trimmed) {
      addingChildParentId = null;
      return;
    }
    app.apply((doc, ctx) => createCategory(doc, { name: trimmed, parent: parentId }, ctx));
    addingChildParentId = null;
    newChildCategoryName = '';
  }

  function handleDeleteCategory(catId: Id) {
    app.apply((doc, ctx) => deleteCategory(doc, catId, ctx));
  }
</script>

<div class="manage-screen">
  <!-- タグ列 -->
  <section class="manage-column">
    <div class="column-header">
      <h2>タグ</h2>
    </div>

    <div class="create-form">
      <input
        type="text"
        bind:value={newTagName}
        placeholder="新しいタグ名…"
        onkeydown={(e) => {
          if (e.key === 'Enter') handleCreateTag();
        }}
      />
      <button type="button" class="primary" onclick={handleCreateTag}>
        ＋タグ
      </button>
    </div>

    <div class="items-list">
      {#if tags.length === 0}
        <div class="empty muted">タグがありません</div>
      {:else}
        {#each tags as tag (tag.id)}
          <div class="row-item">
            {#if editingTagId === tag.id}
              <input
                use:autofocus
                type="text"
                bind:value={editingTagName}
                onblur={() => commitTagRename(tag)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitTagRename(tag);
                  if (e.key === 'Escape') editingTagId = null;
                }}
                class="inline-input"
              />
            {:else}
              <div class="item-name-group">
                <span class="item-name">{tag.name}</span>
                <span class="chip small muted">
                  {indexes?.itemsByTag.get(tag.id)?.length ?? 0}件
                </span>
              </div>
            {/if}

            <div class="actions">
              {#if editingTagId !== tag.id}
                <button
                  type="button"
                  class="small ghost"
                  onclick={() => startTagRename(tag)}
                >
                  名前の変更
                </button>
                <button
                  type="button"
                  class="small danger ghost"
                  onclick={() => handleDeleteTag(tag)}
                >
                  削除
                </button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <!-- カテゴリ列 -->
  <section class="manage-column">
    <div class="column-header">
      <h2>カテゴリ</h2>
      <p class="muted small hint">
        削除すると、中のモノと子カテゴリは親へ移ります。
      </p>
    </div>

    <div class="create-form">
      <input
        type="text"
        bind:value={newTopCategoryName}
        placeholder="新しいカテゴリ名…"
        onkeydown={(e) => {
          if (e.key === 'Enter') handleCreateTopCategory();
        }}
      />
      <button type="button" class="primary" onclick={handleCreateTopCategory}>
        ＋カテゴリ
      </button>
    </div>

    <div class="items-list">
      {#if categoryTree.length === 0}
        <div class="empty muted">カテゴリがありません</div>
      {:else}
        {#each categoryTree as cat (cat.id)}
          <div
            class="row-item category-row"
            style="padding-left: calc(var(--space-3) + {cat.depth} * 20px);"
          >
            {#if editingCatId === cat.id}
              <input
                use:autofocus
                type="text"
                bind:value={editingCatName}
                onblur={() => commitCatRename(cat)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitCatRename(cat);
                  if (e.key === 'Escape') editingCatId = null;
                }}
                class="inline-input"
              />
            {:else}
              <div class="item-name-group">
                <span class="item-name">{cat.name}</span>
                <span class="chip small muted">{cat.directCount}件</span>
              </div>
            {/if}

            <div class="actions">
              {#if editingCatId !== cat.id}
                <button
                  type="button"
                  class="small ghost"
                  onclick={() => startCatRename(cat)}
                >
                  名前の変更
                </button>
                <button
                  type="button"
                  class="small ghost"
                  onclick={() => {
                    movingCategoryCatId = cat.id;
                  }}
                >
                  親の変更
                </button>
                <button
                  type="button"
                  class="small ghost"
                  onclick={() => {
                    addingChildParentId = cat.id;
                    newChildCategoryName = '';
                  }}
                >
                  ＋子
                </button>
                <button
                  type="button"
                  class="small danger ghost"
                  onclick={() => handleDeleteCategory(cat.id)}
                >
                  削除
                </button>
              {/if}
            </div>
          </div>

          {#if addingChildParentId === cat.id}
            <div
              class="create-child-form"
              style="padding-left: calc(var(--space-3) + ({cat.depth} + 1) * 20px);"
            >
              <input
                use:autofocus
                type="text"
                bind:value={newChildCategoryName}
                placeholder="子カテゴリ名…"
                onkeydown={(e) => {
                  if (e.key === 'Enter') handleCreateChildCategory(cat.id);
                  if (e.key === 'Escape') addingChildParentId = null;
                }}
              />
              <button
                type="button"
                class="primary small"
                onclick={() => handleCreateChildCategory(cat.id)}
              >
                追加
              </button>
              <button
                type="button"
                class="ghost small"
                onclick={() => {
                  addingChildParentId = null;
                }}
              >
                取消
              </button>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </section>
</div>

{#if movingCategoryCatId !== null}
  <CategoryPicker
    title="親カテゴリの変更"
    current={categoryTree.find((c) => c.id === movingCategoryCatId)?.parent ?? null}
    allowNone={true}
    allowCreate={false}
    exclude={movingCategoryCatId}
    onSelect={(newParent) => {
      if (movingCategoryCatId !== null) {
        app.apply((doc) => moveCategory(doc, movingCategoryCatId!, newParent));
        movingCategoryCatId = null;
      }
    }}
    onClose={() => {
      movingCategoryCatId = null;
    }}
  />
{/if}

<style>
  .manage-screen {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
    padding: var(--space-4);
    height: 100%;
    overflow-y: auto;
  }

  @media (max-width: 767px) {
    .manage-screen {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }
  }

  .manage-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--surface);
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .column-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .column-header h2 {
    margin: 0;
    font-size: var(--font-size-large);
  }

  .hint {
    margin: 0;
  }

  .create-form {
    display: flex;
    gap: var(--space-2);
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-y: auto;
  }

  .row-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-small);
    border-bottom: 1px solid var(--surface-2);
    gap: var(--space-2);
  }

  .row-item:hover {
    background: var(--surface-2);
  }

  .item-name-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .item-name {
    font-weight: 500;
  }

  .inline-input {
    flex: 1;
    min-height: 32px;
  }

  .actions {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    flex-shrink: 0;
  }

  .create-child-form {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2) var(--space-3);
  }

  .empty {
    padding: var(--space-5);
    text-align: center;
  }
</style>
