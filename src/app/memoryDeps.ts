// 開発用：ファイルの代わりにメモリ上の文書で動かす AppDeps（`?memory` を付けて開いたときだけ使う）。
// ファイル選択はOSのダイアログで自動の確認ができないため、画面の確認にこれを使う。本番のビルドでは使わない。

import type { AppDeps, AppStore } from './store';
import type { FileBackend, FileStat } from '../file/backend';
import type { AppSettings } from '../file/settings';
import type { ArekokoDocument, Id } from '../core/types';
import { newId } from '../core/ids';
import { createEmptyDocument } from '../core/document';
import { serializeDocument } from '../core/serialize';
import { validateDocument, type Violation } from '../core/validate';
import { analyzeDocument, type LoadResult } from '../core/load/index';
import type { OpContext, OpResult } from '../core/ops/common';
import { createKuukan } from '../core/ops/kuukans';
import { addItem } from '../core/ops/items';
import { makeStorage } from '../core/ops/storage';
import { attachOutline, splitEven } from '../core/ops/areas';
import { createTag } from '../core/ops/tags';
import { createCategory } from '../core/ops/categories';

export class MemoryBackend implements FileBackend {
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
  /** 中身を見る（試験用。更新日時は変えない）。 */
  peek(): string {
    return this.text;
  }
}

/**
 * シナリオの試験の見本の文書（最初のスケッチ Room A → 棚A1 → BOX1 に近い形）。
 * 結合試験と E2E（`?memory`）が使う。中身を変えると docs/scenarios.md の期待が変わるので、
 * 利用者向けの見本（src/core/sample.ts。最初の画面の「見本を開く」）とは分けて持つ。
 */
export function scenarioDocument(): ArekokoDocument {
  const ctx: OpContext = { newId, now: () => new Date().toISOString() };
  let doc = createEmptyDocument();
  const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
    const r = f(doc);
    doc = r.doc;
    return r.created;
  };
  const [roomA] = run(d => createKuukan(d, { name: 'Room A', areaLabel: '床' }, ctx));
  const [storeroom] = run(d => createKuukan(d, { name: '物置' }, ctx));
  run(d => createKuukan(d, { name: '貸出中' }, ctx));
  const [tagEmergency] = run(d => createTag(d, { name: '防災' }, ctx));
  const [tagConsumable] = run(d => createTag(d, { name: '消耗品' }, ctx));
  const [catAppliance] = run(d => createCategory(d, { name: '家電' }, ctx));
  const [catBattery] = run(d => createCategory(d, { name: '電池', parent: catAppliance }, ctx));
  const [catTool] = run(d => createCategory(d, { name: '工具' }, ctx));

  const [shelf] = run(d => addItem(d, { name: '棚A1', place: roomA! }, ctx));
  const [shelfKuukan] = run(d => makeStorage(d, shelf!, { areaLabel: '段' }, ctx));
  run(d => attachOutline(d, shelfKuukan!, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 0.6 }, ctx));
  const [dan1, dan2] = run(d => splitEven(d, shelfKuukan!, 'y', 3, ctx));
  const [box] = run(d => addItem(d, { name: 'BOX1', place: dan1! }, ctx));
  const [boxKuukan] = run(d => makeStorage(d, box!, {}, ctx));

  run(d => addItem(d, { name: '単3電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!, tagEmergency!], qty: 8 }, ctx));
  run(d => addItem(d, { name: '単4電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!], qty: 4 }, ctx));
  run(d => addItem(d, { name: '懐中電灯', place: dan2!, category: catAppliance!, tags: [tagEmergency!], summary: 'LED。電池は単3を2本' }, ctx));
  run(d => addItem(d, { name: 'ドライバーセット', place: storeroom!, category: catTool! }, ctx));
  run(d => addItem(d, { name: '延長コード', place: roomA!, category: catAppliance! }, ctx));
  run(d => addItem(d, { name: 'どこかにある鍵' }, ctx));
  for (let i = 1; i <= 60; i++) {
    run(d => addItem(d, { name: `ストック品 ${i}`, place: storeroom!, tags: i % 3 === 0 ? [tagConsumable!] : [] }, ctx));
  }
  return doc;
}

/**
 * 開発者ツールと E2E 試験から使う口（`globalThis.arekokoMemory`。詳細設計(シナリオ) 2.2）。
 * 試験は store.state を読むだけにして、操作は画面から行う。
 */
export interface ArekokoMemoryHook {
  store: AppStore | null;
  /** 見本のファイル（「ファイルを開く」で開く）。 */
  sample: MemoryBackend;
  /** 「新しく作る」「別の名前で保存」と queueOpen で作ったファイル（名前 → 保存先）。 */
  files: Map<string, MemoryBackend>;
  /** 次の「ファイルを開く」で、見本の代わりにこのファイルを開く（壊れたファイルの試験用）。 */
  queueOpen(name: string, text: string): void;
  /** 画面の文書の不変条件の違反（空なら健全）。 */
  violations(): Violation[];
  /** 保存先の中身と、それを読み込みの検査にかけた結果。name を省くと、今開いている文書の保存先。 */
  readFile(name?: string): { text: string; kind: LoadResult['kind'] | 'empty' };
}

function hook(): ArekokoMemoryHook {
  return (globalThis as unknown as { arekokoMemory: ArekokoMemoryHook }).arekokoMemory;
}

/** 画面が使う AppStore を口に入れる（main.ts から）。 */
export function exposeStore(store: AppStore): void {
  hook().store = store;
}

export function memoryDeps(): AppDeps {
  let settings: AppSettings = { autosave: true };
  const sample = new MemoryBackend('見本.json', serializeDocument(scenarioDocument()));
  const files = new Map<string, MemoryBackend>();
  let queued: MemoryBackend | null = null;
  const memory: ArekokoMemoryHook = {
    store: null,
    sample,
    files,
    queueOpen(name, text) {
      queued = new MemoryBackend(name, text);
      files.set(name, queued);
    },
    violations() {
      const doc = memory.store?.state.doc;
      return doc ? validateDocument(doc) : [];
    },
    readFile(name) {
      const fileName = name ?? memory.store?.state.fileName ?? sample.name;
      const backend = files.get(fileName) ?? (fileName === sample.name ? sample : undefined);
      const text = backend?.peek() ?? '';
      if (!text) return { text, kind: 'empty' };
      return { text, kind: analyzeDocument(text, { newId, now: () => new Date().toISOString() }).kind };
    },
  };
  (globalThis as unknown as { arekokoMemory: ArekokoMemoryHook }).arekokoMemory = memory;
  return {
    async pickFileToOpen() {
      const backend = queued ?? sample;
      queued = null;
      const { text, lastModified } = await backend.read();
      return { backend, text, stat: { lastModified } };
    },
    async pickFileToSave(name) {
      const backend = new MemoryBackend(name);
      files.set(name, backend);
      return backend;
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
