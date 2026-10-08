<script lang="ts">
  import { getApp } from '../context';
  import { kuukanTrail } from '../../view/model';
  import type { Id } from '../../core/types';

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
      <span class="crumb-current" aria-current="page">{item.name}</span>
    {:else}
      <button
        type="button"
        class="crumb-link"
        onclick={() => handleNavigate(item)}
      >
        {item.name}
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
  }

  .crumb-link {
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

  .separator {
    color: var(--text-muted);
    font-size: var(--font-size-small);
    user-select: none;
  }

  .crumb-current {
    font-weight: 600;
    color: var(--text);
  }
</style>
