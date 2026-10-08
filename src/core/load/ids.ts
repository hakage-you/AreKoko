import type { Id, EntityKind, Kuukan, Area, Item, Category, Tag, Marker, Notice } from '../types';
import type { RepairEntry, LoadContext } from './index';
import { NIL_ID } from '../constants';
import { isUuidV7 } from '../ids';
import type { NoticeManager } from './notices';

export interface IdResolver {
  resolve(rawId: string | null | undefined): Id | null;
  resolveWithKind(rawId: string | null | undefined, expectedKinds: EntityKind[]): Id | null;
  getKind(id: Id): EntityKind | undefined;
  duplicatedRawIds: Set<string>;
  idMap: Map<string, Id>;
}

export function normalizeIds(
  membership: {
    kuukans: Kuukan[];
    areas: Area[];
    items: Item[];
    categories: Category[];
    tags: Tag[];
  },
  markers: Marker[],
  ctx: LoadContext,
  notices: NoticeManager,
  repairs: RepairEntry[]
): IdResolver {
  const definitions: Array<{ kind: EntityKind; rawId: string; elem: { id: string; name?: string; notices?: Notice[] } }> = [];

  for (const k of membership.kuukans) {
    definitions.push({ kind: 'kuukan', rawId: k.id, elem: k });
  }
  for (const a of membership.areas) {
    definitions.push({ kind: 'area', rawId: a.id, elem: a });
  }
  for (const it of membership.items) {
    definitions.push({ kind: 'item', rawId: it.id, elem: it });
  }
  for (const c of membership.categories) {
    definitions.push({ kind: 'category', rawId: c.id, elem: c });
  }
  for (const t of membership.tags) {
    definitions.push({ kind: 'tag', rawId: t.id, elem: t });
  }
  for (const m of markers) {
    definitions.push({ kind: 'marker', rawId: m.id, elem: m });
  }

  const idCounts = new Map<string, number>();
  for (const d of definitions) {
    idCounts.set(d.rawId, (idCounts.get(d.rawId) ?? 0) + 1);
  }

  const nilKuukanCount = membership.kuukans.filter(k => k.id === NIL_ID).length;

  // 新しく振るIDが、文書にすでにあるIDと重ならないことを保証する（生成器に依存しない）。
  const usedIds = new Set<string>(definitions.map(d => d.rawId));
  function freshId(): Id {
    let id = ctx.newId();
    while (usedIds.has(id)) id = ctx.newId();
    usedIds.add(id);
    return id;
  }

  const duplicatedRawIds = new Set<string>();
  const idMap = new Map<string, Id>();
  const entityKindMap = new Map<Id, EntityKind>();

  for (const d of definitions) {
    const rawId = d.rawId;
    const count = idCounts.get(rawId) ?? 0;
    // 名前を持たないのは収納のクウカンだけ（D3）。持ち主はまだ引いていないので種類だけを示す。
    const what =
      d.elem.name !== undefined
        ? `${getKindLabel(d.kind)}「${d.elem.name}」`
        : d.kind === 'kuukan'
          ? '収納のクウカン'
          : getKindLabel(d.kind);

    if (rawId === NIL_ID) {
      if (d.kind === 'kuukan' && nilKuukanCount === 1) {
        entityKindMap.set(NIL_ID, 'kuukan');
        idMap.set(NIL_ID, NIL_ID);
      } else {
        const newId = freshId();
        d.elem.id = newId;
        entityKindMap.set(newId, d.kind);

        if (d.kind === 'kuukan' && nilKuukanCount > 1) {
          duplicatedRawIds.add(NIL_ID);
          repairs.push({
            code: 'duplicateId',
            message: `重複したID「${rawId}」に新しいIDを振ります（${what}）`,
            target: { kind: d.kind, id: newId },
          });
          notices.addNotice(d.elem, 'duplicateId');
        } else {
          repairs.push({
            code: 'reservedId',
            message: `予約されたID「${rawId}」を新しいIDに付け替えます（${what}）`,
            target: { kind: d.kind, id: newId },
          });
          if (d.kind !== 'marker') notices.addNotice(d.elem, 'reservedId');
        }
      }
    } else if (count > 1) {
      duplicatedRawIds.add(rawId);
      const newId = freshId();
      d.elem.id = newId;
      entityKindMap.set(newId, d.kind);

      repairs.push({
        code: 'duplicateId',
        message: `重複したID「${rawId}」に新しいIDを振ります（${what}）`,
        target: { kind: d.kind, id: newId },
      });
      if (d.kind !== 'marker') notices.addNotice(d.elem, 'duplicateId');
    } else {
      if (isUuidV7(rawId)) {
        idMap.set(rawId, rawId);
        entityKindMap.set(rawId, d.kind);
      } else {
        const newId = freshId();
        d.elem.id = newId;
        idMap.set(rawId, newId);
        entityKindMap.set(newId, d.kind);

        repairs.push({
          code: 'tempId',
          message: `仮ID「${rawId}」を新しいIDに付け替えます（${what}）`,
          target: { kind: d.kind, id: newId },
        });
      }
    }
  }

  if (!entityKindMap.has(NIL_ID)) {
    entityKindMap.set(NIL_ID, 'kuukan');
  }

  function resolve(rawId: string | null | undefined): Id | null {
    if (!rawId) return null;
    if (rawId === NIL_ID) {
      return NIL_ID;
    }
    if (duplicatedRawIds.has(rawId)) {
      return null;
    }
    return idMap.get(rawId) ?? null;
  }

  function resolveWithKind(rawId: string | null | undefined, expectedKinds: EntityKind[]): Id | null {
    const resId = resolve(rawId);
    if (!resId) return null;
    const kind = entityKindMap.get(resId);
    if (!kind || !expectedKinds.includes(kind)) {
      return null;
    }
    return resId;
  }

  return {
    resolve,
    resolveWithKind,
    getKind: (id: Id) => entityKindMap.get(id),
    duplicatedRawIds,
    idMap,
  };
}

function getKindLabel(kind: EntityKind): string {
  switch (kind) {
    case 'kuukan':
      return 'クウカン';
    case 'area':
      return 'エリア';
    case 'item':
      return 'モノ';
    case 'category':
      return 'カテゴリ';
    case 'tag':
      return 'タグ';
    case 'marker':
      return 'マーカー';
  }
}
