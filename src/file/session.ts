// DocumentSession：保存の状態、自動保存、外での変更の検知。
// 詳細設計UI 2.2、設計 10章。ブラウザに依存しない。

import type { ArekokoDocument } from '../core/types';
import { serializeDocument, SerializeError } from '../core/serialize';
import type { FileBackend, FileStat } from './backend';

export type SaveStatus =
  | 'saved'
  | 'dirty'
  | 'pending'
  | 'saving'
  | 'conflict'
  | 'invalid'
  | 'error';

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const AUTOSAVE_DELAY_MS = 1000;

export class DocumentSession {
  private _backend: FileBackend | null;
  private _doc: ArekokoDocument;
  private _lastSavedDoc: ArekokoDocument;
  private _baseline: FileStat | null;
  private _autosave: boolean;
  private _userAutosave: boolean;
  private _timers: Timers;
  private _timerHandle: unknown = null;
  private _status: SaveStatus = 'saved';
  private _listeners: Set<() => void> = new Set();
  private _prevStatus: SaveStatus;
  private _prevDirty: boolean;
  private _prevDoc: ArekokoDocument;
  private _isSaving = false;
  private _savePromise: Promise<void> | null = null;
  private _rerunRequested = false;
  private _forceOverwriteRequested = false;
  private _disposed = false;

  constructor(opts: {
    backend: FileBackend | null;
    doc: ArekokoDocument;
    baseline: FileStat | null;
    autosave: boolean;
    timers?: Timers;
  }) {
    this._backend = opts.backend;
    this._doc = opts.doc;
    this._lastSavedDoc = opts.doc;
    this._baseline = opts.baseline;
    this._autosave = opts.autosave;
    this._userAutosave = opts.autosave;
    this._timers = opts.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as any),
    };
    this._prevStatus = this._status;
    this._prevDirty = this.dirty;
    this._prevDoc = this._doc;
  }

  get doc(): ArekokoDocument {
    return this._doc;
  }

  get status(): SaveStatus {
    return this._status;
  }

  get dirty(): boolean {
    return this._status !== 'saved' && this._doc !== this._lastSavedDoc;
  }

  /**
   * 文書の変更時に呼ぶ。自動保存が効くなら約1秒後に書く。
   */
  update(doc: ArekokoDocument): void {
    if (this._disposed) return;
    this._doc = doc;

    // 文書が最後に保存した状態と同じに戻った場合
    if (this._doc === this._lastSavedDoc) {
      this._clearTimer();
      this._status = 'saved';
      this._notify();
      return;
    }

    // 外での変更による conflict 中は書かない（dirty のまま）
    if (this._status === 'conflict') {
      this._notify();
      return;
    }

    // 書き込み中の場合
    if (this._status === 'saving' || this._isSaving) {
      this._notify();
      return;
    }

    // 自動保存の判定
    if (this._canAutosave()) {
      this._status = 'pending';
      this._scheduleTimer();
    } else {
      this._clearTimer();
      this._status = 'dirty';
    }

    this._notify();
  }

  /**
   * 待たずにすぐ書く（タブを隠す・閉じるとき）。
   */
  async flush(): Promise<void> {
    if (this._disposed) return;
    // 自動保存が効くときだけ（オフのときに書いたり、書き出しのダウンロードを始めたりしない）
    if (!this._canAutosave()) return;
    this._clearTimer();
    if (this._doc === this._lastSavedDoc) return;
    if (this._status === 'conflict') return;
    await this._executeSave();
  }

  /**
   * 手で保存（Ctrl+S や自動保存オフのとき）。
   */
  async save(): Promise<void> {
    if (this._disposed) return;
    this._clearTimer();
    if (!this._backend) return;
    if (this._status === 'conflict') return;
    await this._executeSave();
  }

  /**
   * 自動保存の有効・無効を切り替える。
   */
  setAutosave(on: boolean): void {
    this._userAutosave = on;
    if (this._status === 'conflict') {
      return;
    }
    this._autosave = on;
    if (!on) {
      this._clearTimer();
      if (this._status === 'pending') {
        this._status = 'dirty';
        this._notify();
      }
    } else {
      if (
        this._status === 'dirty' &&
        this._doc !== this._lastSavedDoc &&
        this._canAutosave()
      ) {
        this._status = 'pending';
        this._scheduleTimer();
        this._notify();
      }
    }
  }

  /**
   * 外での変更（conflict）を解決する。
   */
  async resolveConflict(choice: 'overwrite'): Promise<void>;
  async resolveConflict(choice: 'reload'): Promise<{ text: string } & FileStat>;
  async resolveConflict(choice: 'reload' | 'overwrite'): Promise<({ text: string } & FileStat) | void> {
    if (choice === 'reload') {
      if (!this._backend) {
        throw new Error('保存先がありません');
      }
      return await this._backend.read();
    }
    await this._executeSave(true);
  }

  /**
   * 読み込み直した文書で状態を作り直す（conflict 解除）。
   */
  reset(doc: ArekokoDocument, baseline: FileStat): void {
    this._clearTimer();
    this._doc = doc;
    this._lastSavedDoc = doc;
    this._baseline = baseline;
    this._autosave = this._userAutosave;
    this._status = 'saved';
    this._notify();
  }

  /**
   * 保存先を付け替える（別の名前で保存の後、conflict 解除）。
   */
  attach(backend: FileBackend, baseline: FileStat): void {
    this._clearTimer();
    this._backend = backend;
    this._baseline = baseline;
    this._autosave = this._userAutosave;

    if (this._doc === this._lastSavedDoc) {
      this._status = 'saved';
    } else {
      if (this._canAutosave()) {
        this._status = 'pending';
        this._scheduleTimer();
      } else {
        this._status = 'dirty';
      }
    }
    this._notify();
  }

  /**
   * 状態（status・dirty・doc）が変わったときに通知するリスナーを登録する。
   */
  onChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * タイマーを止めてリソースを破棄する。
   */
  dispose(): void {
    this._disposed = true;
    this._clearTimer();
    this._listeners.clear();
  }

  private _canAutosave(): boolean {
    return this._autosave && this._backend !== null && this._backend.canOverwrite;
  }

  private _clearTimer(): void {
    if (this._timerHandle !== null) {
      this._timers.clearTimeout(this._timerHandle);
      this._timerHandle = null;
    }
  }

  private _scheduleTimer(): void {
    this._clearTimer();
    if (this._disposed) return;
    this._timerHandle = this._timers.setTimeout(() => {
      this._timerHandle = null;
      void this._executeSave();
    }, AUTOSAVE_DELAY_MS);
  }

  private _notify(): void {
    const currentDirty = this.dirty;
    if (
      this._status !== this._prevStatus ||
      currentDirty !== this._prevDirty ||
      this._doc !== this._prevDoc
    ) {
      this._prevStatus = this._status;
      this._prevDirty = currentDirty;
      this._prevDoc = this._doc;
      for (const listener of this._listeners) {
        listener();
      }
    }
  }

  private async _executeSave(forceOverwrite = false): Promise<void> {
    if (this._disposed) return;
    if (!this._backend) return;
    if (this._status === 'conflict' && !forceOverwrite) return;

    if (this._isSaving) {
      this._rerunRequested = true;
      if (forceOverwrite) {
        this._forceOverwriteRequested = true;
      }
      await this._savePromise;
      return;
    }

    this._isSaving = true;
    this._forceOverwriteRequested = forceOverwrite;
    this._savePromise = (async () => {
      try {
        while (true) {
          if (this._disposed) return;
          if (!this._backend) return;

          const isOverwrite = this._forceOverwriteRequested;
          this._forceOverwriteRequested = false;
          this._rerunRequested = false;

          if (this._status === 'conflict' && !isOverwrite) return;

          const targetDoc = this._doc;

          if (targetDoc === this._lastSavedDoc && !isOverwrite) {
            if (this._status !== 'saved') {
              this._status = 'saved';
              this._notify();
            }
            return;
          }

          this._status = 'saving';
          this._notify();

          // 1. serializeDocument（不変条件検査つき）
          let text: string;
          try {
            text = serializeDocument(targetDoc);
          } catch (err: unknown) {
            if (err instanceof SerializeError) {
              this._status = 'invalid';
              this._notify();
              return;
            }
            throw err;
          }

          // 2. conflict 検査（上書き指定時および canOverwrite false では行わない）
          if (!isOverwrite && this._backend.canOverwrite) {
            try {
              const currentStat = await this._backend.stat();
              if (
                this._baseline !== null &&
                currentStat.lastModified !== this._baseline.lastModified
              ) {
                this._autosave = false;
                this._status = 'conflict';
                this._notify();
                return;
              }
            } catch {
              this._status = 'error';
              this._notify();
              return;
            }
          }

          // 3. backend.write
          let newStat: FileStat;
          try {
            newStat = await this._backend.write(text);
          } catch {
            this._status = 'error';
            this._notify();
            return;
          }

          // 書き込み成功
          this._baseline = newStat;
          this._lastSavedDoc = targetDoc;
          if (isOverwrite) {
            this._autosave = this._userAutosave;
          }

          // 書き込み完了時に最新文書と等しければ完了
          if (this._doc === targetDoc) {
            this._status = 'saved';
            this._notify();
            return;
          }

          // 書いている途中に update が来ていた場合
          if (this._rerunRequested || this._canAutosave()) {
            continue;
          } else {
            this._status = 'dirty';
            this._notify();
            return;
          }
        }
      } finally {
        this._isSaving = false;
        this._savePromise = null;
      }
    })();

    await this._savePromise;
  }
}
