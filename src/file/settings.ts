// アプリの設定（localStorage）。
// 詳細設計UI 2.4、設計 8.7、原則7。

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  autosave: boolean;
  theme?: ThemeMode;
}

const SETTINGS_KEY = 'arekoko.settings';

export const DEFAULT_SETTINGS: AppSettings = {
  autosave: true,
  theme: 'system',
};

function resolveStorage(storage?: Storage): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    // プライベートブラウジング等で localStorage アクセス自体が拒否される場合
  }
  return null;
}

/**
 * アプリ設定を読み込む。失敗した場合は初期値を返す。
 */
export function loadSettings(storage?: Storage): AppSettings {
  try {
    const s = resolveStorage(storage);
    if (!s) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = s.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.autosave === 'boolean'
    ) {
      const theme: ThemeMode =
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : 'system';
      return { autosave: parsed.autosave, theme };
    }
    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * アプリ設定を保存する。失敗しても例外を投げない。
 */
export function saveSettings(s: AppSettings, storage?: Storage): void {
  try {
    const target = resolveStorage(storage);
    if (!target) {
      return;
    }
    target.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 容量超過やアクセス制限等の失敗時も何もしない
  }
}
