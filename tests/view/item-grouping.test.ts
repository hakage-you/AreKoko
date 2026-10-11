import { describe, it, expect } from 'vitest';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';
import { groupItemsByArea, type AreaItemGroup } from '../../src/view/itemGrouping';
import type { ArekokoDocument, Item } from '../../src/core/types';
import { displayName } from '../../src/core/places';

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

  it('クウカンそのものに置いたモノは、クウカンの名前のグループで先頭に出る（「未設定」は置き場のないモノの言葉なので使わない）', () => {
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
    const first = result.groups[0]!;
    expect(first.areaId).toBeNull();
    expect(first.name).toBe(displayName(doc, shelfKuukanId)); // 収納のクウカンなので持ち主のモノの名前
    expect(first.name).not.toContain('未設定');
    expect(first.items.map(i => i.name)).toEqual(['段未設定のモノ']);
  });

  it('中を分けたエリアに直接置いたモノも隠さず、そのエリアのグループで子より先に出る', () => {
    const doc = createSampleDocument();
    const shelfKuukanId = FIXTURE_IDS.shelfKuukan;
    const child1 = makeDeterministicId(201);
    const child2 = makeDeterministicId(202);
    doc.membership.areas.push(
      { id: child1, kuukan: shelfKuukanId, parent: FIXTURE_IDS.dan1, name: '段1-1', order: 0 },
      { id: child2, kuukan: shelfKuukanId, parent: FIXTURE_IDS.dan1, name: '段1-2', order: 1 },
    );

    const items: Item[] = [
      { id: makeDeterministicId(101), name: '段1のどこか', place: FIXTURE_IDS.dan1, category: null, tags: [] },
      { id: makeDeterministicId(102), name: '段1-2のモノ', place: child2, category: null, tags: [] },
    ];

    const result = groupItemsByArea({ doc, kuukanId: shelfKuukanId, items, selectedAreaId: null });

    expect(result.groups.map(g => g.name)).toEqual(['段1', '段1-1', '段1-2', '段2']);
    expect(result.groups.flatMap(g => g.items).map(i => i.name).sort()).toEqual(['段1-2のモノ', '段1のどこか'].sort());

    // 中を分けたエリアに直接置いたモノがなければ、そのグループは出さない（下のエリアの中身はその行に出る）
    const r2 = groupItemsByArea({ doc, kuukanId: shelfKuukanId, items: [items[1]!], selectedAreaId: null });
    expect(r2.groups.map(g => g.name)).toEqual(['段1-1', '段1-2', '段2']);
  });

  it('クウカンそのものに置いたモノが0件なら、そのグループは作られない', () => {
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
