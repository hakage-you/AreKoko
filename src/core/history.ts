// 元に戻す・やり直す。設計 10章、詳細設計 10章、付録A.14。

import type { ArekokoDocument } from './types';
import { MAX_HISTORY } from './constants';

export class History {
  private readonly limit: number;
  private readonly undoStack: ArekokoDocument[] = [];
  private readonly redoStack: ArekokoDocument[] = [];

  constructor(limit: number = MAX_HISTORY) {
    this.limit = limit;
  }

  /** 操作の前の文書を積む。やり直すの履歴を消す。 */
  record(prev: ArekokoDocument): void {
    this.redoStack.length = 0;
    if (this.limit <= 0) {
      return;
    }
    this.undoStack.push(prev);
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  /** 1つ前の文書に戻す。できなければ null。 */
  undo(current: ArekokoDocument): ArekokoDocument | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) {
      return null;
    }
    this.redoStack.push(current);
    return prev;
  }

  /** やり直す。できなければ null。 */
  redo(current: ArekokoDocument): ArekokoDocument | null {
    const next = this.redoStack.pop();
    if (next === undefined) {
      return null;
    }
    this.undoStack.push(current);
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    return next;
  }

  /** 履歴を空にする。 */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
