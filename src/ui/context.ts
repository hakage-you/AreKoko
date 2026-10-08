// 画面の部品がストアを受け取る口。App.svelte が setApp し、部品は getApp で受け取る。

import { getContext, setContext } from 'svelte';
import type { AppStore } from '../app/store';

const KEY = Symbol('arekoko-app');

export function setApp(store: AppStore): void {
  setContext(KEY, store);
}

export function getApp(): AppStore {
  const store = getContext<AppStore | undefined>(KEY);
  if (!store) throw new Error('AppStore が setApp されていません');
  return store;
}
