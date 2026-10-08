// クウカンビューの見せ方の計算。詳細設計 4章。

import type { ArekokoDocument, Id, Item, Marker, Point } from '../core/types';
import { NIL_ID, UNSET_NAME } from '../core/constants';
import { buildAreaTree, getIndexes } from '../core/indexes';
import { displayName, kuukanOfPlace } from '../core/places';
import { notAPlaceMarkerAt } from '../core/ops/itemDrawings';
import { shapeCenter } from '../geometry/shape';
import { computeRegions, leafAt } from '../geometry/regions';
import { locatePoint } from '../geometry/polygon';
import { searchItems } from '../search/search';

export type Offset =
  | { kind: 'ok' }
  | { kind: 'off'; drawnIn: Id | null };

export interface QuickResult {
  /** 当てはまるモノのうち、このクウカンに直接あるもの。 */
  direct: Set<Id>;
  /** このクウカンに直接ある収納ごとの、中（入れ子を含む）で当てはまる件数。0 のものは入れない。 */
  insideStorage: Map<Id, number>;
  /** 置き場ごとの当てはまる件数（直接＋そこにある収納の中）。図のハイライトと件数に使う。キーはクウカンそのもの、またはエリア。 */
  perPlace: Map<Id, number>;
}

/**
 * エリア（またはクウカン）とその子孫のエリアに直接あるモノを返す。
 * 並び順：置き場の順（クウカンそのもの → エリアの木を深さ優先で、children の順）、同じ置き場の中は名前順（localeCompare 'ja'）。
 * 中の収納の中身は入れない。
 */
export function itemsInScope(
  doc: ArekokoDocument,
  kuukan: Id,
  area: Id | null,
): Item[] {
  const tree = buildAreaTree(doc, kuukan);
  const places: Id[] = [];

  if (area === null) {
    places.push(kuukan);
    function dfsAll(curr: Id) {
      const kids = tree.children.get(curr) ?? [];
      for (const kid of kids) {
        places.push(kid);
        dfsAll(kid);
      }
    }
    dfsAll(kuukan);
  } else {
    places.push(area);
    function dfsSub(curr: Id) {
      const kids = tree.children.get(curr) ?? [];
      for (const kid of kids) {
        places.push(kid);
        dfsSub(kid);
      }
    }
    dfsSub(area);
  }

  const indexes = getIndexes(doc);
  const result: Item[] = [];

  for (const placeId of places) {
    const list = indexes.itemsByPlace.get(placeId);
    if (list && list.length > 0) {
      const sorted = [...list].sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, 'ja');
        if (cmp !== 0) {
          return cmp;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      result.push(...sorted);
    }
  }

  return result;
}

/**
 * クウカンの中の置き場（クウカンそのもの＋全エリア）に直接あるモノを返す。中の収納の中身は入れない。
 */
export function itemsInKuukan(doc: ArekokoDocument, kuukan: Id): Item[] {
  return itemsInScope(doc, kuukan, null);
}

/**
 * 描画していないモノの件数を返す。
 * キーは置き場のID（クウカンそのもの、またはエリア）。数えるのは直接置かれたものだけ。
 */
export function undrawnCounts(
  doc: ArekokoDocument,
  kuukan: Id,
): Map<Id, number> {
  const counts = new Map<Id, number>();
  const indexes = getIndexes(doc);

  const validPlaces = new Set<Id>();
  validPlaces.add(kuukan);
  for (const a of doc.membership.areas) {
    if (a.kuukan === kuukan) {
      validPlaces.add(a.id);
    }
  }

  for (const placeId of validPlaces) {
    const items = indexes.itemsByPlace.get(placeId);
    if (!items) {
      continue;
    }
    let undrawn = 0;
    for (const it of items) {
      if (!indexes.itemDrawingOf.has(it.id)) {
        undrawn++;
      }
    }
    if (undrawn > 0) {
      counts.set(placeId, undrawn);
    }
  }

  return counts;
}

/**
 * 描画のずれを判定する。
 * モノに描画がないか、置き場のクウカンに描画がなければ null。
 */
export function drawingOffset(
  doc: ArekokoDocument,
  item: Id,
): Offset | null {
  const indexes = getIndexes(doc);
  const itemObj = indexes.itemById.get(item);
  if (!itemObj) {
    return null;
  }

  const drawing = indexes.itemDrawingOf.get(item);
  if (!drawing) {
    return null;
  }

  const kuukanId = kuukanOfPlace(doc, itemObj.place);
  if (kuukanId === NIL_ID) {
    return null;
  }

  const kd = indexes.kuukanDrawingOf.get(kuukanId);
  if (!kd) {
    return null;
  }

  const tree = buildAreaTree(doc, kuukanId);
  const nodeIds = new Set<Id>([kuukanId]);
  for (const childIds of tree.children.values()) {
    for (const childId of childIds) {
      nodeIds.add(childId);
    }
  }
  const partitions = doc.drawing.partitions.filter(p => nodeIds.has(p.area));
  const regRes = computeRegions(kd.outline, tree, partitions);
  if (!regRes.ok) {
    return null;
  }

  const center = shapeCenter(drawing.shape);
  const regions = regRes.regions;

  const placePoly = regions.get(itemObj.place);
  if (placePoly) {
    const loc = locatePoint(placePoly, center);
    if (loc === 'inside' || loc === 'boundary') {
      return { kind: 'ok' };
    }
  }

  let drawnIn = leafAt(regions, tree, center);
  if (drawnIn === null) {
    // 仕切りの線の上では leafAt は葉を返さない。外形の内側なら、その点が辺の上にある葉を採る
    const rootPoly = regions.get(kuukanId);
    if (rootPoly && locatePoint(rootPoly, center) !== 'outside') {
      for (const [id, poly] of regions) {
        if (id === kuukanId || (tree.children.get(id)?.length ?? 0) > 0) continue;
        if (locatePoint(poly, center) !== 'outside') {
          drawnIn = id;
          break;
        }
      }
    }
  }
  return { kind: 'off', drawnIn };
}

/**
 * ずれの説明文を返す。
 * 例：「所属：段1（描画は段2の上にあります）」「所属：段1（描画はクウカンの外にあります）」
 */
export function offsetText(
  doc: ArekokoDocument,
  item: Id,
  off: Offset,
): string {
  if (off.kind === 'ok') {
    return '';
  }

  const itemObj = doc.membership.items.find(it => it.id === item);
  const placeName = itemObj ? displayName(doc, itemObj.place) : '';

  if (off.drawnIn === null) {
    return `所属：${placeName}（描画はクウカンの外にあります）`;
  }

  const drawnInName = displayName(doc, off.drawnIn);
  return `所属：${placeName}（描画は${drawnInName}の上にあります）`;
}

/**
 * 置き場にしないマーカーの上かを判定する。
 * 中心が図形の内側か辺の上なら上とみなす（点のマーカーは対象外）。
 */
export function onNotAPlace(
  doc: ArekokoDocument,
  kuukan: Id,
  p: Point,
): Marker | null {
  return notAPlaceMarkerAt(doc, kuukan, p);
}

/**
 * 簡易検索の集計を行う。
 */
export function quickSearch(
  doc: ArekokoDocument,
  kuukan: Id,
  text: string,
): QuickResult {
  const direct = new Set<Id>();
  const insideStorage = new Map<Id, number>();
  const perPlace = new Map<Id, number>();

  if (!text || text.trim() === '') {
    return { direct, insideStorage, perPlace };
  }

  const matched = searchItems(doc, { text, place: kuukan });
  if (matched.length === 0) {
    return { direct, insideStorage, perPlace };
  }

  const indexes = getIndexes(doc);

  const kuukanPlaces = new Set<Id>();
  kuukanPlaces.add(kuukan);
  for (const a of doc.membership.areas) {
    if (a.kuukan === kuukan) {
      kuukanPlaces.add(a.id);
    }
  }

  for (const item of matched) {
    if (kuukanPlaces.has(item.place)) {
      direct.add(item.id);
      perPlace.set(item.place, (perPlace.get(item.place) ?? 0) + 1);
    } else {
      let currPlace = item.place;
      let topStorageItem: Item | null = null;
      const visited = new Set<Id>();

      while (currPlace && !visited.has(currPlace)) {
        visited.add(currPlace);
        const kId = kuukanOfPlace(doc, currPlace);
        if (kId === kuukan) {
          break;
        }
        const kObj = indexes.kuukanById.get(kId);
        if (!kObj || kObj.owner === null) {
          break;
        }
        const owner = indexes.itemById.get(kObj.owner);
        if (!owner) {
          break;
        }
        const ownerKuukanId = kuukanOfPlace(doc, owner.place);
        if (ownerKuukanId === kuukan) {
          topStorageItem = owner;
          break;
        }
        currPlace = owner.place;
      }

      if (topStorageItem) {
        insideStorage.set(
          topStorageItem.id,
          (insideStorage.get(topStorageItem.id) ?? 0) + 1,
        );
        perPlace.set(
          topStorageItem.place,
          (perPlace.get(topStorageItem.place) ?? 0) + 1,
        );
      }
    }
  }

  return { direct, insideStorage, perPlace };
}

/**
 * 経路：外側のクウカンから順に並べた一覧を返す。
 * 収納のクウカンなら、持ち主のモノの置き場をたどる。
 * 各要素の via は、その要素のクウカンの中で次の収納が置かれている置き場。最後の要素の via は null。
 */
export function kuukanTrail(
  doc: ArekokoDocument,
  kuukan: Id,
): { kuukan: Id; name: string; via: Id | null }[] {
  if (kuukan === NIL_ID) {
    return [{ kuukan: NIL_ID, name: UNSET_NAME, via: null }];
  }

  const indexes = getIndexes(doc);
  const targetKuukan = indexes.kuukanById.get(kuukan);
  if (!targetKuukan) {
    return [];
  }

  const chain: Array<{ kuukanId: Id; via: Id | null }> = [];
  const visited = new Set<Id>();

  let currKuukan: typeof targetKuukan | undefined = targetKuukan;
  let nextVia: Id | null = null;

  while (currKuukan && !visited.has(currKuukan.id)) {
    visited.add(currKuukan.id);
    chain.unshift({ kuukanId: currKuukan.id, via: nextVia });

    if (currKuukan.owner !== null) {
      const ownerItem = indexes.itemById.get(currKuukan.owner);
      if (ownerItem) {
        nextVia = ownerItem.place;
        const parentKuukanId = kuukanOfPlace(doc, ownerItem.place);
        currKuukan = indexes.kuukanById.get(parentKuukanId);
        continue;
      }
    }
    break;
  }

  return chain.map(step => ({
    kuukan: step.kuukanId,
    name: displayName(doc, step.kuukanId),
    via: step.via,
  }));
}
