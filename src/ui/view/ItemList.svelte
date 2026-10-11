<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import { getViewUi } from './viewUi.svelte';
  import { buildAreaTree, getIndexes } from '../../core/indexes';
  import { displayName } from '../../core/places';
  import type { ArekokoDocument, Id, Item } from '../../core/types';
  import {
    itemsInScope,
    drawingOffset,
    offsetText,
    quickSearch,
    type QuickResult,
  } from '../../view/model';

  const app = getApp();
  const ui = getViewUi();

  let isAdding = $state(false);
  let newItemName = $state('');

  const kuukan = $derived($app.view?.kuukan ?? null);
  const area = $derived($app.view?.area ?? null);
  const quickText = $derived($app.view?.quick ?? '');
  const isQuickSearching = $derived(quickText.trim() !== '');

  const indexes = $derived($app.doc ? getIndexes($app.doc) : null);

  const scopedItems = $derived.by(() => {
    if (!$app.doc || !kuukan) return [];
    return itemsInScope($app.doc, kuukan, area);
  });

  const searchResult = $derived.by((): QuickResult | null => {
    if (!$app.doc || !kuukan || !isQuickSearching) return null;
    return quickSearch($app.doc, kuukan, quickText.trim());
  });

  function computePlaceOrder(doc: ArekokoDocument, kuukanId: Id): Map<Id, number> {
    const tree = buildAreaTree(doc, kuukanId);
    const orderMap = new Map<Id, number>();
    let nextOrder = 0;

    function traverse(nodeId: Id): void {
      orderMap.set(nodeId, nextOrder++);
      const children = tree.children.get(nodeId) ?? [];
      for (const childId of children) {
        traverse(childId);
      }
    }

    traverse(tree.root);
    return orderMap;
  }

  const displayItems = $derived.by(() => {
    if (!$app.doc || !kuukan) return [];
    let items = scopedItems;
    if (isQuickSearching && searchResult) {
      items = items.filter(
        (item) =>
          searchResult.direct.has(item.id) ||
          searchResult.insideStorage.has(item.id)
      );
    }
    const orderMap = computePlaceOrder($app.doc, kuukan);
    return [...items].sort((a, b) => {
      const orderA = orderMap.get(a.place) ?? Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(b.place) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const nameCmp = a.name.localeCompare(b.name, 'ja');
      if (nameCmp !== 0) return nameCmp;
      return a.id.localeCompare(b.id);
    });
  });

  const kuukanName = $derived(
    $app.doc && kuukan ? displayName($app.doc, kuukan) : ''
  );
  const areaName = $derived(
    $app.doc && area ? displayName($app.doc, area) : ''
  );

  function handleAddItem(): void {
    if (app.addItemInView(newItemName) !== null) {
      newItemName = '';
      isAdding = false;
    }
  }

  function handleCancelAdd(): void {
    isAdding = false;
    newItemName = '';
  }

  function scrollIfFocused(node: HTMLElement, focused: boolean) {
    if (focused) {
      node.scrollIntoView({ block: 'nearest' });
    }
    return {
      update(nextFocused: boolean) {
        if (nextFocused) {
          node.scrollIntoView({ block: 'nearest' });
        }
      },
    };
  }
</script>

<div class="item-list-container">
  <div class="list-header">
    <div class="header-top">
      <h3 class="list-title">
        {#if isQuickSearching}
          {area !== null ? `${areaName} で` : ''}『{quickText.trim()}』に当てはまるモノ {displayItems.length}件
        {:else if area !== null}
          {areaName} のモノ {displayItems.length}件
        {:else}
          {kuukanName} のモノ {displayItems.length}件
        {/if}
      </h3>
      {#if area !== null}
        <button
          type="button"
          class="small ghost clear-area-btn"
          onclick={() => app.selectViewArea(null)}
        >
          選択を解除
        </button>
      {/if}
    </div>

    <div class="add-section">
      {#if isAdding}
        <div class="add-form">
          <input
            type="text"
            placeholder="モノの名前"
            use:autofocus
            bind:value={newItemName}
            onkeydown={(e) => {
              if (e.key === 'Enter') handleAddItem();
              if (e.key === 'Escape') handleCancelAdd();
            }}
          />
          <button type="button" class="primary small" onclick={handleAddItem}>
            追加
          </button>
          <button type="button" class="small" onclick={handleCancelAdd}>
            取り消し
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="primary small add-btn"
          onclick={() => {
            isAdding = true;
            newItemName = '';
          }}
        >
          ＋モノを追加
        </button>
      {/if}
    </div>
  </div>

  <div class="items-scroll">
    {#if displayItems.length === 0}
      <div class="empty-message muted">
        {#if isQuickSearching}
          見つかりませんでした
        {:else}
          モノがありません
        {/if}
      </div>
    {:else}
      <ul class="items-list">
        {#each displayItems as item (item.id)}
          {@const isFocus = $app.view?.focus === item.id}
          {@const isHighlight = $app.highlights.has(item.id)}
          {@const isAttaching = ui.attachTarget === item.id}
          {@const isSelectedDrawing = ui.selectedDrawing === item.id}
          {@const storageKuukan = indexes?.kuukanByOwner.get(item.id)}
          {@const insideCount = searchResult?.insideStorage.get(item.id)}
          {@const offset = $app.doc ? drawingOffset($app.doc, item.id) : null}
          {@const hasItemDrawing = indexes?.itemDrawingOf.has(item.id) ?? false}
          {@const showPlace =
            area === null && item.place !== kuukan && $app.doc
              ? displayName($app.doc, item.place)
              : ''}
          {@const categoryName =
            item.category && $app.doc
              ? displayName($app.doc, item.category)
              : ''}
          <li class="item-row-wrap">
          <div
            class="item-row"
            class:focused={isFocus}
            class:highlighted={isHighlight}
            class:attaching={isAttaching}
            use:scrollIfFocused={isFocus}
            onclick={() => app.showDetail(item.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                app.showDetail(item.id);
              }
            }}
            tabindex="0"
            role="button"
          >
            <div class="row-main">
              <div class="item-primary">
                {#if storageKuukan}
                  <span class="badge badge-storage">収納</span>
                {/if}
                <span class="item-name">{item.name}</span>
                {#if item.qty !== undefined}
                  <span class="item-qty">×{item.qty}</span>
                {/if}
              </div>

              <div class="item-meta">
                {#if showPlace}
                  <span class="chip small place-chip">{showPlace}</span>
                {/if}
                {#if categoryName}
                  <span class="chip small muted">{categoryName}</span>
                {/if}
              </div>

              <div class="item-actions">
                {#if offset && offset.kind === 'off'}
                  <button
                    type="button"
                    class="offset-btn"
                    title="描画が置き場の外にあります"
                    onclick={(e) => {
                      e.stopPropagation();
                      ui.offsetOpen =
                        ui.offsetOpen === item.id ? null : item.id;
                    }}
                  >
                    ⚠ずれ
                  </button>
                {/if}

                {#if storageKuukan}
                  {#if insideCount !== undefined}
                    <span class="chip small muted">中に{insideCount}件</span>
                  {/if}
                  <button
                    type="button"
                    class="small ghost open-storage-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      app.openView(storageKuukan.id);
                    }}
                  >
                    開く
                  </button>
                {/if}

                {#if $app.view?.placing}
                  <div class="placing-actions">
                    {#if hasItemDrawing}
                      <button
                        type="button"
                        class="small ghost select-drawing-btn"
                        class:active={isSelectedDrawing}
                        onclick={(e) => {
                          e.stopPropagation();
                          ui.selectedDrawing = item.id;
                          ui.attachTarget = null;
                        }}
                      >
                        {isSelectedDrawing ? '選択中' : '描画を選ぶ'}
                      </button>
                    {:else if isAttaching}
                      <button
                        type="button"
                        class="small ghost danger cancel-attach-btn"
                        onclick={(e) => {
                          e.stopPropagation();
                          ui.attachTarget = null;
                        }}
                      >
                        やめる
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="small ghost attach-btn"
                        onclick={(e) => {
                          e.stopPropagation();
                          ui.attachTarget = item.id;
                        }}
                      >
                        描画を付ける
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            {#if ui.offsetOpen === item.id && offset && offset.kind === 'off' && $app.doc}
              <div class="offset-banner">
                {offsetText($app.doc, item.id, offset)}
              </div>
            {/if}
          </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .item-list-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--surface);
  }

  .list-header {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .list-title {
    margin: 0;
    font-size: var(--font-size);
    font-weight: 600;
    color: var(--text);
  }

  .clear-area-btn {
    font-size: var(--font-size-small);
  }

  .add-section {
    display: flex;
  }

  .add-btn {
    width: 100%;
  }

  .add-form {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .add-form input {
    flex: 1;
    min-height: 32px;
    font-size: var(--font-size-small);
  }

  .items-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .items-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .item-row {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .item-row:hover {
    background: var(--surface-2);
  }

  .item-row.highlighted {
    background: var(--highlight);
  }

  .item-row.attaching {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .item-row.focused {
    background: var(--accent-soft);
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .row-main {
    display: flex;
    align-items: center;
    min-height: var(--touch);
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
  }

  .item-primary {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 500;
    min-width: 0;
    flex: 1;
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

  .item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-qty {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    font-weight: normal;
    flex-shrink: 0;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .place-chip {
    background: var(--surface-2);
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    margin-left: auto;
  }

  .offset-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    min-height: 24px;
    font-size: var(--font-size-small);
    border-radius: var(--radius-small);
    border: 1px solid var(--warning);
    background: var(--warning-soft);
    color: var(--text);
    cursor: pointer;
  }

  .offset-btn:hover {
    filter: brightness(0.95);
  }

  .offset-banner {
    padding: var(--space-2) var(--space-3);
    background: var(--warning-soft);
    color: var(--text);
    font-size: var(--font-size-small);
    border-top: 1px dashed var(--warning);
    line-height: var(--line-height);
  }

  .placing-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .empty-message {
    padding: var(--space-5) var(--space-4);
    text-align: center;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }
</style>
