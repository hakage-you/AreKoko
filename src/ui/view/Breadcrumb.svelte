<script lang="ts">
  import { getApp } from '../context';
  import { kuukanTrail } from '../../view/model';
  import type { Id } from '../../core/types';
  import KuukanThumb from '../components/KuukanThumb.svelte';

  const app = getApp();

  const trail = $derived.by(() => {
    if (!$app.doc || !$app.view?.kuukan) return [];
    return kuukanTrail($app.doc, $app.view.kuukan);
  });

  function handleNavigate(item: { kuukan: Id; via: Id | null }): void {
    const area = item.via !== null && item.via !== item.kuukan ? item.via : null;
    app.openView(item.kuukan, { area });
  }
</script>

<nav class="breadcrumb" aria-label="経路">
  <button
    type="button"
    class="crumb-link"
    onclick={() => app.setScreen('kuukans')}
  >
    クウカン
  </button>
  {#each trail as item, index (item.kuukan)}
    <span class="separator" aria-hidden="true">›</span>
    {#if index === trail.length - 1}
      <span class="crumb-current" aria-current="page" title={item.name}>
        <KuukanThumb doc={$app.doc} kuukanId={item.kuukan} isStorage={Boolean(item.via)} size={20} />
        <span class="crumb-text">{item.name}</span>
      </span>
    {:else}
      <button
        type="button"
        class="crumb-link with-thumb"
        title={item.name}
        onclick={() => handleNavigate(item)}
      >
        <KuukanThumb doc={$app.doc} kuukanId={item.kuukan} isStorage={Boolean(item.via)} size={20} />
        <span class="crumb-text">{item.name}</span>
      </button>
    {/if}
  {/each}
</nav>

<style>
  .breadcrumb {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    font-size: var(--font-size);
    min-width: 0;
    max-width: 100%;
  }

  .crumb-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: min(240px, 45vw);
    overflow: hidden;
    white-space: nowrap;
    vertical-align: middle;
    background: transparent;
    border: none;
    padding: 0;
    min-height: auto;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .crumb-link:hover {
    filter: brightness(1.15);
  }

  .crumb-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .separator {
    color: var(--text-muted);
    font-size: var(--font-size-small);
    user-select: none;
    flex-shrink: 0;
  }

  .crumb-current {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: min(280px, 50vw);
    overflow: hidden;
    white-space: nowrap;
    vertical-align: middle;
    font-weight: 600;
    color: var(--text);
  }
</style>
