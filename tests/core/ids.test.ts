import { describe, it, expect } from 'vitest';
import {
  newId,
  createIdGenerator,
  isUuidV7,
  timestampOfV7,
} from '../../src/core/ids';

describe('ids', () => {
  it('形式（newId が isUuidV7 を通る）', () => {
    const id = newId();
    expect(isUuidV7(id)).toBe(true);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('同じミリ秒で1万個生成して厳密に昇順・重複なし', () => {
    const fixedNow = 1710000000000;
    const gen = createIdGenerator({ now: () => fixedNow });
    const count = 10000;
    const ids = new Array<string>(count);

    for (let i = 0; i < count; i++) {
      ids[i] = gen();
    }

    // 重複なし
    const unique = new Set(ids);
    expect(unique.size).toBe(count);

    // 厳密に昇順（すべての i で ids[i - 1] < ids[i]）かつすべて isUuidV7 を通る
    for (let i = 0; i < count; i++) {
      const current = ids[i]!;
      expect(isUuidV7(current)).toBe(true);
      if (i > 0) {
        const prev = ids[i - 1]!;
        expect(prev < current).toBe(true);
      }
    }

    // 先頭のタイムスタンプは固定時刻と一致し、あふれた後は仮想的に進んでいる
    expect(timestampOfV7(ids[0]!)).toBe(fixedNow);
    expect(timestampOfV7(ids[5000]!)).toBeGreaterThan(fixedNow);
  });

  it('timestampOfV7 で時刻が戻る', () => {
    const targetTime = 1712345678901;
    const gen = createIdGenerator({ now: () => targetTime });
    const id = gen();

    expect(timestampOfV7(id)).toBe(targetTime);
  });

  it('timestampOfV7 は不正な形式に対して例外を投げる', () => {
    expect(() => timestampOfV7('not-a-uuid')).toThrow();
    expect(() => timestampOfV7('00000000-0000-0000-0000-000000000000')).toThrow();
    expect(() => timestampOfV7('018d3a5b-7c12-4000-8000-000000000000')).toThrow();
  });

  it('時計が戻ったときも昇順', () => {
    let currentTime = 2000;
    const gen = createIdGenerator({ now: () => currentTime });

    const id1 = gen(); // 2000
    currentTime = 1999; // 1ms 戻る
    const id2 = gen();
    currentTime = 1000; // さらに大きく戻る
    const id3 = gen();
    currentTime = 2001; // 再び進む
    const id4 = gen();
    currentTime = 1500; // 再度戻る
    const id5 = gen();

    expect(id1 < id2).toBe(true);
    expect(id2 < id3).toBe(true);
    expect(id3 < id4).toBe(true);
    expect(id4 < id5).toBe(true);

    expect(isUuidV7(id1)).toBe(true);
    expect(isUuidV7(id2)).toBe(true);
    expect(isUuidV7(id3)).toBe(true);
    expect(isUuidV7(id4)).toBe(true);
    expect(isUuidV7(id5)).toBe(true);
  });

  it('isUuidV7 が v4・大文字・Nil を拒む', () => {
    // v4
    expect(isUuidV7('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);

    // 大文字
    expect(isUuidV7('018D3A5B-7C12-7000-8000-000000000000')).toBe(false);
    expect(isUuidV7('018d3a5b-7c12-7000-8000-00000000000A')).toBe(false);

    // Nil UUID
    expect(isUuidV7('00000000-0000-0000-0000-000000000000')).toBe(false);

    // 不正なバリアント
    expect(isUuidV7('018d3a5b-7c12-7000-7000-000000000000')).toBe(false);
    expect(isUuidV7('018d3a5b-7c12-7000-c000-000000000000')).toBe(false);

    // 空文字列・ハイフンなし
    expect(isUuidV7('')).toBe(false);
    expect(isUuidV7('018d3a5b7c1270008000000000000000')).toBe(false);
  });
});
