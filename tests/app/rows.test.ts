import { validateDocument } from '../../src/core/validate';
import { describe, expect, it } from 'vitest';
import type { ArekokoDocument, Item } from '../../src/core/types';
import { NIL_ID } from '../../src/core/constants';
import { buildRows } from '../../src/app/rows';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';

function createRowsTestDoc(): {
  doc: ArekokoDocument;
  items: Item[];
  cat1: string;
  cat2: string;
  catEmpty: string;
  tagA: string;
  tagB: string;
} {
  const doc = createSampleDocument();
  const cat1 = FIXTURE_IDS.categorySmallItems;
  const cat2 = '018f0000-0000-7000-8000-000000000021';
  const catEmpty = '018f0000-0000-7000-8000-000000000022';
  const tagA = FIXTURE_IDS.tagEmergency;
  const tagB = '018f0000-0000-7000-8000-000000000031';

  doc.membership.categories = [
    { id: cat1, name: '小物', parent: null },
    { id: cat2, name: '文具', parent: cat1 },
    { id: catEmpty, name: '空カテゴリ', parent: null },
  ];

  doc.membership.tags = [
    { id: tagA, name: '防災' },
    { id: tagB, name: '日常' },
  ];

  const item1: Item = {
    id: '018f0000-0000-7000-8000-000000000101',
    name: '電池',
    place: FIXTURE_IDS.box1Kuukan,
    category: cat1,
    tags: [tagA, tagB],
  };

  const item2: Item = {
    id: '018f0000-0000-7000-8000-000000000102',
    name: 'ハサミ',
    place: FIXTURE_IDS.dan1,
    category: cat2,
    tags: [tagB],
  };

  const item3: Item = {
    id: '018f0000-0000-7000-8000-000000000103',
    name: '未設定品',
    place: NIL_ID,
    category: null,
    tags: [],
  };

  // 収納の持ち主のモノ（棚A1・BOX1）は残す（消すと壊れた文書になる）
  doc.membership.items = [...doc.membership.items, item1, item2, item3];
  expect(validateDocument(doc)).toEqual([]);

  return { doc, items: [item1, item2, item3], cat1, cat2, catEmpty, tagA, tagB };
}

describe('buildRows', () => {
  it('none: すべてモノの行で depth 0', () => {
    const { doc, items } = createRowsTestDoc();
    const rows = buildRows(doc, items, 'none');

    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.kind).toBe('item');
      expect(r.depth).toBe(0);
    }
    expect(rows.map((r) => r.key)).toEqual(items.map((i) => i.id));
  });

  it('category: 木構造、未分類が最後、空カテゴリは出さない、count が子孫を含む', () => {
    const { doc, items } = createRowsTestDoc();
    const rows = buildRows(doc, items, 'category');

    // cat1（小物: 親）は自身に1件 + cat2（文具: 子）に1件 = count 2
    // cat2（文具: 子）は自身に1件 = count 1
    // catEmpty は 0件なので出ない
    // 未分類は item3 = count 1
    const groupRows = rows.filter((r) => r.kind === 'group');
    expect(groupRows).toHaveLength(3);

    expect(groupRows[0]?.label).toBe('小物');
    expect(groupRows[0]?.depth).toBe(0);
    expect(groupRows[0]?.count).toBe(2);

    expect(groupRows[1]?.label).toBe('文具');
    expect(groupRows[1]?.depth).toBe(1);
    expect(groupRows[1]?.count).toBe(1);

    expect(groupRows[2]?.label).toBe('未分類');
    expect(groupRows[2]?.depth).toBe(0);
    expect(groupRows[2]?.count).toBe(1);

    expect(rows.some((r) => r.kind === 'group' && r.label === '空カテゴリ')).toBe(false);

    // 未分類が最後に来ていること
    expect(rows[rows.length - 1]?.kind).toBe('item');
    expect((rows[rows.length - 1] as any).item.name).toBe('未設定品');
  });

  it('place: 置き場の木、収納の中、未設定が最後', () => {
    const { doc, items } = createRowsTestDoc();
    const rows = buildRows(doc, items, 'place');

    // 構造:
    // Room A (depth 0)
    //   棚A1 (収納クウカン, depth 1)
    //     段1 (エリア, depth 2)
    //       ハサミ (item, depth 3)
    //       BOX1 (収納クウカン, depth 3)
    //         電池 (item, depth 4)
    // 未設定 (depth 0)
    //   未設定品 (item, depth 1)

    const groupRows = rows.filter((r) => r.kind === 'group');
    expect(groupRows.map((g) => g.label)).toEqual([
      'Room A',
      '棚A1',
      '段1',
      'BOX1',
      '未設定',
    ]);

    expect(groupRows[groupRows.length - 1]?.label).toBe('未設定');
    expect(groupRows[groupRows.length - 1]?.depth).toBe(0);

    const lastRow = rows[rows.length - 1]!;
    expect(lastRow.kind).toBe('item');
    expect((lastRow as any).item.name).toBe('未設定品');
    expect(lastRow.depth).toBe(1);
  });

  it('tag: 複数のタグのモノが複数回出る、タグなし、key が一意', () => {
    const { doc, items } = createRowsTestDoc();
    const rows = buildRows(doc, items, 'tag');

    // タグは名前順: '日常' → '防災' → 'タグなし'
    const groupRows = rows.filter((r) => r.kind === 'group');
    expect(groupRows.map((g) => g.label)).toEqual(['日常', '防災', 'タグなし']);

    // 電池は日常・防災の両方に含まれる
    const batteryItemRows = rows.filter(
      (r) => r.kind === 'item' && r.item.name === '電池',
    );
    expect(batteryItemRows).toHaveLength(2);

    // タグなしグループ
    expect(groupRows[2]?.label).toBe('タグなし');
    expect(groupRows[2]?.count).toBe(1);

    // すべての row の key が一意であること
    const keys = rows.map((r) => r.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});
