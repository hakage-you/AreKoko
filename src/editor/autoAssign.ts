import type { ArekokoDocument, Id } from '../core/types';
import type { Relocation } from '../core/ops/common';
import { buildAreaTree } from '../core/indexes';
import { computeRegions, leafAt } from '../geometry/regions';
import { shapeCenter } from '../geometry/shape';
import { leafAreasOfKuukan } from '../core/places';
import { drawingOffset } from '../view/model';

export interface AutoAssignResult {
  doc: ArekokoDocument;
  relocations: Relocation[];
}

/**
 * クウカン内で描画とずれているモノ（描画の中心が置き場の外にあるもの）について、描画の中心がある分けていないエリアへ移した文書と、移り方を返す。
 * 文書を変えるかは呼び出し側が利用者に聞いて決める（設計 3章 原則2、TRS 付録B I-15）。
 */
export function autoAssignItemPlaces(
  doc: ArekokoDocument,
  kuukanId: Id,
): AutoAssignResult {
  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukanId);
  if (!kd) {
    return { doc, relocations: [] };
  }

  const tree = buildAreaTree(doc, kuukanId);
  const nodeIds = new Set<Id>([kuukanId, ...[...tree.children.values()].flat()]);
  const partitions = doc.drawing.partitions.filter(p => nodeIds.has(p.area));

  const regionsRes = computeRegions(kd.outline, tree, partitions);
  if (!regionsRes.ok) {
    return { doc, relocations: [] };
  }

  const leaves = leafAreasOfKuukan(doc, kuukanId);
  const leafIdSet = new Set(leaves.map(a => a.id));

  // このクウカン自身、またはこのクウカン内のエリアに置かれているモノ
  const areaIds = new Set(doc.membership.areas.filter(a => a.kuukan === kuukanId).map(a => a.id));
  const validPlaces = new Set<Id>([kuukanId, ...areaIds]);

  const drawingMap = new Map(doc.drawing.items.map(d => [d.item, d]));
  const relocMap = new Map<string, Relocation>();

  let hasChanges = false;
  const newItems = doc.membership.items.map(item => {
    // 描画を持たないモノ、またはこのクウカン外のモノは対象外
    if (!validPlaces.has(item.place) || !drawingMap.has(item.id)) {
      return item;
    }
    // 描画が置き場の中にあるモノ（ずれていないモノ）は対象外。わざとクウカンそのものや中を分けたエリアに置いたモノを動かさない
    const off = drawingOffset(doc, item.id);
    if (!off || off.kind === 'ok') {
      return item;
    }

    const drawing = drawingMap.get(item.id)!;
    const center = shapeCenter(drawing.shape);
    const targetNode = leafAt(regionsRes.regions, tree, center);

    if (!targetNode) {
      return item;
    }

    // 分けていないエリアがある場合は分けていないエリアへ、分けていないエリアがなければクウカン自身へ
    let destination: Id = targetNode;
    if (destination === kuukanId && leaves.length > 0) {
      // 中心点がエリア境界などでクウカン直下と判定された場合は、既存のエリアが有効な葉であれば維持
      if (leafIdSet.has(item.place)) {
        destination = item.place;
      }
    }

    if (item.place === destination) {
      return item;
    }

    hasChanges = true;
    const key = `${item.place}\0${destination}`;
    let r = relocMap.get(key);
    if (!r) {
      r = { from: item.place, to: destination, items: [] };
      relocMap.set(key, r);
    }
    r.items.push(item.id);

    return {
      ...item,
      place: destination,
    };
  });

  if (!hasChanges) {
    return { doc, relocations: [] };
  }

  return {
    doc: {
      ...doc,
      membership: {
        ...doc.membership,
        items: newItems,
      },
    },
    relocations: Array.from(relocMap.values()),
  };
}
