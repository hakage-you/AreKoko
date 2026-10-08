import { describe, it, expect } from 'vitest';
import { createTag, renameTag, deleteTag } from '../../../src/core/ops/tags';
import { validateDocument } from '../../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('tags ops', () => {
  it('createTag, renameTag', () => {
    const ctx = createTestContext({ startCount: 50 });
    const doc = deepFreeze(createBaseDoc());

    const res1 = createTag(doc, { name: '重要' }, ctx);
    const tagId = res1.created[0]!;

    const res2 = renameTag(res1.doc, tagId, '最重要');
    expect(res2.doc.membership.tags.find(t => t.id === tagId)?.name).toBe('最重要');
    expect(validateDocument(res2.doc)).toEqual([]);
  });

  it('deleteTag: タグとすべてのモノからの参照を消し、モノの updatedAt を更新する', () => {
    const ctx = createTestContext({ now: '2026-10-08T19:00:00.000Z' });
    const base = createBaseDoc();
    const tag1 = '01920000-0000-7000-8000-000000000001';
    const tag2 = '01920000-0000-7000-8000-000000000002';
    const item1 = '01920000-0000-7000-8000-000000000011';
    const item2 = '01920000-0000-7000-8000-000000000012';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        tags: [
          { id: tag1, name: 'タグ1' },
          { id: tag2, name: 'タグ2' },
        ],
        items: [
          { id: item1, name: 'モノ1', place: NIL_ID, category: null, tags: [tag1, tag2], updatedAt: '2026-10-01T00:00:00.000Z' },
          { id: item2, name: 'モノ2', place: NIL_ID, category: null, tags: [tag2], updatedAt: '2026-10-01T00:00:00.000Z' },
        ],
      },
    });

    const res = deleteTag(doc, tag1, ctx);
    expect(res.doc.membership.tags.some(t => t.id === tag1)).toBe(false);

    const updatedItem1 = res.doc.membership.items.find(i => i.id === item1)!;
    expect(updatedItem1.tags).toEqual([tag2]);
    expect(updatedItem1.updatedAt).toBe('2026-10-08T19:00:00.000Z');

    const updatedItem2 = res.doc.membership.items.find(i => i.id === item2)!;
    expect(updatedItem2.tags).toEqual([tag2]);
    // タグを持っていなかったモノの updatedAt は変わらない
    expect(updatedItem2.updatedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(validateDocument(res.doc)).toEqual([]);
  });
});
