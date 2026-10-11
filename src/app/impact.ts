// 統一規則で移るモノの影響を、確認のダイアログに出す文にする（詳細設計UI 5.3）。

import type { ArekokoDocument, Id } from '../core/types';
import type { Relocation } from '../core/ops/common';
import { displayName, formatPlacePath } from '../core/places';

/** 移るモノの名前をいくつまで並べるか（それより多いときは「ほか〇件」）。 */
const MAX_NAMES = 5;

/**
 * 「Room A › 棚A1 › 段2 から 2件（ペン、箱A）→ Room A › 棚A1」の並び。
 * どのモノが移るかを消す前に見せる（TRS 付録B I-13）。
 */
export function describeRelocations(doc: ArekokoDocument, relocations: Relocation[]): string[] {
  return relocations.map(
    r => `${formatPlacePath(doc, r.from)} から ${r.items.length}件（${itemNames(doc, r.items)}）→ ${formatPlacePath(doc, r.to)}`,
  );
}

function itemNames(doc: ArekokoDocument, items: Id[]): string {
  const shown = items.slice(0, MAX_NAMES).map(id => displayName(doc, id));
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join('、')} ほか${rest}件` : shown.join('、');
}
