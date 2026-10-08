// ブラウザ用 AppDeps 実装。詳細設計UI 4.2。

import type { AppDeps } from './store';
import type { FileBackend } from '../file/backend';
import {
  supportsFileSystemAccess,
  FsAccessBackend,
  pickFileToOpen,
  pickFileToSave,
} from '../file/backend';
import type { RecentEntry } from '../file/recent';
import {
  listRecent,
  addRecent,
  removeRecent,
  openRecent,
} from '../file/recent';
import { loadSettings, saveSettings } from '../file/settings';
import { newId } from '../core/ids';

export function browserDeps(): AppDeps {
  return {
    pickFileToOpen,
    pickFileToSave,
    supportsFileSystemAccess,
    listRecent,
    async addRecent(backend: FileBackend): Promise<void> {
      if (backend instanceof FsAccessBackend) {
        await addRecent(backend.handle);
      }
    },
    openRecent,
    async removeRecent(entry: RecentEntry): Promise<void> {
      await removeRecent(entry.handle);
    },
    loadSettings,
    saveSettings,
    newId,
    now: () => new Date().toISOString(),
  };
}
