import { mount } from 'svelte';
import './ui/theme.css';
import { AppStore, type AppDeps } from './app/store';
import { browserDeps } from './app/browserDeps';
import App from './ui/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app が見つかりません');

async function chooseDeps(): Promise<{ deps: AppDeps; onStore?: (store: AppStore) => void }> {
  // 開発時だけ、`?memory` でメモリ上の見本の文書を使う（画面の確認と E2E 試験用。本番のビルドには入らない）。
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('memory')) {
    const { memoryDeps, exposeStore } = await import('./app/memoryDeps');
    return { deps: memoryDeps(), onStore: exposeStore };
  }
  return { deps: browserDeps() };
}

void chooseDeps().then(({ deps, onStore }) => {
  const store = new AppStore(deps);
  onStore?.(store);
  if (import.meta.env.DEV) {
    (window as unknown as { __AREKOKO_APP__?: AppStore }).__AREKOKO_APP__ = store;
  }
  void store.init();
  mount(App, { target, props: { store } });
});
