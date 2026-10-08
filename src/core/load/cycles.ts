import type { Id, Kuukan, Area, Item, Category } from '../types';
import type { Refusal } from './index';
import { getKuukanDisplayName } from './membership';

export function checkCycles(membership: {
  kuukans: Kuukan[];
  areas: Area[];
  items: Item[];
  categories: Category[];
}): Refusal | null {
  // 1. カテゴリの輪
  const categoryMap = new Map<Id, Category>(membership.categories.map(c => [c.id, c]));
  for (const startCat of membership.categories) {
    const visited: Category[] = [];
    const visitedSet = new Set<Id>();
    let curr: Category | undefined = startCat;

    while (curr) {
      if (visitedSet.has(curr.id)) {
        const cycleIdx = visited.findIndex(x => x.id === curr!.id);
        const cycle = visited.slice(cycleIdx);
        cycle.push(curr);
        const names = cycle.map(x => x.name).join(' → ');
        return {
          code: 'cycleCategory',
          message: `カテゴリの親子関係が輪になっています：${names}`,
        };
      }
      visited.push(curr);
      visitedSet.add(curr.id);
      curr = curr.parent ? categoryMap.get(curr.parent) : undefined;
    }
  }

  // 2. エリアの輪
  const areaMap = new Map<Id, Area>(membership.areas.map(a => [a.id, a]));
  for (const startArea of membership.areas) {
    const visited: Area[] = [];
    const visitedSet = new Set<Id>();
    let curr: Area | undefined = startArea;

    while (curr) {
      if (visitedSet.has(curr.id)) {
        const cycleIdx = visited.findIndex(x => x.id === curr!.id);
        const cycle = visited.slice(cycleIdx);
        cycle.push(curr);
        const names = cycle.map(x => x.name).join(' → ');
        return {
          code: 'cycleArea',
          message: `エリアの親子関係が輪になっています：${names}`,
        };
      }
      visited.push(curr);
      visitedSet.add(curr.id);
      curr = curr.parent ? areaMap.get(curr.parent) : undefined;
    }
  }

  // 3. 収納の入れ子の輪
  const itemMap = new Map<Id, Item>(membership.items.map(i => [i.id, i]));
  const kuukanMap = new Map<Id, Kuukan>(membership.kuukans.map(k => [k.id, k]));

  function getKuukanOfPlace(placeId: Id): Id | null {
    if (kuukanMap.has(placeId)) return placeId;
    const a = areaMap.get(placeId);
    if (a) return a.kuukan;
    return null;
  }

  const storageKuukans = membership.kuukans.filter(k => k.owner !== null);
  for (const startK of storageKuukans) {
    const visited: Kuukan[] = [];
    const visitedSet = new Set<Id>();
    let currK: Kuukan | undefined = startK;

    while (currK && currK.owner) {
      if (visitedSet.has(currK.id)) {
        const cycleIdx = visited.findIndex(x => x.id === currK!.id);
        const cycle = visited.slice(cycleIdx);
        cycle.push(currK);
        const names = cycle.map(x => getKuukanDisplayName(x, itemMap)).join(' → ');
        return {
          code: 'cycleNesting',
          message: `収納の入れ子が輪になっています：${names}`,
        };
      }
      visited.push(currK);
      visitedSet.add(currK.id);

      const ownerItem = itemMap.get(currK.owner);
      if (!ownerItem) break;
      const nextKuukanId = getKuukanOfPlace(ownerItem.place);
      if (!nextKuukanId) break;
      currK = kuukanMap.get(nextKuukanId);
    }
  }

  return null;
}
