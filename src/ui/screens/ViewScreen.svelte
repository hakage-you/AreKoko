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
      ui.attachTarget = null;
      ui.selectedDrawing = null;
      app.setPlacing(false);
    } else {
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
</script>

<div class="view-screen">
  <div class="main-content">
    <header class="view-header">
      <div class="header-top">
        <Breadcrumb />
        <div class="header-actions">
          {#if !isUnset && kuukan}
            <button
              type="button"
              class="small ghost"
              onclick={handleEditKuukan}
            >
              編集
            </button>
          {/if}
          {#if hasDrawing}
            {#if $app.view?.placing}
              <button
                type="button"
                class="small primary"
                onclick={handleTogglePlacing}
              >
                配置を終える
              </button>
            {:else}
              <button
                type="button"
                class="small"
                onclick={handleTogglePlacing}
              >
                配置モード
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
              >
                解除
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
          <ItemList />
        </div>
      {:else}
        <div class="list-pane full-width">
          <div class="no-drawing-banner" role="status">
            {#if isUnset}
              <span class="banner-text">置き場が決まっていないモノです。モノの詳細で置き場を変えられます</span>
            {:else}
              <span class="banner-text">このクウカンには図がありません</span>
              {#if kuukan}
                <button
                  type="button"
                  class="small primary"
                  onclick={handleRedraw}
                >
                  図を描く
                </button>
              {/if}
            {/if}
          </div>
          <ItemList />
        </div>
      {/if}
    </div>
  </div>

  {#if $app.detail}
    <aside class="detail-sidebar" aria-label="モノの詳細">
      <ItemDetail id={$app.detail} onClose={() => app.showDetail(null)} />
    </aside>
  {/if}
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
  }

  /* 図のないクウカン：リストが主役。広い画面で間延びしないよう、読みやすい幅で中央に */
  .list-pane.full-width {
    width: 100%;
    min-width: 0;
    max-width: 880px;
    margin: 0 auto;
    border-left: none;
    flex: 1;
  }

  .no-drawing-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: var(--font-size-small);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .banner-text {
    line-height: var(--line-height);
  }

  .detail-sidebar {
    width: var(--detail-width);
    border-left: 1px solid var(--border);
    background: var(--surface);
    height: 100%;
    overflow-y: auto;
    flex-shrink: 0;
    z-index: 20;
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

    .list-pane.full-width {
      border-top: none;
      min-height: 100%;
    }

    .detail-sidebar {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      border-left: none;
      z-index: 50;
    }
  }
</style>
