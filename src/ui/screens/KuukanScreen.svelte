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

  const app = getApp();

  let newKuukanName = $state('');
  let editingKuukanId = $state<Id | null>(null);
  let editingKuukanName = $state('');
  let showTemplateDialog = $state(false);

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

  function handleOpenKuukan(id: Id) {
    app.setQuery({ place: id });
    app.setScreen('search');
  }

  function handleEditKuukan(id: Id) {
    app.openKuukanEditor(id);
  }

  function handleDuplicateKuukan(id: Id) {
    app.openDraft({ kind: 'duplicate', source: id });
  }

  function startRename(kuukan: Kuukan) {
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
</script>

<div class="kuukan-screen">
  <div class="screen-header">
    <h2>クウカン</h2>
    <p class="description muted">
      クウカンの平面図を描いて、仕切りでエリアに分けます。
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
      <div class="kuukan-card unset-card">
        <div class="kuukan-info">
          <span class="kuukan-name">{UNSET_NAME}</span>
          <span class="chip small muted">
            {itemsWithin($app.doc, unsetKuukan.id).length}件
          </span>
          <span class="chip small muted">描画なし</span>
        </div>
        <div class="kuukan-actions">
          <button
            type="button"
            class="small"
            onclick={() => handleOpenKuukan(unsetKuukan.id)}
          >
            モノを見る
          </button>
        </div>
      </div>
    {/if}

    <!-- どこにも置かれていないクウカン -->
    {#if $app.doc}
      {#each customKuukans as kuukan (kuukan.id)}
        <div class="kuukan-card">
          <div class="kuukan-info">
            {#if editingKuukanId === kuukan.id}
              <input
                use:autofocus
                type="text"
                bind:value={editingKuukanName}
                onblur={() => commitRename(kuukan)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename(kuukan);
                  if (e.key === 'Escape') editingKuukanId = null;
                }}
                class="inline-input"
              />
            {:else}
              <span class="kuukan-name">{kuukan.name ?? NAMELESS_NAME}</span>
              <span class="chip small muted">
                {itemsWithin($app.doc, kuukan.id).length}件
              </span>
              {#if hasDrawing(kuukan.id)}
                <span class="chip small accent">平面図あり</span>
              {:else}
                <span class="chip small muted">描画なし</span>
              {/if}
            {/if}
          </div>

          <div class="kuukan-actions">
            {#if editingKuukanId !== kuukan.id}
              <button
                type="button"
                class="small primary"
                onclick={() => handleEditKuukan(kuukan.id)}
              >
                編集
              </button>
              <button
                type="button"
                class="small"
                onclick={() => handleOpenKuukan(kuukan.id)}
              >
                モノを見る
              </button>
              <button
                type="button"
                class="small ghost"
                onclick={() => handleDuplicateKuukan(kuukan.id)}
              >
                複製
              </button>
              <button
                type="button"
                class="small ghost"
                onclick={() => startRename(kuukan)}
              >
                名前の変更
              </button>
              <button
                type="button"
                class="small danger ghost"
                onclick={() => handleDeleteKuukan(kuukan)}
              >
                削除
              </button>
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
            <div class="kuukan-card storage-card">
              <div class="kuukan-info">
                <div class="storage-title-block">
                  <span class="kuukan-name">
                    {ownerItem ? ownerItem.name : (kuukan.name ?? NAMELESS_NAME)}
                  </span>
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
                  <span class="chip small accent">平面図あり</span>
                {:else}
                  <span class="chip small muted">描画なし</span>
                {/if}
              </div>

              <div class="kuukan-actions">
                <button
                  type="button"
                  class="small primary"
                  onclick={() => handleEditKuukan(kuukan.id)}
                >
                  編集
                </button>
                <button
                  type="button"
                  class="small"
                  onclick={() => handleOpenKuukan(kuukan.id)}
                >
                  モノを見る
                </button>
                <button
                  type="button"
                  class="small ghost"
                  onclick={() => handleDuplicateKuukan(kuukan.id)}
                >
                  複製
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showTemplateDialog}
  <div class="dialog-overlay" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-dialog-title"
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
              <div class="template-name">{template.name}</div>
              <div class="template-desc muted small">{template.description}</div>
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

  .inline-input {
    flex: 1;
    min-height: 32px;
  }

  .kuukan-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    flex-wrap: wrap;
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
    gap: 2px;
  }

  .storage-path {
    font-size: var(--font-size-small);
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .template-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: left;
    gap: var(--space-1);
    cursor: pointer;
  }

  .template-card:hover {
    background: var(--surface-2);
  }

  .template-name {
    font-weight: 600;
  }

  .template-desc {
    line-height: var(--line-height);
  }
</style>
