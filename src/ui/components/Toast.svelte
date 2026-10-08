<script lang="ts">
  import { getApp } from '../context';

  const app = getApp();

  $effect(() => {
    const toast = $app.toast;
    if (toast?.kind === 'info') {
      const timer = window.setTimeout(() => {
        app.dismissToast();
      }, 4000);
      return () => {
        window.clearTimeout(timer);
      };
    }
  });
</script>

{#if $app.toast}
  <div
    class="toast-wrapper"
    role={$app.toast.kind === 'error' ? 'alert' : 'status'}
  >
    <div class="toast {$app.toast.kind}">
      <span class="toast-message">{$app.toast.text}</span>
      <button
        type="button"
        class="ghost dismiss-btn"
        onclick={() => app.dismissToast()}
        aria-label="通知を閉じる"
      >
        閉じる
      </button>
    </div>
  </div>
{/if}

<style>
  .toast-wrapper {
    position: fixed;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    max-width: min(560px, calc(100vw - 2 * var(--space-4)));
    width: 100%;
    pointer-events: none;
    display: flex;
    justify-content: center;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    width: 100%;
  }

  .toast.info {
    border-color: var(--accent);
    background: var(--surface);
  }

  .toast.error {
    border-color: var(--danger);
    background: var(--danger-soft);
    color: var(--text);
  }

  .toast-message {
    flex: 1;
    font-size: var(--font-size);
    line-height: var(--line-height);
    word-break: break-word;
  }

  .dismiss-btn {
    flex-shrink: 0;
  }
</style>
