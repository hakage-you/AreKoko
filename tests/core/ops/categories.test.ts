import { describe, it, expect } from 'vitest';
import {
  createCategory,
  renameCategory,
  moveCategory,
  deleteCategory,
} from '../../../src/core/ops/categories';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('categories ops', () => {
  it('createCategory, renameCategory, moveCategory', () => {
    const ctx = createTestContext({ startCount: 40 });
    const doc = deepFreeze(createBaseDoc());

    const res1 = createCategory(doc, { name: '家電' }, ctx);
    const cat1 = res1.created[0]!;

    const res2 = createCategory(res1.doc, { name: '台所家電', parent: cat1 }, ctx);
    const cat2 = res2.created[0]!;

    const res3 = renameCategory(res2.doc, cat2, 'キッチン家電');
    expect(res3.doc.membership.categories.find(c => c.id === cat2)?.name).toBe('キッチン家電');

    // 輪になる moveCategory は cycle エラー
    expect(() => moveCategory(res3.doc, cat1, cat2)).toThrowError(OpError);
    try {
      moveCategory(res3.doc, cat1, cat2);
    } catch (e) {
      expect((e as OpError).code).toBe('cycle');
    }
    expect(validateDocument(res3.doc)).toEqual([]);
  });

  it('deleteCategory: 中のモノと子カテゴリが親（なければ null）へ移り、モノの updatedAt が更新される', () => {
    const ctx = createTestContext({ now: '2026-10-08T18:00:00.000Z' });
    const base = createBaseDoc();
    const parentCat = '01920000-0000-7000-8000-000000000001';
    const targetCat = '01920000-0000-7000-8000-000000000002';
    const childCat = '01920000-0000-7000-8000-000000000003';
    const itemId = '01920000-0000-7000-8000-000000000010';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        categories: [
          { id: parentCat, name: '親カテゴリ', parent: null },
          { id: targetCat, name: '削除対象', parent: parentCat },
          { id: childCat, name: '子カテゴリ', parent: targetCat },
        ],
        items: [
          {
            id: itemId,
            name: '商品',
            place: NIL_ID,
            category: targetCat,
            tags: [],
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    });

    const res = deleteCategory(doc, targetCat, ctx);
    expect(res.doc.membership.categories.some(c => c.id === targetCat)).toBe(false);
    expect(res.doc.membership.categories.find(c => c.id === childCat)?.parent).toBe(parentCat);

    const item = res.doc.membership.items.find(i => i.id === itemId)!;
    expect(item.category).toBe(parentCat);
    expect(item.updatedAt).toBe('2026-10-08T18:00:00.000Z');
    expect(validateDocument(res.doc)).toEqual([]);
  });
});
