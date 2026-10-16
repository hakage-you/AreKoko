<script lang="ts">
  import { getApp } from '../context';
  import { buildRows } from '../../app/rows';
  import { displayName, formatPlacePath } from '../../core/places';
  import { getIndexes } from '../../core/indexes';
  import { isEmptyQuery } from '../../search/search';
  import { drawingOffset, offsetText } from '../../view/model';
import type { Item } from '../../core/types';
  import { getBadgeStyle } from '../color';

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

  // グループの折りたたみ状態（キーの集合）
  let collapsedKeys = $state<Set<string>>(new Set());

  // グループ折りたたみを反映した行リスト
  const displayRows = $derived.by(() => {
    if (collapsedKeys.size === 0) return rows;
    const result: typeof rows = [];
    let skippingDepth: number | null = null;

    for (const row of rows) {
      if (skippingDepth !== null) {
        if (row.depth > skippingDepth) {
          continue;
        } else {
          skippingDepth = null;
        }
      }
      result.push(row);
      if (row.kind === 'group' && collapsedKeys.has(row.key)) {
        skippingDepth = row.depth;
      }
    }
    return result;
  });

  const totalRows = $derived(displayRows.length);
  const startIndex = $derived(
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER)
  );
  const endIndex = $derived(
    Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER)
  );
  const visibleRows = $derived(displayRows.slice(startIndex, endIndex));
  const topPadding = $derived(startIndex * ROW_HEIGHT);
  const bottomPadding = $derived(Math.max(0, (totalRows - endIndex) * ROW_HEIGHT));

  const allGroups = $derived(rows.filter((r): r is Extract<typeof r, { kind: 'group' }> => r.kind === 'group'));
  const allGroupsCollapsed = $derived(
    allGroups.length > 0 && allGroups.every((g) => collapsedKeys.has(g.key))
  );

  function toggleGroup(key: string): void {
    const next = new Set(collapsedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedKeys = next;
  }

  function toggleAllGroups(): void {
    if (allGroupsCollapsed) {
      collapsedKeys = new Set();
    } else {
      collapsedKeys = new Set(allGroups.map((g) => g.key));
    }
  }

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
      <div class="col-actions header-cell" aria-hidden="true">
        {#if $app.grouping !== 'none' && allGroups.length > 0}
          <button
            type="button"
            class="group-toggle-all-btn ghost small"
            onclick={toggleAllGroups}
            title={allGroupsCollapsed ? 'ぜんぶ展開します' : 'ぜんぶ折りたたみます'}
          >
            {allGroupsCollapsed ? 'ぜんぶ展開' : 'ぜんぶ折りたたむ'}
          </button>
        {/if}
      </div>
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
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="row group-row"
            role="button"
            tabindex="0"
            onclick={() => toggleGroup(row.key)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleGroup(row.key);
              }
            }}
            style="padding-left: calc(var(--space-4) + {row.depth * 20}px);"
          >
            <span class="group-toggle-icon" class:is-collapsed={collapsedKeys.has(row.key)}>
              ▶
            </span>
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

            <div class="col-name" style="--indent: {row.depth * 20}px;">
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
                {#if row.item.summary}
                  <span class="item-summary">{row.item.summary}</span>
                {/if}
              </div>
              <div class="mobile-sub muted small">
                {#if row.item.summary}
                  <span class="mobile-summary">{row.item.summary}</span>
                  <span class="mobile-sep">・</span>
                {/if}
                {$app.doc ? formatPlacePath($app.doc, row.item.place) : ''}
              </div>
            </div>

            <div class="col-place">
              <span class="truncate-text">
                {$app.doc ? formatPlacePath($app.doc, row.item.place) : ''}
              </span>
            </div>

            <div class="col-category">
              {#if row.item.category !== null && $app.doc}
                {@const cat = $app.doc.membership.categories.find((c) => c.id === row.item.category)}
                <span class="chip small category-chip" style={getBadgeStyle(cat?.color)}>
                  <span class="chip-text">{cat?.name ?? '未分類'}</span>
                </span>
              {:else}
                <span class="truncate-text muted">未分類</span>
              {/if}
            </div>

            <div class="col-tags">
              <div class="tags-container">
                {#each row.item.tags as tagId (tagId)}
                  {@const tag = $app.doc?.membership.tags.find((t) => t.id === tagId)}
                  <span class="chip small" style={getBadgeStyle(tag?.color)}>
                    {tag?.name ?? ($app.doc ? displayName($app.doc, tagId) : tagId)}
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
                class="view-btn small"
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
    cursor: pointer;
    user-select: none;
    transition: background var(--duration-fast);
  }

  .group-row:hover {
    background: var(--surface-soft, rgba(0, 0, 0, 0.04));
  }

  .group-toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    width: 14px;
    height: 14px;
    color: var(--text-muted);
    transition: transform var(--duration-fast) var(--ease-default);
    transform: rotate(90deg);
  }

  .group-toggle-icon.is-collapsed {
    transform: rotate(0deg);
  }

  .group-label {
    font-size: var(--font-size-small);
  }

  .group-count {
    font-size: var(--font-size-small);
  }

  .group-toggle-all-btn {
    font-size: 11px;
    padding: 2px 6px;
    height: 24px;
    line-height: 1;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
  }

  .group-toggle-all-btn:hover {
    color: var(--text);
    background: var(--surface-2);
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

  /* 字下げは中身にだけかける。列そのものの幅は変えない（flex の配分がずれて、右の列がずれるため） */
  .col-name > :global(*) {
    margin-left: var(--indent, 0px);
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

  .item-summary {
    color: var(--text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: var(--space-1);
    font-weight: normal;
    flex: 0 1 auto;
    min-width: 0;
    opacity: 0.85;
  }

  .mobile-sub {
    display: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  .mobile-summary {
    color: var(--text-muted);
    font-weight: normal;
  }

  .mobile-sep {
    margin: 0 2px;
    opacity: 0.6;
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
    display: flex;
    align-items: center;
  }

  .category-chip {
    max-width: 100%;
  }

  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    height: 28px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
    white-space: nowrap;
    border-radius: var(--radius-small);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    cursor: pointer;
    transition: background var(--duration-fast), border-color var(--duration-fast), transform var(--duration-fast);
  }

  .view-btn:hover {
    background: var(--surface-2);
    border-color: var(--text-muted);
  }

  .view-btn:active {
    transform: translateY(1px);
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
      width: 44px;
      min-width: 44px;
      height: 100%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
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
      gap: var(--space-2);
      padding-right: var(--space-2);
    }

    .view-btn {
      min-height: 38px;
      min-width: 44px;
      padding: 0 var(--space-3);
      font-size: var(--font-size);
    }

    .view-btn-full {
      display: none;
    }

    .view-btn-short {
      display: inline;
    }
  }
</style>
