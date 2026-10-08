// キーの組み合わせの表記。Mac は ⌘、それ以外は Ctrl（App.svelte の keydown は両方を受け付ける）。

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const UNDO_KEYS = isMac ? '⌘Z' : 'Ctrl+Z';
export const REDO_KEYS = isMac ? '⇧⌘Z' : 'Ctrl+Y';
