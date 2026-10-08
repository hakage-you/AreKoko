// 照らし合わせのための正規化。詳細設計UI 3.1。

/**
 * 照らし合わせ用の正規化文字列を作成する。
 * 1. NFKC 正規化（全角英数・半角カナ・全角空白などを正規化）
 * 2. カタカナ（U+30A1〜U+30F6）をひらがな（-0x60）に変換
 * 3. 小文字化
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
}
