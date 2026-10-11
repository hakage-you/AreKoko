// カテゴリの操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Category } from '../types';
import { isLabelColor } from '../constants';
import { OpError, touch, type OpContext, type OpResult } from './common';

export function createCategory(
  doc: ArekokoDocument,
  input: { name: string; parent?: Id | null },
  ctx: OpContext,
): OpResult {
  const parent = input.parent ?? null;
  if (parent !== null) {
    const parentExists = doc.membership.categories.some(c => c.id === parent);
    if (!parentExists) {
      throw new OpError('notFound', `親カテゴリが見つかりません: ${parent}`);
    }
  }

  const id = ctx.newId();
  const newCategory: Category = {
    id,
    name: input.name,
    parent,
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      categories: [...doc.membership.categories, newCategory],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id],
  };
}

export function renameCategory(
  doc: ArekokoDocument,
  id: Id,
  name: string,
): OpResult {
  const index = doc.membership.categories.findIndex(c => c.id === id);
  if (index === -1) {
    throw new OpError('notFound', `カテゴリが見つかりません: ${id}`);
  }

  const current = doc.membership.categories[index]!;
  if (current.name === name) {
    return { doc, moved: [], created: [] };
  }

  const updated: Category = { ...current, name };
  const newCategories = [...doc.membership.categories];
  newCategories[index] = updated;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      categories: newCategories,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function moveCategory(
  doc: ArekokoDocument,
  id: Id,
  parent: Id | null,
): OpResult {
  const target = doc.membership.categories.find(c => c.id === id);
  if (!target) {
    throw new OpError('notFound', `カテゴリが見つかりません: ${id}`);
  }

  if (parent !== null) {
    const parentCat = doc.membership.categories.find(c => c.id === parent);
    if (!parentCat) {
      throw new OpError('notFound', `親カテゴリが見つかりません: ${parent}`);
    }

    if (parent === id) {
      throw new OpError('cycle', '自身を親カテゴリに指定することはできません');
    }

    const catMap = new Map(doc.membership.categories.map(c => [c.id, c]));
    let cur: Id | null = parent;
    while (cur !== null) {
      if (cur === id) {
        throw new OpError('cycle', 'カテゴリの親子関係が輪になります');
      }
      cur = catMap.get(cur)?.parent ?? null;
    }
  }

  if (target.parent === parent) {
    return { doc, moved: [], created: [] };
  }

  const newCategories = doc.membership.categories.map(c => {
    if (c.id === id) {
      return { ...c, parent };
    }
    return c;
  });

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      categories: newCategories,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function deleteCategory(
  doc: ArekokoDocument,
  id: Id,
  ctx: OpContext,
): OpResult {
  const target = doc.membership.categories.find(c => c.id === id);
  if (!target) {
    throw new OpError('notFound', `カテゴリが見つかりません: ${id}`);
  }

  const parent = target.parent;

  const newItems = doc.membership.items.map(item => {
    if (item.category === id) {
      return touch({ ...item, category: parent }, ctx);
    }
    return item;
  });

  const newCategories = doc.membership.categories
    .filter(c => c.id !== id)
    .map(c => {
      if (c.parent === id) {
        return { ...c, parent };
      }
      return c;
    });

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
      categories: newCategories,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function setCategoryColor(
  doc: ArekokoDocument,
  id: Id,
  color: string | null,
): OpResult {
  const index = doc.membership.categories.findIndex(c => c.id === id);
  if (index === -1) {
    throw new OpError('notFound', `カテゴリが見つかりません: ${id}`);
  }

  const current = doc.membership.categories[index]!;
  const normalizedColor = color ? color.trim() : undefined;
  if (normalizedColor !== undefined && !isLabelColor(normalizedColor)) {
    throw new OpError('invalidInput', `色は #rrggbb の形で指定してください: ${normalizedColor}`);
  }
  if (current.color === normalizedColor) {
    return { doc, moved: [], created: [] };
  }

  const updated: Category = { ...current };
  if (normalizedColor) {
    updated.color = normalizedColor;
  } else {
    delete updated.color;
  }

  const newCategories = [...doc.membership.categories];
  newCategories[index] = updated;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      categories: newCategories,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}
