import { describe, expect, it } from 'vitest';
import type { ArekokoDocument } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { serializeDocument } from '../../src/core/serialize';
import { addItem, updateItem } from '../../src/core/ops/items';
import { makeStorage, removeStorage } from '../../src/core/ops/storage';
import type { FileBackend, FileStat } from '../../src/file/backend';
import type { RecentEntry } from '../../src/file/recent';
import type { AppSettings } from '../../src/file/settings';
import type { Timers } from '../../src/file/session';
import { AppStore, type AppDeps, type ConfirmDialog } from '../../src/app/store';
import { createSampleDocument, makeDeterministicId } from '../helpers/fixtures';

class FakeBackend implements FileBackend {
  name: string;
  canOverwrite: boolean;
  text: string;
  lastModified: number;
  writeCount = 0;
  statCount = 0;

  constructor(name: string, text: string, canOverwrite = true, lastModified = 1000) {
    this.name = name;
    this.text = text;
    this.canOverwrite = canOverwrite;
    this.lastModified = lastModified;
  }

  async read(): Promise<{ text: string } & FileStat> {
    return { text: this.text, lastModified: this.lastModified };
  }

  async stat(): Promise<FileStat> {
    this.statCount++;
    return { lastModified: this.lastModified };
  }

  async write(text: string): Promise<FileStat> {
    this.writeCount++;
    this.text = text;
    this.lastModified += 100;
    return { lastModified: this.lastModified };
  }
}

class FakeTimers implements Timers {
  currentTime = 0;
  private nextId = 1;
  private tasks = new Map<number, { runAt: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { runAt: this.currentTime + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  async advanceTime(ms: number): Promise<void> {
    this.currentTime += ms;
    while (true) {
      const runnable = [...this.tasks.entries()]
        .filter(([_, t]) => t.runAt <= this.currentTime)
        .sort((a, b) => a[1].runAt - b[1].runAt);
      if (runnable.length === 0) break;
      const [id, task] = runnable[0]!;
      this.tasks.delete(id);
      task.fn();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    }
  }
}

function createTestDeps(overrides?: Partial<AppDeps>): {
  deps: AppDeps;
  timers: FakeTimers;
  recentList: RecentEntry[];
  settings: AppSettings;
} {
  const timers = new FakeTimers();
  const recentList: RecentEntry[] = [];
  const settings: AppSettings = { autosave: true };
  let idCounter = 100;

  const deps: AppDeps = {
    pickFileToOpen: async () => null,
    pickFileToSave: async (name) => new FakeBackend(name, '', true, 1000),
    supportsFileSystemAccess: () => true,
    listRecent: async () => [...recentList],
    addRecent: async (backend) => {
      recentList.unshift({
        name: backend.name,
        handle: {} as unknown as FileSystemFileHandle,
        openedAt: Date.now(),
      });
    },
    openRecent: async (entry) => {
      const backend = new FakeBackend(entry.name, '', true, 1000);
      return { backend, text: serializeDocument(createSampleDocument()), stat: { lastModified: 1000 } };
    },
    removeRecent: async (entry) => {
      const idx = recentList.findIndex((r) => r.name === entry.name);
      if (idx >= 0) recentList.splice(idx, 1);
    },
    loadSettings: () => ({ ...settings }),
    saveSettings: (s) => {
      settings.autosave = s.autosave;
    },
    newId: () => makeDeterministicId(idCounter++),
    now: () => '2026-10-08T12:00:00.000Z',
    timers,
    ...overrides,
  };

  return { deps, timers, recentList, settings };
}

describe('AppStore', () => {
  it('init: recent と autosave が状態に入る', async () => {
    const { deps, recentList, settings } = createTestDeps();
    settings.autosave = false;
    recentList.push({
      name: 'recent.json',
      handle: {} as unknown as FileSystemFileHandle,
      openedAt: 12345,
    });

    const store = new AppStore(deps);
    expect(store.state.autosave).toBe(true);
    expect(store.state.recent).toEqual([]);

    await store.init();
    expect(store.state.autosave).toBe(false);
    expect(store.state.recent).toHaveLength(1);
    expect(store.state.recent[0]?.name).toBe('recent.json');
    expect(store.state.supportsOverwrite).toBe(true);
  });

  it('newDocument: キャンセル（null）なら何も変わらない', async () => {
    const { deps } = createTestDeps({
      pickFileToSave: async () => null,
    });
    const store = new AppStore(deps);
    await store.newDocument();

    expect(store.state.screen).toBe('start');
    expect(store.state.doc).toBeNull();
    expect(store.state.saveStatus).toBeNull();
  });

  it('newDocument: 選んだら空の文書が書かれて search、saveStatus saved', async () => {
    const backend = new FakeBackend('my-doc.json', '', true, 1000);
    const { deps } = createTestDeps({
      pickFileToSave: async () => backend,
    });
    const store = new AppStore(deps);

    await store.newDocument();
    expect(store.state.screen).toBe('search');
    expect(store.state.doc).not.toBeNull();
    expect(store.state.fileName).toBe('my-doc.json');
    expect(store.state.saveStatus).toBe('saved');
    expect(store.state.dirty).toBe(false);
    expect(backend.writeCount).toBe(1);
    expect(backend.text).toContain('"app":"arekoko"');
  });

  it('openFile: 正しい文書 → search', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('sample.json', serializeDocument(doc), true, 1000);
    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);

    await store.openFile();
    expect(store.state.screen).toBe('search');
    expect(store.state.doc).not.toBeNull();
    expect(store.state.saveStatus).toBe('saved');
    expect(store.state.dirty).toBe(false);
    expect(store.state.dialog).toBeNull();
  });

  it('openFile: 修復が要る文書 → dialog repair、approveRepair で文書が入り dirty。rejectRepair で start のまま', async () => {
    const doc = createSampleDocument();
    const broken = JSON.parse(serializeDocument(doc));
    // 仮ID（new:test）を入れることで修復が必要な文書にする
    broken.membership.items[0].id = 'new:item-temp';
    const backend = new FakeBackend('repairable.json', JSON.stringify(broken), true, 1000);

    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);

    await store.openFile();
    expect(store.state.screen).toBe('start');
    expect(store.state.dialog?.kind).toBe('repair');

    store.rejectRepair();
    expect(store.state.screen).toBe('start');
    expect(store.state.dialog).toBeNull();
    expect(store.state.doc).toBeNull();

    await store.openFile();
    expect(store.state.dialog?.kind).toBe('repair');

    store.approveRepair();
    expect(store.state.screen).toBe('search');
    expect(store.state.dialog).toBeNull();
    expect(store.state.doc).not.toBeNull();
    expect(store.state.dirty).toBe(true);
  });

  it('openFile: 断る文書 → dialog refused', async () => {
    const backend = new FakeBackend('refused.json', JSON.stringify({ app: 'wrong' }), true, 1000);
    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);

    await store.openFile();
    expect(store.state.screen).toBe('start');
    expect(store.state.dialog?.kind).toBe('refused');
    expect(store.state.doc).toBeNull();
  });

  it('apply: モノを追加すると文書が変わり canUndo、1000ms 後に保存される。OpError は toast で null。統一規則のハイライトが次の操作で消える', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('apply-test.json', serializeDocument(doc), true, 1000);
    const { deps, timers } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);
    await store.openFile();

    // 1. 存在しないIDの更新で OpError
    const errorResult = store.apply((d, ctx) =>
      updateItem(d, '018f0000-0000-7000-8000-ffffffffffff', { name: '存在しない' }, ctx),
    );
    expect(errorResult).toBeNull();
    expect(store.state.toast?.kind).toBe('error');
    expect(store.state.canUndo).toBe(false);

    // 2. 正常な追加
    const addResult = store.apply((d, ctx) =>
      addItem(d, { name: '新規モノ', place: NIL_ID }, ctx),
    );
    expect(addResult).not.toBeNull();
    expect(store.state.canUndo).toBe(true);
    expect(store.state.dirty).toBe(true);
    expect(store.state.saveStatus).toBe('pending');
    expect(backend.writeCount).toBe(0);

    // 1000ms 経過で自動保存
    await timers.advanceTime(1000);
    expect(store.state.saveStatus).toBe('saved');
    expect(store.state.dirty).toBe(false);
    expect(backend.writeCount).toBe(1);

    // 3. 収納の削除で統一規則のハイライトを確認
    // 新規モノを収納にする
    const newItemId = addResult!.created[0]!;
    store.apply((d, ctx) => makeStorage(d, newItemId, {}, ctx));
    // その収納の中に子モノを追加
    const innerItem = store.apply((d, ctx) => {
      const storageKuukan = d.membership.kuukans.find((k) => k.owner === newItemId)!;
      return addItem(d, { name: '収納内モノ', place: storageKuukan.id }, ctx);
    });
    const innerItemId = innerItem!.created[0]!;

    // 収納設定を削除すると、innerItemId が外側の置き場へ移る（moved に入る）
    store.apply((d, ctx) => removeStorage(d, newItemId, ctx));
    expect(store.state.highlights.has(innerItemId)).toBe(true);

    // 次の操作でハイライトが消える
    store.apply((d, ctx) => addItem(d, { name: 'さらにモノ追加', place: NIL_ID }, ctx));
    expect(store.state.highlights.has(innerItemId)).toBe(false);
  });

  it('undo / redo: setScreen で履歴とハイライトが消え、setGrouping では消えない', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('undo-test.json', serializeDocument(doc), true, 1000);
    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);
    await store.openFile();

    store.apply((d, ctx) => addItem(d, { name: 'アイテムA', place: NIL_ID }, ctx));
    expect(store.state.canUndo).toBe(true);
    expect(store.state.canRedo).toBe(false);

    store.undo();
    expect(store.state.canUndo).toBe(false);
    expect(store.state.canRedo).toBe(true);
    expect(store.state.doc?.membership.items.some((it) => it.name === 'アイテムA')).toBe(false);

    store.redo();
    expect(store.state.canUndo).toBe(true);
    expect(store.state.canRedo).toBe(false);
    expect(store.state.doc?.membership.items.some((it) => it.name === 'アイテムA')).toBe(true);

    // setGrouping では履歴は消えない
    store.setGrouping('category');
    expect(store.state.grouping).toBe('category');
    expect(store.state.canUndo).toBe(true);

    // setScreen では履歴が消える
    store.setScreen('kuukans');
    expect(store.state.screen).toBe('kuukans');
    expect(store.state.canUndo).toBe(false);
    expect(store.state.canRedo).toBe(false);
  });

  it('外での変更: 偽の FileBackend の更新日時を外から変えて update → dialog conflict。resolveConflict overwrite / reload', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('conflict-test.json', serializeDocument(doc), true, 1000);
    const { deps, timers } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);
    await store.openFile();

    // 外部で更新日時が変更される
    backend.lastModified += 500;

    // 操作して自動保存を走らせる
    store.apply((d, ctx) => addItem(d, { name: 'アイテムX', place: NIL_ID }, ctx));
    await timers.advanceTime(1000);

    expect(store.state.saveStatus).toBe('conflict');
    expect(store.state.dialog?.kind).toBe('conflict');

    // resolveConflict('overwrite') で保存される
    await store.resolveConflict('overwrite');
    expect(store.state.dialog).toBeNull();
    expect(store.state.saveStatus).toBe('saved');
    expect(store.state.dirty).toBe(false);

    // 再度外部変更を起こす
    backend.lastModified += 500;
    const externalDoc = createSampleDocument();
    externalDoc.membership.items[0]!.name = '外部で書き換えられた名前';
    backend.text = serializeDocument(externalDoc);

    store.apply((d, ctx) => addItem(d, { name: 'アイテムY', place: NIL_ID }, ctx));
    await timers.advanceTime(1000);
    expect(store.state.dialog?.kind).toBe('conflict');

    // resolveConflict('reload') で外の内容が入る
    await store.resolveConflict('reload');
    expect(store.state.dialog).toBeNull();
    expect(store.state.saveStatus).toBe('saved');
    expect(store.state.dirty).toBe(false);
    expect(store.state.doc?.membership.items[0]?.name).toBe('外部で書き換えられた名前');
  });

  it('closeDocument: dirty なら confirm が出て、onConfirm で start に戻る', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('close-test.json', serializeDocument(doc), true, 1000);
    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({
        backend,
        text: backend.text,
        stat: { lastModified: backend.lastModified },
      }),
    });
    const store = new AppStore(deps);
    await store.openFile();
    // 自動保存オフで変更を加え、閉じる前の書き込みでも消えない dirty にする
    store.setAutosave(false);

    store.apply((d, ctx) => addItem(d, { name: '保存前', place: NIL_ID }, ctx));
    expect(store.state.dirty).toBe(true);

    await store.closeDocument();
    expect(store.state.dialog?.kind).toBe('confirm');
    expect(store.state.screen).toBe('search');

    const confirmDialog = store.state.dialog as ConfirmDialog;
    confirmDialog.onConfirm();

    expect(store.state.screen).toBe('start');
    expect(store.state.doc).toBeNull();
    expect(store.state.dialog).toBeNull();
  });

  it('closeDocument: 自動保存の待ちの途中なら、書いてから閉じる（confirm を出さない）', async () => {
    const doc = createSampleDocument();
    const backend = new FakeBackend('close-flush.json', serializeDocument(doc), true, 1000);
    const { deps } = createTestDeps({
      pickFileToOpen: async () => ({ backend, text: backend.text, stat: { lastModified: backend.lastModified } }),
    });
    const store = new AppStore(deps);
    await store.openFile();
    store.apply((d, ctx) => addItem(d, { name: '待ちの途中', place: NIL_ID }, ctx));
    expect(store.state.saveStatus).toBe('pending');

    await store.closeDocument();
    expect(backend.text).toContain('待ちの途中');
    expect(store.state.screen).toBe('start');
  });

  it('subscribe がすぐ1回呼ばれ、変化のたびに呼ばれる', async () => {
    const { deps } = createTestDeps();
    const store = new AppStore(deps);
    const screens: string[] = [];

    const unsubscribe = store.subscribe((s) => {
      screens.push(s.screen);
    });

    expect(screens).toEqual(['start']);

    await store.newDocument();
    expect(screens).toEqual(['start', 'search']);

    unsubscribe();
    store.setScreen('settings');
    expect(screens).toEqual(['start', 'search']);
  });
});
