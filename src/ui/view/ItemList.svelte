<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import { getViewUi } from './viewUi.svelte';
  import { buildAreaTree, getIndexes } from '../../core/indexes';
  import { displayName } from '../../core/places';
  import type { ArekokoDocument, Area, Id, Item } from '../../core/types';
  import { NIL_ID } from '../../core/constants';
  import CreateItemPlacingModal, { type PlaceChoice } from '../components/CreateItemPlacingModal.svelte';
  import {
    itemsInScope,
    drawingOffset,
    offsetText,
    quickSearch,
    type QuickResult,
  } from '../../view/model';
  import { getBadgeStyle } from '../color';
  import {
    groupItemsByArea,
    type GroupItemsResult,
  } from '../../view/itemGrouping';

  const app = getApp();
  const ui = getViewUi();

  let isAdding = $state(false);
  let newItemName = $state('');

  $effect(() => {
    if ($app.view?.placing) {
      isAdding = false;
      newItemName = '';
    }
  });

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

  const hasDrawing = $derived.by(() => {
    if (!kuukan || !$app.doc) return false;
    return $app.doc.drawing.kuukans.some((k) => k.kuukan === kuukan);
  });

  const leafAreas = $derived.by((): Area[] => {
    if (!$app.doc || !kuukan) return [];
    const areas = $app.doc.membership.areas.filter((a) => a.kuukan === kuukan);
    if (areas.length === 0) return [];
    const tree = buildAreaTree($app.doc, kuukan);
    return areas.filter(
      (a) =>
        !tree.children.has(a.id) ||
        (tree.children.get(a.id)?.length ?? 0) === 0,
    );
  });

  let pendingAddItem = $state<{ name: string } | null>(null);

  // 追加のダイアログの置き場：クウカンそのもの（エリアを決めない）と、それ以上分けていないエリア（詳細(ビュー) V2・V3、TRS 付録B I-21）
  const placeChoices = $derived.by((): PlaceChoice[] => {
    if (!kuukan) return [];
    const choices: PlaceChoice[] = [{ id: kuukan, name: kuukanName, note: 'エリアを決めずに置く' }];
    for (const a of leafAreas) choices.push({ id: a.id, name: a.name });
    return choices;
  });

  function handleAddItem(): void {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (hasDrawing) {
      pendingAddItem = { name: trimmed };
    } else {
      executeAddItem(trimmed, area ?? kuukan ?? NIL_ID, false);
    }
  }

  function executeAddItem(
    name: string,
    targetPlace: Id,
    placeNow: boolean,
  ): void {
    const createdId = app.addItemInView(name, targetPlace);
    if (createdId !== null) {
      if (placeNow) {
        ui.attachTarget = createdId;
        ui.selectedDrawing = null;
        ui.detailToRestore = createdId;
        app.setPlacing(true);
        app.showDetail(null);
      }
      newItemName = '';
      isAdding = false;
      pendingAddItem = null;
    }
  }

  function handleCancelAdd(): void {
    isAdding = false;
    newItemName = '';
    pendingAddItem = null;
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

  // エリア別グルーピング結果
  const itemGroupingResult = $derived.by((): GroupItemsResult => {
    if (!$app.doc || !kuukan) return { hasAreas: false, groups: [] };
    return groupItemsByArea({
      doc: $app.doc,
      kuukanId: kuukan,
      items: displayItems,
      selectedAreaId: area,
    });
  });

  // 折りたたまれているグループのキー集合（クウカンそのものに置いたモノのグループは '__unset__'）
  let collapsedAreaIds = $state(new Set<string>());

  function toggleGroup(key: string) {
    const next = new Set(collapsedAreaIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedAreaIds = next;
  }

  const isAllCollapsed = $derived.by(() => {
    if (!itemGroupingResult.hasAreas || itemGroupingResult.groups.length === 0) return false;
    return itemGroupingResult.groups.every((g) =>
      collapsedAreaIds.has(g.areaId ?? '__unset__'),
    );
  });

  function toggleAllGroups() {
    if (isAllCollapsed) {
      collapsedAreaIds = new Set();
    } else {
      collapsedAreaIds = new Set(
        itemGroupingResult.groups.map((g) => g.areaId ?? '__unset__'),
      );
    }
  }

  // 図面でエリアが選択された時、該当アコーディオンを展開してスクロール追従
  $effect(() => {
    if (area !== null) {
      if (collapsedAreaIds.has(area)) {
        const next = new Set(collapsedAreaIds);
        next.delete(area);
        collapsedAreaIds = next;
      }
      setTimeout(() => {
        const el = document.querySelector(`[data-area-id="${area}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  });
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
      {#if itemGroupingResult.hasAreas && area === null}
        <button
          type="button"
          class="ghost small toggle-all-btn"
          onclick={toggleAllGroups}
          title={isAllCollapsed ? 'すべてのエリアを展開します' : 'すべてのエリアを折りたたみます'}
        >
          {isAllCollapsed ? 'すべて開く' : 'すべて閉じる'}
        </button>
      {/if}
    </div>

    {#if area !== null}
      <div class="area-filter-badge">
        <span class="badge-area-text"><strong>{areaName}</strong> で絞り込み中</span>
        <button
          type="button"
          class="badge-clear-btn"
          onclick={() => app.selectViewArea(null)}
          title="エリアの絞り込みを解除して全体を表示"
        >
          すべて表示
        </button>
      </div>
    {/if}

    {#if !$app.view?.placing}
      <div class="add-section">
        {#if isAdding}
          <div class="add-form">
            <input
              type="text"
              placeholder="モノの名前"
              use:autofocus
              bind:value={newItemName}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  // 開いたモノの追加の画面に同じ Enter が届いて、選ぶ前に作られてしまわないように止める
                  e.stopPropagation();
                  handleAddItem();
                }
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
    {/if}
  </div>

  {#snippet itemRow(item: Item, showPlaceChip: boolean)}
    {@const isFocus = $app.view?.focus === item.id}
    {@const isHighlight = $app.highlights.has(item.id)}
    {@const isAttaching = ui.attachTarget === item.id}
    {@const isSelectedDrawing = ui.selectedDrawing === item.id}
    {@const storageKuukan = indexes?.kuukanByOwner.get(item.id)}
    {@const insideCount = searchResult?.insideStorage.get(item.id)}
    {@const offset = $app.doc ? drawingOffset($app.doc, item.id) : null}
    {@const hasItemDrawing = indexes?.itemDrawingOf.has(item.id) ?? false}
    {@const showPlace =
      showPlaceChip && area === null && item.place !== kuukan && $app.doc
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
        onclick={() => {
          if ($app.view?.placing) {
            ui.detailToRestore = item.id;
            if (hasItemDrawing) {
              ui.selectedDrawing = item.id;
              ui.attachTarget = null;
            } else {
              ui.attachTarget = item.id;
              ui.selectedDrawing = null;
            }
          } else {
            app.showDetail(item.id);
          }
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if ($app.view?.placing) {
              ui.detailToRestore = item.id;
              if (hasItemDrawing) {
                ui.selectedDrawing = item.id;
                ui.attachTarget = null;
              } else {
                ui.attachTarget = item.id;
                ui.selectedDrawing = null;
              }
            } else {
              app.showDetail(item.id);
            }
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
            {#if item.category && $app.doc}
              {@const cat = $app.doc.membership.categories.find((c) => c.id === item.category)}
              <span class="chip small" style={getBadgeStyle(cat?.color)}>
                {cat?.name ?? categoryName}
              </span>
            {/if}
            {#if item.tags.length > 0 && $app.doc}
              {#each item.tags as tid (tid)}
                {@const tag = $app.doc.membership.tags.find((t) => t.id === tid)}
                <span class="chip small" style={getBadgeStyle(tag?.color)}>
                  {tag?.name ?? tid}
                </span>
              {/each}
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
                    {isSelectedDrawing ? '選択中' : '選択'}
                  </button>
                {:else if isAttaching}
                  <div class="attach-shape-group">
                    <button
                      type="button"
                      class="small ghost shape-toggle-btn"
                      class:active={ui.attachTool === 'point'}
                      onclick={(e) => {
                        e.stopPropagation();
                        ui.attachTool = 'point';
                      }}
                      title="図をクリックした位置に、点で配置します"
                    >
                      点
                    </button>
                    <button
                      type="button"
                      class="small ghost shape-toggle-btn"
                      class:active={ui.attachTool === 'rect'}
                      onclick={(e) => {
                        e.stopPropagation();
                        ui.attachTool = 'rect';
                      }}
                      title="図の上をドラッグして、四角で配置します"
                    >
                      四角
                    </button>
                    <button
                      type="button"
                      class="small ghost danger cancel-attach-btn"
                      onclick={(e) => {
                        e.stopPropagation();
                        ui.attachTarget = null;
                      }}
                      title="配置を取り消します"
                    >
                      取消
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    class="small ghost attach-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      ui.attachTarget = item.id;
                    }}
                  >
                    配置する
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
  {/snippet}

  <div class="items-scroll">
    {#if displayItems.length === 0}
      <div class="empty-message muted">
        {#if isQuickSearching}
          見つかりませんでした
        {:else}
          モノがありません
        {/if}
      </div>
    {:else if !itemGroupingResult.hasAreas}
      <!-- エリア分割がない部屋ではフラットリスト -->
      <ul class="items-list">
        {#each displayItems as item (item.id)}
          {@render itemRow(item, true)}
        {/each}
      </ul>
    {:else}
      <!-- エリア分割がある部屋ではアコーディオン表示 -->
      <div class="area-groups-list">
        {#each itemGroupingResult.groups as group (group.areaId ?? '__unset__')}
          {@const gKey = group.areaId ?? '__unset__'}
          {@const isCollapsed = collapsedAreaIds.has(gKey)}
          <div
            class="area-group"
            class:selected-group={group.isSelected}
            data-area-id={group.areaId}
          >
            <button
              type="button"
              class="area-group-header"
              class:selected={group.isSelected}
              aria-expanded={!isCollapsed}
              onclick={() => toggleGroup(gKey)}
            >
              <div class="header-left">
                <span class="group-arrow" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                <span class="group-name">{group.name}</span>
                <span class="group-count muted small">（{group.items.length}件）</span>
              </div>
              {#if group.isSelected}
                <span class="chip accent small group-selected-badge">選択中</span>
              {/if}
            </button>
            {#if !isCollapsed}
              {#if group.items.length === 0}
                <div class="group-empty muted small">このエリアにモノはありません</div>
              {:else}
                <ul class="items-list">
                  {#each group.items as item (item.id)}
                    {@render itemRow(item, false)}
                  {/each}
                </ul>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if pendingAddItem && kuukan}
    <CreateItemPlacingModal
      itemName={pendingAddItem.name}
      choices={placeChoices}
      initialPlace={area ?? kuukan}
      onConfirm={({ place, placeNow }) => {
        if (!pendingAddItem) return;
        executeAddItem(pendingAddItem.name, place, placeNow);
      }}
      onCancel={() => {
        pendingAddItem = null;
      }}
    />
  {/if}
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

  .area-filter-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-small);
  }

  .badge-area-text {
    flex: 1;
    color: var(--text);
  }

  .badge-clear-btn {
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: var(--font-size-small);
    font-weight: 600;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast);
  }

  .badge-clear-btn:hover {
    background: var(--surface);
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

  .attach-shape-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: var(--surface-2);
    padding: 2px;
    border-radius: var(--radius-small);
  }

  .shape-toggle-btn.active {
    background: var(--accent);
    color: var(--accent-text);
  }

  .empty-message {
    padding: var(--space-5) var(--space-4);
    text-align: center;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .toggle-all-btn {
    font-size: 11px;
    padding: 2px 6px;
    min-height: 24px;
    height: 24px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .area-groups-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-1);
  }

  .area-group {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .area-group.selected-group {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .area-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 34px;
    padding: var(--space-1) var(--space-3);
    background: var(--surface-2);
    border: none;
    border-bottom: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text);
  }

  .area-group-header:hover {
    background: var(--surface-3, rgba(0, 0, 0, 0.05));
  }

  .area-group-header.selected {
    background: var(--accent-soft);
    color: var(--accent);
    border-bottom-color: var(--accent-border, rgba(0, 0, 0, 0.1));
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .group-arrow {
    display: inline-block;
    width: 14px;
    font-size: 12px;
    color: var(--text-muted);
    user-select: none;
  }

  .group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-count {
    font-weight: 400;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .group-selected-badge {
    margin-left: var(--space-2);
    flex-shrink: 0;
  }

  .group-empty {
    padding: var(--space-3);
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }

  @media (max-width: 767.98px) {
    .row-main {
      padding: var(--space-3) var(--space-3);
      gap: var(--space-3);
    }

    .open-storage-btn,
    .placing-actions button {
      min-height: 40px;
      min-width: 44px;
      padding: 0 var(--space-3);
      font-size: var(--font-size);
    }
  }
</style>
