// 置き場変更ダイアログ向けのツリー構造・グループ化ロジック

import type { ArekokoDocument, Id } from '../../core/types';
import { NIL_ID, UNSET_NAME, NAMELESS_NAME } from '../../core/constants';
import { getIndexes } from '../../core/indexes';
import { displayName, formatPlacePath, placePath } from '../../core/places';
import { normalizeForMatch } from '../../search/normalize';

export interface PlaceNode {
  id: Id;
  name: string;
  depth: number;
  kind?: 'kuukan' | 'area' | 'unset';
  kuukanId?: Id;
  isStorage?: boolean;
  isCurrent: boolean;
  isSelectable: boolean;
}

export interface PlaceSection {
  id: string;
  type: 'active' | 'unset' | 'other';
  title?: string;
  badge?: string;
  nodes: PlaceNode[];
}

export interface GroupPlaceTreeOptions {
  doc: ArekokoDocument;
  candidateIds: Set<Id>;
  current?: Id | null;
  activeKuukanId?: Id | null;
}

export interface PlaceSearchResult {
  id: Id;
  name: string;
  path: string;
  isCurrent: boolean;
  isActiveKuukan: boolean;
}

/**
 * 候補置き場を「表示中クウカン」「未設定」「その他のクウカン」にグループ化して返す。
 * ユーザー指定順序:
 * 1. 表示中のクウカン（いま見ている部屋とその中身）
 * 2. 未設定（置き場なし）
 * 3. その他のクウカン（別の部屋等）
 */
export function groupPlaceTreeNodes(options: GroupPlaceTreeOptions): PlaceSection[] {
  const { doc, candidateIds, current = null, activeKuukanId = null } = options;
  const indexes = getIndexes(doc);
  const visited = new Set<Id>();

  function traversePlace(placeId: Id, depth: number, acc: PlaceNode[]) {
    // 1. エリア
    const areas =
      indexes.areaById.has(placeId)
        ? (indexes.childAreas.get(placeId) ?? [])
        : doc.membership.areas.filter((a) => a.kuukan === placeId && a.parent === null);

    for (const area of areas) {
      if (visited.has(area.id)) continue;
      visited.add(area.id);

      acc.push({
        id: area.id,
        name: area.name,
        depth,
        kind: 'area',
        kuukanId: area.kuukan,
        isCurrent: current === area.id,
        isSelectable: candidateIds.has(area.id),
      });

      traversePlace(area.id, depth + 1, acc);
    }

    // 2. 収納
    const itemsInPlace = indexes.itemsByPlace.get(placeId) ?? [];
    for (const it of itemsInPlace) {
      const storageKuukan = indexes.kuukanByOwner.get(it.id);
      if (!storageKuukan) continue;
      if (visited.has(storageKuukan.id)) continue;
      visited.add(storageKuukan.id);

      acc.push({
        id: storageKuukan.id,
        name: it.name,
        depth,
        kind: 'kuukan',
        kuukanId: storageKuukan.id,
        isStorage: true,
        isCurrent: current === storageKuukan.id,
        isSelectable: candidateIds.has(storageKuukan.id),
      });

      traversePlace(storageKuukan.id, depth + 1, acc);
    }
  }

  function buildKuukanTree(kId: Id): PlaceNode[] {
    const k = indexes.kuukanById.get(kId);
    if (!k || visited.has(k.id)) return [];
    visited.add(k.id);

    const nodes: PlaceNode[] = [];
    nodes.push({
      id: k.id,
      name: k.name ?? NAMELESS_NAME,
      depth: 0,
      kind: 'kuukan',
      kuukanId: k.id,
      isCurrent: current === k.id,
      isSelectable: candidateIds.has(k.id),
    });

    traversePlace(k.id, 1, nodes);
    return nodes;
  }

  const sections: PlaceSection[] = [];

  // 未設定ノード
  const unsetNode: PlaceNode | null = candidateIds.has(NIL_ID)
    ? {
        id: NIL_ID,
        name: UNSET_NAME,
        depth: 0,
        kind: 'unset',
        kuukanId: NIL_ID,
        isCurrent: current === NIL_ID,
        isSelectable: true,
      }
    : null;

  // A. activeKuukanId が指定されている場合
  if (activeKuukanId !== null && indexes.kuukanById.has(activeKuukanId)) {
    const activeKuukan = indexes.kuukanById.get(activeKuukanId)!;
    // activeKuukan が収納などの場合はそのルートクウカンを使うか、自身を使う
    const targetRootKuukanId = activeKuukan.owner ? activeKuukan.id : activeKuukan.id;
    const activeNodes = buildKuukanTree(targetRootKuukanId);

    if (activeNodes.length > 0) {
      sections.push({
        id: 'active',
        type: 'active',
        title: '表示中のクウカン',
        badge: activeKuukan.name ?? NAMELESS_NAME,
        nodes: activeNodes,
      });
    }

    // 2. 未設定（二番目）
    if (unsetNode) {
      sections.push({
        id: 'unset',
        type: 'unset',
        nodes: [unsetNode],
      });
    }

    // 3. その他のクウカン
    const otherTopKuukans = doc.membership.kuukans.filter(
      (k) => k.id !== NIL_ID && k.owner === null && k.id !== targetRootKuukanId,
    );

    const otherNodes: PlaceNode[] = [];
    for (const k of otherTopKuukans) {
      const nodes = buildKuukanTree(k.id);
      otherNodes.push(...nodes);
    }

    if (otherNodes.length > 0) {
      sections.push({
        id: 'other',
        type: 'other',
        title: 'その他のクウカン',
        nodes: otherNodes,
      });
    }
  } else {
    // B. activeKuukanId が未指定の場合
    if (unsetNode) {
      sections.push({
        id: 'unset',
        type: 'unset',
        nodes: [unsetNode],
      });
    }

    const topKuukans = doc.membership.kuukans.filter(
      (k) => k.id !== NIL_ID && k.owner === null,
    );

    const otherNodes: PlaceNode[] = [];
    for (const k of topKuukans) {
      const nodes = buildKuukanTree(k.id);
      otherNodes.push(...nodes);
    }

    if (otherNodes.length > 0) {
      sections.push({
        id: 'other',
        type: 'other',
        nodes: otherNodes,
      });
    }
  }

  return sections;
}

/**
 * 検索クエリに基づき候補置き場を絞り込み、表示中クウカンフラグを付与して返す。
 */
export function searchPlaceCandidates(
  doc: ArekokoDocument,
  candidateIds: Set<Id>,
  searchQuery: string,
  current: Id | null,
  activeKuukanId?: Id | null,
): PlaceSearchResult[] {
  if (!searchQuery.trim()) return [];
  const q = normalizeForMatch(searchQuery);
  const results: PlaceSearchResult[] = [];

  for (const id of candidateIds) {
    const name = displayName(doc, id);
    const path = formatPlacePath(doc, id);
    if (normalizeForMatch(name).includes(q) || normalizeForMatch(path).includes(q)) {
      const pSteps = placePath(doc, id);
      const isUnderActive = activeKuukanId !== null && (id === activeKuukanId || (pSteps.length > 0 && pSteps[0]!.id === activeKuukanId));
      results.push({
        id,
        name,
        path,
        isCurrent: id === current,
        isActiveKuukan: Boolean(isUnderActive),
      });
    }
  }

  return results;
}
