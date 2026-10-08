// モノの操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Item } from '../types';
import { NIL_ID } from '../constants';
import { getIndexes } from '../indexes';
import { kuukanOfPlace, placeCandidates } from '../places';
import { removeKuukan } from '../relocate';
import { OpError, touch, type OpContext, type OpResult, type Relocation } from './common';

export function addItem(
  doc: ArekokoDocument,
  input: {
    name: string;
    place?: Id;
    category?: Id | null;
    tags?: Id[];
    summary?: string;
    qty?: number;
  },
  ctx: OpContext,
): OpResult {
  const indexes = getIndexes(doc);
  const place = input.place ?? NIL_ID;

  if (!indexes.kuukanById.has(place) && !indexes.areaById.has(place)) {
    throw new OpError('invalidPlace', `指定された置き場が見つかりません: ${place}`);
  }

  if (input.qty !== undefined && input.qty !== null) assertQty(input.qty);

  const category = input.category ?? null;
  if (category !== null && !indexes.categoryById.has(category)) {
    throw new OpError('notFound', `指定されたカテゴリが見つかりません: ${category}`);
  }

  const tags: Id[] = [];
  if (input.tags) {
    for (const tagId of input.tags) {
      if (!indexes.tagById.has(tagId)) {
        throw new OpError('notFound', `指定されたタグが見つかりません: ${tagId}`);
      }
      if (!tags.includes(tagId)) {
        tags.push(tagId);
      }
    }
  }

  const id = ctx.newId();
  const newItem: Item = {
    id,
    name: input.name,
    place,
    category,
    tags,
    updatedAt: ctx.now(),
  };

  if (input.summary !== undefined && input.summary !== null) {
    newItem.summary = input.summary;
  }
  if (input.qty !== undefined && input.qty !== null) {
    newItem.qty = input.qty;
  }

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: [...doc.membership.items, newItem],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id],
  };
}

/** 数量は 0 以上の整数（schema.json と同じ）。書いたファイルが読めなくならないよう、入口で弾く。 */
function assertQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 0) {
    throw new OpError('invalidInput', '数量は 0 以上の整数にしてください');
  }
}

export function updateItem(
  doc: ArekokoDocument,
  id: Id,
  patch: { name?: string; summary?: string | null; qty?: number | null },
  ctx: OpContext,
): OpResult {
  const index = doc.membership.items.findIndex(item => item.id === id);
  if (index === -1) {
    throw new OpError('notFound', `モノが見つかりません: ${id}`);
  }

  if (patch.qty !== undefined && patch.qty !== null) assertQty(patch.qty);

  const current = doc.membership.items[index]!;
  const updated: Item = { ...current };
  let changed = false;

  if (patch.name !== undefined && patch.name !== current.name) {
    updated.name = patch.name;
    changed = true;
  }

  if (patch.summary !== undefined) {
    if (patch.summary === null) {
      if ('summary' in updated) {
        delete updated.summary;
        changed = true;
      }
    } else if (patch.summary !== current.summary) {
      updated.summary = patch.summary;
      changed = true;
    }
  }

  if (patch.qty !== undefined) {
    if (patch.qty === null) {
      if ('qty' in updated) {
        delete updated.qty;
        changed = true;
      }
    } else if (patch.qty !== current.qty) {
      updated.qty = patch.qty;
      changed = true;
    }
  }

  if (changed) {
    updated.updatedAt = ctx.now();
  }

  const newItems = [...doc.membership.items];
  newItems[index] = updated;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function moveItems(
  doc: ArekokoDocument,
  ids: Id[],
  place: Id,
  ctx: OpContext,
): OpResult {
  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const indexes = getIndexes(doc);
  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const candidates = placeCandidates(doc, ids);
  if (!candidates.includes(place)) {
    throw new OpError('invalidPlace', `移動先に指定できない置き場です: ${place}`);
  }

  const moved: Id[] = [];
  const droppedDrawingItemIds = new Set<Id>();
  const targetKuukan = kuukanOfPlace(doc, place);
  const updatedItemsMap = new Map<Id, Item>();

  for (const id of ids) {
    const item = indexes.itemById.get(id)!;
    if (item.place === place) {
      continue;
    }

    moved.push(id);
    const oldKuukan = kuukanOfPlace(doc, item.place);
    if (oldKuukan !== targetKuukan) {
      droppedDrawingItemIds.add(id);
    }

    updatedItemsMap.set(id, touch({ ...item, place }, ctx));
  }

  if (moved.length === 0) {
    return { doc, moved: [], created: [] };
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
    created: [],
  };
}

export function setItemsCategory(
  doc: ArekokoDocument,
  ids: Id[],
  category: Id | null,
  ctx: OpContext,
): OpResult {
  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const indexes = getIndexes(doc);
  if (category !== null && !indexes.categoryById.has(category)) {
    throw new OpError('notFound', `カテゴリが見つかりません: ${category}`);
  }

  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const updatedItemsMap = new Map<Id, Item>();
  for (const id of ids) {
    const item = indexes.itemById.get(id)!;
    if (item.category !== category) {
      updatedItemsMap.set(id, touch({ ...item, category }, ctx));
    }
  }

  if (updatedItemsMap.size === 0) {
    return { doc, moved: [], created: [] };
  }

  const newItems = doc.membership.items.map(item => updatedItemsMap.get(item.id) ?? item);

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function addTagToItems(
  doc: ArekokoDocument,
  ids: Id[],
  tag: Id,
  ctx: OpContext,
): OpResult {
  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const indexes = getIndexes(doc);
  if (!indexes.tagById.has(tag)) {
    throw new OpError('notFound', `タグが見つかりません: ${tag}`);
  }

  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const updatedItemsMap = new Map<Id, Item>();
  for (const id of ids) {
    const item = indexes.itemById.get(id)!;
    if (!item.tags.includes(tag)) {
      updatedItemsMap.set(id, touch({ ...item, tags: [...item.tags, tag] }, ctx));
    }
  }

  if (updatedItemsMap.size === 0) {
    return { doc, moved: [], created: [] };
  }

  const newItems = doc.membership.items.map(item => updatedItemsMap.get(item.id) ?? item);

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function removeTagFromItems(
  doc: ArekokoDocument,
  ids: Id[],
  tag: Id,
  ctx: OpContext,
): OpResult {
  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const indexes = getIndexes(doc);
  if (!indexes.tagById.has(tag)) {
    throw new OpError('notFound', `タグが見つかりません: ${tag}`);
  }

  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const updatedItemsMap = new Map<Id, Item>();
  for (const id of ids) {
    const item = indexes.itemById.get(id)!;
    if (item.tags.includes(tag)) {
      updatedItemsMap.set(
        id,
        touch({ ...item, tags: item.tags.filter(t => t !== tag) }, ctx),
      );
    }
  }

  if (updatedItemsMap.size === 0) {
    return { doc, moved: [], created: [] };
  }

  const newItems = doc.membership.items.map(item => updatedItemsMap.get(item.id) ?? item);

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function deleteItems(
  doc: ArekokoDocument,
  ids: Id[],
  ctx: OpContext,
): OpResult {
  if (ids.length === 0) {
    return { doc, moved: [], created: [] };
  }

  const indexes = getIndexes(doc);
  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const orderedIds: Id[] = [];
  const idSet = new Set<Id>();
  for (const id of ids) {
    if (!idSet.has(id)) {
      idSet.add(id);
      orderedIds.push(id);
    }
  }

  // 収納のモノだけは、中身を移すために1つずつ順に片付ける。入れ子でも、順に処理すれば
  // 中身は最終的に外側の収納があった置き場へ行く。モノ自体はあとでまとめて消す。
  let currentDoc = doc;
  const allMoved: Id[] = [];
  for (const id of orderedIds) {
    const ownedKuukan = getIndexes(currentDoc).kuukanByOwner.get(id);
    if (!ownedKuukan) continue;
    const item = getIndexes(currentDoc).itemById.get(id)!;
    const result = removeKuukan(currentDoc, ownedKuukan.id, item.place, ctx);
    currentDoc = result.doc;
    allMoved.push(...result.moved);
  }

  currentDoc = {
    ...currentDoc,
    membership: {
      ...currentDoc.membership,
      items: currentDoc.membership.items.filter(i => !idSet.has(i.id)),
    },
    drawing: {
      ...currentDoc.drawing,
      items: currentDoc.drawing.items.filter(d => !idSet.has(d.item)),
    },
  };

  const moved = Array.from(new Set(allMoved)).filter(id => !idSet.has(id));

  return {
    doc: currentDoc,
    moved,
    created: [],
  };
}

export function planDeleteItems(
  doc: ArekokoDocument,
  ids: Id[],
): Relocation[] {
  if (ids.length === 0) {
    return [];
  }

  const indexes = getIndexes(doc);
  for (const id of ids) {
    if (!indexes.itemById.has(id)) {
      throw new OpError('notFound', `モノが見つかりません: ${id}`);
    }
  }

  const dummyCtx: OpContext = {
    newId: () => '',
    now: () => '',
  };
  const result = deleteItems(doc, ids, dummyCtx);

  const deletedSet = new Set(ids);
  const newItemMap = new Map(result.doc.membership.items.map(i => [i.id, i]));
  const relocMap = new Map<string, Relocation>();

  for (const oldItem of doc.membership.items) {
    if (deletedSet.has(oldItem.id)) {
      continue;
    }
    const newItem = newItemMap.get(oldItem.id);
    if (!newItem) {
      continue;
    }
    if (oldItem.place !== newItem.place) {
      const key = `${oldItem.place}\0${newItem.place}`;
      let reloc = relocMap.get(key);
      if (!reloc) {
        reloc = { from: oldItem.place, to: newItem.place, items: [] };
        relocMap.set(key, reloc);
      }
      reloc.items.push(oldItem.id);
    }
  }

  return Array.from(relocMap.values());
}
