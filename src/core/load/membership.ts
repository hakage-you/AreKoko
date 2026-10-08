import type { Id, Kuukan, Area, Item, Category, Tag } from '../types';
import type { RepairEntry } from './index';
import type { IdResolver } from './ids';
import type { NoticeManager } from './notices';
import { NIL_ID, UNSET_NAME, DEFAULT_AREA_LABEL, NAMELESS_NAME } from '../constants';

export function getKuukanDisplayName(kuukan: Kuukan, itemsById: Map<Id, Item>): string {
  if (kuukan.id === NIL_ID) {
    return UNSET_NAME;
  }
  if (kuukan.owner) {
    const ownerItem = itemsById.get(kuukan.owner);
    if (ownerItem?.name) {
      return ownerItem.name;
    }
  }
  return kuukan.name ?? NAMELESS_NAME;
}

export function repairMembership(
  membership: {
    kuukans: Kuukan[];
    areas: Area[];
    items: Item[];
    categories: Category[];
    tags: Tag[];
  },
  resolver: IdResolver,
  notices: NoticeManager,
  repairs: RepairEntry[]
): void {
  const itemsById = new Map<Id, Item>(membership.items.map(it => [it.id, it]));

  // 1. クウカン
  // 1.1 owner を引く。モノでなければ null（ownerMissing）
  for (const k of membership.kuukans) {
    if (k.id === NIL_ID) continue;
    if (k.owner !== null) {
      const resolvedOwner = resolver.resolveWithKind(k.owner, ['item']);
      if (!resolvedOwner) {
        k.owner = null;
        const name = getKuukanDisplayName(k, itemsById);
        repairs.push({
          code: 'ownerMissing',
          message: `クウカン「${name}」：持ち主のモノが見つからないため、どこにも置かれていないクウカンにします`,
          target: { kind: 'kuukan', id: k.id },
        });
        notices.addNotice(k, 'ownerMissing');
      } else {
        k.owner = resolvedOwner;
      }
    }
  }

  // 1.2 同じモノを持ち主にするクウカンが2つ以上あれば、それらすべての owner を null（ownerShared）
  const kuukansByOwner = new Map<Id, Kuukan[]>();
  for (const k of membership.kuukans) {
    if (k.owner) {
      let list = kuukansByOwner.get(k.owner);
      if (!list) {
        list = [];
        kuukansByOwner.set(k.owner, list);
      }
      list.push(k);
    }
  }
  for (const [, sharedList] of kuukansByOwner) {
    if (sharedList.length > 1) {
      for (const k of sharedList) {
        k.owner = null;
        const name = getKuukanDisplayName(k, itemsById);
        repairs.push({
          code: 'ownerShared',
          message: `クウカン「${name}」：1つのモノが複数のクウカンを持っていたため、持ち主を外します`,
          target: { kind: 'kuukan', id: k.id },
        });
        notices.addNotice(k, 'ownerShared');
      }
    }
  }

  // 1.3 未設定のクウカンの owner が null でなければ null（unsetHasOwner）
  const unsetKuukan = membership.kuukans.find(k => k.id === NIL_ID);
  if (unsetKuukan && unsetKuukan.owner !== null) {
    unsetKuukan.owner = null;
    repairs.push({
      code: 'unsetHasOwner',
      message: '未設定のクウカンに持ち主が設定されていたため外します',
      target: { kind: 'kuukan', id: NIL_ID },
    });
  }

  // 1.4 owner が null になったのに name がないクウカンは、name を「名前なし」にする（D3）
  for (const k of membership.kuukans) {
    if (k.id !== NIL_ID && k.owner === null) {
      // 空文字は利用者が付けた名前なので変えない。名前そのものがないときだけ補う（D3）。
      if (k.name === undefined) {
        k.name = NAMELESS_NAME;
      }
    }
  }

  // 1.5 未設定のクウカンがなければ作り、kuukans の先頭に置く（missingUnset）
  if (!unsetKuukan) {
    const newUnset: Kuukan = {
      id: NIL_ID,
      name: UNSET_NAME,
      owner: null,
      areaLabel: DEFAULT_AREA_LABEL,
    };
    membership.kuukans.unshift(newUnset);
    repairs.push({
      code: 'missingUnset',
      message: '未設定のクウカンが存在しないため作ります',
      target: { kind: 'kuukan', id: NIL_ID },
    });
  }

  // 2. エリア
  const kuukanSet = new Set<Id>(membership.kuukans.map(k => k.id));
  const removedAreaIds = new Map<Id, 'areaKuukanMissing' | 'unsetHasAreas'>();
  const remainingAreas: Area[] = [];

  for (const a of membership.areas) {
    const rawKuukan = a.kuukan;
    const kuukanId = resolver.resolveWithKind(rawKuukan, ['kuukan']);

    if (!kuukanId || !kuukanSet.has(kuukanId)) {
      // 2.1 kuukan を引く。クウカンでなければ、そのエリアを外す（areaKuukanMissing）
      removedAreaIds.set(a.id, 'areaKuukanMissing');
      repairs.push({
        code: 'areaKuukanMissing',
        message: `エリア「${a.name}」：所属するクウカンが見つからないため外します`,
        target: { kind: 'area', id: a.id },
      });
    } else if (kuukanId === NIL_ID) {
      // 2.2 kuukan が未設定のクウカンなら、そのエリアを外す（unsetHasAreas）
      removedAreaIds.set(a.id, 'unsetHasAreas');
      repairs.push({
        code: 'unsetHasAreas',
        message: `エリア「${a.name}」：未設定のクウカンはエリアを持てないため外します`,
        target: { kind: 'area', id: a.id },
      });
    } else {
      a.kuukan = kuukanId;
      remainingAreas.push(a);
    }
  }

  // 2.3 残ったエリアの parent を引く。残ったエリアで、かつ同じクウカンのものでなければ null（areaParentMissing）
  const remainingAreaMap = new Map<Id, Area>(remainingAreas.map(a => [a.id, a]));
  for (const a of remainingAreas) {
    if (a.parent !== null) {
      const parentId = resolver.resolveWithKind(a.parent, ['area']);
      const parentArea = parentId ? remainingAreaMap.get(parentId) : undefined;
      if (!parentArea || parentArea.kuukan !== a.kuukan) {
        a.parent = null;
        repairs.push({
          code: 'areaParentMissing',
          message: `エリア「${a.name}」：親のエリアの参照先が見つからないため、クウカンの直下へ移します`,
          target: { kind: 'area', id: a.id },
        });
        notices.addNotice(a, 'areaParentMissing');
      } else {
        a.parent = parentId!;
      }
    }
  }
  membership.areas = remainingAreas;

  // 3. モノ
  for (const item of membership.items) {
    // 3.1 place を引く。クウカンか、残ったエリアでなければ、未設定（Nil）へ移す
    const resolvedPlace = resolver.resolve(item.place);
    const isValidPlace =
      resolvedPlace !== null &&
      (kuukanSet.has(resolvedPlace) || remainingAreaMap.has(resolvedPlace));

    if (!isValidPlace) {
      const removedReason = resolvedPlace ? removedAreaIds.get(resolvedPlace) : undefined;
      item.place = NIL_ID;

      const code = removedReason ?? 'placeMissing';
      let message = '';
      if (code === 'areaKuukanMissing') {
        message = `モノ「${item.name}」：置き場のエリアが属するクウカンが見つからなかったため未設定へ移します`;
      } else if (code === 'unsetHasAreas') {
        message = `モノ「${item.name}」：未設定のクウカンはエリアを持てないため、未設定へ移します`;
      } else {
        message = `モノ「${item.name}」：置き場の参照先が見つからないため、未設定へ移します`;
      }

      repairs.push({
        code,
        message,
        target: { kind: 'item', id: item.id },
      });
      notices.addNotice(item, code);
    } else {
      item.place = resolvedPlace!;
    }

    // 3.2 category を引く。カテゴリでなければ null（categoryMissing）
    if (item.category !== null) {
      const catId = resolver.resolveWithKind(item.category, ['category']);
      if (!catId) {
        item.category = null;
        repairs.push({
          code: 'categoryMissing',
          message: `モノ「${item.name}」：カテゴリの参照先が見つからないため未分類にします`,
          target: { kind: 'item', id: item.id },
        });
        notices.addNotice(item, 'categoryMissing');
      } else {
        item.category = catId;
      }
    }

    // 3.3 tags の各要素を引く。タグでないものを外す（tagMissing）。重複を外す（tagDuplicate）
    let tagMissing = false;
    const validTags: Id[] = [];
    for (const rawTag of item.tags) {
      const tagId = resolver.resolveWithKind(rawTag, ['tag']);
      if (!tagId) {
        tagMissing = true;
      } else {
        validTags.push(tagId);
      }
    }
    if (tagMissing) {
      repairs.push({
        code: 'tagMissing',
        message: `モノ「${item.name}」：タグの参照先が見つからないため、そのタグを外します`,
        target: { kind: 'item', id: item.id },
      });
      notices.addNotice(item, 'tagMissing');
    }

    let tagDuplicate = false;
    const uniqueTags: Id[] = [];
    const seenTags = new Set<Id>();
    for (const tagId of validTags) {
      if (seenTags.has(tagId)) {
        tagDuplicate = true;
      } else {
        seenTags.add(tagId);
        uniqueTags.push(tagId);
      }
    }
    if (tagDuplicate) {
      repairs.push({
        code: 'tagDuplicate',
        message: `モノ「${item.name}」：同じタグが重複していたため1つにまとめます`,
        target: { kind: 'item', id: item.id },
      });
      notices.addNotice(item, 'tagDuplicate');
    }
    item.tags = uniqueTags;
  }

  // 4. カテゴリ
  const categoryMap = new Map<Id, Category>(membership.categories.map(c => [c.id, c]));
  for (const c of membership.categories) {
    if (c.parent !== null) {
      const parentId = resolver.resolveWithKind(c.parent, ['category']);
      if (!parentId || !categoryMap.has(parentId)) {
        c.parent = null;
        repairs.push({
          code: 'categoryParentMissing',
          message: `カテゴリ「${c.name}」：親カテゴリの参照先が見つからないため、いちばん上へ移します`,
          target: { kind: 'category', id: c.id },
        });
        notices.addNotice(c, 'categoryParentMissing');
      } else {
        c.parent = parentId;
      }
    }
  }
}
