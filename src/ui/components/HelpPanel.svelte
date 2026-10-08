<script lang="ts">
  import { getApp } from '../context';
  import { HELP, HELP_ORDER, WORDS } from '../../app/help';
  import type { HelpTopic } from '../../app/store';

  const app = getApp();

  const topic = $derived($app.help);
  const page = $derived(topic && topic !== 'words' ? HELP[topic] : null);

  let bodyEl = $state<HTMLElement | null>(null);

  function go(t: HelpTopic): void {
    app.openHelp(t);
    bodyEl?.scrollTo({ top: 0 });
  }

  $effect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') app.closeHelp();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

{#if topic}
  <div class="help-backdrop" role="presentation" onclick={() => app.closeHelp()}></div>
  <aside class="help-panel" aria-label="ヘルプ">
    <div class="help-head">
      <strong>ヘルプ</strong>
      <button type="button" class="ghost small" onclick={() => app.closeHelp()} aria-label="ヘルプを閉じる">閉じる</button>
    </div>

    <nav class="help-topics" aria-label="ヘルプの項目">
      {#each HELP_ORDER as t (t)}
        <button type="button" class="topic" class:active={topic === t} aria-current={topic === t ? 'true' : undefined} onclick={() => go(t)}>
          {HELP[t].title}
        </button>
      {/each}
      <button type="button" class="topic" class:active={topic === 'words'} onclick={() => go('words')}>ことば</button>
    </nav>

    <div class="help-body" bind:this={bodyEl}>
      {#if page}
        <h2>{page.title}</h2>
        <p class="what">{page.what}</p>

        <h3>よくある使い方</h3>
        <ol>
          {#each page.steps as step, i (i)}
            <li>{step}</li>
          {/each}
        </ol>

        <h3>主なボタン</h3>
        <dl>
          {#each page.buttons as b (b.label)}
            <dt>{b.label}</dt>
            <dd>{b.text}</dd>
          {/each}
        </dl>

        <p class="to-words">
          ことばが分からないときは <button type="button" class="link" onclick={() => go('words')}>ことば</button> へ。
        </p>
      {:else}
        <h2>ことば</h2>
        <dl>
          {#each WORDS as w (w.term)}
            <dt>{w.term}</dt>
            <dd>{w.text}</dd>
          {/each}
        </dl>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(0, 0, 0, 0.25);
  }

  .help-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 91;
    width: min(440px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.25);
  }

  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .help-topics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .topic {
    min-height: 28px;
    padding: 0 var(--space-2);
    font-size: 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
  }

  .topic.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .help-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) var(--space-4) var(--space-6, 32px);
    line-height: var(--line-height);
  }

  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-large);
  }

  h3 {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--font-size);
  }

  .what {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-small);
  }

  ol {
    margin: 0;
    padding-left: 1.4em;
  }

  li + li {
    margin-top: var(--space-1);
  }

  dl {
    margin: 0;
  }

  dt {
    margin-top: var(--space-2);
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--text-muted);
  }

  .to-words {
    margin-top: var(--space-4);
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .link {
    display: inline;
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }

  @media (max-width: 767px) {
    .help-panel {
      width: 100vw;
      border-left: none;
    }
  }
</style>
