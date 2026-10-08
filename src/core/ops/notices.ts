// 修復メモの操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Kuukan, Area, Item, Category, Tag } from '../types';
import { OpError, type OpResult } from './common';

export function removeNotice(
  doc: ArekokoDocument,
  kind: 'kuukan' | 'area' | 'item' | 'category' | 'tag',
  id: Id,
  index: number,
): OpResult {
  const collectionKey =
    kind === 'kuukan'
      ? 'kuukans'
      : kind === 'area'
        ? 'areas'
        : kind === 'item'
          ? 'items'
          : kind === 'category'
            ? 'categories'
            : 'tags';

  const list = doc.membership[collectionKey] as Array<Kuukan | Area | Item | Category | Tag>;
  const itemIndex = list.findIndex(elem => elem.id === id);
  if (itemIndex === -1) {
    throw new OpError('notFound', `対象が見つかりません: ${id}`);
  }

  const target = list[itemIndex]!;
  const notices = target.notices;
  if (!notices || index < 0 || index >= notices.length) {
    throw new OpError('outOfRange', `指定された修復メモが見つかりません: インデックス ${index}`);
  }

  const newNotices = notices.filter((_, i) => i !== index);
  const updated = { ...target };
  if (newNotices.length > 0) {
    updated.notices = newNotices;
  } else {
    delete updated.notices;
  }

  const newList = [...list];
  newList[itemIndex] = updated;

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      [collectionKey]: newList,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}
