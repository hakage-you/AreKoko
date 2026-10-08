<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Id, Tag } from '../../core/types';
  import {
    updateItem,
    moveItems,
    setItemsCategory,
    addTagToItems,
    removeTagFromItems,
    deleteItems,
  } from '../../core/ops/items';
  import { removeNotice } from '../../core/ops/notices';
  import {
    planRemoveStorage,
    removeStorage,
  } from '../../core/ops/storage';
  import { formatPlacePath } from '../../core/places';
  import { timestampOfV7 } from '../../core/ids';
  import PlacePicker from './PlacePicker.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import TagPicker from './TagPicker.svelte';

  interface Props {
    id: Id;
    onClose: () => void;
  }

  let { id, onClose }: Props = $props();
  const app = getApp();

  const item = $derived($app.doc?.membership.items.find((i) => i.id === id));

  $effect(() => {
    if (!item) {
      onClose();
    }
  });

  let nameInput = $state('');
  let summaryInput = $state('');
  let qtyInput = $state('');

  let isAddingSummary = $state(false);
  let isAddingQty = $state(false);

  let showPlacePicker = $state(false);
  let showCategoryPicker = $state(false);
  let showTagPicker = $state(false);

  $effect(() => {
    if (item) {
      nameInput = item.name;
      summaryInput = item.summary ?? '';
      qtyInput = item.qty !== undefined ? String(item.qty) : '';
    }
  });

  function commitName() {
    if (!item) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      nameInput = item.name;
      return;
    }
    if (trimmed !== item.name) {
      app.apply((doc, ctx) => updateItem(doc, id, { name: trimmed }, ctx));
    }
  }

  function commitSummary() {
    if (!item) return;
    const trimmed = summaryInput.trim();
    if (!trimmed) {
      if (item.summary !== undefined) {
        app.apply((doc, ctx) => updateItem(doc, id, { summary: null }, ctx));
      }
      isAddingSummary = false;
    } else {
      if (trimmed !== item.summary) {
        app.apply((doc, ctx) => updateItem(doc, id, { summary: trimmed }, ctx));
      }
      isAddingSummary = false;
    }
  }

  function commitQty() {
    if (!item) return;
    const trimmed = qtyInput.trim();
    if (!trimmed) {
      if (item.qty !== undefined) {
        app.apply((doc, ctx) => updateItem(doc, id, { qty: null }, ctx));
      }
      isAddingQty = false;
      return;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num < 0) {
      qtyInput = item.qty !== undefined ? String(item.qty) : '';
      isAddingQty = false;
      return;
    }
    if (num !== item.qty) {
      app.apply((doc, ctx) => updateItem(doc, id, { qty: num }, ctx));
    }
    isAddingQty = false;
  }

  const categoryName = $derived.by(() => {
    if (!item || item.category === null || !$app.doc) return '未分類';
    const cat = $app.doc.membership.categories.find((c) => c.id === item.category);
    return cat ? cat.name : '未分類';
  });

  const tagObjects = $derived.by(() => {
    if (!item || !$app.doc) return [];
    const tagMap = new Map($app.doc.membership.tags.map((t) => [t.id, t]));
    return item.tags
      .map((tid) => tagMap.get(tid))
      .filter((t): t is Tag => t !== undefined);
  });

  const placePathString = $derived.by(() => {
    if (!item || !$app.doc) return '';
    return formatPlacePath($app.doc, item.place);
  });

  const storageKuukan = $derived(
    $app.doc?.membership.kuukans.find((k) => k.owner === id),
  );
  const isStorage = $derived(storageKuukan !== undefined);

  function handleMakeStorage() {
    app.openDraft({ kind: 'storage', item: id });
  }

  function handleRemoveStorage() {
    if (!$app.doc || !item) return;
    const relocations = planRemoveStorage($app.doc, id);
    const totalCount = relocations.reduce((sum, r) => sum + r.items.length, 0);
    const targetPath = formatPlacePath($app.doc, item.place);
    const message = `中のクウカンがなくなり、中のモノ ${totalCount}件は「${targetPath}」へ移ります。`;
    const details = relocations.map((r) => {
      const fromPath = formatPlacePath($app.doc!, r.from);
      const toPath = formatPlacePath($app.doc!, r.to);
      return `${fromPath} から ${r.items.length}件 → ${toPath}`;
    });

    app.confirm({
      title: '収納設定の削除',
      message,
      details,
      confirmLabel: '収納設定を削除',
      danger: true,
      onConfirm: () => {
        app.apply((doc, ctx) => removeStorage(doc, id, ctx));
      },
    });
  }

  function handleDeleteItem() {
    app.apply((doc, ctx) => deleteItems(doc, [id], ctx));
    onClose();
  }

  function formatNoticeDate(isoDate: string): string {
    return isoDate.slice(0, 10).replace(/-/g, '/');
  }

  const createdAtFormatted = $derived.by(() => {
    try {
      const ts = timestampOfV7(id);
      const d = new Date(ts);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '―';
    }
  });

  const updatedAtFormatted = $derived.by(() => {
    if (!item?.updatedAt) return '―';
    try {
      const d = new Date(item.updatedAt);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '―';
    }
  });
</script>

{#if item}
  <aside class="item-detail">
    <div class="header">
      <input
        type="text"
        class="name-input"
        bind:value={nameInput}
        onblur={commitName}
        onkeydown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        placeholder="名前"
      />
      <button type="button" class="close-button ghost" onclick={onClose} aria-label="詳細を閉じる">
        ✕
      </button>
    </div>

    <div class="body">
      <!-- 置き場 -->
      <section class="section">
        <div class="section-header">
          <span class="section-label">置き場</span>
          <button
            type="button"
            class="small ghost"
            onclick={() => {
              showPlacePicker = true;
            }}
          >
            変更
          </button>
        </div>
        <div class="field-value place-path">
          {placePathString || '未設定'}
        </div>
      </section>

      <!-- カテゴリ -->
      <section class="section">
        <div class="section-header">
          <span class="section-label">カテゴリ</span>
          <button
            type="button"
            class="small ghost"
            onclick={() => {
              showCategoryPicker = true;
            }}
          >
            変更
          </button>
        </div>
        <div class="field-value">
          <span class="chip {item.category === null ? 'muted' : ''}">
            {categoryName}
          </span>
        </div>
      </section>

      <!-- タグ -->
      <section class="section">
        <div class="section-header">
          <span class="section-label">タグ</span>
          <button
            type="button"
            class="small ghost"
            onclick={() => {
              showTagPicker = true;
            }}
          >
            ＋ タグを追加
          </button>
        </div>
        <div class="tags-list">
          {#if tagObjects.length === 0}
            <span class="muted small">タグなし</span>
          {:else}
            {#each tagObjects as tag (tag.id)}
              <span class="chip">
                {tag.name}
                <button
                  type="button"
                  class="tag-remove"
                  onclick={() => {
                    app.apply((doc, ctx) => removeTagFromItems(doc, [id], tag.id, ctx));
                  }}
                  aria-label="{tag.name}を外す"
                >
                  ✕
                </button>
              </span>
            {/each}
          {/if}
        </div>
      </section>

      <!-- 概要 -->
      {#if item.summary !== undefined || isAddingSummary}
        <section class="section">
          <label for="item-summary" class="section-label">概要</label>
          <textarea
            use:autofocus={isAddingSummary}
            id="item-summary"
            bind:value={summaryInput}
            onblur={commitSummary}
            placeholder="概要を入力…"
            rows="3"
          ></textarea>
        </section>
      {/if}

      <!-- 数量 -->
      {#if item.qty !== undefined || isAddingQty}
        <section class="section">
          <label for="item-qty" class="section-label">数量</label>
          <input
            use:autofocus={isAddingQty}
            id="item-qty"
            type="number"
            min="0"
            step="1"
            bind:value={qtyInput}
            onblur={commitQty}
            onkeydown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="数量を入力…"
          />
        </section>
      {/if}

      <!-- ＋項目を追加 -->
      {#if (item.summary === undefined && !isAddingSummary) || (item.qty === undefined && !isAddingQty)}
        <section class="section add-fields-section">
          <div class="add-fields-header">
            <span class="section-label">＋項目を追加</span>
          </div>
          <div class="add-buttons">
            {#if item.summary === undefined && !isAddingSummary}
              <button
                type="button"
                class="small"
                onclick={() => {
                  isAddingSummary = true;
                  summaryInput = '';
                }}
              >
                ＋ 概要
              </button>
            {/if}
            {#if item.qty === undefined && !isAddingQty}
              <button
                type="button"
                class="small"
                onclick={() => {
                  isAddingQty = true;
                  qtyInput = '';
                }}
              >
                ＋ 数量
              </button>
            {/if}
          </div>
        </section>
      {/if}

      <!-- 修復メモ -->
      {#if item.notices && item.notices.length > 0}
        <section class="section notices-section">
          <div class="section-label">修復メモ</div>
          <p class="muted small notice-desc">読み込み時の修復でアプリが付けた記録です。</p>
          <div class="notices-list">
            {#each item.notices as notice, index}
              <div class="notice-item">
                <div class="notice-content">
                  <span class="notice-date muted small">{formatNoticeDate(notice.at)}</span>
                  <span class="notice-text">{notice.text}</span>
                </div>
                <button
                  type="button"
                  class="small danger ghost"
                  onclick={() => {
                    app.apply((doc) => removeNotice(doc, 'item', id, index));
                  }}
                >
                  消す
                </button>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 収納設定 -->
      <section class="section storage-section">
        <div class="section-header">
          <span class="section-label">収納</span>
          {#if isStorage}
            <span class="chip accent">収納</span>
          {/if}
        </div>
        <div class="storage-actions">
          {#if isStorage && storageKuukan}
            <button
              type="button"
              class="small"
              onclick={() => {
                app.setQuery({ place: storageKuukan.id });
              }}
            >
              中を見る
            </button>
            <button
              type="button"
              class="primary small"
              onclick={() => {
                app.openKuukanEditor(storageKuukan.id);
              }}
            >
              クウカンを編集
            </button>
            <button type="button" class="danger small" onclick={handleRemoveStorage}>
              収納設定を削除する
            </button>
          {:else}
            <button type="button" class="small" onclick={handleMakeStorage}>
              収納として設定する
            </button>
          {/if}
        </div>
      </section>

      <!-- 削除とタイムスタンプ -->
      <section class="section footer-actions">
        <button type="button" class="danger" onclick={handleDeleteItem}>
          このモノを削除
        </button>

        <div class="timestamps muted small">
          <div>作成日時: {createdAtFormatted}</div>
          <div>更新日時: {updatedAtFormatted}</div>
        </div>
      </section>
    </div>
  </aside>
{/if}

{#if showPlacePicker && item}
  <PlacePicker
    title="置き場の変更"
    itemIds={[id]}
    current={item.place}
    onSelect={(newPlace) => {
      app.apply((doc, ctx) => moveItems(doc, [id], newPlace, ctx));
      showPlacePicker = false;
    }}
    onClose={() => {
      showPlacePicker = false;
    }}
  />
{/if}

{#if showCategoryPicker && item}
  <CategoryPicker
    title="カテゴリの変更"
    current={item.category}
    allowNone={true}
    allowCreate={true}
    onSelect={(newCat) => {
      app.apply((doc, ctx) => setItemsCategory(doc, [id], newCat, ctx));
      showCategoryPicker = false;
    }}
    onClose={() => {
      showCategoryPicker = false;
    }}
  />
{/if}

{#if showTagPicker && item}
  <TagPicker
    title="タグを追加"
    exclude={item.tags}
    allowCreate={true}
    onSelect={(newTag) => {
      app.apply((doc, ctx) => addTagToItems(doc, [id], newTag, ctx));
      showTagPicker = false;
    }}
    onClose={() => {
      showTagPicker = false;
    }}
  />
{/if}

<style>
  .item-detail {
    width: var(--detail-width);
    height: 100%;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
    gap: var(--space-2);
  }

  .name-input {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-large);
    font-weight: 600;
    border: 1px solid transparent;
    border-bottom: 1px dotted var(--border);
    border-radius: var(--radius-small);
    background: transparent;
    padding: var(--space-1) var(--space-2);
    min-height: auto;
    color: var(--text);
  }

  .name-input:hover {
    background: var(--surface-2);
  }

  .name-input:focus {
    outline: none;
    border: 1px solid var(--focus);
    background: var(--surface);
  }

  .close-button {
    padding: var(--space-1);
    min-height: auto;
    font-size: var(--font-size);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    margin: 0;
  }

  .place-path {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .field-value {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .chip {
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    max-width: 100%;
    min-height: 28px;
    height: auto;
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .tag-remove {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    font-size: 10px;
    color: var(--text-muted);
    min-height: auto;
    flex-shrink: 0;
  }

  .tag-remove:hover {
    color: var(--danger);
  }

  .add-fields-section {
    padding: var(--space-2) 0;
  }

  .add-buttons {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .notices-section {
    background: var(--surface-2);
    padding: var(--space-3);
    border-radius: var(--radius);
    min-width: 0;
  }

  .notice-desc {
    margin: var(--space-1) 0;
  }

  .notices-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .notice-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    background: var(--surface);
    padding: var(--space-2);
    border-radius: var(--radius-small);
    border: 1px solid var(--border);
    min-width: 0;
  }

  .notice-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }

  .notice-text {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  textarea,
  input[type='number'] {
    max-width: 100%;
    min-width: 0;
  }

  .storage-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
    flex-wrap: wrap;
  }

  .footer-actions {
    margin-top: auto;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .timestamps {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-wrap: anywhere;
  }

  @media (max-width: 767px) {
    .item-detail {
      position: absolute;
      inset: 0;
      width: 100%;
      z-index: 10;
      border-left: none;
    }
  }
</style>
