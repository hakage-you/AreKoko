// 置き場の計算。詳細設計 2.5, 7.2、付録A.8。

import { NAMELESS_NAME, NIL_ID, UNSET_NAME } from './constants';
import { buildAreaTree, getIndexes } from './indexes';
import type { Area, ArekokoDocument, Id, Item } from './types';

export interface PathStep {
  id: Id;
  kind: 'kuukan' | 'area' | 'item';
  name: string;
}

/**
 * 要素の表示名を返す（詳細設計 2.5）。
 */
export function displayName(doc: ArekokoDocument, id: Id): string {
  if (id === NIL_ID) {
    return UNSET_NAME;
  }
  const indexes = getIndexes(doc);
  const kuukan = indexes.kuukanById.get(id);
  if (kuukan) {
    if (kuukan.id === NIL_ID) {
      return UNSET_NAME;
    }
    if (kuukan.owner !== null) {
      const ownerItem = indexes.itemById.get(kuukan.owner);
      if (ownerItem) {
        return ownerItem.name;
      }
      return kuukan.name ?? NAMELESS_NAME;
    }
    return kuukan.name ?? NAMELESS_NAME;
  }

  const area = indexes.areaById.get(id);
  if (area) {
    return area.name;
  }

  const item = indexes.itemById.get(id);
  if (item) {
    return item.name;
  }

  const category = indexes.categoryById.get(id);
  if (category) {
    return category.name;
  }

  const tag = indexes.tagById.get(id);
  if (tag) {
    return tag.name;
  }

  const marker = indexes.markerById.get(id);
  if (marker) {
    return marker.name;
  }

  return '';
}

/**
 * 置き場が直接属するクウカンのIDを返す。
 */
export function kuukanOfPlace(doc: ArekokoDocument, place: Id): Id {
  if (place === NIL_ID) {
    return NIL_ID;
  }
  const indexes = getIndexes(doc);
  if (indexes.kuukanById.has(place)) {
    return place;
  }
  const area = indexes.areaById.get(place);
  if (area) {
    return area.kuukan;
  }
  return NIL_ID;
}

/**
 * 最も外側のクウカンから置き場までの経路を返す。
 * 収納クウカンは持ち主のモノ（kind: 'item'）として表し、その前にモノの置き場までの経路を繋ぐ。
 */
export function placePath(doc: ArekokoDocument, place: Id): PathStep[] {
  if (place === NIL_ID) {
    return [{ id: NIL_ID, kind: 'kuukan', name: UNSET_NAME }];
  }

  const indexes = getIndexes(doc);
  const visited = new Set<Id>();

  function resolvePath(currentPlace: Id): PathStep[] {
    if (visited.has(currentPlace)) {
      return [];
    }
    visited.add(currentPlace);

    if (currentPlace === NIL_ID) {
      return [{ id: NIL_ID, kind: 'kuukan', name: UNSET_NAME }];
    }

    const area = indexes.areaById.get(currentPlace);
    if (area) {
      const areaSteps: PathStep[] = [];
      let currArea: Area | undefined = area;
      const visitedAreas = new Set<Id>();

      while (currArea && !visitedAreas.has(currArea.id)) {
        visitedAreas.add(currArea.id);
        areaSteps.unshift({
          id: currArea.id,
          kind: 'area',
          name: currArea.name,
        });
        if (currArea.parent !== null) {
          currArea = indexes.areaById.get(currArea.parent);
        } else {
          break;
        }
      }

      const kuukanSteps = resolveKuukanPath(area.kuukan);
      return [...kuukanSteps, ...areaSteps];
    }

    const kuukan = indexes.kuukanById.get(currentPlace);
    if (kuukan) {
      return resolveKuukanPath(kuukan.id);
    }

    return [];
  }

  function resolveKuukanPath(kuukanId: Id): PathStep[] {
    if (kuukanId === NIL_ID) {
      return [{ id: NIL_ID, kind: 'kuukan', name: UNSET_NAME }];
    }
    const kuukan = indexes.kuukanById.get(kuukanId);
    if (!kuukan) {
      return [];
    }

    if (kuukan.owner !== null) {
      const ownerItem = indexes.itemById.get(kuukan.owner);
      if (ownerItem) {
        const parentPath = resolvePath(ownerItem.place);
        const itemStep: PathStep = {
          id: ownerItem.id,
          kind: 'item',
          name: ownerItem.name,
        };
        return [...parentPath, itemStep];
      }
      return [{ id: kuukan.id, kind: 'kuukan', name: displayName(doc, kuukan.id) }];
    }

    return [{ id: kuukan.id, kind: 'kuukan', name: displayName(doc, kuukan.id) }];
  }

  return resolvePath(place);
}

/**
 * 置き場経路を ' › ' で連結した文字列を返す。
 */
export function formatPlacePath(doc: ArekokoDocument, place: Id): string {
  return placePath(doc, place)
    .map(step => step.name)
    .join(' › ');
}

/**
 * エリアとそのすべての子孫エリアのIDを返す。
 */
export function areaSubtree(doc: ArekokoDocument, area: Id): Id[] {
  const indexes = getIndexes(doc);
  const result: Id[] = [area];
  const queue: Id[] = [area];
  const visited = new Set<Id>([area]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const kids = indexes.childAreas.get(curr);
    if (kids) {
      for (const kid of kids) {
        if (!visited.has(kid.id)) {
          visited.add(kid.id);
          result.push(kid.id);
          queue.push(kid.id);
        }
      }
    }
  }

  return result;
}

/**
 * 指定した置き場がクウカンの中（中の収納の中まで含む）にあるかを判定する。
 */
export function isInsideKuukan(doc: ArekokoDocument, place: Id, kuukan: Id): boolean {
  if (place === kuukan) {
    return true;
  }
  const indexes = getIndexes(doc);
  let current: Id | null = place;
  const visited = new Set<Id>();

  while (current && !visited.has(current)) {
    visited.add(current);
    if (current === kuukan) {
      return true;
    }
    if (current === NIL_ID) {
      return kuukan === NIL_ID;
    }

    const area = indexes.areaById.get(current);
    if (area) {
      if (area.kuukan === kuukan) {
        return true;
      }
      current = area.kuukan;
      continue;
    }

    const k = indexes.kuukanById.get(current);
    if (k) {
      if (k.id === kuukan) {
        return true;
      }
      if (k.owner !== null) {
        const ownerItem = indexes.itemById.get(k.owner);
        if (ownerItem) {
          current = ownerItem.place;
          continue;
        }
      }
      break;
    }

    break;
  }

  return false;
}

/**
 * クウカンに属する葉エリア（子を持たない選択可能なエリア）一覧を返す。
 */
export function leafAreasOfKuukan(doc: ArekokoDocument, kuukan: Id): Area[] {
  const areas = doc.membership.areas.filter(a => a.kuukan === kuukan);
  if (areas.length === 0) return [];
  const tree = buildAreaTree(doc, kuukan);
  return areas.filter(
    a => !tree.children.has(a.id) || (tree.children.get(a.id)?.length ?? 0) === 0,
  );
}

/**
 * 指定したエリアが、指定したクウカンの有効な葉エリア（選択可能なエリア）であるかを判定する。
 */
export function isValidLeafArea(doc: ArekokoDocument, kuukan: Id, areaId: Id | null): boolean {
  if (areaId === null) return false;
  const exists = doc.membership.areas.some(a => a.id === areaId && a.kuukan === kuukan);
  if (!exists) return false;
  const tree = buildAreaTree(doc, kuukan);
  return !tree.children.has(areaId) || (tree.children.get(areaId)?.length ?? 0) === 0;
}

/**
 * 指定したモノを配置可能な置き場候補を返す。
 * 対象のモノ自身が持つクウカンの中（入れ子の収納の中まで含む）は除外する。
 */
export function placeCandidates(doc: ArekokoDocument, itemIds: Id[]): Id[] {
  const indexes = getIndexes(doc);
  const forbiddenKuukans = new Set<Id>();

  for (const itemId of itemIds) {
    const k = indexes.kuukanByOwner.get(itemId);
    if (k) {
      forbiddenKuukans.add(k.id);
    }
  }

  const allCandidates: Id[] = [
    ...doc.membership.kuukans.map(k => k.id),
    ...doc.membership.areas.map(a => a.id),
  ];

  if (forbiddenKuukans.size === 0) {
    return allCandidates;
  }

  const excluded = new Set<Id>();
  const kuukanQueue: Id[] = Array.from(forbiddenKuukans);
  const visitedKuukans = new Set<Id>(forbiddenKuukans);

  while (kuukanQueue.length > 0) {
    const kId = kuukanQueue.shift()!;
    excluded.add(kId);

    for (const a of doc.membership.areas) {
      if (a.kuukan === kId) {
        excluded.add(a.id);
      }
    }

    for (const it of doc.membership.items) {
      if (excluded.has(it.place)) {
        const subK = indexes.kuukanByOwner.get(it.id);
        if (subK && !visitedKuukans.has(subK.id)) {
          visitedKuukans.add(subK.id);
          kuukanQueue.push(subK.id);
        }
      }
    }
  }

  return allCandidates.filter(c => !excluded.has(c));
}

/**
 * 置き場に含まれるすべてのモノを再帰的に返す。
 * 置き場がクウカンならそのクウカンと全エリア、置き場がエリアならそのエリアと子孫エリア、
 * およびそこに含まれる収納の中身を再帰的に含める。
 */
export function itemsWithin(doc: ArekokoDocument, place: Id): Item[] {
  const indexes = getIndexes(doc);
  const result: Item[] = [];
  const visitedItems = new Set<Id>();
  const visitedPlaces = new Set<Id>();
  const placeQueue: Id[] = [];

  function addPlace(pId: Id) {
    if (!visitedPlaces.has(pId)) {
      visitedPlaces.add(pId);
      placeQueue.push(pId);
    }
  }

  if (place === NIL_ID) {
    addPlace(NIL_ID);
  } else if (indexes.kuukanById.has(place)) {
    addPlace(place);
    for (const a of doc.membership.areas) {
      if (a.kuukan === place) {
        addPlace(a.id);
      }
    }
  } else if (indexes.areaById.has(place)) {
    const subAreas = areaSubtree(doc, place);
    for (const aId of subAreas) {
      addPlace(aId);
    }
  } else {
    addPlace(place);
  }

  while (placeQueue.length > 0) {
    const p = placeQueue.shift()!;
    const items = indexes.itemsByPlace.get(p);
    if (items) {
      for (const it of items) {
        if (!visitedItems.has(it.id)) {
          visitedItems.add(it.id);
          result.push(it);

          const subKuukan = indexes.kuukanByOwner.get(it.id);
          if (subKuukan) {
            addPlace(subKuukan.id);
            for (const a of doc.membership.areas) {
              if (a.kuukan === subKuukan.id) {
                addPlace(a.id);
              }
            }
          }
        }
      }
    }
  }

  return result;
}
