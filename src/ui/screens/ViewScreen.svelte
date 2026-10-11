<script lang="ts">
  import { getApp } from '../context';
  import { createViewUi } from '../view/viewUi.svelte';
  import Breadcrumb from '../view/Breadcrumb.svelte';
  import ItemList from '../view/ItemList.svelte';
  import ViewCanvas from '../view/ViewCanvas.svelte';
  import ItemDetail from '../components/ItemDetail.svelte';
  import { NIL_ID } from '../../core/constants';
  import type { Id } from '../../core/types';

  const app = getApp();
  const ui = createViewUi();

  const kuukan = $derived($app.view?.kuukan ?? null);
  const isUnset = $derived(kuukan === NIL_ID);
  const hasDrawing = $derived.by(() => {
    if (!kuukan || !$app.doc) return false;
    return $app.doc.drawing.kuukans.some((k) => k.kuukan === kuukan);
  });
  const quickText = $derived($app.view?.quick ?? '');
  const hasQuickText = $derived(quickText.trim() !== '');

  let prevKuukan = $state<Id | null>(null);

  $effect(() => {
    const currentKuukan = $app.view?.kuukan ?? null;
    if (currentKuukan !== prevKuukan) {
      prevKuukan = currentKuukan;
      ui.selectedDrawing = null;
      ui.attachTarget = null;
      ui.message = null;
      ui.offsetOpen = null;
      ui.fitRequest += 1;
    }
  });

  function handleEditKuukan(): void {
    if (kuukan) {
      app.openKuukanEditor(kuukan);
    }
  }

  function handleRedraw(): void {
    if (kuukan && !isUnset) {
      app.openDraft({ kind: 'redraw', source: kuukan });
    }
  }

  function handleTogglePlacing(): void {
    if ($app.view?.placing) {
      const restoreId = ui.selectedDrawing ?? ui.attachTarget ?? ui.detailToRestore;
      ui.attachTarget = null;
      ui.selectedDrawing = null;
      ui.detailToRestore = null;
      app.setPlacing(false);
      if (restoreId && $app.doc?.membership.items.some((it) => it.id === restoreId)) {
        app.showDetail(restoreId);
      }
    } else {
      const currentDetail = $app.detail;
      ui.detailToRestore = currentDetail;
      ui.selectedDrawing = null;
      ui.attachTarget = null;
      if (currentDetail && $app.doc) {
        const hasDrawing = $app.doc.drawing.items.some((d) => d.item === currentDetail);
        if (hasDrawing) {
          ui.selectedDrawing = currentDetail;
        } else {
          ui.attachTarget = currentDetail;
        }
      }
      app.showDetail(null);
      app.setPlacing(true);
    }
  }

  function handleQuickInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    app.setQuick(target.value);
  }

  function handleClearQuick(): void {
    app.setQuick('');
  }

  function handleSearchFromView(): void {
    app.searchFromView();
  }

  function handleCloseDetail(): void {
    app.showDetail(null);
    ui.selectedDrawing = null;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      if ($app.detail) {
        handleCloseDetail();
      } else if ($app.view?.placing) {
        handleTogglePlacing();
      }
    }
  }}
/>

<div class="view-screen">
  <div class="main-content">
    <header class="view-header">
      <div class="header-top">
        <Breadcrumb />
        <div class="header-actions">
          {#if hasDrawing}
            {#if $app.view?.placing}
              <button
                type="button"
                class="small primary placing-active-btn"
                onclick={handleTogglePlacing}
                title="モノの配置を終了して閲覧画面に戻ります"
              >
                配置を終了
              </button>
            {:else}
              <button
                type="button"
                class="small placing-btn"
                onclick={handleTogglePlacing}
                title="間取りや棚の上にモノのマーク（点や長方形）を配置・移動します"
              >
                モノを配置
              </button>
            {/if}
          {/if}
        </div>
      </div>

      <div class="header-bottom">
        <div class="quick-search">
          <span class="search-label">簡易検索</span>
          <div class="search-input-wrapper">
            <input
              type="text"
              placeholder="モノの名前や概要…"
              value={quickText}
              oninput={handleQuickInput}
            />
            {#if hasQuickText}
              <button
                type="button"
                class="small ghost clear-btn"
                onclick={handleClearQuick}
                title="検索テキストを消去"
                aria-label="検索テキストを消去"
              >
                ✕
              </button>
            {/if}
          </div>
          {#if hasQuickText}
            <button
              type="button"
              class="small"
              onclick={handleSearchFromView}
            >
              サガシモノで続きを探す
            </button>
          {/if}
        </div>
      </div>
    </header>

    <div class="view-body">
      {#if hasDrawing}
        <div class="canvas-pane">
          <ViewCanvas />
        </div>
        <div class="list-pane">
          {#if $app.detail && !$app.view?.placing}
            <div class="detail-region" role="region" aria-label="モノの詳細">
              <ItemDetail id={$app.detail} onClose={handleCloseDetail} />
            </div>
          {:else}
            <ItemList />
          {/if}
        </div>
      {:else}
        <div class="no-drawing-container">
          <div class="no-drawing-inner">
            {#if isUnset}
              <div class="no-drawing-card unset-card">
                <div class="card-body">
                  <h3 class="card-title">置き場が決まっていないモノ</h3>
                  <p class="card-desc">モノをクリックして詳細パネルから置き場を設定できます。</p>
                </div>
              </div>
            {:else}
              <div class="no-drawing-card">
                <div class="card-body">
                  <h3 class="card-title">このクウカンにはまだ間取り図がありません</h3>
                  <p class="card-desc">
                    図を描くと、部屋や収納の中でのモノの位置を視覚的に管理できるようになります。
                  </p>
                </div>
                {#if kuukan}
                  <button
                    type="button"
                    class="primary small"
                    onclick={handleRedraw}
                  >
                    図を描く
                  </button>
                {/if}
              </div>
            {/if}
            <div class="no-drawing-list-wrapper">
              {#if $app.detail}
                <div class="detail-region" role="region" aria-label="モノの詳細">
                  <ItemDetail id={$app.detail} onClose={handleCloseDetail} />
                </div>
              {:else}
                <ItemList />
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .view-screen {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: var(--bg);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .view-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--touch);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .header-bottom {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .quick-search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    flex: 1;
  }

  .search-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    position: relative;
    max-width: 320px;
    flex: 1;
  }

  .search-input-wrapper input {
    min-height: 32px;
    padding-right: 48px;
    font-size: var(--font-size-small);
  }

  .clear-btn {
    position: absolute;
    right: 4px;
    min-height: 24px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
  }

  .view-body {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .canvas-pane {
    flex: 1;
    min-width: 0;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .list-pane {
    width: 380px;
    min-width: 320px;
    max-width: 460px;
    height: 100%;
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }

  .placing-btn {
    border: 1px solid var(--border);
    font-weight: 500;
  }

  .placing-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .placing-active-btn {
    font-weight: 600;
    box-shadow: 0 0 0 2px var(--accent-soft);
  }


  .no-drawing-container {
    flex: 1;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    background: var(--bg);
    padding: var(--space-4);
  }

  .no-drawing-inner {
    width: 100%;
    max-width: 820px;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
  }

  .no-drawing-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    flex-shrink: 0;
  }

  .no-drawing-card .card-body {
    flex: 1;
  }

  .no-drawing-card .card-title {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--font-size);
    font-weight: 600;
    color: var(--text);
  }

  .no-drawing-card .card-desc {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
    line-height: var(--line-height);
  }

  .no-drawing-list-wrapper {
    flex: 1;
    min-height: 300px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
    position: relative;
  }

  @media (max-width: 767.98px) {
    .view-header {
      padding: var(--space-2);
    }

    .header-top {
      flex-wrap: wrap;
    }

    .search-input-wrapper {
      max-width: none;
      width: 100%;
    }

    .view-body {
      flex-direction: column;
      overflow-y: auto;
    }

    .canvas-pane {
      min-height: 320px;
      height: 52vh;
      flex-shrink: 0;
    }

    .list-pane {
      width: 100%;
      max-width: none;
      min-width: 0;
      height: auto;
      min-height: 360px;
      border-left: none;
      border-top: 1px solid var(--border);
      flex: 1;
    }

    .no-drawing-container {
      padding: var(--space-2);
    }

    .no-drawing-card {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      padding: var(--space-3);
    }
  }
</style>
