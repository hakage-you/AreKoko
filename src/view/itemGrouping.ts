// 右ペインのモノ一覧におけるエリア別グルーピングロジック

import type { ArekokoDocument, Id, Item } from '../core/types';
import { buildAreaTree } from '../core/indexes';
import { displayName } from '../core/places';

export interface AreaItemGroup {
  /** エリアID。クウカンそのものに置いたモノのグループは null */
  areaId: Id | null;
  /** グループ表示名（例: "床1", "床2"。クウカンそのものはクウカンの名前） */
  name: string;
  /** このエリアに属するアイテム一覧 */
  items: Item[];
  /** このエリアが現在選択中かどうか */
  isSelected: boolean;
}

export interface GroupItemsByAreaOptions {
  doc: ArekokoDocument;
  kuukanId: Id;
  items: Item[];
  selectedAreaId: Id | null;
}

export interface GroupItemsResult {
  /** エリアが存在するかどうか（分割されていない部屋なら false） */
  hasAreas: boolean;
  /** グループ一覧 */
  groups: AreaItemGroup[];
}

/**
 * モノ一覧をエリア別にグループ化する。
 * エリアがないクウカンの場合は hasAreas: false で全アイテムを1グループにして返す。
 * エリアがある場合は、クウカンそのものに置いたモノがあれば先頭にクウカンの名前のグループ、続いてエリアを木の順に置く
 * （分けていないエリアはいつも、中を分けたエリアは直接置かれたモノがあるときだけ）。
 */
export function groupItemsByArea(options: GroupItemsByAreaOptions): GroupItemsResult {
  const { doc, kuukanId, items, selectedAreaId } = options;

  const areas = doc.membership.areas.filter((a) => a.kuukan === kuukanId);
  const kuukanName = displayName(doc, kuukanId);

  // 1. エリアが1つもないクウカンの場合
  if (areas.length === 0) {
    return {
      hasAreas: false,
      groups: [
        {
          areaId: null,
          name: kuukanName,
          items,
          isSelected: false,
        },
      ],
    };
  }

  // 2. エリアが存在する場合
  const tree = buildAreaTree(doc, kuukanId);

  // アイテムを place ごとに分類
  const itemsByPlace = new Map<Id, Item[]>();
  for (const item of items) {
    const list = itemsByPlace.get(item.place) ?? [];
    list.push(item);
    itemsByPlace.set(item.place, list);
  }

  const groups: AreaItemGroup[] = [];

  // クウカンそのものに置いたモノ。名前はクウカンの名前（「未設定」は置き場のないモノの言葉なので使わない。設計 4章）
  const direct = itemsByPlace.get(kuukanId) ?? [];
  if (direct.length > 0) {
    groups.push({ areaId: null, name: kuukanName, items: direct, isSelected: false });
  }

  // エリアを木の順（親が先）に。分けていないエリアはいつも出す。中を分けたエリアは、直接置かれたモノがあるときだけ出す
  // （下のエリアの中身はその行に出る。A-32 と同じ数え方）。中を分けたエリアのモノを隠さない
  function traverse(nodeId: Id): void {
    const children = tree.children.get(nodeId) ?? [];
    if (nodeId !== kuukanId) {
      const areaItems = itemsByPlace.get(nodeId) ?? [];
      if (children.length === 0 || areaItems.length > 0) {
        const areaObj = doc.membership.areas.find((a) => a.id === nodeId);
        groups.push({
          areaId: nodeId,
          name: areaObj?.name ?? displayName(doc, nodeId),
          items: areaItems,
          isSelected: selectedAreaId === nodeId,
        });
      }
    }
    for (const childId of children) traverse(childId);
  }
  traverse(kuukanId);

  return {
    hasAreas: true,
    groups,
  };
}
