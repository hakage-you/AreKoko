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

/** 最初のスケッチ（Room A → 棚A1 → BOX1）に近い見本の文書。 */
export function sampleDocument(): ArekokoDocument {
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
