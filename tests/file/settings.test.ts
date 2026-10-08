import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/file/settings';

class FakeStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    throw new Error('Storage error: length');
  }

  clear(): void {
    throw new Error('Storage error: clear');
  }

  getItem(_key: string): string | null {
    throw new Error('Storage error: getItem');
  }

  key(_index: number): string | null {
    throw new Error('Storage error: key');
  }

  removeItem(_key: string): void {
    throw new Error('Storage error: removeItem');
  }

  setItem(_key: string, _value: string): void {
    throw new Error('Storage error: setItem');
  }
}

describe('file/settings', () => {
  it('初期値を取得できる', () => {
    const storage = new FakeStorage();
    const settings = loadSettings(storage);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.autosave).toBe(true);
  });

  it('保存と読み込みができる', () => {
    const storage = new FakeStorage();
    saveSettings({ autosave: false }, storage);
    const loaded = loadSettings(storage);
    expect(loaded).toEqual({ autosave: false });

    saveSettings({ autosave: true }, storage);
    const loaded2 = loadSettings(storage);
    expect(loaded2).toEqual({ autosave: true });
  });

  it('壊れた JSON や不正な形式の場合は初期値を返す', () => {
    const storage = new FakeStorage();
    storage.setItem('arekoko.settings', 'invalid json{');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);

    storage.setItem('arekoko.settings', JSON.stringify({ autosave: 'not-a-boolean' }));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);

    storage.setItem('arekoko.settings', JSON.stringify(null));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('例外を投げる Storage でも例外を投げず初期値で動作する', () => {
    const throwing = new ThrowingStorage();
    expect(() => loadSettings(throwing)).not.toThrow();
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);

    expect(() => saveSettings({ autosave: false }, throwing)).not.toThrow();
  });
});
