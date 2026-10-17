<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id, Tag } from '../../core/types';
  import { getIndexes } from '../../core/indexes';
  import { createTag, renameTag, setTagColor } from '../../core/ops/tags';
  import {
    createCategory,
    renameCategory,
    moveCategory,
    deleteCategory,
    setCategoryColor,
  } from '../../core/ops/categories';
  import CategoryPicker from '../components/CategoryPicker.svelte';
  import ColorPicker from '../components/ColorPicker.svelte';
  import { getSwatchStyle } from '../color';

  const app = getApp();

  let activeColorPicker = $state<{ type: 'tag' | 'category'; id: Id } | null>(null);

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
    app.requestDeleteTag(tag.id);
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
    color?: string;
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
          color: cat.color,
          directCount,
        });
        traverse(cat.id, depth + 1);
      }
    }

    traverse(null, 0);
    return list;
  });

  function handleSelectTagColor(tagId: Id, color: string | null) {
    app.apply((doc) => setTagColor(doc, tagId, color));
    activeColorPicker = null;
  }

  function handleSelectCatColor(catId: Id, color: string | null) {
    app.apply((doc) => setCategoryColor(doc, catId, color));
    activeColorPicker = null;
  }

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
    if (!indexes || !$app.doc) return;
    const targetCat = $app.doc.membership.categories.find((c) => c.id === catId);
    if (!targetCat) return;
    const directCount = indexes.itemsByCategory.get(catId)?.length ?? 0;
    const childCats = indexes.childCategories.get(catId) ?? [];
    const parentCat = targetCat.parent
      ? $app.doc.membership.categories.find((c) => c.id === targetCat.parent)
      : null;
    const destName = parentCat ? `親カテゴリ「${parentCat.name}」` : '未分類';

    const message = `カテゴリ「${targetCat.name}」を削除します。`;
    const details: string[] = [];
    if (directCount > 0) {
      details.push(`所属しているモノ ${directCount}件は ${destName} に移ります。`);
    }
    if (childCats.length > 0) {
      details.push(`子カテゴリ ${childCats.length}件は ${destName} に移ります。`);
    }

    app.confirm({
      title: 'カテゴリの削除',
      message,
      details,
      confirmLabel: '削除する',
      danger: true,
      onConfirm: () => {
        app.apply((doc, ctx) => deleteCategory(doc, catId, ctx));
      },
    });
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
                <div class="color-picker-trigger-wrapper">
                  <button
                    type="button"
                    class="color-badge-trigger"
                    style={getSwatchStyle(tag.color)}
                    title={tag.color ? '色を変更' : '色を設定'}
                    onclick={(e) => {
                      e.stopPropagation();
                      activeColorPicker = (activeColorPicker?.type === 'tag' && activeColorPicker?.id === tag.id)
                        ? null
                        : { type: 'tag', id: tag.id };
                    }}
                    aria-label="タグの色を変更"
                  ></button>
                  {#if activeColorPicker?.type === 'tag' && activeColorPicker?.id === tag.id}
                    <ColorPicker
                      color={tag.color}
                      onSelect={(c) => handleSelectTagColor(tag.id, c)}
                      onClose={() => { activeColorPicker = null; }}
                    />
                  {/if}
                </div>
                <span class="item-name">{tag.name}</span>
                <button
                  type="button"
                  class="chip small muted count-link-btn"
                  title="サガシモノで「{tag.name}」のモノを表示"
                  onclick={() => {
                    app.setQuery({ tags: { ids: [tag.id], mode: 'all' } });
                    app.setScreen('search');
                  }}
                >
                  <span class="count-text">{indexes?.itemsByTag.get(tag.id)?.length ?? 0}件</span>
                </button>
              </div>
            {/if}

            <div class="actions">
              {#if editingTagId !== tag.id}
                <button
                  type="button"
                  class="action-btn-icon"
                  title="名前の変更"
                  aria-label="タグ「{tag.name}」の名前の変更"
                  onclick={() => startTagRename(tag)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button
                  type="button"
                  class="action-btn-icon danger"
                  title="削除"
                  aria-label="タグ「{tag.name}」を削除"
                  onclick={() => handleDeleteTag(tag)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
                <div class="color-picker-trigger-wrapper">
                  <button
                    type="button"
                    class="color-badge-trigger"
                    style={getSwatchStyle(cat.color)}
                    title={cat.color ? '色を変更' : '色を設定'}
                    onclick={(e) => {
                      e.stopPropagation();
                      activeColorPicker = (activeColorPicker?.type === 'category' && activeColorPicker?.id === cat.id)
                        ? null
                        : { type: 'category', id: cat.id };
                    }}
                    aria-label="カテゴリの色を変更"
                  ></button>
                  {#if activeColorPicker?.type === 'category' && activeColorPicker?.id === cat.id}
                    <ColorPicker
                      color={cat.color}
                      onSelect={(c) => handleSelectCatColor(cat.id, c)}
                      onClose={() => { activeColorPicker = null; }}
                    />
                  {/if}
                </div>
                <span class="item-name">{cat.name}</span>
                <button
                  type="button"
                  class="chip small muted count-link-btn"
                  title="サガシモノで「{cat.name}」のモノを表示"
                  onclick={() => {
                    app.setQuery({ category: cat.id });
                    app.setScreen('search');
                  }}
                >
                  <span class="count-text">{cat.directCount}件</span>
                </button>
              </div>
            {/if}

            <div class="actions">
              {#if editingCatId !== cat.id}
                <button
                  type="button"
                  class="action-btn-icon"
                  title="名前の変更"
                  aria-label="カテゴリ「{cat.name}」の名前の変更"
                  onclick={() => startCatRename(cat)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button
                  type="button"
                  class="action-btn-icon"
                  title="親カテゴリの変更"
                  aria-label="カテゴリ「{cat.name}」の親カテゴリの変更"
                  onclick={() => {
                    movingCategoryCatId = cat.id;
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                </button>
                <button
                  type="button"
                  class="action-btn-icon"
                  title="子カテゴリを追加"
                  aria-label="カテゴリ「{cat.name}」に子カテゴリを追加"
                  onclick={() => {
                    addingChildParentId = cat.id;
                    newChildCategoryName = '';
                  }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button
                  type="button"
                  class="action-btn-icon danger"
                  title="削除"
                  aria-label="カテゴリ「{cat.name}」を削除"
                  onclick={() => handleDeleteCategory(cat.id)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
    align-items: start;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-4);
    max-width: 1040px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
  }

  @media (max-width: 767px) {
    .manage-screen {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }
  }

  /* #8 インライン操作アイコンボタン */
  .action-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    min-width: 28px;
    height: 28px;
    width: 28px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all var(--duration-fast);
  }

  .action-btn-icon:hover {
    background: var(--surface-2);
    border-color: var(--text-muted);
    color: var(--text);
  }

  .action-btn-icon:active {
    transform: translateY(1px);
  }

  .action-btn-icon.danger {
    color: var(--danger);
    border-color: rgba(220, 38, 38, 0.35);
  }

  .action-btn-icon.danger:hover {
    background: rgba(220, 38, 38, 0.08);
    border-color: var(--danger);
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

  .create-form input {
    min-width: 0;
    flex: 1;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow: visible;
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
    min-width: 0;
    flex: 1;
  }

  .item-name {
    font-weight: 500;
    word-break: break-word;
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

  .color-picker-trigger-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .color-badge-trigger {
    width: 18px;
    height: 18px;
    min-height: 0;
    min-width: 0;
    padding: 0;
    border-radius: 50%;
    border: 1.5px dashed var(--border-strong);
    background: var(--surface-2);
    cursor: pointer;
    box-sizing: border-box;
    transition: transform var(--duration-fast), border-color var(--duration-fast);
    flex-shrink: 0;
  }

  .color-badge-trigger:hover {
    border-color: var(--accent);
    transform: scale(1.15);
  }

  .count-link-btn {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    transition: color var(--duration-fast), border-color var(--duration-fast);
  }

  .count-link-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .count-link-btn:hover .count-text {
    text-decoration: underline;
  }
</style>
