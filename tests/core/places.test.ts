import { describe, expect, it } from 'vitest';
import { NIL_ID } from '../../src/core/constants';
import {
  areaSubtree,
  displayName,
  formatPlacePath,
  isInsideKuukan,
  itemsDirectlyIn,
  itemsWithin,
  kuukanOfPlace,
  placeCandidates,
  placePath,
} from '../../src/core/places';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';

describe('displayName', () => {
  it('詳細設計 2.5 の規則どおりに名前を返す', () => {
    const doc = createSampleDocument();
    expect(displayName(doc, NIL_ID)).toBe('未設定');
    expect(displayName(doc, FIXTURE_IDS.roomA)).toBe('Room A');
    expect(displayName(doc, FIXTURE_IDS.shelfKuukan)).toBe('棚A1');
    expect(displayName(doc, FIXTURE_IDS.dan1)).toBe('段1');
    expect(displayName(doc, FIXTURE_IDS.battery)).toBe('単3電池');
    expect(displayName(doc, FIXTURE_IDS.categorySmallItems)).toBe('小物');
    expect(displayName(doc, FIXTURE_IDS.tagEmergency)).toBe('防災');
  });

  it('名前が空文字のどこにも置かれていないクウカンは「名前なし」と出す。文書の名前はそのまま（A-11、TRS 付録B I-07）', () => {
    const doc = createSampleDocument();
    doc.membership.kuukans.find(k => k.id === FIXTURE_IDS.roomA)!.name = '';
    expect(displayName(doc, FIXTURE_IDS.roomA)).toBe('名前なし');
    expect(doc.membership.kuukans.find(k => k.id === FIXTURE_IDS.roomA)!.name).toBe('');
  });
});

describe('itemsDirectlyIn', () => {
  it('クウカンそのものとエリアに直接置かれたモノだけを返す。収納は1件で、中身は含めない（A-21、TRS 付録B I-08）', () => {
    const doc = createSampleDocument();
    // Room A には棚A1（収納）だけが直接ある。棚A1 の中の BOX1・単3電池は数えない
    expect(itemsDirectlyIn(doc, FIXTURE_IDS.roomA).map(i => i.id)).toEqual([FIXTURE_IDS.shelf]);
    // 棚A1 のクウカンでは、エリア 段1 に直接ある BOX1 だけ。BOX1 の中の単3電池は数えない
    expect(itemsDirectlyIn(doc, FIXTURE_IDS.shelfKuukan).map(i => i.id)).toEqual([FIXTURE_IDS.box1]);
  });
});

describe('kuukanOfPlace', () => {
  it('置き場が属するクウカンIDを返す', () => {
    const doc = createSampleDocument();
    expect(kuukanOfPlace(doc, NIL_ID)).toBe(NIL_ID);
    expect(kuukanOfPlace(doc, FIXTURE_IDS.roomA)).toBe(FIXTURE_IDS.roomA);
    expect(kuukanOfPlace(doc, FIXTURE_IDS.dan1)).toBe(FIXTURE_IDS.shelfKuukan);
    expect(kuukanOfPlace(doc, FIXTURE_IDS.box1Kuukan)).toBe(FIXTURE_IDS.box1Kuukan);
  });
});

describe('placePath / formatPlacePath', () => {
  it('未設定の経路', () => {
    const doc = createSampleDocument();
    expect(placePath(doc, NIL_ID)).toEqual([
      { id: NIL_ID, kind: 'kuukan', name: '未設定' },
    ]);
    expect(formatPlacePath(doc, NIL_ID)).toBe('未設定');
  });

  it('部屋直下のモノの置き場', () => {
    const doc = createSampleDocument();
    expect(placePath(doc, FIXTURE_IDS.roomA)).toEqual([
      { id: FIXTURE_IDS.roomA, kind: 'kuukan', name: 'Room A' },
    ]);
    expect(formatPlacePath(doc, FIXTURE_IDS.roomA)).toBe('Room A');
  });

  it('収納の中のエリアの経路', () => {
    const doc = createSampleDocument();
    expect(placePath(doc, FIXTURE_IDS.dan1)).toEqual([
      { id: FIXTURE_IDS.roomA, kind: 'kuukan', name: 'Room A' },
      { id: FIXTURE_IDS.shelf, kind: 'item', name: '棚A1' },
      { id: FIXTURE_IDS.dan1, kind: 'area', name: '段1' },
    ]);
    expect(formatPlacePath(doc, FIXTURE_IDS.dan1)).toBe('Room A › 棚A1 › 段1');
  });

  it('入れ子の収納の中のクウカンの経路', () => {
    const doc = createSampleDocument();
    expect(placePath(doc, FIXTURE_IDS.box1Kuukan)).toEqual([
      { id: FIXTURE_IDS.roomA, kind: 'kuukan', name: 'Room A' },
      { id: FIXTURE_IDS.shelf, kind: 'item', name: '棚A1' },
      { id: FIXTURE_IDS.dan1, kind: 'area', name: '段1' },
      { id: FIXTURE_IDS.box1, kind: 'item', name: 'BOX1' },
    ]);
    expect(formatPlacePath(doc, FIXTURE_IDS.box1Kuukan)).toBe('Room A › 棚A1 › 段1 › BOX1');
  });
});

describe('isInsideKuukan', () => {
  it('クウカンの中にあるかを正しく判定する', () => {
    const doc = createSampleDocument();
    expect(isInsideKuukan(doc, FIXTURE_IDS.roomA, FIXTURE_IDS.roomA)).toBe(true);
    expect(isInsideKuukan(doc, FIXTURE_IDS.dan1, FIXTURE_IDS.shelfKuukan)).toBe(true);
    expect(isInsideKuukan(doc, FIXTURE_IDS.box1Kuukan, FIXTURE_IDS.roomA)).toBe(true);
    expect(isInsideKuukan(doc, FIXTURE_IDS.roomA, FIXTURE_IDS.shelfKuukan)).toBe(false);
  });
});

describe('placeCandidates', () => {
  it('候補から対象のモノが持つクウカンの中（中の収納まで含む）が除外される', () => {
    const doc = createSampleDocument();
    const candidatesForShelf = placeCandidates(doc, [FIXTURE_IDS.shelf]);

    expect(candidatesForShelf).toContain(NIL_ID);
    expect(candidatesForShelf).toContain(FIXTURE_IDS.roomA);
    expect(candidatesForShelf).not.toContain(FIXTURE_IDS.shelfKuukan);
    expect(candidatesForShelf).not.toContain(FIXTURE_IDS.dan1);
    expect(candidatesForShelf).not.toContain(FIXTURE_IDS.dan2);
    expect(candidatesForShelf).not.toContain(FIXTURE_IDS.box1Kuukan);

    const candidatesForBox = placeCandidates(doc, [FIXTURE_IDS.box1]);
    expect(candidatesForBox).toContain(FIXTURE_IDS.dan1);
    expect(candidatesForBox).not.toContain(FIXTURE_IDS.box1Kuukan);
  });
});

describe('itemsWithin', () => {
  it('Room A を指定すると中の収納の中まで含めてすべてのモノが返る', () => {
    const doc = createSampleDocument();
    const items = itemsWithin(doc, FIXTURE_IDS.roomA);
    const itemIds = items.map(i => i.id);

    expect(itemIds).toContain(FIXTURE_IDS.shelf);
    expect(itemIds).toContain(FIXTURE_IDS.box1);
    expect(itemIds).toContain(FIXTURE_IDS.battery);
  });

  it('段1 を指定すると BOX1 と単3電池が含まれる', () => {
    const doc = createSampleDocument();
    const items = itemsWithin(doc, FIXTURE_IDS.dan1);
    const itemIds = items.map(i => i.id);

    expect(itemIds).toContain(FIXTURE_IDS.box1);
    expect(itemIds).toContain(FIXTURE_IDS.battery);
    expect(itemIds).not.toContain(FIXTURE_IDS.shelf);
  });

  it('段2 を指定すると空配列が返る', () => {
    const doc = createSampleDocument();
    const items = itemsWithin(doc, FIXTURE_IDS.dan2);
    expect(items).toEqual([]);
  });
});

describe('areaSubtree', () => {
  it('エリアとその子孫エリアのIDを返す', () => {
    const doc = createSampleDocument();
    const childAreaId = makeDeterministicId(201);
    doc.membership.areas.push({
      id: childAreaId,
      kuukan: FIXTURE_IDS.shelfKuukan,
      parent: FIXTURE_IDS.dan1,
      name: '段1-1',
      order: 0,
    });

    const subtree = areaSubtree(doc, FIXTURE_IDS.dan1);
    expect(subtree).toEqual([FIXTURE_IDS.dan1, childAreaId]);
  });
});
