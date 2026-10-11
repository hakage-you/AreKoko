import { describe, it, expect } from 'vitest';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';
import { groupItemsByArea, type AreaItemGroup } from '../../src/view/itemGrouping';
import type { ArekokoDocument, Item } from '../../src/core/types';

describe('groupItemsByArea', () => {
  it('エリアが存在しないクウカンでは、hasAreas: false で全アイテムが単一グループにまとまる', () => {
    const doc = createSampleDocument();
    // monooki はエリアなし
    const monookiId = makeDeterministicId(99);
    doc.membership.kuukans.push({
      id: monookiId,
      name: '物置',
      owner: null,
      areaLabel: 'エリア',
    });

    const items: Item[] = [
      { id: makeDeterministicId(101), name: '脚立', place: monookiId, category: null, tags: [] },
      { id: makeDeterministicId(102), name: '工具箱', place: monookiId, category: null, tags: [] },
    ];

    const result = groupItemsByArea({
      doc,
      kuukanId: monookiId,
      items,
      selectedAreaId: null,
    });

    expect(result.hasAreas).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.areaId).toBeNull();
    expect(result.groups[0]!.items).toHaveLength(2);
  });

  it('エリアが存在するクウカンでは、エリアごとにアイテムがグループ化される', () => {
    const doc = createSampleDocument();
    // shelfKuukan には dan1, dan2 の2つのエリアがある
    const shelfKuukanId = FIXTURE_IDS.shelfKuukan;

    const items: Item[] = [
      { id: makeDeterministicId(101), name: 'アイテムA', place: FIXTURE_IDS.dan1, category: null, tags: [] },
      { id: makeDeterministicId(102), name: 'アイテムB', place: FIXTURE_IDS.dan1, category: null, tags: [] },
      { id: makeDeterministicId(103), name: 'アイテムC', place: FIXTURE_IDS.dan2, category: null, tags: [] },
    ];

    const result = groupItemsByArea({
      doc,
      kuukanId: shelfKuukanId,
      items,
      selectedAreaId: FIXTURE_IDS.dan2,
    });

    expect(result.hasAreas).toBe(true);
    expect(result.groups).toHaveLength(2);

    const dan1Group = result.groups.find((g) => g.areaId === FIXTURE_IDS.dan1);
    expect(dan1Group).toBeDefined();
    expect(dan1Group?.name).toBe('段1');
    expect(dan1Group?.items).toHaveLength(2);
    expect(dan1Group?.isSelected).toBe(false);

    const dan2Group = result.groups.find((g) => g.areaId === FIXTURE_IDS.dan2);
    expect(dan2Group).toBeDefined();
    expect(dan2Group?.name).toBe('段2');
    expect(dan2Group?.items).toHaveLength(1);
    expect(dan2Group?.isSelected).toBe(true);
  });

  it('エリア未設定（クウカン直下）のアイテムがある場合、未設定グループが作られる', () => {
    const doc = createSampleDocument();
    const shelfKuukanId = FIXTURE_IDS.shelfKuukan;

    const items: Item[] = [
      { id: makeDeterministicId(101), name: '段未設定のモノ', place: shelfKuukanId, category: null, tags: [] },
      { id: makeDeterministicId(102), name: 'アイテムA', place: FIXTURE_IDS.dan1, category: null, tags: [] },
    ];

    const result = groupItemsByArea({
      doc,
      kuukanId: shelfKuukanId,
      items,
      selectedAreaId: null,
    });

    expect(result.hasAreas).toBe(true);
    // dan1, dan2, 未設定
    const unsetGroup = result.groups.find((g) => g.areaId === null);
    expect(unsetGroup).toBeDefined();
    expect(unsetGroup?.name).toBe('エリア未設定');
    expect(unsetGroup?.items).toHaveLength(1);
  });

  it('未設定アイテムが0件の場合は、未設定グループは作られない', () => {
    const doc = createSampleDocument();
    const shelfKuukanId = FIXTURE_IDS.shelfKuukan;

    const items: Item[] = [
      { id: makeDeterministicId(102), name: 'アイテムA', place: FIXTURE_IDS.dan1, category: null, tags: [] },
    ];

    const result = groupItemsByArea({
      doc,
      kuukanId: shelfKuukanId,
      items,
      selectedAreaId: null,
    });

    const unsetGroup = result.groups.find((g) => g.areaId === null);
    expect(unsetGroup).toBeUndefined();
  });
});
