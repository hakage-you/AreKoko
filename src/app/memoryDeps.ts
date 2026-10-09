// 開発用：ファイルの代わりにメモリ上の文書で動かす AppDeps（`?memory` を付けて開いたときだけ使う）。
// ファイル選択はOSのダイアログで自動の確認ができないため、画面の確認にこれを使う。本番のビルドでは使わない。

import type { AppDeps } from './store';
import type { FileBackend, FileStat } from '../file/backend';
import type { AppSettings } from '../file/settings';
import type { ArekokoDocument, Id } from '../core/types';
import { newId } from '../core/ids';
import { createEmptyDocument } from '../core/document';
import { serializeDocument } from '../core/serialize';
import type { OpContext, OpResult } from '../core/ops/common';
import { createKuukan } from '../core/ops/kuukans';
import { addItem } from '../core/ops/items';
import { makeStorage } from '../core/ops/storage';
import { attachOutline, splitEven } from '../core/ops/areas';
import { createTag } from '../core/ops/tags';
import { createCategory } from '../core/ops/categories';
import { sampleDocument } from '../core/sample';

class MemoryBackend implements FileBackend {
  readonly canOverwrite = true;
  private text: string;
  private lastModified = Date.now();
  constructor(readonly name: string, text = '') {
    this.text = text;
  }
  async read(): Promise<{ text: string } & FileStat> {
    return { text: this.text, lastModified: this.lastModified };
  }
  async stat(): Promise<FileStat> {
    return { lastModified: this.lastModified };
  }
  async write(text: string): Promise<FileStat> {
    this.text = text;
    this.lastModified = Math.max(Date.now(), this.lastModified + 1);
    return { lastModified: this.lastModified };
  }
  /** 開発者ツールから「外での変更」をまねるため。 */
  touchFromOutside(): void {
    this.lastModified += 1000;
  }
}

export { sampleDocument } from '../core/sample';

export function memoryDeps(): AppDeps {
  let settings: AppSettings = { autosave: true };
  const sample = new MemoryBackend('見本.json', serializeDocument(sampleDocument()));
  (globalThis as { arekokoMemory?: unknown }).arekokoMemory = { sample };
  return {
    async pickFileToOpen() {
      const { text, lastModified } = await sample.read();
      return { backend: sample, text, stat: { lastModified } };
    },
    async pickFileToSave(name) {
      return new MemoryBackend(name);
    },
    async openDroppedFile(dataTransfer: DataTransfer) {
      const file = dataTransfer.files?.[0];
      if (file) {
        const text = await file.text();
        const backend = new MemoryBackend(file.name, text);
        return { backend, text, stat: { lastModified: file.lastModified } };
      }
      return null;
    },
    supportsFileSystemAccess: () => true,
    listRecent: async () => [],
    addRecent: async () => {},
    openRecent: async () => null,
    removeRecent: async () => {},
    loadSettings: () => settings,
    saveSettings: s => {
      settings = s;
    },
    newId,
    now: () => new Date().toISOString(),
  };
}
