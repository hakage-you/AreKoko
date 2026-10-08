import { mount } from 'svelte';
import './ui/theme.css';
import { AppStore, type AppDeps } from './app/store';
import { browserDeps } from './app/browserDeps';
import App from './ui/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app が見つかりません');

async function chooseDeps(): Promise<AppDeps> {
  // 開発時だけ、`?memory` でメモリ上の見本の文書を使う（画面の確認用。本番のビルドには入らない）。
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('memory')) {
    const { memoryDeps } = await import('./app/memoryDeps');
    return memoryDeps();
  }
  return browserDeps();
}

void chooseDeps().then(deps => {
  const store = new AppStore(deps);
  void store.init();
  mount(App, { target, props: { store } });
});
