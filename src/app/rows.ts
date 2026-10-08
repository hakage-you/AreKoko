// サガシモノの表の行構成。詳細設計UI 4.4。

import type { Area, ArekokoDocument, Category, Id, Item, Kuukan } from '../core/types';
import { NIL_ID } from '../core/constants';
import { getIndexes } from '../core/indexes';
import { displayName } from '../core/places';
import type { Grouping } from './store';

export type Row =
  | { kind: 'group'; key: string; label: string; depth: number; count: number }
  | { kind: 'item'; key: string; item: Item; depth: number };

export function buildRows(
  doc: ArekokoDocument,
  items: Item[],
  grouping: Grouping,
): Row[] {
  switch (grouping) {
    case 'none':
      return buildNoneRows(items);
    case 'category':
      return buildCategoryRows(doc, items);
    case 'place':
      return buildPlaceRows(doc, items);
    case 'tag':
      return buildTagRows(doc, items);
  }
}

function buildNoneRows(items: Item[]): Row[] {
  return items.map((item) => ({
    kind: 'item',
    key: item.id,
    item,
    depth: 0,
  }));
}

function buildCategoryRows(doc: ArekokoDocument, items: Item[]): Row[] {
  const indexes = getIndexes(doc);
  const rows: Row[] = [];

  const directItemsByCat = new Map<Id | null, Item[]>();
  for (const item of items) {
    const catId =
      item.category !== null && indexes.categoryById.has(item.category)
        ? item.category
        : null;
    let list = directItemsByCat.get(catId);
    if (!list) {
      list = [];
      directItemsByCat.set(catId, list);
    }
    list.push(item);
  }

  const countCache = new Map<Id, number>();
  function getSubtreeCount(catId: Id): number {
    const cached = countCache.get(catId);
    if (cached !== undefined) return cached;

    let count = directItemsByCat.get(catId)?.length ?? 0;
    const children = indexes.childCategories.get(catId) ?? [];
    for (const child of children) {
      count += getSubtreeCount(child.id);
    }
    countCache.set(catId, count);
    return count;
  }

  function emitCategory(cat: Category, depth: number): void {
    const totalCount = getSubtreeCount(cat.id);
    if (totalCount === 0) return;

    rows.push({
      kind: 'group',
      key: `cat:${cat.id}`,
      label: cat.name,
      depth,
      count: totalCount,
    });

    const directItems = directItemsByCat.get(cat.id);
    if (directItems) {
      for (const item of directItems) {
        rows.push({
          kind: 'item',
          key: `cat:${cat.id}:item:${item.id}`,
          item,
          depth: depth + 1,
        });
      }
    }

    const children = indexes.childCategories.get(cat.id) ?? [];
    for (const child of children) {
      emitCategory(child, depth + 1);
    }
  }

  const rootCategories = indexes.childCategories.get(null) ?? [];
  for (const root of rootCategories) {
    emitCategory(root, 0);
  }

  const uncategorized = directItemsByCat.get(null);
  if (uncategorized && uncategorized.length > 0) {
    rows.push({
      kind: 'group',
      key: 'cat:null',
      label: '未分類',
      depth: 0,
      count: uncategorized.length,
    });
    for (const item of uncategorized) {
      rows.push({
        kind: 'item',
        key: `cat:null:item:${item.id}`,
        item,
        depth: 1,
      });
    }
  }

  return rows;
}

function buildPlaceRows(doc: ArekokoDocument, items: Item[]): Row[] {
  const indexes = getIndexes(doc);
  const rows: Row[] = [];

  const directItemsByPlace = new Map<Id, Item[]>();
  for (const item of items) {
    let list = directItemsByPlace.get(item.place);
    if (!list) {
      list = [];
      directItemsByPlace.set(item.place, list);
    }
    list.push(item);
  }

  const storagesByPlace = new Map<Id, Kuukan[]>();
  for (const it of doc.membership.items) {
    const k = indexes.kuukanByOwner.get(it.id);
    if (k) {
      let list = storagesByPlace.get(it.place);
      if (!list) {
        list = [];
        storagesByPlace.set(it.place, list);
      }
      list.push(k);
    }
  }

  function getChildren(pId: Id): { areas: Area[]; storages: Kuukan[] } {
    const areas = indexes.childAreas.get(pId) ?? [];
    const storages = storagesByPlace.get(pId) ?? [];
    return { areas, storages };
  }

  const countCache = new Map<Id, number>();
  function getSubtreeCount(pId: Id): number {
    const cached = countCache.get(pId);
    if (cached !== undefined) return cached;

    let count = directItemsByPlace.get(pId)?.length ?? 0;
    const { areas, storages } = getChildren(pId);
    for (const a of areas) {
      count += getSubtreeCount(a.id);
    }
    for (const s of storages) {
      count += getSubtreeCount(s.id);
    }
    countCache.set(pId, count);
    return count;
  }

  const visiting = new Set<Id>();
  function emitPlace(pId: Id, depth: number): void {
    if (visiting.has(pId)) return;
    const totalCount = getSubtreeCount(pId);
    if (totalCount === 0) return;

    visiting.add(pId);
    rows.push({
      kind: 'group',
      key: `place:${pId}`,
      label: displayName(doc, pId),
      depth,
      count: totalCount,
    });

    const directItems = directItemsByPlace.get(pId);
    if (directItems) {
      for (const item of directItems) {
        rows.push({
          kind: 'item',
          key: `place:${pId}:item:${item.id}`,
          item,
          depth: depth + 1,
        });
      }
    }

    const { areas, storages } = getChildren(pId);
    for (const a of areas) {
      emitPlace(a.id, depth + 1);
    }
    for (const s of storages) {
      emitPlace(s.id, depth + 1);
    }
    visiting.delete(pId);
  }

  for (const k of doc.membership.kuukans) {
    if (k.id === NIL_ID || k.owner !== null) continue;
    emitPlace(k.id, 0);
  }

  emitPlace(NIL_ID, 0);

  return rows;
}

function buildTagRows(doc: ArekokoDocument, items: Item[]): Row[] {
  const rows: Row[] = [];

  const sortedTags = [...doc.membership.tags].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, 'ja');
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  for (const tag of sortedTags) {
    const tagItems = items.filter((it) => it.tags.includes(tag.id));
    if (tagItems.length === 0) continue;

    rows.push({
      kind: 'group',
      key: `tag:${tag.id}`,
      label: tag.name,
      depth: 0,
      count: tagItems.length,
    });

    for (const item of tagItems) {
      rows.push({
        kind: 'item',
        key: `tag:${tag.id}:item:${item.id}`,
        item,
        depth: 1,
      });
    }
  }

  const noTagItems = items.filter((it) => it.tags.length === 0);
  if (noTagItems.length > 0) {
    rows.push({
      kind: 'group',
      key: 'tag:none',
      label: 'タグなし',
      depth: 0,
      count: noTagItems.length,
    });

    for (const item of noTagItems) {
      rows.push({
        kind: 'item',
        key: `tag:none:item:${item.id}`,
        item,
        depth: 1,
      });
    }
  }

  return rows;
}
