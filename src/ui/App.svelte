<script lang="ts">
  import type { AppStore } from '../app/store';
  import { setApp } from './context';
  import Header from './components/Header.svelte';
  import Toast from './components/Toast.svelte';
  import RepairDialog from './dialogs/RepairDialog.svelte';
  import RefusedDialog from './dialogs/RefusedDialog.svelte';
  import ConflictDialog from './dialogs/ConflictDialog.svelte';
  import ConfirmDialog from './dialogs/ConfirmDialog.svelte';
  import StartScreen from './screens/StartScreen.svelte';
  import SearchScreen from './screens/SearchScreen.svelte';
  import KuukanScreen from './screens/KuukanScreen.svelte';
  import ViewScreen from './screens/ViewScreen.svelte';
  import HelpPanel from './components/HelpPanel.svelte';
  import EditorScreen from './screens/EditorScreen.svelte';
  import ManageScreen from './screens/ManageScreen.svelte';
  import SettingsScreen from './screens/SettingsScreen.svelte';

  let { store }: { store: AppStore } = $props();

  // store は起動時に一度だけ渡され、差し替えない
  // svelte-ignore state_referenced_locally
  const app = store;
  setApp(app);

  function isEditableElement(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  }

  $effect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const isUnsaved =
        $app.dirty ||
        $app.saveStatus === 'pending' ||
        $app.saveStatus === 'saving' ||
        $app.saveStatus === 'conflict';
      if (isUnsaved) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void store.flush();
      }
    };

    const handlePageHide = () => {
      void store.flush();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!$app.doc) return;
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;

      const key = event.key.toLowerCase();

      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        void store.save();
        return;
      }

      if (isEditableElement(document.activeElement)) {
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
        return;
      }

      if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        event.preventDefault();
        store.redo();
        return;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="app-root">
  {#if $app.screen === 'start'}
    <StartScreen />
  {:else}
    <Header />
    <main class="main-content">
      {#if $app.screen === 'search'}
        <SearchScreen />
      {:else if $app.screen === 'kuukans'}
        <KuukanScreen />
      {:else if $app.screen === 'view'}
        <ViewScreen />
      {:else if $app.screen === 'editor'}
        <EditorScreen />
      {:else if $app.screen === 'manage'}
        <ManageScreen />
      {:else if $app.screen === 'settings'}
        <SettingsScreen />
      {/if}
    </main>
  {/if}

  <HelpPanel />

  {#if $app.dialog}
    {#if $app.dialog.kind === 'repair'}
      <RepairDialog />
    {:else if $app.dialog.kind === 'refused'}
      <RefusedDialog />
    {:else if $app.dialog.kind === 'conflict'}
      <ConflictDialog />
    {:else if $app.dialog.kind === 'confirm'}
      <ConfirmDialog dialog={$app.dialog} />
    {/if}
  {/if}

  {#if $app.toast}
    <Toast />
  {/if}
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    position: relative;
  }
</style>
