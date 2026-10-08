<script lang="ts">
  import { getApp } from '../context';
  import { isEmptyQuery, suggest } from '../../search/search';
  import { displayName, formatPlacePath } from '../../core/places';
  import type { Category, Id, Tag } from '../../core/types';
  import CategoryPicker from './CategoryPicker.svelte';
  import TagPicker from './TagPicker.svelte';
  import PlacePicker from './PlacePicker.svelte';

  const app = getApp();

  let showCategoryPicker = $state(false);
  let showTagPicker = $state(false);
  let showPlacePicker = $state(false);
  let isFilterOpen = $state(false);

  const suggestions = $derived.by(() => {
    if (!$app.doc || !$app.query.text || $app.query.text.trim() === '') {
      return { tags: [], categories: [] };
    }
    return suggest($app.doc, $app.query.text);
  });

  const hasSuggestions = $derived(
    suggestions.categories.length > 0 || suggestions.tags.length > 0
  );

  const filterCount = $derived.by(() => {
    let count = 0;
    if ($app.query.category !== undefined) count += 1;
    if ($app.query.tags && $app.query.tags.ids.length > 0) {
      count += $app.query.tags.ids.length;
    }
    if ($app.query.place !== undefined) count += 1;
    if ($app.query.unsetOnly) count += 1;
    if ($app.query.storageOnly) count += 1;
    return count;
  });

  function handleTextInput(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    app.setQuery({ ...$app.query, text: target.value });
  }

  function applyCategorySuggestion(cat: Category): void {
    app.setQuery({ ...$app.query, category: cat.id });
  }

  function applyTagSuggestion(tag: Tag): void {
    const currentIds = $app.query.tags?.ids ?? [];
    if (!currentIds.includes(tag.id)) {
      app.setQuery({
        ...$app.query,
        tags: {
          ids: [...currentIds, tag.id],
          mode: $app.query.tags?.mode ?? 'all',
        },
      });
    }
  }

  function removeCategory(): void {
    const next = { ...$app.query };
    delete next.category;
    app.setQuery(next);
  }

  function removeTag(tagId: Id): void {
    const remaining = ($app.query.tags?.ids ?? []).filter((id) => id !== tagId);
    if (remaining.length === 0) {
      const next = { ...$app.query };
      delete next.tags;
      app.setQuery(next);
    } else {
      app.setQuery({
        ...$app.query,
        tags: {
          ids: remaining,
          mode: $app.query.tags?.mode ?? 'all',
        },
      });
    }
  }

  function toggleTagMode(): void {
    if (!$app.query.tags) return;
    const nextMode = $app.query.tags.mode === 'all' ? 'any' : 'all';
    app.setQuery({
      ...$app.query,
      tags: {
        ...$app.query.tags,
        mode: nextMode,
      },
    });
  }

  function removePlace(): void {
    const next = { ...$app.query };
    delete next.place;
    app.setQuery(next);
  }

  function removeUnsetOnly(): void {
    const next = { ...$app.query };
    delete next.unsetOnly;
    app.setQuery(next);
  }

  function toggleUnsetOnly(): void {
    if ($app.query.unsetOnly) {
      removeUnsetOnly();
    } else {
      app.setQuery({ ...$app.query, unsetOnly: true });
    }
  }

  function removeStorageOnly(): void {
    const next = { ...$app.query };
    delete next.storageOnly;
    app.setQuery(next);
  }

  function toggleStorageOnly(): void {
    if ($app.query.storageOnly) {
      removeStorageOnly();
    } else {
      app.setQuery({ ...$app.query, storageOnly: true });
    }
  }

  function clearQuery(): void {
    app.setQuery({});
  }
</script>

<div class="search-bar">
  <div class="search-input-wrapper">
    <input
      type="search"
      placeholder="名前・概要で探す"
      value={$app.query.text ?? ''}
      oninput={handleTextInput}
      aria-label="検索キーワード"
    />
  </div>

  {#if hasSuggestions}
    <div class="suggestions-list" aria-label="検索候補">
      <span class="suggestions-title muted">候補:</span>
      {#each suggestions.categories as cat (cat.id)}
        <button
          type="button"
          class="chip suggestion-chip"
          onclick={() => applyCategorySuggestion(cat)}
        >
          📁 {cat.name}
        </button>
      {/each}
      {#each suggestions.tags as tag (tag.id)}
        <button
          type="button"
          class="chip suggestion-chip"
          onclick={() => applyTagSuggestion(tag)}
        >
          🏷️ {tag.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="filter-controls">
    <div class="filter-bar-row">
      <button
        type="button"
        class="small filter-toggle-btn"
        class:is-active={filterCount > 0}
        onclick={() => {
          isFilterOpen = !isFilterOpen;
        }}
        aria-expanded={isFilterOpen}
      >
        絞り込み{filterCount > 0 ? `（${filterCount}）` : ''}
      </button>

      <div class="chips-area">
        {#if $app.query.category !== undefined}
          <span class="chip accent filter-chip">
            <span>
              カテゴリ: {$app.query.category === null
                ? '未分類'
                : ($app.doc ? displayName($app.doc, $app.query.category) : '')}
            </span>
            <button
              type="button"
              class="chip-remove"
              onclick={removeCategory}
              aria-label="カテゴリ条件を解除"
            >
              ×
            </button>
          </span>
        {/if}

        {#if $app.query.tags && $app.query.tags.ids.length > 0}
          {#each $app.query.tags.ids as tagId (tagId)}
            <span class="chip accent filter-chip">
              <span>
                タグ: {$app.doc ? displayName($app.doc, tagId) : tagId}
              </span>
              <button
                type="button"
                class="chip-remove"
                onclick={() => removeTag(tagId)}
                aria-label="タグ条件を解除"
              >
                ×
              </button>
            </span>
          {/each}

          {#if $app.query.tags.ids.length >= 2}
            <button
              type="button"
              class="chip small mode-toggle-btn"
              onclick={toggleTagMode}
              title="タグの照合方法を切り替える"
            >
              タグ一致: {$app.query.tags.mode === 'all' ? 'すべて' : 'どれか'}
            </button>
          {/if}
        {/if}

        {#if $app.query.place !== undefined}
          <span class="chip accent filter-chip">
            <span>
              置き場: {$app.doc ? formatPlacePath($app.doc, $app.query.place) : ''}
            </span>
            <button
              type="button"
              class="chip-remove"
              onclick={removePlace}
              aria-label="置き場条件を解除"
            >
              ×
            </button>
          </span>
        {/if}

        {#if $app.query.unsetOnly}
          <span class="chip accent filter-chip">
            <span>未設定だけ</span>
            <button
              type="button"
              class="chip-remove"
              onclick={removeUnsetOnly}
              aria-label="未設定だけ条件を解除"
            >
              ×
            </button>
          </span>
        {/if}

        {#if $app.query.storageOnly}
          <span class="chip accent filter-chip">
            <span>収納だけ</span>
            <button
              type="button"
              class="chip-remove"
              onclick={removeStorageOnly}
              aria-label="収納だけ条件を解除"
            >
              ×
            </button>
          </span>
        {/if}
      </div>
    </div>

    <div class="add-filters-area" class:is-open={isFilterOpen}>
      <button
        type="button"
        class="filter-add-btn"
        onclick={() => {
          showCategoryPicker = true;
        }}
      >
        ＋カテゴリ
      </button>

      <button
        type="button"
        class="filter-add-btn"
        onclick={() => {
          showTagPicker = true;
        }}
      >
        ＋タグ
      </button>

      <button
        type="button"
        class="filter-add-btn"
        onclick={() => {
          showPlacePicker = true;
        }}
      >
        ＋置き場
      </button>

      {#if !$app.query.unsetOnly}
        <button
          type="button"
          class="filter-add-btn"
          onclick={toggleUnsetOnly}
        >
          未設定だけ
        </button>
      {/if}

      {#if !$app.query.storageOnly}
        <button
          type="button"
          class="filter-add-btn"
          onclick={toggleStorageOnly}
        >
          収納だけ
        </button>
      {/if}

      {#if !isEmptyQuery($app.query)}
        <button
          type="button"
          class="ghost clear-btn"
          onclick={clearQuery}
        >
          条件を解除
        </button>
      {/if}
    </div>
  </div>
</div>

{#if showCategoryPicker}
  <CategoryPicker
    title="カテゴリを選択"
    current={$app.query.category ?? null}
    allowNone={true}
    allowCreate={false}
    onSelect={(cat) => {
      app.setQuery({ ...$app.query, category: cat });
      showCategoryPicker = false;
    }}
    onClose={() => {
      showCategoryPicker = false;
    }}
  />
{/if}

{#if showTagPicker}
  <TagPicker
    title="タグを追加"
    exclude={$app.query.tags?.ids}
    allowCreate={false}
    onSelect={(tagId) => {
      const currentIds = $app.query.tags?.ids ?? [];
      app.setQuery({
        ...$app.query,
        tags: {
          ids: [...currentIds, tagId],
          mode: $app.query.tags?.mode ?? 'all',
        },
      });
      showTagPicker = false;
    }}
    onClose={() => {
      showTagPicker = false;
    }}
  />
{/if}

{#if showPlacePicker}
  <PlacePicker
    title="置き場を選択"
    itemIds={[]}
    current={$app.query.place ?? null}
    onSelect={(placeId) => {
      app.setQuery({ ...$app.query, place: placeId });
      showPlacePicker = false;
    }}
    onClose={() => {
      showPlacePicker = false;
    }}
  />
{/if}

<style>
  .search-bar {
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .search-input-wrapper {
    width: 100%;
  }

  .suggestions-list {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    overflow-x: auto;
    white-space: nowrap;
    padding: var(--space-1) 0;
    -webkit-overflow-scrolling: touch;
  }

  .suggestions-title {
    font-size: var(--font-size-small);
  }

  .suggestion-chip {
    cursor: pointer;
    background: var(--surface-2);
  }

  .suggestion-chip:hover {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .filter-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .filter-bar-row {
    display: contents;
  }

  .filter-toggle-btn {
    display: none;
  }

  .chips-area {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding-right: var(--space-1);
  }

  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }

  .chip-remove:hover {
    background: var(--border);
    color: var(--text);
  }

  .mode-toggle-btn {
    cursor: pointer;
    background: var(--surface);
  }

  .mode-toggle-btn:hover {
    background: var(--surface-2);
  }

  .add-filters-area {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-left: auto;
  }

  .filter-add-btn {
    min-height: var(--touch);
    padding: 0 var(--space-3);
    font-size: var(--font-size-small);
    border-radius: var(--radius);
  }

  .clear-btn {
    min-height: var(--touch);
    padding: 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-size-small);
  }

  .clear-btn:hover {
    color: var(--danger);
  }

  @media (max-width: 767.98px) {
    .search-bar {
      padding: var(--space-2);
    }

    .filter-controls {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
    }

    .filter-bar-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      width: 100%;
    }

    .filter-toggle-btn {
      display: inline-flex;
      flex-shrink: 0;
    }

    .filter-toggle-btn.is-active {
      background: var(--accent-soft);
      border-color: var(--accent);
    }

    .chips-area {
      flex: 1;
      min-width: 0;
      flex-wrap: nowrap;
      overflow-x: auto;
      white-space: nowrap;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 2px;
    }

    .filter-chip,
    .mode-toggle-btn {
      flex-shrink: 0;
    }

    .add-filters-area {
      display: none;
    }

    .add-filters-area.is-open {
      display: flex;
      width: 100%;
      margin-left: 0;
      overflow-x: auto;
      white-space: nowrap;
      -webkit-overflow-scrolling: touch;
      padding-bottom: var(--space-1);
    }
  }
</style>
