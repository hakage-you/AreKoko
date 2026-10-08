// タグの操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Tag } from '../types';
import { OpError, touch, type OpContext, type OpResult } from './common';

export function createTag(
  doc: ArekokoDocument,
  input: { name: string },
  ctx: OpContext,
): OpResult {
  const id = ctx.newId();
  const newTag: Tag = {
    id,
    name: input.name,
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      tags: [...doc.membership.tags, newTag],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id],
  };
}

export function renameTag(
  doc: ArekokoDocument,
  id: Id,
  name: string,
): OpResult {
  const index = doc.membership.tags.findIndex(t => t.id === id);
  if (index === -1) {
    throw new OpError('notFound', `タグが見つかりません: ${id}`);
  }

  const current = doc.membership.tags[index]!;
  if (current.name === name) {
    return { doc, moved: [], created: [] };
  }

  const updated: Tag = { ...current, name };
  const newTags = [...doc.membership.tags];
  newTags[index] = updated;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      tags: newTags,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function deleteTag(
  doc: ArekokoDocument,
  id: Id,
  ctx: OpContext,
): OpResult {
  const target = doc.membership.tags.find(t => t.id === id);
  if (!target) {
    throw new OpError('notFound', `タグが見つかりません: ${id}`);
  }

  const newItems = doc.membership.items.map(item => {
    if (item.tags.includes(id)) {
      return touch(
        { ...item, tags: item.tags.filter(t => t !== id) },
        ctx,
      );
    }
    return item;
  });

  const newTags = doc.membership.tags.filter(t => t.id !== id);

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      items: newItems,
      tags: newTags,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}
