<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Kuukan, Id } from '../../core/types';
  import { NIL_ID, UNSET_NAME, NAMELESS_NAME } from '../../core/constants';
  import { itemsWithin, formatPlacePath } from '../../core/places';
  import {
    renameKuukan,
    planDeleteKuukan,
    deleteKuukan,
  } from '../../core/ops/kuukans';
  import { TEMPLATE_LIST } from '../../editor/templates';
  import type { TemplateId } from '../../editor/draft';
  import TemplateThumb from '../components/TemplateThumb.svelte';

  const app = getApp();

  let newKuukanName = $state('');
  let editingKuukanId = $state<Id | null>(null);
  let editingKuukanName = $state('');
  let showTemplateDialog = $state(false);
  let openMenuKuukanId = $state<Id | null>(null);

  const topLevelKuukans = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return [];
    return doc.membership.kuukans.filter((k) => k.owner === null);
  });

  const storageKuukans = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return [];
    return doc.membership.kuukans.filter((k) => k.owner !== null);
  });

  const unsetKuukan = $derived.by(() => {
    return topLevelKuukans.find((k) => k.id === NIL_ID);
  });

  const customKuukans = $derived.by(() => {
    return topLevelKuukans.filter((k) => k.id !== NIL_ID);
  });

  function hasDrawing(kuukanId: Id): boolean {
    const doc = $app.doc;
    if (!doc) return false;
    return doc.drawing.kuukans.some((k) => k.kuukan === kuukanId);
  }

  function handleCreateKuukan() {
    const trimmed = newKuukanName.trim();
    app.openDraft({ kind: 'new' }, { name: trimmed || '新しいクウカン' });
    newKuukanName = '';
  }

  function handleSelectTemplate(template: TemplateId) {
    showTemplateDialog = false;
    app.openDraft({ kind: 'template', template });
  }

  function handleEditKuukan(id: Id) {
    closeMenu();
    app.openKuukanEditor(id);
  }

  function handleDuplicateKuukan(id: Id) {
    closeMenu();
    app.openDraft({ kind: 'duplicate', source: id });
  }

  function startRename(kuukan: Kuukan) {
    closeMenu();
    editingKuukanId = kuukan.id;
    editingKuukanName = kuukan.name ?? NAMELESS_NAME;
  }

  function commitRename(kuukan: Kuukan) {
    if (editingKuukanId !== kuukan.id) return;
    const trimmed = editingKuukanName.trim();
    if (trimmed && trimmed !== (kuukan.name ?? NAMELESS_NAME)) {
      app.apply((doc) => renameKuukan(doc, kuukan.id, trimmed));
    }
    editingKuukanId = null;
  }

  function handleDeleteKuukan(kuukan: Kuukan) {
    closeMenu();
    if (!$app.doc) return;
    const relocations = planDeleteKuukan($app.doc, kuukan.id);
    const displayName = kuukan.name ?? NAMELESS_NAME;
    const message = `クウカン「${displayName}」を削除します。中のモノは未設定へ移ります。`;
    const details = relocations.map((r) => {
      const fromPath = formatPlacePath($app.doc!, r.from);
      const toPath = formatPlacePath($app.doc!, r.to);
      return `${fromPath} から ${r.items.length}件 → ${toPath}`;
    });

    app.confirm({
      title: 'クウカンの削除',
      message,
      details,
      confirmLabel: '削除する',
      danger: true,
      onConfirm: () => {
        app.apply((doc, ctx) => deleteKuukan(doc, kuukan.id, ctx));
      },
    });
  }

  function toggleMenu(id: Id, e: MouseEvent) {
    e.stopPropagation();
    openMenuKuukanId = openMenuKuukanId === id ? null : id;
  }

  function closeMenu() {
    openMenuKuukanId = null;
  }

  function handleCardClick(id: Id, e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, [role="menu"], [role="menuitem"]')) {
      return;
    }
    closeMenu();
    app.openView(id);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      if (openMenuKuukanId !== null) {
        closeMenu();
      }
      if (showTemplateDialog) {
        showTemplateDialog = false;
      }
    }
  }}
  onclick={() => {
    if (openMenuKuukanId !== null) {
      closeMenu();
    }
  }}
/>

<div class="kuukan-screen">
  <div class="screen-header">
    <h2>クウカン</h2>
    <p class="description muted">
      クウカンを開くと、中のモノを見たり追加したりできます。置き場のないモノは「未設定」に入ります。
    </p>
  </div>

  <div class="create-form">
    <input
      type="text"
      bind:value={newKuukanName}
      placeholder="新しいクウカン名…"
      onkeydown={(e) => {
        if (e.key === 'Enter') handleCreateKuukan();
      }}
    />
    <button type="button" class="primary" onclick={handleCreateKuukan}>
      ＋新しいクウカン
    </button>
    <button
      type="button"
      class="ghost"
      onclick={() => {
        showTemplateDialog = true;
      }}
    >
      テンプレートから
    </button>
  </div>

  <div class="kuukans-list">
    <!-- 未設定（常に最初） -->
    {#if unsetKuukan && $app.doc}
      <!-- svelte-ignore a11y_click_events_have_key_events (キーボードでは名前のボタンで開く) -->
      <div
        class="kuukan-card unset-card"
        role="presentation"
        onclick={(e) => handleCardClick(NIL_ID, e)}
      >
        <div class="kuukan-info">
          <button
            type="button"
            class="kuukan-name kuukan-name-btn"
            onclick={(e) => {
              e.stopPropagation();
              app.openView(NIL_ID);
            }}
          >
            {UNSET_NAME}
          </button>
          <span class="chip small muted">
            {itemsWithin($app.doc, unsetKuukan.id).length}件
          </span>
          <span class="chip small muted">図なし</span>
        </div>
        <div class="kuukan-actions">
          <button
            type="button"
            class="small primary"
            onclick={(e) => {
              e.stopPropagation();
              app.openView(NIL_ID);
            }}
          >
            開く
          </button>
        </div>
      </div>
    {/if}

    <!-- どこにも置かれていないクウカン -->
    {#if $app.doc}
      {#each customKuukans as kuukan (kuukan.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events (キーボードでは名前のボタンで開く) -->
        <div
          class="kuukan-card"
          role="presentation"
          onclick={(e) => handleCardClick(kuukan.id, e)}
        >
          <div class="kuukan-info">
            {#if editingKuukanId === kuukan.id}
              <input
                use:autofocus
                type="text"
                bind:value={editingKuukanName}
                onblur={() => commitRename(kuukan)}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename(kuukan);
                  if (e.key === 'Escape') editingKuukanId = null;
                }}
                class="inline-input"
              />
            {:else}
              <button
                type="button"
                class="kuukan-name kuukan-name-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  app.openView(kuukan.id);
                }}
              >
                {kuukan.name ?? NAMELESS_NAME}
              </button>
              <span class="chip small muted">
                {itemsWithin($app.doc, kuukan.id).length}件
              </span>
              {#if hasDrawing(kuukan.id)}
                <span class="chip small accent">図あり</span>
              {:else}
                <span class="chip small muted">図なし</span>
              {/if}
            {/if}
          </div>

          <div class="kuukan-actions">
            {#if editingKuukanId !== kuukan.id}
              <button
                type="button"
                class="small primary"
                onclick={(e) => {
                  e.stopPropagation();
                  app.openView(kuukan.id);
                }}
              >
                開く
              </button>
              <button
                type="button"
                class="small"
                onclick={(e) => {
                  e.stopPropagation();
                  handleEditKuukan(kuukan.id);
                }}
              >
                編集
              </button>

              <div class="menu-container">
                <button
                  type="button"
                  class="small ghost menu-trigger-btn"
                  aria-label="ほかの操作"
                  aria-haspopup="menu"
                  aria-expanded={openMenuKuukanId === kuukan.id}
                  onclick={(e) => toggleMenu(kuukan.id, e)}
                >
                  …
                </button>
                {#if openMenuKuukanId === kuukan.id}
                  <div
                    class="menu-dropdown"
                    role="menu"
                    tabindex="-1"
                  >
                    <button
                      type="button"
                      class="menu-item"
                      role="menuitem"
                      onclick={() => handleDuplicateKuukan(kuukan.id)}
                    >
                      複製
                    </button>
                    <button
                      type="button"
                      class="menu-item"
                      role="menuitem"
                      onclick={() => startRename(kuukan)}
                    >
                      名前の変更
                    </button>
                    <button
                      type="button"
                      class="menu-item danger"
                      role="menuitem"
                      onclick={() => handleDeleteKuukan(kuukan)}
                    >
                      削除
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}

    <!-- 収納のクウカン -->
    {#if storageKuukans.length > 0 && $app.doc}
      <div class="storage-section">
        <h3 class="storage-header">収納</h3>
        <div class="storage-list">
          {#each storageKuukans as kuukan (kuukan.id)}
            {@const ownerItem = $app.doc.membership.items.find((i) => i.id === kuukan.owner)}
            <!-- svelte-ignore a11y_click_events_have_key_events (キーボードでは名前のボタンで開く) -->
            <div
              class="kuukan-card storage-card"
              role="presentation"
              onclick={(e) => handleCardClick(kuukan.id, e)}
            >
              <div class="kuukan-info">
                <div class="storage-title-block">
                  <button
                    type="button"
                    class="kuukan-name kuukan-name-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      app.openView(kuukan.id);
                    }}
                  >
                    {ownerItem ? ownerItem.name : (kuukan.name ?? NAMELESS_NAME)}
                  </button>
                  {#if ownerItem}
                    <span class="storage-path muted small">
                      {formatPlacePath($app.doc, ownerItem.place)}
                    </span>
                  {/if}
                </div>
                <span class="chip small muted">
                  {itemsWithin($app.doc, kuukan.id).length}件
                </span>
                {#if hasDrawing(kuukan.id)}
                  <span class="chip small accent">図あり</span>
                {:else}
                  <span class="chip small muted">図なし</span>
                {/if}
              </div>

              <div class="kuukan-actions">
                <button
                  type="button"
                  class="small primary"
                  onclick={(e) => {
                    e.stopPropagation();
                    app.openView(kuukan.id);
                  }}
                >
                  開く
                </button>
                <button
                  type="button"
                  class="small"
                  onclick={(e) => {
                    e.stopPropagation();
                    handleEditKuukan(kuukan.id);
                  }}
                >
                  編集
                </button>

                <div class="menu-container">
                  <button
                    type="button"
                    class="small ghost menu-trigger-btn"
                    aria-label="ほかの操作"
                    aria-haspopup="menu"
                    aria-expanded={openMenuKuukanId === kuukan.id}
                    onclick={(e) => toggleMenu(kuukan.id, e)}
                  >
                    …
                  </button>
                  {#if openMenuKuukanId === kuukan.id}
                    <div
                      class="menu-dropdown"
                      role="menu"
                      tabindex="-1"
                    >
                      <button
                        type="button"
                        class="menu-item"
                        role="menuitem"
                        onclick={() => handleDuplicateKuukan(kuukan.id)}
                      >
                        複製
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showTemplateDialog}
  <div
    class="dialog-overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) showTemplateDialog = false;
    }}
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-dialog-title"
      tabindex="-1"
    >
      <div class="dialog-header" id="template-dialog-title">
        テンプレートから作成
      </div>
      <div class="dialog-body">
        <div class="template-list">
          {#each TEMPLATE_LIST as template (template.id)}
            <button
              type="button"
              class="template-card"
              onclick={() => handleSelectTemplate(template.id)}
            >
              <TemplateThumb templateId={template.id} />
              <div class="template-text">
                <div class="template-name">{template.name}</div>
                <div class="template-desc muted small">{template.description}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
      <div class="dialog-footer">
        <button
          type="button"
          onclick={() => {
            showTemplateDialog = false;
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .kuukan-screen {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    height: 100%;
    overflow-y: auto;
  }

  .screen-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .screen-header h2 {
    margin: 0;
    font-size: var(--font-size-large);
  }

  .description {
    margin: 0;
    line-height: var(--line-height);
  }

  .create-form {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .create-form input {
    flex: 1;
    min-width: 200px;
  }

  .kuukans-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .kuukan-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    gap: var(--space-3);
    cursor: pointer;
  }

  .kuukan-card:hover {
    border-color: var(--accent);
  }

  .unset-card {
    background: var(--surface-2);
  }

  .kuukan-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    flex-wrap: wrap;
  }

  .kuukan-name {
    font-weight: 600;
  }

  .kuukan-name-btn {
    border: none;
    background: transparent;
    padding: 0;
    min-height: auto;
    font-weight: 600;
    font-size: inherit;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    border-radius: var(--radius-small);
  }

  .kuukan-name-btn:hover {
    background: transparent;
    text-decoration: underline;
  }

  .inline-input {
    flex: 1;
    min-height: 32px;
    cursor: text;
  }

  .kuukan-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .menu-container {
    position: relative;
    display: inline-flex;
  }

  .menu-trigger-btn {
    min-width: 32px;
    padding: 0 var(--space-2);
    font-weight: bold;
    font-size: var(--font-size);
    line-height: 1;
  }

  .menu-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + var(--space-1));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    padding: var(--space-1);
    gap: 2px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-small);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--font-size-small);
    text-align: left;
    cursor: pointer;
    justify-content: flex-start;
  }

  .menu-item:hover {
    background: var(--surface-2);
  }

  .menu-item.danger {
    color: var(--danger);
  }

  .menu-item.danger:hover {
    background: var(--danger-soft);
  }

  .storage-section {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .storage-header {
    margin: 0;
    font-size: var(--font-size);
    font-weight: 600;
    color: var(--text-muted);
  }

  .storage-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .storage-title-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 2px;
  }

  .storage-path {
    font-size: var(--font-size-small);
    text-align: left;
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .template-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: left;
    gap: var(--space-3);
    cursor: pointer;
  }

  .template-card:hover {
    background: var(--surface-2);
  }

  .template-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .template-name {
    font-weight: 600;
  }

  .template-desc {
    line-height: var(--line-height);
  }

  @media (max-width: 767.98px) {
    .kuukan-card {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-3);
      padding: var(--space-3);
    }

    .kuukan-info {
      width: 100%;
    }

    .kuukan-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .create-form {
      flex-direction: column;
    }

    .create-form input {
      min-width: 0;
      width: 100%;
    }
  }
</style>
