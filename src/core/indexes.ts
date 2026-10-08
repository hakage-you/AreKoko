// 索引（文書ごとに WeakMap で1回だけ作成）。設計 11章、詳細設計 7.1、付録A.7。

import type { AreaTree } from '../geometry/regions';
import type {
  Area,
  ArekokoDocument,
  Category,
  EntityKind,
  Id,
  Item,
  ItemDrawing,
  Kuukan,
  KuukanDrawing,
  Marker,
  Partition,
  Tag,
} from './types';

export interface Indexes {
  kindOf: Map<Id, EntityKind>;
  kuukanById: Map<Id, Kuukan>;
  areaById: Map<Id, Area>;
  itemById: Map<Id, Item>;
  categoryById: Map<Id, Category>;
  tagById: Map<Id, Tag>;
  markerById: Map<Id, Marker>;
  childAreas: Map<Id, Area[]>;
  itemsByPlace: Map<Id, Item[]>;
  itemsByCategory: Map<Id | null, Item[]>;
  itemsByTag: Map<Id, Item[]>;
  kuukanByOwner: Map<Id, Kuukan>;
  childCategories: Map<Id | null, Category[]>;
  kuukanDrawingOf: Map<Id, KuukanDrawing>;
  partitionOf: Map<Id, Partition>;
  markersOf: Map<Id, Marker[]>;
  itemDrawingOf: Map<Id, ItemDrawing>;
}

const indexCache = new WeakMap<ArekokoDocument, Indexes>();

/**
 * 文書の索引を作成する。不変文書のため WeakMap でキャッシュする。
 */
export function getIndexes(doc: ArekokoDocument): Indexes {
  const cached = indexCache.get(doc);
  if (cached) {
    return cached;
  }

  const kindOf = new Map<Id, EntityKind>();
  const kuukanById = new Map<Id, Kuukan>();
  const areaById = new Map<Id, Area>();
  const itemById = new Map<Id, Item>();
  const categoryById = new Map<Id, Category>();
  const tagById = new Map<Id, Tag>();
  const markerById = new Map<Id, Marker>();

  for (const k of doc.membership.kuukans) {
    kindOf.set(k.id, 'kuukan');
    kuukanById.set(k.id, k);
  }
  for (const a of doc.membership.areas) {
    kindOf.set(a.id, 'area');
    areaById.set(a.id, a);
  }
  for (const it of doc.membership.items) {
    kindOf.set(it.id, 'item');
    itemById.set(it.id, it);
  }
  for (const c of doc.membership.categories) {
    kindOf.set(c.id, 'category');
    categoryById.set(c.id, c);
  }
  for (const t of doc.membership.tags) {
    kindOf.set(t.id, 'tag');
    tagById.set(t.id, t);
  }
  for (const m of doc.drawing.markers) {
    kindOf.set(m.id, 'marker');
    markerById.set(m.id, m);
  }

  // childAreas: 親（クウカンID か エリアID）→ 子エリア
  const childAreas = new Map<Id, Area[]>();
  for (const a of doc.membership.areas) {
    const parentId = a.parent ?? a.kuukan;
    let list = childAreas.get(parentId);
    if (!list) {
      list = [];
      childAreas.set(parentId, list);
    }
    list.push(a);
  }

  // order の昇順、同じなら id の昇順でソート
  for (const list of childAreas.values()) {
    list.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  // itemsByPlace: 置き場 → モノ
  const itemsByPlace = new Map<Id, Item[]>();
  for (const it of doc.membership.items) {
    let list = itemsByPlace.get(it.place);
    if (!list) {
      list = [];
      itemsByPlace.set(it.place, list);
    }
    list.push(it);
  }

  // itemsByCategory: カテゴリ（未分類は null）→ モノ
  const itemsByCategory = new Map<Id | null, Item[]>();
  for (const it of doc.membership.items) {
    let list = itemsByCategory.get(it.category);
    if (!list) {
      list = [];
      itemsByCategory.set(it.category, list);
    }
    list.push(it);
  }

  // itemsByTag: タグ → モノ
  const itemsByTag = new Map<Id, Item[]>();
  for (const it of doc.membership.items) {
    for (const tagId of it.tags) {
      let list = itemsByTag.get(tagId);
      if (!list) {
        list = [];
        itemsByTag.set(tagId, list);
      }
      list.push(it);
    }
  }

  // kuukanByOwner: モノ → 持っているクウカン
  const kuukanByOwner = new Map<Id, Kuukan>();
  for (const k of doc.membership.kuukans) {
    if (k.owner !== null && !kuukanByOwner.has(k.owner)) {
      kuukanByOwner.set(k.owner, k);
    }
  }

  // childCategories: 親（最上位は null）→ 子カテゴリ
  const childCategories = new Map<Id | null, Category[]>();
  for (const c of doc.membership.categories) {
    let list = childCategories.get(c.parent);
    if (!list) {
      list = [];
      childCategories.set(c.parent, list);
    }
    list.push(c);
  }

  // 描画の層の引き当て
  const kuukanDrawingOf = new Map<Id, KuukanDrawing>();
  for (const kd of doc.drawing.kuukans) {
    if (!kuukanDrawingOf.has(kd.kuukan)) {
      kuukanDrawingOf.set(kd.kuukan, kd);
    }
  }

  const partitionOf = new Map<Id, Partition>();
  for (const p of doc.drawing.partitions) {
    if (!partitionOf.has(p.area)) {
      partitionOf.set(p.area, p);
    }
  }

  const markersOf = new Map<Id, Marker[]>();
  for (const m of doc.drawing.markers) {
    let list = markersOf.get(m.kuukan);
    if (!list) {
      list = [];
      markersOf.set(m.kuukan, list);
    }
    list.push(m);
  }

  const itemDrawingOf = new Map<Id, ItemDrawing>();
  for (const idr of doc.drawing.items) {
    if (!itemDrawingOf.has(idr.item)) {
      itemDrawingOf.set(idr.item, idr);
    }
  }

  const indexes: Indexes = {
    kindOf,
    kuukanById,
    areaById,
    itemById,
    categoryById,
    tagById,
    markerById,
    childAreas,
    itemsByPlace,
    itemsByCategory,
    itemsByTag,
    kuukanByOwner,
    childCategories,
    kuukanDrawingOf,
    partitionOf,
    markersOf,
    itemDrawingOf,
  };

  indexCache.set(doc, indexes);
  return indexes;
}

/**
 * 特定のクウカンに属するエリアの階層構造（AreaTree）を構築する。
 */
export function buildAreaTree(doc: ArekokoDocument, kuukan: Id): AreaTree {
  const indexes = getIndexes(doc);
  const childrenMap = new Map<Id, Id[]>();

  const visited = new Set<Id>();
  const queue: Id[] = [kuukan];
  visited.add(kuukan);

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const kids = indexes.childAreas.get(parentId);
    if (kids && kids.length > 0) {
      const childIds = kids.map(k => k.id);
      childrenMap.set(parentId, childIds);
      for (const kid of kids) {
        if (!visited.has(kid.id) && kid.kuukan === kuukan) {
          visited.add(kid.id);
          queue.push(kid.id);
        }
      }
    }
  }

  return {
    root: kuukan,
    children: childrenMap,
  };
}
