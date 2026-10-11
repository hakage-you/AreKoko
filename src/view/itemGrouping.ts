// 右ペインのモノ一覧におけるエリア別グルーピングロジック

import type { ArekokoDocument, Id, Item } from '../core/types';
import { buildAreaTree } from '../core/indexes';
import { displayName } from '../core/places';

export interface AreaItemGroup {
  /** エリアID。クウカン直下（エリア未設定）の場合は null */
  areaId: Id | null;
  /** グループ表示名（例: "床1", "床2", "エリア未設定"） */
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
 * エリアがある場合は、エリアの木順に各エリアグループを配置し、クウカン直下のアイテムがあれば「エリア未設定」グループを追加する。
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

  // 葉エリア（または全エリア）をツリー順に取得
  const orderedAreaIds: Id[] = [];
  function traverse(nodeId: Id): void {
    const children = tree.children.get(nodeId) ?? [];
    if (children.length === 0) {
      if (nodeId !== kuukanId) {
        orderedAreaIds.push(nodeId);
      }
    } else {
      for (const childId of children) {
        traverse(childId);
      }
    }
  }
  traverse(kuukanId);

  // アイテムを place ごとに分類
  const itemsByPlace = new Map<Id, Item[]>();
  for (const item of items) {
    const list = itemsByPlace.get(item.place) ?? [];
    list.push(item);
    itemsByPlace.set(item.place, list);
  }

  const groups: AreaItemGroup[] = [];

  // 各エリアのグループを作成
  for (const aId of orderedAreaIds) {
    const areaObj = doc.membership.areas.find((a) => a.id === aId);
    const areaName = areaObj?.name ?? displayName(doc, aId);
    const areaItems = itemsByPlace.get(aId) ?? [];

    groups.push({
      areaId: aId,
      name: areaName,
      items: areaItems,
      isSelected: selectedAreaId === aId,
    });
  }

  // クウカン直下（エリア未設定）のアイテムがあれば追加
  const unsetItems = itemsByPlace.get(kuukanId) ?? [];
  if (unsetItems.length > 0) {
    groups.push({
      areaId: null,
      name: 'エリア未設定',
      items: unsetItems,
      isSelected: false,
    });
  }

  return {
    hasAreas: true,
    groups,
  };
}
