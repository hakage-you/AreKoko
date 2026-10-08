// クウカンの操作。詳細設計 8章、付録A.13。

import type { Id, ArekokoDocument, Kuukan } from '../types';
import { DEFAULT_AREA_LABEL, NIL_ID } from '../constants';
import { planRemoveKuukan, removeKuukan } from '../relocate';
import { OpError, type OpContext, type OpResult, type Relocation } from './common';

export function createKuukan(
  doc: ArekokoDocument,
  input: { name: string; areaLabel?: string },
  ctx: OpContext,
): OpResult {
  const id = ctx.newId();
  const newKuukan: Kuukan = {
    id,
    name: input.name,
    owner: null,
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

export function renameKuukan(
  doc: ArekokoDocument,
  id: Id,
  name: string,
): OpResult {
  if (id === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンは名前を変更できません');
  }

  const target = doc.membership.kuukans.find(k => k.id === id);
  if (!target) {
    throw new OpError('notFound', `クウカンが見つかりません: ${id}`);
  }

  if (target.owner !== null) {
    throw new OpError('invalidInput', '収納のクウカンの名前は変更できません');
  }

  if (target.name === name) {
    return { doc, moved: [], created: [] };
  }

  const newKuukans = doc.membership.kuukans.map(k => {
    if (k.id === id) {
      return { ...k, name };
    }
    return k;
  });

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      kuukans: newKuukans,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function setAreaLabel(
  doc: ArekokoDocument,
  id: Id,
  label: string,
): OpResult {
  if (id === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンは変更できません');
  }

  const target = doc.membership.kuukans.find(k => k.id === id);
  if (!target) {
    throw new OpError('notFound', `クウカンが見つかりません: ${id}`);
  }

  if (target.areaLabel === label) {
    return { doc, moved: [], created: [] };
  }

  const newKuukans = doc.membership.kuukans.map(k => {
    if (k.id === id) {
      return { ...k, areaLabel: label };
    }
    return k;
  });

  const newDoc: ArekokoDocument = {
    ...doc,
    membership: {
      ...doc.membership,
      kuukans: newKuukans,
    },
  };

  return {
    doc: newDoc,
    moved: [],
    created: [],
  };
}

export function planDeleteKuukan(
  doc: ArekokoDocument,
  id: Id,
): Relocation[] {
  topLevelKuukan(doc, id);
  return planRemoveKuukan(doc, id, NIL_ID);
}

export function deleteKuukan(
  doc: ArekokoDocument,
  id: Id,
  ctx: OpContext,
): OpResult {
  topLevelKuukan(doc, id);
  const result = removeKuukan(doc, id, NIL_ID, ctx);
  return { doc: result.doc, moved: result.moved, created: [] };
}

/** 消せるのは、どこにも置かれていない、未設定以外のクウカンだけ。 */
function topLevelKuukan(doc: ArekokoDocument, id: Id): Kuukan {
  if (id === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンは削除できません');
  }
  const target = doc.membership.kuukans.find(k => k.id === id);
  if (!target) {
    throw new OpError('notFound', `クウカンが見つかりません: ${id}`);
  }
  if (target.owner !== null) {
    throw new OpError('notTopLevel', '収納のクウカンは削除できません');
  }
  return target;
}
