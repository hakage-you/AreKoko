<script lang="ts">
  import { autofocus } from '../actions';
  import { getApp } from '../context';
  import type { Kuukan } from '../../core/types';
  import { NIL_ID, UNSET_NAME, NAMELESS_NAME } from '../../core/constants';
  import { itemsWithin, formatPlacePath } from '../../core/places';
  import {
    createKuukan,
    renameKuukan,
    planDeleteKuukan,
    deleteKuukan,
  } from '../../core/ops/kuukans';

  const app = getApp();

  let newKuukanName = $state('');
  let editingKuukanId = $state<Id | null>(null);
  let editingKuukanName = $state('');

  type Id = string;

  const topLevelKuukans = $derived.by(() => {
    const doc = $app.doc;
    if (!doc) return [];
    return doc.membership.kuukans.filter((k) => k.owner === null);
  });

  const unsetKuukan = $derived.by(() => {
    return topLevelKuukans.find((k) => k.id === NIL_ID);
  });

  const customKuukans = $derived.by(() => {
    return topLevelKuukans.filter((k) => k.id !== NIL_ID);
  });

  function handleCreateKuukan() {
    const trimmed = newKuukanName.trim();
    if (!trimmed) return;
    app.apply((doc, ctx) => createKuukan(doc, { name: trimmed }, ctx));
    newKuukanName = '';
  }

  function handleOpenKuukan(id: Id) {
    app.setQuery({ place: id });
    app.setScreen('search');
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
      平面図を描く「クウカン編集」は準備中です。ここでは、描画なしのクウカン（部屋・物置・貸出中 など）を作れます。
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
      ＋クウカン
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
        </div>
        <div class="kuukan-actions">
          <button
            type="button"
            class="small"
            onclick={() => handleOpenKuukan(unsetKuukan.id)}
          >
            開く
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
            {/if}
          </div>

          <div class="kuukan-actions">
            {#if editingKuukanId !== kuukan.id}
              <button
                type="button"
                class="small"
                onclick={() => handleOpenKuukan(kuukan.id)}
              >
                開く
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
  </div>
</div>

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
  }
</style>
