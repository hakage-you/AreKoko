// ランダム検査用の共通補助。操作列の生成・実行および文書の破壊処理。

import fc from 'fast-check';
import type {
  ArekokoDocument,
  Id,
  Axis,
  Point,
} from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { createEmptyDocument } from '../../src/core/document';
import { History } from '../../src/core/history';
import { buildAreaTree } from '../../src/core/indexes';
import { placeCandidates } from '../../src/core/places';
import { OpError, type OpContext } from '../../src/core/ops/common';
import {
  addItem,
  updateItem,
  moveItems,
  deleteItems,
  setItemsCategory,
  addTagToItems,
  removeTagFromItems,
} from '../../src/core/ops/items';
import {
  createCategory,
  moveCategory,
  deleteCategory,
} from '../../src/core/ops/categories';
import { createTag, deleteTag } from '../../src/core/ops/tags';
import { createKuukan, deleteKuukan } from '../../src/core/ops/kuukans';
import { makeStorage, removeStorage } from '../../src/core/ops/storage';
import { removeNotice } from '../../src/core/ops/notices';
import {
  attachOutline,
  splitAt,
  splitEven,
  deleteLine,
  moveLine,
} from '../../src/core/ops/areas';
import { dragRange } from '../../src/geometry/drag';

/**
 * 検査対象の操作種別一覧（24種類）。
 */
export type OpType =
  | 'addItem'
  | 'updateItem'
  | 'moveItems'
  | 'deleteItems'
  | 'setItemsCategory'
  | 'addTagToItems'
  | 'removeTagFromItems'
  | 'createCategory'
  | 'moveCategory'
  | 'deleteCategory'
  | 'createTag'
  | 'deleteTag'
  | 'createKuukan'
  | 'deleteKuukan'
  | 'makeStorage'
  | 'removeStorage'
  | 'removeNotice'
  | 'attachOutline'
  | 'splitAt'
  | 'splitEven'
  | 'deleteLine'
  | 'moveLine'
  | 'undo'
  | 'redo';

/**
 * 操作の指定。操作の種類と引数選択のための乱数の種。
 */
export interface OpCommand {
  type: OpType;
  seed1: number;
  seed2: number;
  seed3: number;
}

/**
 * 操作1件の Arbitrary。
 */
// 操作の重み。作る系を多めにして、文書が育ってから消す・動かす系が効くようにする。
const OP_WEIGHTS: Array<[OpType, number]> = [
  ['addItem', 8],
  ['updateItem', 2],
  ['moveItems', 5],
  ['deleteItems', 2],
  ['setItemsCategory', 2],
  ['addTagToItems', 3],
  ['removeTagFromItems', 2],
  ['createCategory', 2],
  ['moveCategory', 2],
  ['deleteCategory', 1],
  ['createTag', 2],
  ['deleteTag', 1],
  ['createKuukan', 3],
  ['deleteKuukan', 1],
  ['makeStorage', 3],
  ['removeStorage', 1],
  ['removeNotice', 1],
  ['attachOutline', 3],
  ['splitAt', 6],
  ['splitEven', 3],
  ['deleteLine', 2],
  ['moveLine', 3],
  ['undo', 2],
  ['redo', 1],
];

/**
 * 操作1件の Arbitrary。
 */
export const opCommandArbitrary: fc.Arbitrary<OpCommand> = fc.record({
  type: fc.oneof(...OP_WEIGHTS.map(([type, weight]) => ({ arbitrary: fc.constant(type), weight }))),
  seed1: fc.nat(),
  seed2: fc.nat(),
  seed3: fc.nat(),
});

/**
 * 操作列の Arbitrary。fast-check は既定で配列を短く作るので、size を 'max' にして長さを使い切る。
 */
export function opsListArbitrary(maxLength = 60): fc.Arbitrary<OpCommand[]> {
  return fc.array(opCommandArbitrary, { minLength: 10, maxLength, size: 'max' });
}

/**
 * プロパティテスト用の決定的な OpContext を生成する。
 */
export function createPropertyTestContext(start = 1): OpContext {
  let counter = start;
  return {
    now: () => '2026-10-08T12:00:00.000Z',
    newId: () => {
      const hex = (counter++).toString(16).padStart(12, '0');
      return `01920000-0000-7000-8000-${hex}`;
    },
  };
}

export interface ApplyOpResult {
  doc: ArekokoDocument;
  executed: boolean;
  error?: OpError;
}

/**
 * 現在の文書に対して操作を1件適用する。
 * OpError は許容して文書を変更せず返し、それ以外の例外はそのままスローする。
 */
export function applyOp(
  currentDoc: ArekokoDocument,
  history: History,
  op: OpCommand,
  ctx: OpContext,
): ApplyOpResult {
  const { type, seed1, seed2, seed3 } = op;
  let newDoc = currentDoc;

  try {
    switch (type) {
      case 'undo': {
        const prev = history.undo(currentDoc);
        if (prev !== null) {
          return { doc: prev, executed: true };
        }
        return { doc: currentDoc, executed: false };
      }

      case 'redo': {
        const next = history.redo(currentDoc);
        if (next !== null) {
          return { doc: next, executed: true };
        }
        return { doc: currentDoc, executed: false };
      }

      case 'addItem': {
        const places = [
          ...currentDoc.membership.kuukans.map(k => k.id),
          ...currentDoc.membership.areas.map(a => a.id),
        ];
        const place =
          places.length > 0 && seed1 % 10 !== 0
            ? places[seed1 % places.length]
            : undefined;

        const categories = currentDoc.membership.categories;
        const category =
          categories.length > 0 && seed2 % 5 !== 0
            ? categories[seed2 % categories.length]!.id
            : null;

        const tags = currentDoc.membership.tags;
        const selectedTags: Id[] = [];
        if (tags.length > 0 && seed3 % 3 !== 0) {
          const count = (seed3 % Math.min(tags.length, 3)) + 1;
          for (let i = 0; i < count; i++) {
            const tag = tags[(seed1 + i * 7) % tags.length]!;
            if (!selectedTags.includes(tag.id)) {
              selectedTags.push(tag.id);
            }
          }
        }

        const res = addItem(
          currentDoc,
          {
            name: `item-${seed1 % 1000}`,
            place,
            category,
            tags: selectedTags,
            summary: seed1 % 2 === 0 ? `summary-${seed1 % 100}` : undefined,
            qty: seed2 % 2 === 0 ? (seed2 % 10) + 1 : undefined,
          },
          ctx,
        );
        newDoc = res.doc;
        break;
      }

      case 'updateItem': {
        const items = currentDoc.membership.items;
        if (items.length === 0) return { doc: currentDoc, executed: false };
        const item = items[seed1 % items.length]!;
        const patch: { name?: string; summary?: string | null; qty?: number | null } = {};
        if (seed2 % 3 === 0) patch.name = `updated-${seed1 % 1000}`;
        if (seed2 % 3 === 1) patch.summary = seed3 % 2 === 0 ? `new-sum-${seed3 % 50}` : null;
        if (seed2 % 3 === 2) patch.qty = seed3 % 2 === 0 ? (seed3 % 20) + 1 : null;
        const res = updateItem(currentDoc, item.id, patch, ctx);
        newDoc = res.doc;
        break;
      }

      case 'moveItems': {
        const items = currentDoc.membership.items;
        if (items.length === 0) return { doc: currentDoc, executed: false };
        const count = Math.min(items.length, (seed1 % 3) + 1);
        const selectedIds: Id[] = [];
        for (let i = 0; i < count; i++) {
          const it = items[(seed2 + i * 5) % items.length]!;
          if (!selectedIds.includes(it.id)) {
            selectedIds.push(it.id);
          }
        }
        const candidates = placeCandidates(currentDoc, selectedIds);
        if (candidates.length === 0) return { doc: currentDoc, executed: false };
        const targetPlace = candidates[seed3 % candidates.length]!;
        const res = moveItems(currentDoc, selectedIds, targetPlace, ctx);
        newDoc = res.doc;
        break;
      }

      case 'deleteItems': {
        const items = currentDoc.membership.items;
        if (items.length === 0) return { doc: currentDoc, executed: false };
        const count = Math.min(items.length, (seed1 % 3) + 1);
        const selectedIds: Id[] = [];
        for (let i = 0; i < count; i++) {
          const it = items[(seed2 + i * 3) % items.length]!;
          if (!selectedIds.includes(it.id)) {
            selectedIds.push(it.id);
          }
        }
        const res = deleteItems(currentDoc, selectedIds, ctx);
        newDoc = res.doc;
        break;
      }

      case 'setItemsCategory': {
        const items = currentDoc.membership.items;
        if (items.length === 0) return { doc: currentDoc, executed: false };
        const count = Math.min(items.length, (seed1 % 3) + 1);
        const selectedIds: Id[] = [];
        for (let i = 0; i < count; i++) {
          const it = items[(seed2 + i) % items.length]!;
          if (!selectedIds.includes(it.id)) {
            selectedIds.push(it.id);
          }
        }
        const categories = currentDoc.membership.categories;
        const category =
          categories.length > 0 && seed3 % 4 !== 0
            ? categories[seed3 % categories.length]!.id
            : null;
        const res = setItemsCategory(currentDoc, selectedIds, category, ctx);
        newDoc = res.doc;
        break;
      }

      case 'addTagToItems': {
        const items = currentDoc.membership.items;
        const tags = currentDoc.membership.tags;
        if (items.length === 0 || tags.length === 0) return { doc: currentDoc, executed: false };
        const count = Math.min(items.length, (seed1 % 3) + 1);
        const selectedIds: Id[] = [];
        for (let i = 0; i < count; i++) {
          const it = items[(seed2 + i) % items.length]!;
          if (!selectedIds.includes(it.id)) selectedIds.push(it.id);
        }
        const tag = tags[seed3 % tags.length]!;
        const res = addTagToItems(currentDoc, selectedIds, tag.id, ctx);
        newDoc = res.doc;
        break;
      }

      case 'removeTagFromItems': {
        const items = currentDoc.membership.items;
        const tags = currentDoc.membership.tags;
        if (items.length === 0 || tags.length === 0) return { doc: currentDoc, executed: false };
        const count = Math.min(items.length, (seed1 % 3) + 1);
        const selectedIds: Id[] = [];
        for (let i = 0; i < count; i++) {
          const it = items[(seed2 + i) % items.length]!;
          if (!selectedIds.includes(it.id)) selectedIds.push(it.id);
        }
        const tag = tags[seed3 % tags.length]!;
        const res = removeTagFromItems(currentDoc, selectedIds, tag.id, ctx);
        newDoc = res.doc;
        break;
      }

      case 'createCategory': {
        const categories = currentDoc.membership.categories;
        const parent =
          categories.length > 0 && seed2 % 3 !== 0
            ? categories[seed2 % categories.length]!.id
            : null;
        const res = createCategory(
          currentDoc,
          { name: `cat-${seed1 % 100}`, parent },
          ctx,
        );
        newDoc = res.doc;
        break;
      }

      case 'moveCategory': {
        const categories = currentDoc.membership.categories;
        if (categories.length === 0) return { doc: currentDoc, executed: false };
        const cat = categories[seed1 % categories.length]!;
        const otherCats = categories.filter(c => c.id !== cat.id);
        const parent =
          otherCats.length > 0 && seed2 % 4 !== 0
            ? otherCats[seed2 % otherCats.length]!.id
            : null;
        const res = moveCategory(currentDoc, cat.id, parent);
        newDoc = res.doc;
        break;
      }

      case 'deleteCategory': {
        const categories = currentDoc.membership.categories;
        if (categories.length === 0) return { doc: currentDoc, executed: false };
        const cat = categories[seed1 % categories.length]!;
        const res = deleteCategory(currentDoc, cat.id, ctx);
        newDoc = res.doc;
        break;
      }

      case 'createTag': {
        const res = createTag(currentDoc, { name: `tag-${seed1 % 100}` }, ctx);
        newDoc = res.doc;
        break;
      }

      case 'deleteTag': {
        const tags = currentDoc.membership.tags;
        if (tags.length === 0) return { doc: currentDoc, executed: false };
        const tag = tags[seed1 % tags.length]!;
        const res = deleteTag(currentDoc, tag.id, ctx);
        newDoc = res.doc;
        break;
      }

      case 'createKuukan': {
        const res = createKuukan(
          currentDoc,
          {
            name: `kuukan-${seed1 % 100}`,
            areaLabel: seed2 % 2 === 0 ? 'エリア' : '段',
          },
          ctx,
        );
        newDoc = res.doc;
        break;
      }

      case 'deleteKuukan': {
        const deletable = currentDoc.membership.kuukans.filter(k => k.id !== NIL_ID);
        if (deletable.length === 0) return { doc: currentDoc, executed: false };
        const kuukan = deletable[seed1 % deletable.length]!;
        const res = deleteKuukan(currentDoc, kuukan.id, ctx);
        newDoc = res.doc;
        break;
      }

      case 'makeStorage': {
        const storageOwnerIds = new Set(
          currentDoc.membership.kuukans.filter(k => k.owner !== null).map(k => k.owner),
        );
        const nonStorageItems = currentDoc.membership.items.filter(
          i => !storageOwnerIds.has(i.id),
        );
        if (nonStorageItems.length === 0) return { doc: currentDoc, executed: false };
        const item = nonStorageItems[seed1 % nonStorageItems.length]!;
        const res = makeStorage(currentDoc, item.id, { areaLabel: '段' }, ctx);
        newDoc = res.doc;
        break;
      }

      case 'removeStorage': {
        const storageKuukans = currentDoc.membership.kuukans.filter(k => k.owner !== null);
        if (storageKuukans.length === 0) return { doc: currentDoc, executed: false };
        const kuukan = storageKuukans[seed1 % storageKuukans.length]!;
        const res = removeStorage(currentDoc, kuukan.owner!, ctx);
        newDoc = res.doc;
        break;
      }

      case 'removeNotice': {
        const entitiesWithNotices: Array<{
          kind: 'kuukan' | 'area' | 'item' | 'category' | 'tag';
          id: Id;
          noticeCount: number;
        }> = [];
        for (const k of currentDoc.membership.kuukans) {
          if (k.notices && k.notices.length > 0) {
            entitiesWithNotices.push({ kind: 'kuukan', id: k.id, noticeCount: k.notices.length });
          }
        }
        for (const a of currentDoc.membership.areas) {
          if (a.notices && a.notices.length > 0) {
            entitiesWithNotices.push({ kind: 'area', id: a.id, noticeCount: a.notices.length });
          }
        }
        for (const it of currentDoc.membership.items) {
          if (it.notices && it.notices.length > 0) {
            entitiesWithNotices.push({ kind: 'item', id: it.id, noticeCount: it.notices.length });
          }
        }
        for (const c of currentDoc.membership.categories) {
          if (c.notices && c.notices.length > 0) {
            entitiesWithNotices.push({ kind: 'category', id: c.id, noticeCount: c.notices.length });
          }
        }
        for (const t of currentDoc.membership.tags) {
          if (t.notices && t.notices.length > 0) {
            entitiesWithNotices.push({ kind: 'tag', id: t.id, noticeCount: t.notices.length });
          }
        }
        if (entitiesWithNotices.length === 0) return { doc: currentDoc, executed: false };
        const ent = entitiesWithNotices[seed1 % entitiesWithNotices.length]!;
        const noticeIndex = seed2 % ent.noticeCount;
        const res = removeNotice(currentDoc, ent.kind, ent.id, noticeIndex);
        newDoc = res.doc;
        break;
      }

      case 'attachOutline': {
        const candidates = currentDoc.membership.kuukans.filter(
          k =>
            k.id !== NIL_ID &&
            currentDoc.drawing.kuukans.every(kd => kd.kuukan !== k.id) &&
            currentDoc.membership.areas.every(a => a.kuukan !== k.id),
        );
        if (candidates.length === 0) return { doc: currentDoc, executed: false };
        const kuukan = candidates[seed1 % candidates.length]!;
        const rectOutline: Point[] = [
          [0, 0],
          [10000, 0],
          [10000, 10000],
          [0, 10000],
        ];
        const lOutline: Point[] = [
          [0, 0],
          [10000, 0],
          [10000, 5000],
          [5000, 5000],
          [5000, 10000],
          [0, 10000],
        ];
        const uOutline: Point[] = [
          [0, 0],
          [10000, 0],
          [10000, 10000],
          [7000, 10000],
          [7000, 3000],
          [3000, 3000],
          [3000, 10000],
          [0, 10000],
        ];
        const outline = [rectOutline, lOutline, uOutline][seed2 % 3]!;
        const res = attachOutline(currentDoc, kuukan.id, { outline, aspect: 1.0 }, ctx);
        newDoc = res.doc;
        break;
      }

      case 'splitAt': {
        const drawnKuukans = currentDoc.drawing.kuukans;
        if (drawnKuukans.length === 0) return { doc: currentDoc, executed: false };
        const kd = drawnKuukans[seed1 % drawnKuukans.length]!;
        const axis: Axis = seed2 % 2 === 0 ? 'x' : 'y';
        const px = 1000 + (seed2 % 8000);
        const py = 1000 + (seed3 % 8000);
        const point: Point = [px, py];
        const res = splitAt(currentDoc, kd.kuukan, axis, point, ctx);
        newDoc = res.doc;
        break;
      }

      case 'splitEven': {
        const drawnKuukans = currentDoc.drawing.kuukans;
        if (drawnKuukans.length === 0) return { doc: currentDoc, executed: false };
        const kd = drawnKuukans[seed1 % drawnKuukans.length]!;
        const tree = buildAreaTree(currentDoc, kd.kuukan);
        const allNodes = [
          kd.kuukan,
          ...currentDoc.membership.areas
            .filter(a => a.kuukan === kd.kuukan)
            .map(a => a.id),
        ];
        const leafNodes = allNodes.filter(
          node => (tree.children.get(node)?.length ?? 0) === 0,
        );
        if (leafNodes.length === 0) return { doc: currentDoc, executed: false };
        const node = leafNodes[seed2 % leafNodes.length]!;
        const axis: Axis = seed3 % 2 === 0 ? 'x' : 'y';
        const n = 2 + (seed1 % 3); // 2..4
        const res = splitEven(currentDoc, node, axis, n, ctx);
        newDoc = res.doc;
        break;
      }

      case 'deleteLine': {
        const partitions = currentDoc.drawing.partitions;
        if (partitions.length === 0) return { doc: currentDoc, executed: false };
        const partition = partitions[seed1 % partitions.length]!;
        const lineIndex = seed2 % partition.at.length;
        const res = deleteLine(currentDoc, partition.area, lineIndex, ctx);
        newDoc = res.doc;
        break;
      }

      case 'moveLine': {
        const partitions = currentDoc.drawing.partitions;
        if (partitions.length === 0) return { doc: currentDoc, executed: false };
        const partition = partitions[seed1 % partitions.length]!;
        const lineIndex = seed2 % partition.at.length;

        const isKuukan = currentDoc.membership.kuukans.some(k => k.id === partition.area);
        const kuukanId = isKuukan
          ? partition.area
          : currentDoc.membership.areas.find(a => a.id === partition.area)?.kuukan;
        if (!kuukanId) return { doc: currentDoc, executed: false };

        const kd = currentDoc.drawing.kuukans.find(k => k.kuukan === kuukanId);
        if (!kd) return { doc: currentDoc, executed: false };

        const tree = buildAreaTree(currentDoc, kuukanId);
        const kuukanNodes = new Set<Id>([kuukanId]);
        for (const childList of tree.children.values()) {
          for (const ch of childList) kuukanNodes.add(ch);
        }
        const kuukanPartitions = currentDoc.drawing.partitions.filter(p =>
          kuukanNodes.has(p.area),
        );

        const range = dragRange(kd.outline, tree, kuukanPartitions, partition.area, lineIndex);
        if (range.min > range.max) return { doc: currentDoc, executed: false };
        const at =
          range.min === range.max
            ? range.min
            : range.min + (seed3 % (range.max - range.min + 1));
        const res = moveLine(currentDoc, partition.area, lineIndex, at);
        newDoc = res.doc;
        break;
      }
    }

    if (newDoc !== currentDoc) {
      history.record(currentDoc);
      return { doc: newDoc, executed: true };
    }
    return { doc: currentDoc, executed: false };
  } catch (err) {
    if (err instanceof OpError) {
      return { doc: currentDoc, executed: false, error: err };
    }
    throw err;
  }
}

/**
 * 空の文書から指定された操作列を順に適用して文書を構築する。
 */
export function applyOps(
  ops: OpCommand[],
  initialDoc: ArekokoDocument = createEmptyDocument(),
): { doc: ArekokoDocument; history: History } {
  const history = new History();
  const ctx = createPropertyTestContext();
  let doc = initialDoc;
  for (const op of ops) {
    const res = applyOp(doc, history, op, ctx);
    doc = res.doc;
  }
  return { doc, history };
}

// ---- 壊す方向のランダム検査（load.property.test）用補助 ----

export type CorruptionKind =
  | 'corruptPlace'
  | 'corruptCategory'
  | 'corruptTags'
  | 'corruptOwner'
  | 'corruptAreaParent'
  | 'corruptCategoryParent'
  | 'corruptAreaKuukan'
  | 'corruptPartitionArea'
  | 'corruptPartitionChildren'
  | 'corruptDrawingItem'
  | 'corruptDrawingKuukan'
  | 'duplicateId'
  | 'tempId'
  | 'uuidV4Id'
  | 'reservedNilId'
  | 'deleteElement'
  | 'invalidRotation'
  | 'corruptOutline'
  | 'corruptRoot';

export interface CorruptionSpec {
  kind: CorruptionKind;
  seed1: number;
  seed2: number;
  seed3: number;
}

export const corruptionArbitrary: fc.Arbitrary<CorruptionSpec> = fc.record({
  kind: fc.constantFrom<CorruptionKind>(
    'corruptPlace',
    'corruptCategory',
    'corruptTags',
    'corruptOwner',
    'corruptAreaParent',
    'corruptCategoryParent',
    'corruptAreaKuukan',
    'corruptPartitionArea',
    'corruptPartitionChildren',
    'corruptDrawingItem',
    'corruptDrawingKuukan',
    'duplicateId',
    'tempId',
    'uuidV4Id',
    'reservedNilId',
    'deleteElement',
    'invalidRotation',
    'corruptOutline',
    'corruptRoot',
  ),
  seed1: fc.nat(),
  seed2: fc.nat(),
  seed3: fc.nat(),
});

export function corruptionsListArbitrary(maxLength = 5): fc.Arbitrary<CorruptionSpec[]> {
  return fc.array(corruptionArbitrary, { minLength: 1, maxLength });
}

function makeNonExistentId(seed: number): string {
  const hex = (seed % 0xffffff).toString(16).padStart(12, '0');
  return `018f9999-9999-7999-8999-${hex}`;
}

function replaceIdInDoc(rawDoc: any, fromId: string, toId: string): void {
  for (const k of rawDoc.membership?.kuukans ?? []) {
    if (k.id === fromId) k.id = toId;
    if (k.owner === fromId) k.owner = toId;
  }
  for (const a of rawDoc.membership?.areas ?? []) {
    if (a.id === fromId) a.id = toId;
    if (a.kuukan === fromId) a.kuukan = toId;
    if (a.parent === fromId) a.parent = toId;
  }
  for (const it of rawDoc.membership?.items ?? []) {
    if (it.id === fromId) it.id = toId;
    if (it.place === fromId) it.place = toId;
    if (it.category === fromId) it.category = toId;
    if (Array.isArray(it.tags)) {
      it.tags = it.tags.map((t: string) => (t === fromId ? toId : t));
    }
  }
  for (const c of rawDoc.membership?.categories ?? []) {
    if (c.id === fromId) c.id = toId;
    if (c.parent === fromId) c.parent = toId;
  }
  for (const t of rawDoc.membership?.tags ?? []) {
    if (t.id === fromId) t.id = toId;
  }
  for (const dk of rawDoc.drawing?.kuukans ?? []) {
    if (dk.kuukan === fromId) dk.kuukan = toId;
  }
  for (const p of rawDoc.drawing?.partitions ?? []) {
    if (p.area === fromId) p.area = toId;
    if (Array.isArray(p.children)) {
      p.children = p.children.map((ch: string) => (ch === fromId ? toId : ch));
    }
  }
  for (const m of rawDoc.drawing?.markers ?? []) {
    if (m.id === fromId) m.id = toId;
    if (m.kuukan === fromId) m.kuukan = toId;
  }
  for (const di of rawDoc.drawing?.items ?? []) {
    if (di.item === fromId) di.item = toId;
  }
}

/**
 * 文書のディープコピーに対して、指定された破壊操作を適用した生オブジェクト（JSON）を返す。
 */
export function corruptDocument(
  doc: ArekokoDocument,
  corruptions: CorruptionSpec[],
): any {
  const raw: any = JSON.parse(JSON.stringify(doc));

  for (const c of corruptions) {
    const { kind, seed1, seed2, seed3 } = c;
    switch (kind) {
      case 'corruptPlace': {
        const items = raw.membership?.items;
        if (Array.isArray(items) && items.length > 0) {
          const it = items[seed1 % items.length];
          if (it) {
            if (seed2 % 2 === 0) {
              it.place = makeNonExistentId(seed3);
            } else {
              const categories = raw.membership?.categories ?? [];
              if (categories.length > 0) {
                it.place = categories[seed3 % categories.length].id;
              } else {
                it.place = makeNonExistentId(seed3);
              }
            }
          }
        }
        break;
      }

      case 'corruptCategory': {
        const items = raw.membership?.items;
        if (Array.isArray(items) && items.length > 0) {
          const it = items[seed1 % items.length];
          if (it) {
            if (seed2 % 2 === 0) {
              it.category = makeNonExistentId(seed3);
            } else {
              const kuukans = raw.membership?.kuukans ?? [];
              if (kuukans.length > 0) {
                it.category = kuukans[seed3 % kuukans.length].id;
              } else {
                it.category = makeNonExistentId(seed3);
              }
            }
          }
        }
        break;
      }

      case 'corruptTags': {
        const items = raw.membership?.items;
        if (Array.isArray(items) && items.length > 0) {
          const it = items[seed1 % items.length];
          if (it) {
            it.tags = it.tags ?? [];
            if (seed2 % 3 === 0) {
              it.tags.push(makeNonExistentId(seed3));
            } else if (seed2 % 3 === 1 && it.tags.length > 0) {
              it.tags.push(it.tags[0]);
            } else {
              it.tags.push(it.id);
            }
          }
        }
        break;
      }

      case 'corruptOwner': {
        const kuukans = raw.membership?.kuukans;
        if (Array.isArray(kuukans) && kuukans.length > 0) {
          const validKuukans = kuukans.filter((k: any) => k.id !== NIL_ID);
          if (validKuukans.length > 0) {
            const k = validKuukans[seed1 % validKuukans.length];
            if (k) {
              if (seed2 % 3 === 0) {
                k.owner = makeNonExistentId(seed3);
              } else if (seed2 % 3 === 1) {
                k.owner = k.id;
              } else {
                const items = raw.membership?.items ?? [];
                if (items.length > 0 && validKuukans.length >= 2) {
                  const sharedItem = items[seed3 % items.length].id;
                  validKuukans[0].owner = sharedItem;
                  validKuukans[1].owner = sharedItem;
                } else {
                  k.owner = makeNonExistentId(seed3);
                }
              }
            }
          }
        }
        break;
      }

      case 'corruptAreaParent': {
        const areas = raw.membership?.areas;
        if (Array.isArray(areas) && areas.length > 0) {
          const a = areas[seed1 % areas.length];
          if (a) {
            if (seed2 % 2 === 0) {
              a.parent = makeNonExistentId(seed3);
            } else {
              a.parent = a.id;
            }
          }
        }
        break;
      }

      case 'corruptCategoryParent': {
        const categories = raw.membership?.categories;
        if (Array.isArray(categories) && categories.length > 0) {
          if (categories.length >= 2 && seed2 % 2 === 0) {
            const c0 = categories[0];
            const c1 = categories[1];
            c0.parent = c1.id;
            c1.parent = c0.id;
          } else {
            const c = categories[seed1 % categories.length];
            if (c) c.parent = makeNonExistentId(seed3);
          }
        }
        break;
      }

      case 'corruptAreaKuukan': {
        const areas = raw.membership?.areas;
        if (Array.isArray(areas) && areas.length > 0) {
          const a = areas[seed1 % areas.length];
          if (a) {
            a.kuukan = seed2 % 2 === 0 ? makeNonExistentId(seed3) : NIL_ID;
          }
        }
        break;
      }

      case 'corruptPartitionArea': {
        const partitions = raw.drawing?.partitions;
        if (Array.isArray(partitions) && partitions.length > 0) {
          const p = partitions[seed1 % partitions.length];
          if (p) p.area = makeNonExistentId(seed3);
        }
        break;
      }

      case 'corruptPartitionChildren': {
        const partitions = raw.drawing?.partitions;
        if (Array.isArray(partitions) && partitions.length > 0) {
          const p = partitions[seed1 % partitions.length];
          if (p && Array.isArray(p.children) && p.children.length > 0) {
            const idx = seed2 % p.children.length;
            p.children[idx] = makeNonExistentId(seed3);
          }
        }
        break;
      }

      case 'corruptDrawingItem': {
        const dItems = raw.drawing?.items;
        if (Array.isArray(dItems) && dItems.length > 0) {
          const di = dItems[seed1 % dItems.length];
          if (di) di.item = makeNonExistentId(seed3);
        }
        break;
      }

      case 'corruptDrawingKuukan': {
        const dKuukans = raw.drawing?.kuukans;
        if (Array.isArray(dKuukans) && dKuukans.length > 0) {
          const dk = dKuukans[seed1 % dKuukans.length];
          if (dk) {
            dk.kuukan = seed2 % 2 === 0 ? makeNonExistentId(seed3) : NIL_ID;
          }
        }
        break;
      }

      case 'duplicateId': {
        const allDefs: Array<{ id: string }> = [
          ...(raw.membership?.kuukans ?? []),
          ...(raw.membership?.areas ?? []),
          ...(raw.membership?.items ?? []),
          ...(raw.membership?.categories ?? []),
          ...(raw.membership?.tags ?? []),
        ];
        if (allDefs.length >= 2) {
          const idxA = seed1 % allDefs.length;
          let idxB = seed2 % allDefs.length;
          if (idxA === idxB) idxB = (idxB + 1) % allDefs.length;
          allDefs[idxA]!.id = allDefs[idxB]!.id;
        }
        break;
      }

      case 'tempId': {
        const allDefs: Array<{ id: string }> = [
          ...(raw.membership?.kuukans?.filter((k: any) => k.id !== NIL_ID) ?? []),
          ...(raw.membership?.areas ?? []),
          ...(raw.membership?.items ?? []),
          ...(raw.membership?.categories ?? []),
          ...(raw.membership?.tags ?? []),
        ];
        if (allDefs.length > 0) {
          const elem = allDefs[seed1 % allDefs.length]!;
          const oldId = elem.id;
          const tempId = `new:temp_${seed3 % 1000}`;
          elem.id = tempId;
          if (seed2 % 2 === 0) {
            replaceIdInDoc(raw, oldId, tempId);
          }
        }
        break;
      }

      case 'uuidV4Id': {
        const allDefs: Array<{ id: string }> = [
          ...(raw.membership?.kuukans?.filter((k: any) => k.id !== NIL_ID) ?? []),
          ...(raw.membership?.areas ?? []),
          ...(raw.membership?.items ?? []),
          ...(raw.membership?.categories ?? []),
          ...(raw.membership?.tags ?? []),
        ];
        if (allDefs.length > 0) {
          const elem = allDefs[seed1 % allDefs.length]!;
          const oldId = elem.id;
          const hex = (seed3 % 0xffffff).toString(16).padStart(12, '0');
          const v4Id = `a0000000-0000-4000-8000-${hex}`;
          elem.id = v4Id;
          if (seed2 % 2 === 0) {
            replaceIdInDoc(raw, oldId, v4Id);
          }
        }
        break;
      }

      case 'reservedNilId': {
        const allDefs: Array<{ id: string }> = [
          ...(raw.membership?.areas ?? []),
          ...(raw.membership?.items ?? []),
          ...(raw.membership?.categories ?? []),
          ...(raw.membership?.tags ?? []),
        ];
        if (allDefs.length > 0) {
          const elem = allDefs[seed1 % allDefs.length]!;
          elem.id = NIL_ID;
        }
        break;
      }

      case 'deleteElement': {
        const collections = ['kuukans', 'areas', 'items', 'categories', 'tags'] as const;
        const colName = collections[seed1 % collections.length]!;
        const col = raw.membership?.[colName];
        if (Array.isArray(col) && col.length > 0) {
          const idx = seed2 % col.length;
          col.splice(idx, 1);
        }
        break;
      }

      case 'invalidRotation': {
        const items = raw.drawing?.items;
        if (Array.isArray(items) && items.length > 0) {
          const di = items[seed1 % items.length];
          if (di) di.rotation = 9;
        } else {
          const markers = raw.drawing?.markers;
          if (Array.isArray(markers) && markers.length > 0) {
            const m = markers[seed1 % markers.length];
            if (m) m.rotation = 9;
          }
        }
        break;
      }

      case 'corruptOutline': {
        const dKuukans = raw.drawing?.kuukans;
        if (Array.isArray(dKuukans) && dKuukans.length > 0) {
          const dk = dKuukans[seed1 % dKuukans.length];
          if (dk) {
            dk.outline = [
              [0, 0],
              [10000, 0],
            ];
          }
        }
        break;
      }

      case 'corruptRoot': {
        if (seed2 % 3 === 0) {
          raw.app = 'other_app';
        } else if (seed2 % 3 === 1) {
          raw.schemaVersion = 999;
        } else {
          raw.schemaVersion = 0;
        }
        break;
      }
    }
  }

  return raw;
}
