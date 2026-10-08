// 最近開いたファイル（IndexedDB にファイルハンドルだけを残す）。
// 詳細設計UI 2.3、設計 8.1、原則7。

import type { FileStat } from './backend';
import { FsAccessBackend } from './backend';

export interface RecentEntry {
  name: string;
  handle: FileSystemFileHandle;
  openedAt: number;
}

const DB_NAME = 'arekoko';
const DB_VERSION = 1;
const STORE_NAME = 'recent';
const MAX_RECENT = 10;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function getAllEntries(db: IDBDatabase): Promise<RecentEntry[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as RecentEntry[]) || [];
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function replaceAllEntries(db: IDBDatabase, entries: RecentEntry[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const entry of entries) {
        store.add(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * 最近開いたファイルの一覧を新しい順（最大10件）で取得する。
 */
export async function listRecent(): Promise<RecentEntry[]> {
  try {
    const db = await openDatabase();
    if (!db) return [];
    const entries = await getAllEntries(db);
    entries.sort((a, b) => b.openedAt - a.openedAt);
    return entries.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * 最近開いたファイルの一覧にハンドルを追加する。
 * 同じファイルは isSameEntry で重複を除き、最大10件を残す。
 */
export async function addRecent(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;
    const current = await getAllEntries(db);

    const filtered: RecentEntry[] = [];
    for (const item of current) {
      let isSame = false;
      try {
        if (item.handle && typeof item.handle.isSameEntry === 'function') {
          isSame = await item.handle.isSameEntry(handle);
        }
      } catch {
        isSame = false;
      }
      if (!isSame) {
        filtered.push(item);
      }
    }

    const newEntry: RecentEntry = {
      name: handle.name,
      handle,
      openedAt: Date.now(),
    };

    const updated = [newEntry, ...filtered];
    updated.sort((a, b) => b.openedAt - a.openedAt);
    const trimmed = updated.slice(0, MAX_RECENT);

    await replaceAllEntries(db, trimmed);
  } catch {
    // IndexedDB 未対応や失敗時は何もしない
  }
}

/**
 * 最近開いたファイルの一覧から指定のハンドルを外す。
 */
export async function removeRecent(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db) return;
    const current = await getAllEntries(db);

    const filtered: RecentEntry[] = [];
    for (const item of current) {
      let isSame = false;
      try {
        if (item.handle && typeof item.handle.isSameEntry === 'function') {
          isSame = await item.handle.isSameEntry(handle);
        }
      } catch {
        isSame = false;
      }
      if (!isSame) {
        filtered.push(item);
      }
    }

    await replaceAllEntries(db, filtered);
  } catch {
    // IndexedDB 未対応や失敗時は何もしない
  }
}

/**
 * 最近開いたファイルを開く。許可が得られない場合は null を返す。
 */
export async function openRecent(
  entry: RecentEntry,
): Promise<{ backend: FsAccessBackend; text: string; stat: FileStat } | null> {
  try {
    if (typeof entry.handle.requestPermission === 'function') {
      const state = await entry.handle.requestPermission({ mode: 'readwrite' });
      if (state !== 'granted') {
        return null;
      }
    }
    const backend = new FsAccessBackend(entry.handle);
    const { text, lastModified } = await backend.read();
    return {
      backend,
      text,
      stat: { lastModified },
    };
  } catch {
    return null;
  }
}
