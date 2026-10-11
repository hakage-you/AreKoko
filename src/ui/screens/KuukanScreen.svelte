<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Kuukan, Id } from '../../core/types';
  import { NIL_ID, UNSET_NAME, NAMELESS_NAME } from '../../core/constants';
  import { itemsDirectlyIn, formatPlacePath } from '../../core/places';
  import { renameKuukan } from '../../core/ops/kuukans';
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

  // 未設定のほかにクウカンがない（はじめて）。最初の一歩の案内を出す
  const isFirstTime = $derived(customKuukans.length === 0 && storageKuukans.length === 0);

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
    app.requestDeleteKuukan(kuukan.id);
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
    <div class="title-row">
      <h2>クウカン</h2>
      <button type="button" class="help-mini" onclick={() => app.openHelp('kuukans')} aria-label="クウカンとは（ヘルプ）" title="クウカンとは">？</button>
    </div>
    <p class="description">
      モノを置く場所（部屋・物置・棚の中など）を<strong>クウカン</strong>と呼びます。クウカンを開くと、中のモノを見たり追加したりできます。
    </p>
  </div>

  {#if isFirstTime}
    <!-- はじめて：最初の一歩だけを示す（レビュー2） -->
    <section class="onboarding" aria-labelledby="onboarding-title">
      <h3 id="onboarding-title">はじめに：モノを置く場所を作りましょう</h3>
      <p class="onboarding-lead">
        まず、家の中の場所（リビング、寝室、物置など）をクウカンとして1つ作ります。作ったクウカンを開いて、モノを追加していきます。
      </p>
      <div class="start-options">
        <button type="button" class="start-option" onclick={() => (showTemplateDialog = true)}>
          <strong>形を選んで作る</strong>
          <span>6畳間・L字のリビング・棚などの間取りから選びます。図の上でエリアに分けて使えます。</span>
          <span class="option-action">形を選ぶ →</span>
        </button>
        <div class="start-option">
          <strong>名前だけで作る</strong>
          <span>図なしで、すぐ使えます。図は後から描けます。</span>
          <div class="start-name-row">
            <input
              type="text"
              bind:value={newKuukanName}
              placeholder="例：リビング"
              aria-label="クウカンの名前"
              onkeydown={(e) => {
                if (e.key === 'Enter') handleCreateKuukan();
              }}
            />
            <button type="button" class="primary" onclick={handleCreateKuukan} disabled={!newKuukanName.trim()}>作る</button>
          </div>
        </div>
      </div>
    </section>
  {:else}
    <div class="create-form" role="group" aria-label="クウカンを作る">
      <span class="create-label">クウカンを作る</span>
      <input
        type="text"
        bind:value={newKuukanName}
        placeholder="名前（例：リビング）"
        aria-label="新しいクウカンの名前"
        onkeydown={(e) => {
          if (e.key === 'Enter') handleCreateKuukan();
        }}
      />
      <button type="button" class="primary" onclick={handleCreateKuukan} disabled={!newKuukanName.trim()}>作る</button>
      <button type="button" onclick={() => (showTemplateDialog = true)}>形を選んで作る</button>
    </div>
  {/if}

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
            {itemsDirectlyIn($app.doc, unsetKuukan.id).length}件
          </span>
          <button
            type="button"
            class="help-mini"
            onclick={(e) => {
              e.stopPropagation();
              app.openHelp('unset');
            }}
            aria-label="未設定とは（ヘルプ）"
            title="未設定とは"
          >？</button>
          <span class="unset-note">置き場がまだ決まっていないモノが入ります</span>
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
                {itemsDirectlyIn($app.doc, kuukan.id).length}件
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
                  {itemsDirectlyIn($app.doc, kuukan.id).length}件
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
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .create-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .help-mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    min-width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    border: 1px solid var(--border);
    background: transparent;
  }

  .unset-note {
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .onboarding {
    padding: var(--space-4);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent-soft);
  }

  .onboarding h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-large);
  }

  .onboarding-lead {
    margin: 0 0 var(--space-3);
    line-height: var(--line-height);
  }

  .start-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .start-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3);
    min-height: 0;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    line-height: var(--line-height);
    white-space: normal;
  }

  button.start-option:hover {
    border-color: var(--accent);
  }

  .start-option strong {
    font-size: var(--font-size);
  }

  .start-option span {
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .start-option .option-action {
    margin-top: auto;
    align-self: flex-end;
    padding: 6px var(--space-3);
    border-radius: var(--radius-small);
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .start-name-row {
    display: flex;
    gap: var(--space-2);
    width: 100%;
    margin-top: var(--space-1);
  }

  .start-name-row input {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 767.98px) {
    .start-options {
      grid-template-columns: 1fr;
    }
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
