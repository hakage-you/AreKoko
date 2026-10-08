// 収納の操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Item, Kuukan } from '../types';
import { DEFAULT_AREA_LABEL } from '../constants';
import { planRemoveKuukan, removeKuukan } from '../relocate';
import { OpError, type OpContext, type OpResult, type Relocation } from './common';

export function makeStorage(
  doc: ArekokoDocument,
  itemId: Id,
  input: { areaLabel?: string },
  ctx: OpContext,
): OpResult {
  const targetItem = doc.membership.items.find(i => i.id === itemId);
  if (!targetItem) {
    throw new OpError('notFound', `モノが見つかりません: ${itemId}`);
  }

  const alreadyStorage = doc.membership.kuukans.some(k => k.owner === itemId);
  if (alreadyStorage) {
    throw new OpError('alreadyStorage', '既に収納として設定されています');
  }

  const id = ctx.newId();
  const newKuukan: Kuukan = {
    id,
    owner: itemId,
    areaLabel: input.areaLabel ?? DEFAULT_AREA_LABEL,
  };

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      kuukans: [...doc.membership.kuukans, newKuukan],
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [id],
  };
}

export function planRemoveStorage(
  doc: ArekokoDocument,
  itemId: Id,
): Relocation[] {
  const { item, kuukan } = storageOf(doc, itemId);
  return planRemoveKuukan(doc, kuukan.id, item.place);
}

export function removeStorage(
  doc: ArekokoDocument,
  itemId: Id,
  ctx: OpContext,
): OpResult {
  const { item, kuukan } = storageOf(doc, itemId);
  const result = removeKuukan(doc, kuukan.id, item.place, ctx);
  return { doc: result.doc, moved: result.moved, created: [] };
}

function storageOf(doc: ArekokoDocument, itemId: Id): { item: Item; kuukan: Kuukan } {
  const item = doc.membership.items.find(i => i.id === itemId);
  if (!item) {
    throw new OpError('notFound', `モノが見つかりません: ${itemId}`);
  }
  const kuukan = doc.membership.kuukans.find(k => k.owner === itemId);
  if (!kuukan) {
    throw new OpError('notStorage', '収納ではありません');
  }
  return { item, kuukan };
}
