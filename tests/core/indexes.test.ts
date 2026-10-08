import { describe, expect, it } from 'vitest';
import { buildAreaTree, getIndexes } from '../../src/core/indexes';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';

describe('getIndexes', () => {
  it('WeakMap で文書ごとに1回だけ作成され、キャッシュが効く', () => {
    const doc = createSampleDocument();
    const idx1 = getIndexes(doc);
    const idx2 = getIndexes(doc);
    expect(idx1).toBe(idx2);

    const doc2 = createSampleDocument();
    const idx3 = getIndexes(doc2);
    expect(idx3).not.toBe(idx1);
  });

  it('childAreas の並びが order の昇順、同じなら id の昇順になる', () => {
    const doc = createSampleDocument();
    const idA = makeDeterministicId(101);
    const idB = makeDeterministicId(102);
    const idC = makeDeterministicId(103);

    doc.membership.areas.push(
      { id: idC, kuukan: FIXTURE_IDS.roomA, parent: null, name: 'エリアC', order: 2 },
      { id: idA, kuukan: FIXTURE_IDS.roomA, parent: null, name: 'エリアA', order: 0 },
      { id: idB, kuukan: FIXTURE_IDS.roomA, parent: null, name: 'エリアB', order: 0 },
    );

    const indexes = getIndexes(doc);
    const children = indexes.childAreas.get(FIXTURE_IDS.roomA);
    expect(children).toBeDefined();
    expect(children!.map(a => a.id)).toEqual([idA, idB, idC]);
  });

  it('buildAreaTree は root にクウカンID、children に親子関係のマップを構築する', () => {
    const doc = createSampleDocument();
    const tree = buildAreaTree(doc, FIXTURE_IDS.shelfKuukan);

    expect(tree.root).toBe(FIXTURE_IDS.shelfKuukan);
    expect(tree.children.get(FIXTURE_IDS.shelfKuukan)).toEqual([
      FIXTURE_IDS.dan1,
      FIXTURE_IDS.dan2,
    ]);
  });

  it('各種索引が正しく引ける', () => {
    const doc = createSampleDocument();
    const indexes = getIndexes(doc);

    expect(indexes.kindOf.get(FIXTURE_IDS.roomA)).toBe('kuukan');
    expect(indexes.kindOf.get(FIXTURE_IDS.dan1)).toBe('area');
    expect(indexes.kindOf.get(FIXTURE_IDS.shelf)).toBe('item');
    expect(indexes.kindOf.get(FIXTURE_IDS.categorySmallItems)).toBe('category');
    expect(indexes.kindOf.get(FIXTURE_IDS.tagEmergency)).toBe('tag');

    expect(indexes.itemsByPlace.get(FIXTURE_IDS.roomA)?.map(i => i.id)).toEqual([FIXTURE_IDS.shelf]);
    expect(indexes.itemsByPlace.get(FIXTURE_IDS.dan1)?.map(i => i.id)).toEqual([FIXTURE_IDS.box1]);
    expect(indexes.itemsByPlace.get(FIXTURE_IDS.box1Kuukan)?.map(i => i.id)).toEqual([FIXTURE_IDS.battery]);

    expect(indexes.kuukanByOwner.get(FIXTURE_IDS.shelf)?.id).toBe(FIXTURE_IDS.shelfKuukan);
    expect(indexes.kuukanByOwner.get(FIXTURE_IDS.box1)?.id).toBe(FIXTURE_IDS.box1Kuukan);
  });
});
