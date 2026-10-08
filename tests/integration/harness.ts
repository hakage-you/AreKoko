import { expect } from 'vitest';
import type { ArekokoDocument, Id } from '../../src/core/types';
import { analyzeDocument, type LoadContext } from '../../src/core/load/index';
import { validateDocument } from '../../src/core/validate';
import type { FileBackend, FileStat } from '../../src/file/backend';
import type { RecentEntry } from '../../src/file/recent';
import type { AppSettings } from '../../src/file/settings';
import type { Timers } from '../../src/file/session';
import { AppStore, type AppDeps } from '../../src/app/store';

/**
 * 決定的な UUID v7 形式の ID を生成する。
 */
export function makeDeterministicV7Id(index: number): Id {
  const hex = index.toString(16).padStart(12, '0');
  return `018f0000-0000-7000-8000-${hex}`;
}

/**
 * 偽の Timers 実装。時間を進め、期限の来たタイマーを実行し、Promise の後片付けまで待つ。
 */
export class FakeClock implements Timers {
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

  async advance(ms: number): Promise<void> {
    this.currentTime += ms;
    while (true) {
      const runnable = [...this.tasks.entries()]
        .filter(([_, t]) => t.runAt <= this.currentTime)
        .sort((a, b) => a[1].runAt - b[1].runAt);
      if (runnable.length === 0) break;
      const [id, task] = runnable[0]!;
      this.tasks.delete(id);
      task.fn();
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    }
  }

  get pendingCount(): number {
    return this.tasks.size;
  }
}

/**
 * 偽の保存先。中身（text）と更新日時を持ち、複数の FileBackend から同じ1つの中身を共有できる。
 */
export class MemoryFile {
  name: string;
  text: string;
  lastModified: number;
  writes = 0;
  canOverwrite: boolean;

  constructor(
    init?:
      | string
      | { name?: string; text?: string; lastModified?: number; canOverwrite?: boolean },
    textIfNameFirst?: string,
  ) {
    if (typeof init === 'string') {
      if (textIfNameFirst !== undefined) {
        this.name = init;
        this.text = textIfNameFirst;
      } else if (init.endsWith('.json') && !init.startsWith('{')) {
        this.name = init;
        this.text = '';
      } else {
        this.name = 'test.json';
        this.text = init;
      }
      this.lastModified = 1000;
      this.canOverwrite = true;
    } else {
      this.name = init?.name ?? 'test.json';
      this.text = init?.text ?? '';
      this.lastModified = init?.lastModified ?? 1000;
      this.canOverwrite = init?.canOverwrite ?? true;
    }
  }

  json<T = any>(): T {
    return JSON.parse(this.text);
  }

  backend(opts?: { name?: string; canOverwrite?: boolean }): FileBackend {
    const file = this;
    const backendName = opts?.name ?? file.name;
    const canOverwrite = opts?.canOverwrite ?? file.canOverwrite;

    return {
      get name() {
        return backendName;
      },
      get canOverwrite() {
        return canOverwrite;
      },
      async read(): Promise<{ text: string } & FileStat> {
        return { text: file.text, lastModified: file.lastModified };
      },
      async stat(): Promise<FileStat> {
        return { lastModified: file.lastModified };
      },
      async write(text: string): Promise<FileStat> {
        file.writes++;
        file.text = text;
        file.lastModified += 100;
        return { lastModified: file.lastModified };
      },
    };
  }
}

export interface MakeAppOpts {
  file?: MemoryFile;
  openFile?: MemoryFile | null;
  saveFile?: MemoryFile | null;
  settings?: AppSettings;
  clock?: FakeClock;
  now?: string;
  idStart?: number;
  supportsFileSystemAccess?: boolean;
}

export interface AppHarness {
  app: AppStore;
  file: MemoryFile;
  clock: FakeClock;
  deps: AppDeps;
  settings: AppSettings;
  recentList: RecentEntry[];
  setOpenFile(f: MemoryFile | null): void;
  setSaveFile(f: MemoryFile | null): void;
}

/**
 * AppStore を偽の AppDeps で作成する。
 */
export function makeApp(opts: MakeAppOpts = {}): AppHarness {
  const clock = opts.clock ?? new FakeClock();
  const file = opts.file ?? new MemoryFile();
  let currentOpenFile: MemoryFile | null =
    opts.openFile !== undefined ? opts.openFile : file;
  let currentSaveFile: MemoryFile | null =
    opts.saveFile !== undefined ? opts.saveFile : file;
  const settings: AppSettings = opts.settings ?? { autosave: true };
  const fixedNow = opts.now ?? '2026-10-08T12:00:00.000Z';
  let idCounter = opts.idStart ?? 1000;
  const recentList: RecentEntry[] = [];

  const deps: AppDeps = {
    pickFileToOpen: async () => {
      if (!currentOpenFile) return null;
      return {
        backend: currentOpenFile.backend(),
        text: currentOpenFile.text,
        stat: { lastModified: currentOpenFile.lastModified },
      };
    },
    pickFileToSave: async (suggestedName) => {
      if (!currentSaveFile) return null;
      return currentSaveFile.backend({ name: suggestedName });
    },
    supportsFileSystemAccess: () => opts.supportsFileSystemAccess ?? true,
    listRecent: async () => [...recentList],
    addRecent: async (backend) => {
      recentList.unshift({
        name: backend.name,
        handle: {} as unknown as FileSystemFileHandle,
        openedAt: Date.now(),
      });
    },
    openRecent: async (entry) => {
      if (!currentOpenFile) return null;
      return {
        backend: currentOpenFile.backend({ name: entry.name }),
        text: currentOpenFile.text,
        stat: { lastModified: currentOpenFile.lastModified },
      };
    },
    removeRecent: async (entry) => {
      const idx = recentList.findIndex((r) => r.name === entry.name);
      if (idx >= 0) recentList.splice(idx, 1);
    },
    loadSettings: () => ({ ...settings }),
    saveSettings: (s) => {
      settings.autosave = s.autosave;
    },
    newId: () => makeDeterministicV7Id(idCounter++),
    now: () => fixedNow,
    timers: clock,
  };

  const app = new AppStore(deps);

  return {
    app,
    file,
    clock,
    deps,
    settings,
    recentList,
    setOpenFile: (f) => {
      currentOpenFile = f;
    },
    setSaveFile: (f) => {
      currentSaveFile = f;
    },
  };
}

/**
 * 観点表の冒頭で定められた共通の健康状態の確認。
 * - 保存されたファイルの中身を analyzeDocument にかけると ok（修復が要らない）
 * - 保存されたファイルは改行・空白なし（設計 6.1）
 * - 画面の状態の doc が validateDocument を通る
 */
export function expectHealthy(app: AppStore, file: MemoryFile): void {
  if (file.text.length > 0) {
    let dummyCounter = 1;
    const dummyCtx: LoadContext = {
      newId: () => makeDeterministicV7Id(dummyCounter++),
      now: () => '2026-10-08T12:00:00.000Z',
    };
    const res = analyzeDocument(file.text, dummyCtx);
    expect(res.kind).toBe('ok');

    expect(file.text).not.toMatch(/[\r\n]/);
    expect(file.text).toBe(JSON.stringify(JSON.parse(file.text)));
  }

  if (app.state.doc !== null) {
    const violations = validateDocument(app.state.doc);
    expect(violations).toEqual([]);
  }

  // 「保存済み」と出ているなら、画面の文書とファイルの中身が一致している（表示が嘘をつかない）
  if (app.state.saveStatus === 'saved' && app.state.doc !== null && file.text.length > 0) {
    expect(JSON.parse(file.text)).toEqual(app.state.doc);
  }
}

/**
 * 統一規則の確認（観点表 2章）：moved に入ったモノだけ置き場が変わり、それ以外は動いていない。
 * 消されたモノ（after にないもの）は比べない。
 */
export function expectOnlyMoved(before: ArekokoDocument, after: ArekokoDocument, moved: Id[]): void {
  const movedSet = new Set(moved);
  const afterById = new Map(after.membership.items.map(i => [i.id, i]));
  for (const item of before.membership.items) {
    const now = afterById.get(item.id);
    if (!now) continue;
    if (movedSet.has(item.id)) {
      expect(now.place, `${item.name} は移るはず`).not.toBe(item.place);
    } else {
      expect(now.place, `${item.name} は動かないはず`).toBe(item.place);
    }
  }
}
