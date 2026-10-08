// 画面の状態と操作の流れ。詳細設計UI 4.1, 4.3、設計 8章 / 10章。
// Svelte に依存せず、ブラウザのAPIも直接は使わない（差し込み可能）。

import type { ArekokoDocument, Id } from '../core/types';
import type { LoadContext, LoadResult, Refusal, RepairEntry } from '../core/load/index';
import { analyzeDocument } from '../core/load/index';
import { createEmptyDocument } from '../core/document';
import { serializeDocument } from '../core/serialize';
import { History } from '../core/history';
import { OpError } from '../core/ops/common';
import { kuukanOfPlace } from '../core/places';
import type { OpContext, OpResult } from '../core/ops/common';
import type { FileBackend, FileStat } from '../file/backend';
import type { SaveStatus, Timers } from '../file/session';
import { DocumentSession } from '../file/session';
import type { RecentEntry } from '../file/recent';
import type { AppSettings } from '../file/settings';
import type { SearchQuery } from '../search/search';
import type { Point } from '../core/types';
import type { Relocation } from '../core/ops/common';
import {
  type Draft,
  type DraftOrigin,
  newDraft,
  templateDraft,
  duplicateDraft,
  storageDraft,
  redrawDraft,
  setDraftOutline,
} from '../editor/draft';
import { type ConfirmMode, planConfirm, confirmDraft as confirmDraftOp } from '../editor/confirm';

export type Screen = 'start' | 'kuukans' | 'view' | 'search' | 'editor' | 'manage' | 'settings';

/** ヘルプの項目（詳細設計 レビュー1 1章）。 */
export type HelpTopic =
  | 'start' | 'kuukans' | 'view' | 'placing' | 'editor' | 'draft' | 'search' | 'manage' | 'settings' | 'words';

/** クウカンビューで開いているもの（詳細設計 段階6 5章）。 */
export interface ViewTarget {
  kuukan: Id;
  /** 選んでいるエリア。 */
  area: Id | null;
  /** 簡易検索の文字。 */
  quick: string;
  /** サガシモノから来たときに強めにハイライトするモノ。 */
  focus: Id | null;
  /** 配置モード。 */
  placing: boolean;
}

/** クウカン編集で開いているもの（詳細設計 段階5 7章）。 */
export type EditorTarget =
  | { kind: 'draft'; draft: Draft; canUndo: boolean; canRedo: boolean }
  | { kind: 'kuukan'; kuukan: Id };
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
  editor: EditorTarget | null;     // screen が 'editor' のときだけ
  view: ViewTarget | null;         // screen が 'view' のとき（と、そこから開いたクウカン編集の間）だけ
  help: HelpTopic | null;          // 開いているヘルプ
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
  // 下書きは文書の外にあるので、文書とは別の履歴を持つ（E6）
  private draftHistory: History = new History();
  // 下書きを取り消したときに戻る画面
  private editorReturnScreen: Exclude<Screen, 'start' | 'editor'> = 'kuukans';

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
      editor: null,
      view: null,
      help: null,
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
      screen: 'kuukans',
      view: null,
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
        screen: 'kuukans',
      view: null,
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
      screen: 'kuukans',
      view: null,
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
    if (this._state.editor?.kind === 'draft') return this.draftUndo();
    if (!this._state.doc) return;
    const prev = this.history.undo(this._state.doc);
    if (prev) this.commitDoc(prev, new Set());
  }

  redo(): void {
    if (this._state.editor?.kind === 'draft') return this.draftRedo();
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
    // 編集中のクウカンがなくなったら（確定を元に戻したときなど）一覧へ
    const ed = this._state.editor;
    const editorGone = ed?.kind === 'kuukan' && !doc.membership.kuukans.some(k => k.id === ed.kuukan);
    this.updateState({
      ...this.viewAfterChange(doc),
      ...(editorGone ? { screen: 'kuukans' as const, editor: null, view: null } : {}),
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

  /** 文書が変わった後の view。開いているクウカンが消えたら一覧へ、エリアやフォーカスが消えたら外す。 */
  private viewAfterChange(doc: ArekokoDocument): Partial<AppState> {
    const v = this._state.view;
    if (!v) return {};
    if (!doc.membership.kuukans.some(k => k.id === v.kuukan)) {
      return this._state.screen === 'view' ? { screen: 'kuukans', view: null } : { view: null };
    }
    const area = v.area !== null && doc.membership.areas.some(a => a.id === v.area && a.kuukan === v.kuukan) ? v.area : null;
    const focus = v.focus !== null && doc.membership.items.some(it => it.id === v.focus) ? v.focus : null;
    // 描画がなくなったら配置モードを終える
    const placing = v.placing && doc.drawing.kuukans.some(d => d.kuukan === v.kuukan);
    if (area === v.area && focus === v.focus && placing === v.placing) return {};
    return { view: { ...v, area, focus, placing } };
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
          ...this.viewAfterChange(loadResult.doc),
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
          ...this.viewAfterChange(this.session.doc),
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
    if (this._state.editor?.kind === 'draft') {
      this.confirmDiscardDraft(() => {
        this.updateState({ editor: null });
        void this.closeDocument();
      });
      return;
    }
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
      editor: null,
      view: null,
    });
    this.draftHistory.clear();

    void this.deps.listRecent().then((recent) => {
      this.updateState({ recent });
    }).catch(() => {
      // ignore
    });
  }

  setScreen(s: Exclude<Screen, 'start' | 'editor'>): void {
    if (this._state.editor?.kind === 'draft') {
      this.confirmDiscardDraft(() => this.doSetScreen(s));
      return;
    }
    this.doSetScreen(s);
  }

  private doSetScreen(s: Exclude<Screen, 'start' | 'editor'>): void {
    this.history.clear();
    this.draftHistory.clear();
    const view = s === 'view' ? this.viewAfterReturn() : null;
    this.updateState({
      screen: s === 'view' && !view ? 'kuukans' : s,
      view,
      editor: null,
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
      selection: new Set(),
    });
  }

  /** クウカン編集から戻るときの view。開いていたクウカンが消えていたら null。 */
  private viewAfterReturn(): ViewTarget | null {
    const v = this._state.view;
    const doc = this._state.doc;
    if (!v || !doc || !doc.membership.kuukans.some(k => k.id === v.kuukan)) return null;
    const next = { ...v, ...(this.viewAfterChange(doc).view ?? {}) };
    return next;
  }

  // ---- ヘルプ（詳細設計 レビュー1 1章） ----

  /** 今の画面に合うヘルプの項目。 */
  helpTopicForScreen(): HelpTopic {
    const st = this._state;
    switch (st.screen) {
      case 'start': return 'start';
      case 'kuukans': return 'kuukans';
      case 'view': return st.view?.placing ? 'placing' : 'view';
      case 'editor': return st.editor?.kind === 'draft' ? 'draft' : 'editor';
      case 'search': return 'search';
      case 'manage': return 'manage';
      case 'settings': return 'settings';
    }
  }

  openHelp(topic?: HelpTopic): void {
    this.updateState({ help: topic ?? this.helpTopicForScreen() });
  }

  closeHelp(): void {
    if (this._state.help !== null) this.updateState({ help: null });
  }

  // ---- クウカンビュー（詳細設計 段階6 5章） ----

  /** クウカンビューを開く。別のクウカンに変わるときは履歴を消す（設計 10章）。 */
  openView(kuukan: Id, opts: { area?: Id | null; quick?: string; focus?: Id | null } = {}): void {
    if (this._state.editor?.kind === 'draft') {
      this.confirmDiscardDraft(() => this.doOpenView(kuukan, opts));
      return;
    }
    this.doOpenView(kuukan, opts);
  }

  private doOpenView(kuukan: Id, opts: { area?: Id | null; quick?: string; focus?: Id | null }): void {
    const doc = this._state.doc;
    if (!doc || !doc.membership.kuukans.some(k => k.id === kuukan)) return;
    const area = opts.area != null && doc.membership.areas.some(a => a.id === opts.area && a.kuukan === kuukan) ? opts.area : null;
    const same = this._state.screen === 'view' && this._state.view?.kuukan === kuukan;
    if (!same) {
      this.history.clear();
      this.draftHistory.clear();
    }
    this.updateState({
      screen: 'view',
      editor: null,
      view: { kuukan, area, quick: opts.quick ?? '', focus: opts.focus ?? null, placing: false },
      detail: null,
      selection: new Set(),
      ...(same ? {} : { canUndo: false, canRedo: false, highlights: new Set() }),
    });
  }

  selectViewArea(area: Id | null): void {
    const v = this._state.view;
    if (!v || v.area === area) return;
    this.updateState({ view: { ...v, area } });
  }

  setQuick(text: string): void {
    const v = this._state.view;
    if (!v || v.quick === text) return;
    this.updateState({ view: { ...v, quick: text, focus: null } });
  }

  /** 配置モードの入り切り。履歴は消さない（設計 10章）。描画のないクウカンでは入らない。 */
  setPlacing(on: boolean): void {
    const v = this._state.view;
    const doc = this._state.doc;
    if (!v || !doc || v.placing === on) return;
    if (on && !doc.drawing.kuukans.some(d => d.kuukan === v.kuukan)) return;
    this.updateState({ view: { ...v, placing: on } });
  }

  /** 簡易検索の続きをサガシモノで（設計 8.8：文字と置き場を引き継ぐ）。 */
  searchFromView(): void {
    const v = this._state.view;
    if (!v) return;
    const text = v.quick.trim();
    this.setQuery({ ...(text ? { text } : {}), place: v.kuukan });
    this.setScreen('search');
  }

  /** サガシモノの結果からクウカンビューへ（設計 8.8：名前を簡易検索の文字に入れ、そのモノを強めにハイライト）。 */
  showInView(item: Id): void {
    const doc = this._state.doc;
    const it = doc?.membership.items.find(i => i.id === item);
    if (!doc || !it) return;
    const kuukan = kuukanOfPlace(doc, it.place);
    this.openView(kuukan, { area: it.place !== kuukan ? it.place : null, quick: it.name, focus: it.id });
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

  // ---- クウカン編集（詳細設計 段階5 7章） ----

  /** 下書きを作って、クウカン編集を開く。 */
  openDraft(origin: DraftOrigin, input: { name?: string } = {}): void {
    const doc = this._state.doc;
    if (!doc) return;
    const ctx = this.opContext();
    let draft: Draft;
    try {
      switch (origin.kind) {
        case 'new':
          draft = newDraft({ name: input.name ?? '新しいクウカン' }, ctx);
          break;
        case 'template':
          draft = templateDraft(origin.template, ctx);
          break;
        case 'duplicate':
          draft = duplicateDraft(doc, origin.source, ctx);
          break;
        case 'storage':
          draft = storageDraft(doc, origin.item, ctx);
          break;
        case 'redraw':
          draft = redrawDraft(doc, origin.source, ctx);
          break;
      }
    } catch (err: unknown) {
      if (err instanceof OpError) {
        this.showToast('error', err.message);
        return;
      }
      throw err;
    }
    this.rememberReturnScreen();
    this.history.clear();
    this.draftHistory.clear();
    this.updateState({
      screen: 'editor',
      editor: { kind: 'draft', draft, canUndo: false, canRedo: false },
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
    });
  }

  /** 確定したクウカンの編集を開く。表示するクウカンが変わるので履歴を消す（設計 10章）。 */
  openKuukanEditor(kuukan: Id): void {
    if (!this._state.doc?.membership.kuukans.some(k => k.id === kuukan)) return;
    this.rememberReturnScreen();
    this.history.clear();
    this.draftHistory.clear();
    this.updateState({
      screen: 'editor',
      editor: { kind: 'kuukan', kuukan },
      canUndo: false,
      canRedo: false,
      highlights: new Set(),
    });
  }

  /** クウカン編集から、開いた元の画面へ戻る（下書きなら捨てるか確認する）。 */
  leaveEditor(): void {
    this.setScreen(this.editorReturnScreen);
  }

  /** 下書きの文書に操作をかける。OpError は toast。 */
  draftApply(op: (doc: ArekokoDocument, ctx: OpContext) => OpResult): OpResult | null {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return null;
    let result: OpResult;
    try {
      result = op(ed.draft.doc, this.opContext());
    } catch (err: unknown) {
      if (err instanceof OpError) {
        this.showToast('error', err.message);
        return null;
      }
      throw err;
    }
    if (result.doc !== ed.draft.doc) this.commitDraft({ ...ed.draft, doc: result.doc }, true);
    return result;
  }

  /** 下書きの外形を付け替える。仕切りと矛盾すれば受け付けず、理由を出す（E2）。 */
  draftSetOutline(outline: Point[]): boolean {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return false;
    return this.draftReplace(setDraftOutline(ed.draft, outline));
  }

  /** 下書きを丸ごと差し替える（外形を付ける・外すなど、draft.ts の関数の結果）。 */
  draftReplace(next: Draft | { error: string }): boolean {
    if (this._state.editor?.kind !== 'draft') return false;
    if ('error' in next) {
      this.showToast('error', next.error);
      return false;
    }
    this.commitDraft(next, true);
    return true;
  }

  draftUndo(): void {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return;
    const prev = this.draftHistory.undo(ed.draft.doc);
    if (prev) this.commitDraft({ ...ed.draft, doc: prev }, false);
  }

  draftRedo(): void {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return;
    const next = this.draftHistory.redo(ed.draft.doc);
    if (next) this.commitDraft({ ...ed.draft, doc: next }, false);
  }

  planDraftConfirm(mode: ConfirmMode): { removedAreas: Id[]; relocations: Relocation[] } | null {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft' || !this._state.doc) return null;
    return planConfirm(this._state.doc, ed.draft, mode);
  }

  /** 下書きを文書に確定し、確定したクウカンの編集へ移る。移ったモノはハイライトされる。 */
  confirmDraft(mode: ConfirmMode): void {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return;
    const draft = ed.draft;
    const result = this.apply((doc, ctx) => confirmDraftOp(doc, draft, mode, ctx));
    if (!result) return;
    const kuukan = result.created[0] ?? draft.kuukan;
    this.draftHistory.clear();
    // 確定は文書の履歴に積んだまま（元に戻すで確定を取り消せる）。表示を確定したクウカンへ。
    this.updateState({ screen: 'editor', editor: { kind: 'kuukan', kuukan } });
  }

  /** 下書きを捨てて、開いた元の画面へ戻る。 */
  cancelDraft(): void {
    if (this._state.editor?.kind !== 'draft') return;
    this.draftHistory.clear();
    this.updateState({ screen: this.editorReturnScreen, editor: null, canUndo: false, canRedo: false });
  }

  private rememberReturnScreen(): void {
    const s = this._state.screen;
    if (s !== 'editor' && s !== 'start') this.editorReturnScreen = s;
  }

  private commitDraft(draft: Draft, record: boolean): void {
    const ed = this._state.editor;
    if (ed?.kind !== 'draft') return;
    if (record) this.draftHistory.record(ed.draft.doc);
    this.updateState({
      editor: { kind: 'draft', draft, canUndo: this.draftHistory.canUndo, canRedo: this.draftHistory.canRedo },
    });
  }

  private confirmDiscardDraft(then: () => void): void {
    this.confirm({
      title: '下書きを捨てますか？',
      message: '確定していない下書きは、文書に入りません。',
      details: [],
      confirmLabel: '捨てる',
      danger: true,
      onConfirm: () => {
        this.draftHistory.clear();
        this.updateState({ editor: null });
        then();
      },
    });
  }

  private opContext(): OpContext {
    return { newId: () => this.deps.newId(), now: () => this.deps.now() };
  }
}
