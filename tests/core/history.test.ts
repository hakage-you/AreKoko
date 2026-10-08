import { describe, it, expect } from 'vitest';
import { History } from '../../src/core/history';
import { createEmptyDocument } from '../../src/core/document';
import type { ArekokoDocument } from '../../src/core/types';

function createDummyDoc(name: string): ArekokoDocument {
  const doc = createEmptyDocument();
  doc.membership.kuukans[0]!.name = name;
  return doc;
}

describe('History', () => {
  it('undo / redo の基本動作', () => {
    const history = new History();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    const doc0 = createDummyDoc('v0');
    const doc1 = createDummyDoc('v1');
    const doc2 = createDummyDoc('v2');

    // 操作前の状態 doc0 を積む
    history.record(doc0);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    // 操作前の状態 doc1 を積む
    history.record(doc1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    // 1回 undo（現在 doc2 から doc1 に戻す）
    const undone1 = history.undo(doc2);
    expect(undone1).toBe(doc1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    // もう1回 undo（現在 doc1 から doc0 に戻す）
    const undone2 = history.undo(doc1);
    expect(undone2).toBe(doc0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    // これ以上 undo できない
    expect(history.undo(doc0)).toBeNull();

    // 1回 redo（現在 doc0 から doc1 に進める）
    const redone1 = history.redo(doc0);
    expect(redone1).toBe(doc1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);

    // もう1回 redo（現在 doc1 から doc2 に進める）
    const redone2 = history.redo(doc1);
    expect(redone2).toBe(doc2);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    // これ以上 redo できない
    expect(history.redo(doc2)).toBeNull();
  });

  it('上限50（MAX_HISTORY）で古い履歴が捨てられる', () => {
    const history = new History();
    const docs: ArekokoDocument[] = [];
    for (let i = 0; i <= 60; i++) {
      docs.push(createDummyDoc(`v${i}`));
    }

    // 60 回 record する（doc0 〜 doc59）
    for (let i = 0; i < 60; i++) {
      history.record(docs[i]!);
    }

    expect(history.canUndo).toBe(true);

    // ちょうど 50 回 undo できる（doc59 から戻していき、doc10 まで戻る）
    let current = docs[60]!;
    for (let i = 59; i >= 10; i--) {
      const prev = history.undo(current);
      expect(prev).toBe(docs[i]!);
      current = prev!;
    }

    // 51 回目の undo は null になる（古い doc0 〜 doc9 は消えている）
    expect(history.canUndo).toBe(false);
    expect(history.undo(current)).toBeNull();
  });

  it('カスタム上限を指定できる', () => {
    const history = new History(3);
    const doc0 = createDummyDoc('0');
    const doc1 = createDummyDoc('1');
    const doc2 = createDummyDoc('2');
    const doc3 = createDummyDoc('3');

    history.record(doc0);
    history.record(doc1);
    history.record(doc2);
    history.record(doc3); // doc0 はあふれる

    let current = createDummyDoc('4');
    expect(history.undo(current)).toBe(doc3);
    current = doc3;
    expect(history.undo(current)).toBe(doc2);
    current = doc2;
    expect(history.undo(current)).toBe(doc1);
    current = doc1;
    expect(history.undo(current)).toBeNull();
  });

  it('新しい record で redo が消える', () => {
    const history = new History();
    const doc0 = createDummyDoc('v0');
    const doc1 = createDummyDoc('v1');
    const doc2 = createDummyDoc('v2');
    const docBranch = createDummyDoc('branch');

    history.record(doc0);
    history.record(doc1);

    // undo して redo 可能な状態にする
    history.undo(doc2);
    expect(history.canRedo).toBe(true);

    // ここで新しい操作を record する
    history.record(docBranch);

    // redo 履歴が消えている
    expect(history.canRedo).toBe(false);
    expect(history.redo(docBranch)).toBeNull();
  });

  it('clear で undo と redo の両方が消える', () => {
    const history = new History();
    const doc0 = createDummyDoc('v0');
    const doc1 = createDummyDoc('v1');

    history.record(doc0);
    history.undo(doc1);
    expect(history.canRedo).toBe(true);

    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo(doc1)).toBeNull();
    expect(history.redo(doc0)).toBeNull();
  });
});
