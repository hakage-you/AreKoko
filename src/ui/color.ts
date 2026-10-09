/**
 * カテゴリ・タグのラベルカラー用ユーティリティ
 */

export interface PresetColor {
  id: string;
  name: string;
  hex: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { id: 'blue', name: 'ブルー', hex: '#0284c7' },
  { id: 'teal', name: 'ティール', hex: '#0d9488' },
  { id: 'green', name: 'グリーン', hex: '#16a34a' },
  { id: 'amber', name: 'アンバー', hex: '#d97706' },
  { id: 'orange', name: 'オレンジ', hex: '#ea580c' },
  { id: 'rose', name: 'ローズ', hex: '#e11d48' },
  { id: 'purple', name: 'パープル', hex: '#9333ea' },
  { id: 'indigo', name: 'インディゴ', hex: '#4f46e5' },
  { id: 'slate', name: 'スレート', hex: '#64748b' },
];

/**
 * カラーコードから、ライト・ダーク両対応のバッジ用CSSインラインスタイルを生成する。
 */
export function getBadgeStyle(color?: string | null): string {
  if (!color) return '';
  return `background: color-mix(in srgb, ${color} 15%, transparent); color: color-mix(in srgb, ${color} 88%, var(--text)); border: 1px solid color-mix(in srgb, ${color} 35%, transparent);`;
}
