// 統一規則によるモノの移動。設計 7.8、詳細設計 8.1、付録A.12。

import type { Id, ArekokoDocument, Item } from './types';
import { touch, type OpContext, type Relocation } from './ops/common';
import { kuukanOfPlace } from './places';

/**
 * なくなる置き場から行き先への対応に従ってモノを移す。
 * 行き先がさらに mapping のキーなら、キーでないところまで辿る。
 * 別のクウカンへ移るモノの描画は外し、移ったモノの updatedAt を更新する。
 */
export function relocateItems(
  doc: ArekokoDocument,
  mapping: Map<Id, Id>,
  ctx: OpContext,
): { doc: ArekokoDocument; moved: Id[]; relocations: Relocation[] } {
  if (mapping.size === 0) {
    return { doc, moved: [], relocations: [] };
  }

  // 循環を防ぎつつ、最終的な行き先を引く
  function resolveDestination(start: Id): Id {
    let current = start;
    const visited = new Set<Id>();
    while (mapping.has(current)) {
      visited.add(current);
      const next = mapping.get(current)!;
      if (visited.has(next)) {
        break;
      }
      current = next;
    }
    return current;
  }

  const moved: Id[] = [];
  const droppedDrawingItemIds = new Set<Id>();
  const relocationMap = new Map<string, Relocation>();
  const updatedItemsMap = new Map<Id, Item>();

  for (const item of doc.membership.items) {
    if (!mapping.has(item.place)) {
      continue;
    }

    const finalDest = resolveDestination(item.place);
    if (finalDest === item.place) {
      continue;
    }

    const oldPlace = item.place;
    const oldKuukan = kuukanOfPlace(doc, oldPlace);
    const newKuukan = kuukanOfPlace(doc, finalDest);

    moved.push(item.id);
    if (oldKuukan !== newKuukan) {
      droppedDrawingItemIds.add(item.id);
    }

    const updatedItem = touch({ ...item, place: finalDest }, ctx);
    updatedItemsMap.set(item.id, updatedItem);

    const relocKey = `${oldPlace}\0${finalDest}`;
    let reloc = relocationMap.get(relocKey);
    if (!reloc) {
      reloc = { from: oldPlace, to: finalDest, items: [] };
      relocationMap.set(relocKey, reloc);
    }
    reloc.items.push(item.id);
  }

  if (moved.length === 0) {
    return { doc, moved: [], relocations: [] };
  }

  const newItems = doc.membership.items.map(item => updatedItemsMap.get(item.id) ?? item);
  const newDrawingItems =
    droppedDrawingItemIds.size > 0
      ? doc.drawing.items.filter(d => !droppedDrawingItemIds.has(d.item))
      : doc.drawing.items;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
    },
    drawing: {
      ...doc.drawing,
      items: newDrawingItems,
    },
  };

  return {
    doc: newDoc,
    moved,
    relocations: Array.from(relocationMap.values()),
  };
}

/** クウカンとそのエリアを、置き場としての対応（→ destination）にする。 */
function kuukanPlaceMapping(doc: ArekokoDocument, kuukan: Id, destination: Id): Map<Id, Id> {
  const mapping = new Map<Id, Id>([[kuukan, destination]]);
  for (const a of doc.membership.areas) {
    if (a.kuukan === kuukan) mapping.set(a.id, destination);
  }
  return mapping;
}

/**
 * クウカンを、エリア・描画・仕切り・マーカーごと消し、中身を destination へ移す（統一規則）。
 * 収納のモノの削除、収納設定の削除、どこにも置かれていないクウカンの削除で共通に使う。
 */
export function removeKuukan(
  doc: ArekokoDocument,
  kuukan: Id,
  destination: Id,
  ctx: OpContext,
): { doc: ArekokoDocument; moved: Id[]; relocations: Relocation[] } {
  const mapping = kuukanPlaceMapping(doc, kuukan, destination);
  const result = relocateItems(doc, mapping, ctx);
  const d = result.doc;
  return {
    ...result,
    doc: {
      ...d,
      membership: {
        ...d.membership,
        kuukans: d.membership.kuukans.filter(k => k.id !== kuukan),
        areas: d.membership.areas.filter(a => a.kuukan !== kuukan),
      },
      drawing: {
        ...d.drawing,
        kuukans: d.drawing.kuukans.filter(kd => kd.kuukan !== kuukan),
        partitions: d.drawing.partitions.filter(p => !mapping.has(p.area)),
        markers: d.drawing.markers.filter(m => m.kuukan !== kuukan),
      },
    },
  };
}

/** removeKuukan で移るモノの一覧（文書は変えない）。 */
export function planRemoveKuukan(doc: ArekokoDocument, kuukan: Id, destination: Id): Relocation[] {
  const mapping = kuukanPlaceMapping(doc, kuukan, destination);
  const byFrom = new Map<Id, Relocation>();
  for (const item of doc.membership.items) {
    if (!mapping.has(item.place)) continue;
    let r = byFrom.get(item.place);
    if (!r) {
      r = { from: item.place, to: destination, items: [] };
      byFrom.set(item.place, r);
    }
    r.items.push(item.id);
  }
  return Array.from(byFrom.values());
}
