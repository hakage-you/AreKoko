// 画面の状態と操作の流れ。詳細設計UI 4.1, 4.3、設計 8章 / 10章。
// Svelte に依存せず、ブラウザのAPIも直接は使わない（差し込み可能）。

import type { ArekokoDocument, Id } from '../core/types';
import type { LoadContext, LoadResult, Refusal, RepairEntry } from '../core/load/index';
import { analyzeDocument } from '../core/load/index';
import { createEmptyDocument } from '../core/document';
import { serializeDocument } from '../core/serialize';
import { History } from '../core/history';
import { OpError } from '../core/ops/common';
import type { OpContext, OpResult } from '../core/ops/common';
import type { FileBackend, FileStat } from '../file/backend';
import type { SaveStatus, Timers } from '../file/session';
import { DocumentSession } from '../file/session';
import type { RecentEntry } from '../file/recent';
import type { AppSettings } from '../file/settings';
import type { SearchQuery } from '../search/search';

export type Screen = 'start' | 'search' | 'kuukans' | 'manage' | 'settings';
export type Grouping = 'none' | 'category' | 'place' | 'tag';

export type ConfirmDialog = {
  kind: 'confirm';
  title: string;
  message: string;
  details: string[];
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
};

export type Dialog =
  | { kind: 'repair'; fileName: string; repairs: RepairEntry[] }
  | { kind: 'refused'; fileName: string; reasons: Refusal[] }
  | { kind: 'conflict' }
  | ConfirmDialog;

export interface AppState {
  screen: Screen;
  doc: ArekokoDocument | null;
  fileName: string | null;
  saveStatus: SaveStatus | null;
  dirty: boolean;
  hasBackend: boolean;
  canOverwrite: boolean;
  autosave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  highlights: ReadonlySet<Id>;
  dialog: Dialog | null;
  toast: { kind: 'info' | 'error'; text: string } | null;
  query: SearchQuery;
  grouping: Grouping;
  detail: Id | null;
  selection: ReadonlySet<Id>;
  recent: RecentEntry[];
  supportsOverwrite: boolean;
}

export interface AppDeps {
  pickFileToOpen(): Promise<{ backend: FileBackend; text: string; stat: FileStat } | null>;
  pickFileToSave(suggestedName: string): Promise<FileBackend | null>;
  supportsFileSystemAccess(): boolean;
  listRecent(): Promise<RecentEntry[]>;
  addRecent(backend: FileBackend): Promise<void>;
  openRecent(entry: RecentEntry): Promise<{ backend: FileBackend; text: string; stat: FileStat } | null>;
  removeRecent(entry: RecentEntry): Promise<void>;
  loadSettings(): AppSettings;
  saveSettings(s: AppSettings): void;
  newId(): Id;
  now(): string;
  timers?: Timers;
}

export class AppStore {
  private deps: AppDeps;
  private _state: AppState;
  private listeners: Set<(s: AppState) => void> = new Set();
  private session: DocumentSession | null = null;
  private currentBackend: FileBackend | null = null;
  private unsubscribeSession: (() => void) | null = null;
  private history: History = new History();
  private pendingRepair: { backend: FileBackend; stat: FileStat; doc: ArekokoDocument } | null = null;

  constructor(deps: AppDeps) {
    this.deps = deps;
    this._state = {
      screen: 'start',
      doc: null,
      fileName: null,
      saveStatus: null,
      dirty: false,
      hasBackend: false,
      canOverwrite: false,
      autosave: true,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      dialog: null,
      toast: null,
      query: {},
      grouping: 'none',
      detail: null,
      selection: new Set(),
      recent: [],
      supportsOverwrite: deps.supportsFileSystemAccess(),
    };
  }

  get state(): AppState {
    return this._state;
  }

  subscribe(run: (s: AppState) => void): () => void {
    this.listeners.add(run);
    run(this._state);
    return () => {
      this.listeners.delete(run);
    };
  }

  private updateState(patch: Partial<AppState>): void {
    this._state = {
      ...this._state,
      ...patch,
    };
    for (const listener of this.listeners) {
      listener(this._state);
    }
  }

  private subscribeToSession(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession =
      this.session?.onChange(() => {
        if (!this.session) return;
        const isConflict = this.session.status === 'conflict';
        let dialog = this._state.dialog;
        if (isConflict) {
          dialog = { kind: 'conflict' };
        } else if (dialog?.kind === 'conflict') {
          dialog = null;
        }
        this.updateState({
          saveStatus: this.session.status,
          dirty: this.session.dirty,
          dialog,
        });
      }) ?? null;
  }

  async init(): Promise<void> {
    const settings = this.deps.loadSettings();
    let recent: RecentEntry[] = [];
    try {
      recent = await this.deps.listRecent();
    } catch {
      // ignore
    }
    this.updateState({
      autosave: settings.autosave,
      recent,
      supportsOverwrite: this.deps.supportsFileSystemAccess(),
    });
  }

  async newDocument(): Promise<void> {
    const backend = await this.deps.pickFileToSave('arekoko.json');
    if (!backend) return;

    const doc = createEmptyDocument();
    this.unsubscribeSession?.();
    this.session?.dispose();
    this.currentBackend = backend;

    // 上書きできる保存先なら、空の文書をすぐ書いてから始める（選んだファイルを0バイトのまま残さない）。
    // 書き出ししかできない環境では、最初の保存（書き出し）まで何も書かない。
    let baseline: FileStat | null = null;
    if (backend.canOverwrite) {
      try {
        baseline = await backend.write(serializeDocument(doc));
      } catch {
        this.showToast('error', 'ファイルに書き込めませんでした');
        return;
      }
    }

    this.session = new DocumentSession({
      backend,
      doc,
      baseline,
      autosave: this._state.autosave,
      timers: this.deps.timers,
    });
    this.subscribeToSession();

    this.history.clear();
    this.pendingRepair = null;
    this.updateState({
      screen: 'search',
      doc,
      fileName: backend.name,
      saveStatus: this.session.status,
      dirty: this.session.dirty,
      hasBackend: true,
      canOverwrite: backend.canOverwrite,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      dialog: null,
      detail: null,
      selection: new Set(),
    });

    await this.deps.addRecent(backend);
  }

  async openFile(): Promise<void> {
    const result = await this.deps.pickFileToOpen();
    if (!result) return;
    await this.processOpenedContent(result.backend, result.text, result.stat);
  }

  async openRecent(entry: RecentEntry): Promise<void> {
    const result = await this.deps.openRecent(entry);
    if (!result) {
      this.showToast('error', 'ファイルのアクセスが許可されませんでした');
      return;
    }
    await this.processOpenedContent(result.backend, result.text, result.stat);
  }

  async removeRecent(entry: RecentEntry): Promise<void> {
    await this.deps.removeRecent(entry);
    try {
      const recent = await this.deps.listRecent();
      this.updateState({ recent });
    } catch {
      // ignore
    }
  }

  private async processOpenedContent(
    backend: FileBackend,
    text: string,
    stat: FileStat,
  ): Promise<void> {
    const ctx: LoadContext = {
      newId: () => this.deps.newId(),
      now: () => this.deps.now(),
    };
    const loadResult = analyzeDocument(text, ctx);

    if (loadResult.kind === 'ok') {
      this.unsubscribeSession?.();
      this.session?.dispose();
      this.currentBackend = backend;
      this.session = new DocumentSession({
        backend,
        doc: loadResult.doc,
        baseline: stat,
        autosave: this._state.autosave,
        timers: this.deps.timers,
      });
      this.subscribeToSession();
      this.history.clear();
      this.pendingRepair = null;

      this.updateState({
        screen: 'search',
        doc: loadResult.doc,
        fileName: backend.name,
        saveStatus: this.session.status,
        dirty: this.session.dirty,
        hasBackend: true,
        canOverwrite: backend.canOverwrite,
        canUndo: false,
        canRedo: false,
        highlights: new Set(),
        dialog: null,
        detail: null,
        selection: new Set(),
      });

      await this.deps.addRecent(backend);
    } else if (loadResult.kind === 'repair') {
      this.pendingRepair = { backend, stat, doc: loadResult.doc };
      this.updateState({
        dialog: {
          kind: 'repair',
          fileName: backend.name,
          repairs: loadResult.repairs,
        },
      });
    } else if (loadResult.kind === 'refused') {
      this.pendingRepair = null;
      this.updateState({
        dialog: {
          kind: 'refused',
          fileName: backend.name,
          reasons: loadResult.reasons,
        },
      });
    }
  }

  approveRepair(): void {
    if (!this.pendingRepair) return;
    const { backend, stat, doc } = this.pendingRepair;
    this.pendingRepair = null;

    this.unsubscribeSession?.();
    this.session?.dispose();
    this.currentBackend = backend;
    this.session = new DocumentSession({
      backend,
      doc,
      baseline: stat,
      autosave: this._state.autosave,
      timers: this.deps.timers,
    });
    this.subscribeToSession();

    // 変更ありの状態にするため、作った直後に session.update({ ...doc }) を呼ぶ
    this.session.update({ ...doc });

    this.history.clear();
    this.updateState({
      screen: 'search',
      doc: this.session.doc,
      fileName: backend.name,
      saveStatus: this.session.status,
      dirty: this.session.dirty,
      hasBackend: true,
      canOverwrite: backend.canOverwrite,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      dialog: null,
      detail: null,
      selection: new Set(),
    });

    void this.deps.addRecent(backend);
  }

  rejectRepair(): void {
    this.pendingRepair = null;
    this.updateState({ dialog: null });
  }

  apply(op: (doc: ArekokoDocument, ctx: OpContext) => OpResult): OpResult | null {
    if (!this._state.doc || !this.session) return null;

    const ctx: OpContext = {
      newId: () => this.deps.newId(),
      now: () => this.deps.now(),
    };

    let result: OpResult;
    try {
      result = op(this._state.doc, ctx);
    } catch (err: unknown) {
      if (err instanceof OpError) {
        this.showToast('error', err.message);
        return null;
      }
      throw err;
    }

    if (result.doc !== this._state.doc) {
      this.history.record(this._state.doc);
      this.commitDoc(result.doc, new Set(result.moved));
    }

    return result;
  }

  undo(): void {
    if (!this._state.doc) return;
    const prev = this.history.undo(this._state.doc);
    if (prev) this.commitDoc(prev, new Set());
  }

  redo(): void {
    if (!this._state.doc) return;
    const next = this.history.redo(this._state.doc);
    if (next) this.commitDoc(next, new Set());
  }

  /** 文書を差し替え、セッションへ渡し、消えたモノを詳細と選択から外す。 */
  private commitDoc(doc: ArekokoDocument, highlights: ReadonlySet<Id>): void {
    if (!this.session) return;
    this.session.update(doc);
    const exists = new Set(doc.membership.items.map(it => it.id));
    const detail = this._state.detail !== null && exists.has(this._state.detail) ? this._state.detail : null;
    const selection = new Set([...this._state.selection].filter(id => exists.has(id)));
    this.updateState({
      doc,
      saveStatus: this.session.status,
      dirty: this.session.dirty,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      highlights,
      detail,
      selection,
    });
  }

  confirm(d: Omit<ConfirmDialog, 'kind'>): void {
    const originalOnConfirm = d.onConfirm;
    this.updateState({
      dialog: {
        kind: 'confirm',
        ...d,
        onConfirm: () => {
          this.closeDialog();
          originalOnConfirm();
        },
      },
    });
  }

  /** 外での変更のダイアログをもう一度出す（閉じた後に、上部の保存の状態から開く）。 */
  openConflictDialog(): void {
    if (this.session?.status === 'conflict') this.updateState({ dialog: { kind: 'conflict' } });
  }

  closeDialog(): void {
    this.updateState({ dialog: null });
  }

  showToast(kind: 'info' | 'error', text: string): void {
    this.updateState({ toast: { kind, text } });
  }

  dismissToast(): void {
    this.updateState({ toast: null });
  }

  async save(): Promise<void> {
    if (!this.session) return;
    if (!this.currentBackend) {
      const backend = await this.deps.pickFileToSave(this._state.fileName ?? 'arekoko.json');
      if (!backend) return;
      const stat = await backend.stat();
      this.currentBackend = backend;
      this.session.attach(backend, stat);
      await this.session.save();
      await this.deps.addRecent(backend);
      this.updateState({
        fileName: backend.name,
        hasBackend: true,
        canOverwrite: backend.canOverwrite,
        saveStatus: this.session.status,
        dirty: this.session.dirty,
      });
      return;
    }
    await this.session.save();
  }

  async saveAs(): Promise<void> {
    if (!this.session) return;
    const suggestedName = this._state.fileName ?? 'arekoko.json';
    const backend = await this.deps.pickFileToSave(suggestedName);
    if (!backend) return;
    const stat = await backend.stat();
    this.currentBackend = backend;
    this.session.attach(backend, stat);
    await this.session.save();
    await this.deps.addRecent(backend);
    this.updateState({
      fileName: backend.name,
      hasBackend: true,
      canOverwrite: backend.canOverwrite,
      saveStatus: this.session.status,
      dirty: this.session.dirty,
    });
  }

  async flush(): Promise<void> {
    if (this.session) {
      await this.session.flush();
    }
  }

  setAutosave(on: boolean): void {
    this.deps.saveSettings({ autosave: on });
    this.session?.setAutosave(on);
    this.updateState({
      autosave: on,
      saveStatus: this.session?.status ?? this._state.saveStatus,
      dirty: this.session?.dirty ?? this._state.dirty,
    });
  }

  async resolveConflict(choice: 'reload' | 'overwrite' | 'saveAs'): Promise<void> {
    if (!this.session) return;
    this.closeDialog();

    if (choice === 'overwrite') {
      await this.session.resolveConflict('overwrite');
      this.updateState({
        saveStatus: this.session.status,
        dirty: this.session.dirty,
      });
      return;
    }

    if (choice === 'saveAs') {
      await this.saveAs();
      return;
    }

    if (choice === 'reload') {
      const result = await this.session.resolveConflict('reload');
      const ctx: LoadContext = {
        newId: () => this.deps.newId(),
        now: () => this.deps.now(),
      };
      const loadResult = analyzeDocument(result.text, ctx);

      if (loadResult.kind === 'ok') {
        this.session.reset(loadResult.doc, result);
        this.history.clear();
        this.updateState({
          doc: loadResult.doc,
          saveStatus: this.session.status,
          dirty: this.session.dirty,
          canUndo: false,
          canRedo: false,
          highlights: new Set(),
        });
      } else if (loadResult.kind === 'repair') {
        this.session.reset(loadResult.doc, result);
        this.session.update({ ...loadResult.doc });
        this.history.clear();
        this.showToast('info', '外部での変更を修復して読み込みました');
        this.updateState({
          doc: this.session.doc,
          saveStatus: this.session.status,
          dirty: this.session.dirty,
          canUndo: false,
          canRedo: false,
          highlights: new Set(),
        });
      } else if (loadResult.kind === 'refused') {
        this.showToast('error', '外部で変更されたファイル形式が不正なため、読み込めませんでした');
      }
    }
  }

  /** 最初の画面へ。自動保存の待ちの途中なら、捨てずに書いてから閉じる。 */
  async closeDocument(): Promise<void> {
    await this.flush();
    if (this._state.dirty) {
      this.confirm({
        title: '確認',
        message: '保存していない変更があります。閉じますか？',
        details: [],
        confirmLabel: '閉じる',
        danger: true,
        onConfirm: () => {
          this.doCloseDocument();
        },
      });
      return;
    }
    this.doCloseDocument();
  }

  private doCloseDocument(): void {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.session?.dispose();
    this.session = null;
    this.currentBackend = null;
    this.history.clear();
    this.pendingRepair = null;

    this.updateState({
      screen: 'start',
      doc: null,
      fileName: null,
      saveStatus: null,
      dirty: false,
      hasBackend: false,
      canOverwrite: false,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      dialog: null,
      toast: null,
      query: {},
      grouping: 'none',
      detail: null,
      selection: new Set(),
    });

    void this.deps.listRecent().then((recent) => {
      this.updateState({ recent });
    }).catch(() => {
      // ignore
    });
  }

  setScreen(s: Exclude<Screen, 'start'>): void {
    this.history.clear();
    this.updateState({
      screen: s,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      selection: new Set(),
    });
  }

  setQuery(q: SearchQuery): void {
    this.updateState({ query: q });
  }

  setGrouping(g: Grouping): void {
    this.updateState({ grouping: g });
  }

  showDetail(id: Id | null): void {
    this.updateState({ detail: id });
  }

  setSelection(ids: Iterable<Id>): void {
    this.updateState({ selection: new Set(ids) });
  }

  toggleSelection(id: Id): void {
    const next = new Set(this._state.selection);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.updateState({ selection: next });
  }
}
