// 組み込みSVGアイコンの定義。クウカンのアイコン設定で使用。
import type { BuiltinIconId } from '../core/types';

export interface BuiltinIconItem {
  id: BuiltinIconId;
  label: string;
  path: string;
}

/** 組み込みSVGアイコンの一覧（24x24 viewBox, stroke-width="2", fill="none"） */
export const BUILTIN_ICON_ITEMS: readonly BuiltinIconItem[] = [
  {
    id: 'home',
    label: '部屋・家',
    path: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  },
  {
    id: 'shelf',
    label: '棚・ラック',
    path: 'M4 3v18 M20 3v18 M4 7h16 M4 12h16 M4 17h16',
  },
  {
    id: 'box',
    label: '箱・ケース',
    path: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
  },
  {
    id: 'drawer',
    label: '引き出し',
    path: 'M3 3h18v18H3z M3 9h18 M3 15h18 M10 6h4 M10 12h4 M10 18h4',
  },
  {
    id: 'closet',
    label: 'クローゼット',
    path: 'M4 3h16v18H4z M12 3v18 M9 11v3 M15 11v3 M7 21v2 M17 21v2',
  },
  {
    id: 'kitchen',
    label: 'キッチン・食器',
    path: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z M21 15v7',
  },
  {
    id: 'tool',
    label: '工具・物置',
    path: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  },
  {
    id: 'book',
    label: '本・書類',
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  },
] as const;

const ICON_MAP = new Map<BuiltinIconId, BuiltinIconItem>(
  BUILTIN_ICON_ITEMS.map((item) => [item.id, item]),
);

/** 組み込みアイコンIDからアイコン情報を取得 */
export function getBuiltinIcon(id: BuiltinIconId | undefined | null): BuiltinIconItem | undefined {
  if (!id) return undefined;
  return ICON_MAP.get(id);
}
