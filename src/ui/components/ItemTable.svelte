<script lang="ts">
  import { getApp } from '../context';
  import { buildRows } from '../../app/rows';
  import { displayName, formatPlacePath } from '../../core/places';
  import { getIndexes } from '../../core/indexes';
  import { isEmptyQuery } from '../../search/search';
  import { drawingOffset, offsetText } from '../../view/model';
  import type { Item } from '../../core/types';

  interface Props {
    items: Item[];
  }

  let { items }: Props = $props();

  const app = getApp();

  const rows = $derived($app.doc ? buildRows($app.doc, items, $app.grouping) : []);
  const indexes = $derived($app.doc ? getIndexes($app.doc) : null);

  const ROW_HEIGHT = 44;
  const BUFFER = 5;

  let scrollTop = $state(0);
  let containerHeight = $state(600);

  const totalRows = $derived(rows.length);
  const startIndex = $derived(
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER)
  );
  const endIndex = $derived(
    Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER)
  );
  const visibleRows = $derived(rows.slice(startIndex, endIndex));
  const topPadding = $derived(startIndex * ROW_HEIGHT);
  const bottomPadding = $derived(Math.max(0, (totalRows - endIndex) * ROW_HEIGHT));

  const allVisibleSelected = $derived(
    items.length > 0 && items.every((it) => $app.selection.has(it.id))
  );

  function handleSelectAllToggle(): void {
    if (allVisibleSelected) {
      const next = new Set($app.selection);
      for (const it of items) {
        next.delete(it.id);
      }
      app.setSelection(next);
    } else {
      const next = new Set($app.selection);
      for (const it of items) {
        next.add(it.id);
      }
      app.setSelection(next);
    }
  }

  function handleScroll(e: Event): void {
    const target = e.currentTarget as HTMLDivElement;
    scrollTop = target.scrollTop;
    containerHeight = target.clientHeight;
  }

  function getOffset(item: Item): { isOff: boolean; desc: string } {
    if (!$app.doc) return { isOff: false, desc: '' };
    const off = drawingOffset($app.doc, item.id);
    if (!off || off.kind !== 'off') return { isOff: false, desc: '' };
    return { isOff: true, desc: offsetText($app.doc, item.id, off) };
  }
</script>

<div class="table-container">
  {#if $app.doc && $app.doc.membership.items.length === 0}
    <div class="empty-state">
      <p>まだモノがありません。モノはクウカンの画面から追加します</p>
      <button
        type="button"
        class="small primary"
        onclick={() => app.setScreen('kuukans')}
      >
        クウカンの一覧へ
      </button>
    </div>
  {:else if items.length === 0}
    <div class="empty-state">
      <p>見つかりませんでした</p>
      {#if !isEmptyQuery($app.query)}
        <button
          type="button"
          class="small"
          onclick={() => app.setQuery({})}
        >
          条件を解除
        </button>
      {/if}
    </div>
  {:else}
    <div class="table-header" role="row">
      <div class="col-check">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onchange={handleSelectAllToggle}
          aria-label="すべて選択"
        />
      </div>
      <div class="col-name header-cell">名前</div>
      <div class="col-place header-cell">置き場</div>
      <div class="col-category header-cell">カテゴリ</div>
      <div class="col-tags header-cell">タグ</div>
      <div class="col-actions header-cell" aria-hidden="true"></div>
    </div>

    <div
      class="scroll-area"
      onscroll={handleScroll}
      bind:clientHeight={containerHeight}
      role="table"
    >
      {#if topPadding > 0}
        <div style="height: {topPadding}px;" aria-hidden="true"></div>
      {/if}

      {#each visibleRows as row (row.key)}
        {#if row.kind === 'group'}
          <div
            class="row group-row"
            role="row"
            style="padding-left: calc(var(--space-4) + {row.depth * 20}px);"
          >
            <span class="group-label">{row.label}</span>
            <span class="group-count muted">（{row.count}）</span>
          </div>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="row item-row"
            class:is-active-detail={$app.detail === row.item.id}
            class:is-highlighted={$app.highlights.has(row.item.id)}
            role="row"
            onclick={(e) => {
              // チェック欄（ラベルごと押せる）の押下は、詳細を開かない
              if ((e.target as Element).closest('.col-check')) return;
              app.showDetail(row.item.id);
            }}
          >
            <label class="col-check">
              <input
                type="checkbox"
                checked={$app.selection.has(row.item.id)}
                onclick={(e) => {
                  e.stopPropagation();
                }}
                onchange={() => {
                  app.toggleSelection(row.item.id);
                }}
                aria-label="{row.item.name} を選択"
              />
            </label>

            <div class="col-name" style="padding-left: {row.depth * 20}px;">
              <div class="name-line">
                {#if $app.highlights.has(row.item.id)}
                  <span class="badge badge-highlight">移動</span>
                {/if}
                {#if indexes?.kuukanByOwner.has(row.item.id)}
                  <span class="badge badge-storage">収納</span>
                {/if}
                {#if row.item.notices && row.item.notices.length > 0}
                  <span class="badge badge-notice">メモ</span>
                {/if}
                <span class="item-name-text">{row.item.name}</span>
                {#if row.item.qty !== undefined}
                  <span class="item-qty muted">×{row.item.qty}</span>
                {/if}
              </div>
              <div class="mobile-sub muted small">
                {$app.doc ? formatPlacePath($app.doc, row.item.place) : ''}
              </div>
            </div>

            <div class="col-place">
              <span class="truncate-text">
                {$app.doc ? formatPlacePath($app.doc, row.item.place) : ''}
              </span>
            </div>

            <div class="col-category">
              <span class="truncate-text" class:muted={row.item.category === null}>
                {row.item.category !== null && $app.doc
                  ? displayName($app.doc, row.item.category)
                  : '未分類'}
              </span>
            </div>

            <div class="col-tags">
              <div class="tags-container">
                {#each row.item.tags as tagId (tagId)}
                  <span class="chip small">
                    {$app.doc ? displayName($app.doc, tagId) : tagId}
                  </span>
                {/each}
              </div>
            </div>

            <div class="col-actions">
              {#if getOffset(row.item).isOff}
                {@const offsetInfo = getOffset(row.item)}
                <button
                  type="button"
                  class="offset-btn small"
                  title={offsetInfo.desc}
                  aria-label="ずれ：{offsetInfo.desc}"
                  onclick={(e) => {
                    e.stopPropagation();
                    app.showToast('info', offsetInfo.desc);
                  }}
                >
                  ⚠ずれ
                </button>
              {/if}
              <button
                type="button"
                class="view-btn small ghost"
                title="クウカンで見る"
                aria-label="{row.item.name} をクウカンで見る"
                onclick={(e) => {
                  e.stopPropagation();
                  app.showInView(row.item.id);
                }}
              >
                <span class="view-btn-full">クウカンで見る</span>
                <span class="view-btn-short">見る</span>
              </button>
            </div>
          </div>
        {/if}
      {/each}

      {#if bottomPadding > 0}
        <div style="height: {bottomPadding}px;" aria-hidden="true"></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .table-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    background: var(--surface);
    overflow: hidden;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-6);
    color: var(--text-muted);
    height: 100%;
    text-align: center;
  }

  .table-header {
    display: flex;
    align-items: center;
    height: var(--row-height);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-muted);
    padding: 0 var(--space-2);
    flex-shrink: 0;
  }

  .scroll-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    position: relative;
  }

  .row {
    display: flex;
    align-items: center;
    height: var(--row-height);
    max-height: var(--row-height);
    min-height: var(--row-height);
    border-bottom: 1px solid var(--border);
    padding: 0 var(--space-2);
    box-sizing: border-box;
  }

  .group-row {
    background: var(--surface-2);
    font-weight: 600;
    gap: var(--space-2);
  }

  .group-label {
    font-size: var(--font-size-small);
  }

  .group-count {
    font-size: var(--font-size-small);
  }

  .item-row {
    background: var(--surface);
    cursor: pointer;
  }

  .item-row:hover:not(.is-active-detail):not(.is-highlighted) {
    background: var(--surface-2);
  }

  .item-row.is-active-detail {
    background: var(--accent-soft);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .item-row.is-highlighted {
    background: var(--highlight);
  }

  .header-cell {
    padding: 0 var(--space-2);
  }

  .col-check {
    width: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-check input {
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .col-name {
    flex: 2;
    min-width: 140px;
    padding: 0 var(--space-2);
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    overflow: hidden;
  }

  .item-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .item-qty {
    font-size: var(--font-size-small);
    white-space: nowrap;
  }

  .mobile-sub {
    display: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  .col-place {
    flex: 2;
    min-width: 140px;
    padding: 0 var(--space-2);
    overflow: hidden;
  }

  .col-category {
    flex: 1.2;
    min-width: 100px;
    padding: 0 var(--space-2);
    overflow: hidden;
  }

  .col-tags {
    flex: 1.8;
    min-width: 120px;
    padding: 0 var(--space-2);
    overflow: hidden;
  }

  .col-actions {
    width: 180px;
    min-width: 180px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    flex-shrink: 0;
  }

  .offset-btn {
    min-height: 26px;
    height: 26px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
    background: var(--warning-soft);
    color: var(--warning);
    border: 1px solid var(--warning);
    border-radius: var(--radius-small);
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    line-height: 1;
  }

  .offset-btn:hover {
    filter: brightness(0.95);
  }

  .view-btn {
    min-height: 28px;
    height: 28px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
    white-space: nowrap;
    border-radius: var(--radius-small);
  }

  .view-btn-full {
    display: inline;
  }

  .view-btn-short {
    display: none;
  }

  .truncate-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-small);
  }

  .tags-container {
    display: flex;
    gap: var(--space-1);
    overflow: hidden;
    white-space: nowrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: var(--radius-small);
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .badge-storage {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
  }

  .badge-notice {
    background: var(--warning-soft);
    color: var(--warning);
    border: 1px solid var(--warning);
  }

  .badge-highlight {
    background: var(--warning);
    color: var(--surface);
    font-weight: 600;
  }

  @media (max-width: 767.98px) {
    .table-header {
      display: none;
    }

    .col-check {
      height: 100%;
      cursor: pointer;
    }

    .col-place,
    .col-category,
    .col-tags {
      display: none;
    }

    .mobile-sub {
      display: block;
    }

    .col-name {
      padding-right: var(--space-2);
    }

    .col-actions {
      width: auto;
      min-width: auto;
      gap: var(--space-1);
    }

    .view-btn-full {
      display: none;
    }

    .view-btn-short {
      display: inline;
    }
  }
</style>
