/**
 * カテゴリ・タグのラベルカラー用ユーティリティ
 */

import { isLabelColor } from '../core/constants';

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
  if (!isLabelColor(color)) return ''; // #rrggbb でない値はスタイルに入れない（既定の色で出す）
  return `background: color-mix(in srgb, ${color} 15%, transparent); color: color-mix(in srgb, ${color} 88%, var(--text)); border: 1px solid color-mix(in srgb, ${color} 35%, transparent);`;
}

/** 色の見本（管理画面の色のボタン）のスタイル。#rrggbb でない値は入れない。 */
export function getSwatchStyle(color?: string | null): string {
  if (!isLabelColor(color)) return '';
  return `background-color: ${color}; border-color: ${color};`;
}

/**
 * sRGB 16進数カラーコード（#rrggbb）の相対輝度（0〜1）を算出する（WCAG 2.1）。
 */
export function getRelativeLuminance(hex: string): number {
  if (!isLabelColor(hex)) return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const [lr, lg, lb] = [r, g, b].map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
}

/**
 * 2つのカラーコード（#rrggbb）間のWCAGコントラスト比（1〜21）を算出する。
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 背景色（#rrggbb）に対する高コントラストな文字色（白 または 黒）を返す。
 * WCAG 2.1 相対輝度に基づき、白（#ffffff）と黒（#0f172a）のうちコントラスト比が高い方を自動選定する。
 */
export function getContrastTextColor(hexBg: string): string {
  if (!isLabelColor(hexBg)) return '#ffffff';
  const white = '#ffffff';
  const black = '#0f172a';
  const crWhite = getContrastRatio(hexBg, white);
  const crBlack = getContrastRatio(hexBg, black);
  return crBlack > crWhite ? black : white;
}

/**
 * クウカン名から一文字アイコン用の文字を抽出する。
 */
export function getKuukanInitial(name: string | null | undefined): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const first = Array.from(trimmed)[0] || '?';
  return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
}

/**
 * クウカンアイコンのインラインCSSスタイルを生成する。
 */
export function getKuukanIconStyle(icon?: { bg?: string; color?: string } | null): string {
  if (!icon) return '';
  const styles: string[] = [];
  if (isLabelColor(icon.bg)) {
    styles.push(`background-color: ${icon.bg}`);
    if (!isLabelColor(icon.color)) {
      styles.push(`color: ${getContrastTextColor(icon.bg)}`);
    }
  }
  if (isLabelColor(icon.color)) {
    styles.push(`color: ${icon.color}`);
  }
  return styles.join('; ');
}
