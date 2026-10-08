import { describe, expect, it } from 'vitest';
import type { ArekokoDocument } from '../../src/core/types';
import { serializeDocument } from '../../src/core/serialize';
import type { FileBackend, FileStat } from '../../src/file/backend';
import { DocumentSession, type Timers } from '../../src/file/session';
import { createSampleDocument } from '../helpers/fixtures';

class FakeBackend implements FileBackend {
  name = 'test.json';
  canOverwrite = true;
  text: string;
  lastModified = 1000;
  writeCount = 0;
  statCount = 0;
  throwOnWrite: Error | null = null;
  writeGate: Promise<void> | null = null;

  constructor(initialText: string, initialModified = 1000) {
    this.text = initialText;
    this.lastModified = initialModified;
  }

  async read(): Promise<{ text: string } & FileStat> {
    return { text: this.text, lastModified: this.lastModified };
  }

  async stat(): Promise<FileStat> {
    this.statCount++;
    return { lastModified: this.lastModified };
  }

  async write(text: string): Promise<FileStat> {
    if (this.writeGate) {
      await this.writeGate;
    }
    if (this.throwOnWrite) {
      const err = this.throwOnWrite;
      this.throwOnWrite = null;
      throw err;
    }
    this.writeCount++;
    this.text = text;
    this.lastModified += 100;
    return { lastModified: this.lastModified };
  }

  simulateExternalChange(newText: string): void {
    this.text = newText;
    this.lastModified += 500;
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

  get pendingCount(): number {
    return this.tasks.size;
  }
}

function modifyDoc(doc: ArekokoDocument, newName: string): ArekokoDocument {
  return {
    ...doc,
    membership: {
      ...doc.membership,
      items: doc.membership.items.map((item, idx) =>
        idx === 0 ? { ...item, name: newName } : item,
      ),
    },
  };
}

describe('DocumentSession', () => {
  it('update → pending → 1000ms 後に書かれて saved。999ms ではまだ書かれない', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    expect(session.status).toBe('saved');
    expect(session.dirty).toBe(false);

    const doc2 = modifyDoc(doc1, '変更1');
    session.update(doc2);

    expect(session.status).toBe('pending');
    expect(session.dirty).toBe(true);
    expect(backend.writeCount).toBe(0);

    await timers.advanceTime(999);
    expect(session.status).toBe('pending');
    expect(backend.writeCount).toBe(0);

    await timers.advanceTime(1);
    expect(session.status).toBe('saved');
    expect(session.dirty).toBe(false);
    expect(backend.writeCount).toBe(1);
    expect(JSON.parse(backend.text).membership.items[0].name).toBe('変更1');
  });

  it('1秒の間に3回 update → 書き込みは1回だけ（最後の文書）', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    session.update(modifyDoc(doc1, '変更1'));
    await timers.advanceTime(300);
    session.update(modifyDoc(doc1, '変更2'));
    await timers.advanceTime(300);
    session.update(modifyDoc(doc1, '変更3'));

    expect(backend.writeCount).toBe(0);

    await timers.advanceTime(1000);
    expect(backend.writeCount).toBe(1);
    expect(session.status).toBe('saved');
    expect(JSON.parse(backend.text).membership.items[0].name).toBe('変更3');
  });

  it('flush はすぐ書く', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    session.update(modifyDoc(doc1, '変更1'));
    expect(session.status).toBe('pending');
    expect(backend.writeCount).toBe(0);

    await session.flush();
    expect(backend.writeCount).toBe(1);
    expect(session.status).toBe('saved');
    expect(timers.pendingCount).toBe(0);
    expect(JSON.parse(backend.text).membership.items[0].name).toBe('変更1');
  });

  it('外での変更 → conflict、書かれない。その後の update でも書かれない。resolveConflict(overwrite) で書かれ、自動保存が戻る', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    backend.simulateExternalChange('external change');

    session.update(modifyDoc(doc1, '手元の変更'));
    await timers.advanceTime(1000);

    expect(session.status).toBe('conflict');
    expect(session.dirty).toBe(true);
    expect(backend.writeCount).toBe(0);

    // その後の update でも書かれない
    session.update(modifyDoc(doc1, '手元の変更2'));
    await timers.advanceTime(1000);
    expect(session.status).toBe('conflict');
    expect(backend.writeCount).toBe(0);

    // overwrite で解決
    await session.resolveConflict('overwrite');
    expect(backend.writeCount).toBe(1);
    expect(session.status).toBe('saved');
    expect(session.dirty).toBe(false);

    // 自動保存が復活しているか確認
    session.update(modifyDoc(doc1, '手元の変更3'));
    expect(session.status).toBe('pending');
    await timers.advanceTime(1000);
    expect(session.status).toBe('saved');
    expect(backend.writeCount).toBe(2);
  });

  it('resolveConflict(reload) が外の内容を返し、reset で saved に戻る', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    const externalDoc = modifyDoc(doc1, '外での変更データ');
    const externalText = serializeDocument(externalDoc);
    backend.simulateExternalChange(externalText);

    session.update(modifyDoc(doc1, '手元の変更'));
    await session.flush();
    expect(session.status).toBe('conflict');

    const reloaded = await session.resolveConflict('reload');
    expect(reloaded.text).toBe(externalText);
    expect(reloaded.lastModified).toBe(backend.lastModified);
    expect(session.status).toBe('conflict');

    session.reset(externalDoc, { lastModified: reloaded.lastModified });
    expect(session.status).toBe('saved');
    expect(session.dirty).toBe(false);
    expect(session.doc).toBe(externalDoc);
  });

  it('不変条件に違反する文書 → invalid、書かれない', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    const invalidDoc = {
      ...doc1,
      membership: {
        ...doc1.membership,
        items: [{ ...doc1.membership.items[0]!, id: 'invalid-id' }],
      },
    };

    session.update(invalidDoc);
    await timers.advanceTime(1000);

    expect(session.status).toBe('invalid');
    expect(session.dirty).toBe(true);
    expect(backend.writeCount).toBe(0);
  });

  it('write が例外 → error、次の update で再試行して saved', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    backend.throwOnWrite = new Error('Disk write failed');
    session.update(modifyDoc(doc1, '変更1'));
    await timers.advanceTime(1000);

    expect(session.status).toBe('error');
    expect(session.dirty).toBe(true);

    // 次の update で再試行
    session.update(modifyDoc(doc1, '変更2'));
    expect(session.status).toBe('pending');
    await timers.advanceTime(1000);

    expect(session.status).toBe('saved');
    expect(session.dirty).toBe(false);
    expect(backend.writeCount).toBe(1);
    expect(JSON.parse(backend.text).membership.items[0].name).toBe('変更2');
  });

  it('自動保存オフ → dirty、save() で書かれる。setAutosave(true) にすると待ちに入る', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: false,
      timers,
    });

    session.update(modifyDoc(doc1, '変更1'));
    expect(session.status).toBe('dirty');
    expect(session.dirty).toBe(true);
    await timers.advanceTime(2000);
    expect(backend.writeCount).toBe(0);

    await session.save();
    expect(session.status).toBe('saved');
    expect(backend.writeCount).toBe(1);

    session.update(modifyDoc(doc1, '変更2'));
    expect(session.status).toBe('dirty');

    session.setAutosave(true);
    expect(session.status).toBe('pending');
    await timers.advanceTime(1000);
    expect(session.status).toBe('saved');
    expect(backend.writeCount).toBe(2);
  });

  it('保存先なし（backend null）→ dirty、save() は何もしない。attach の後は書ける', async () => {
    const doc1 = createSampleDocument();
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend: null,
      doc: doc1,
      baseline: null,
      autosave: true,
      timers,
    });

    session.update(modifyDoc(doc1, '変更1'));
    expect(session.status).toBe('dirty');
    expect(session.dirty).toBe(true);

    await expect(session.save()).resolves.toBeUndefined();
    expect(session.status).toBe('dirty');

    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    session.attach(backend, { lastModified: 1000 });

    await session.save();
    expect(session.status).toBe('saved');
    expect(backend.writeCount).toBe(1);
  });

  it('canOverwrite false → 自動保存しない、save() で write が呼ばれる、stat の確認はしない', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    backend.canOverwrite = false;
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    session.update(modifyDoc(doc1, '変更1'));
    expect(session.status).toBe('dirty');
    await timers.advanceTime(2000);
    expect(backend.writeCount).toBe(0);

    backend.simulateExternalChange('external');
    await session.save();
    expect(backend.writeCount).toBe(1);
    expect(backend.statCount).toBe(0);
    expect(session.status).toBe('saved');
  });

  it('書いている途中の update → 書き終わってから、もう一度書く。2つの write が同時に走らない', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    let concurrentWrites = 0;
    let maxConcurrentWrites = 0;
    let resolveFirstWrite: (() => void) | null = null;
    const firstWriteGate = new Promise<void>((r) => {
      resolveFirstWrite = r;
    });

    const origWrite = backend.write.bind(backend);
    backend.write = async (text: string) => {
      concurrentWrites++;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
      if (backend.writeCount === 0) {
        await firstWriteGate;
      }
      try {
        return await origWrite(text);
      } finally {
        concurrentWrites--;
      }
    };

    session.update(modifyDoc(doc1, '変更1'));
    const firstAdvance = timers.advanceTime(1000);

    expect(session.status).toBe('saving');

    session.update(modifyDoc(doc1, '変更2'));

    resolveFirstWrite!();
    await firstAdvance;

    expect(session.status).toBe('saved');
    expect(backend.writeCount).toBe(2);
    expect(maxConcurrentWrites).toBe(1);
    expect(JSON.parse(backend.text).membership.items[0].name).toBe('変更2');
  });

  it('flush は自動保存が効くときだけ書く（オフのとき・書き出しのときは書かない）', async () => {
    const doc1 = createSampleDocument();
    const timers = new FakeTimers();

    const off = new FakeBackend(serializeDocument(doc1), 1000);
    const s1 = new DocumentSession({ backend: off, doc: doc1, baseline: { lastModified: 1000 }, autosave: false, timers });
    s1.update(modifyDoc(doc1, '変更'));
    await s1.flush();
    expect(off.writeCount).toBe(0);
    expect(s1.status).toBe('dirty');

    const download = new FakeBackend(serializeDocument(doc1), 1000);
    (download as unknown as { canOverwrite: boolean }).canOverwrite = false;
    const s2 = new DocumentSession({ backend: download, doc: doc1, baseline: { lastModified: 1000 }, autosave: true, timers });
    s2.update(modifyDoc(doc1, '変更'));
    await s2.flush();
    expect(download.writeCount).toBe(0);
  });

  it('onChange が呼ばれる。dispose の後はタイマーが走らない', async () => {
    const doc1 = createSampleDocument();
    const backend = new FakeBackend(serializeDocument(doc1), 1000);
    const timers = new FakeTimers();
    const session = new DocumentSession({
      backend,
      doc: doc1,
      baseline: { lastModified: 1000 },
      autosave: true,
      timers,
    });

    let changeCount = 0;
    const unsubscribe = session.onChange(() => {
      changeCount++;
    });

    session.update(modifyDoc(doc1, '変更1'));
    expect(changeCount).toBe(1);

    // pending → saving → saved
    await timers.advanceTime(1000);
    expect(changeCount).toBe(3);

    unsubscribe();
    session.update(modifyDoc(doc1, '変更2'));
    expect(changeCount).toBe(3);

    session.dispose();
    await timers.advanceTime(2000);
    expect(backend.writeCount).toBe(1);
  });
});
