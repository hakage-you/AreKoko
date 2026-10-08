import { describe, it, expect } from 'vitest';
import { removeNotice } from '../../../src/core/ops/notices';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('notices ops', () => {
  it('removeNotice: 指定した修復メモを削除し、0件になったらキーごと消す（モノの updatedAt は変わらない）', () => {
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        items: [
          {
            id: itemId,
            name: 'モノ',
            place: NIL_ID,
            category: null,
            tags: [],
            updatedAt: '2026-10-01T00:00:00.000Z',
            notices: [{ at: '2026-10-01T00:00:00.000Z', text: '修復メモ1' }],
          },
        ],
      },
    });

    const res = removeNotice(doc, 'item', itemId, 0);
    const item = res.doc.membership.items[0]!;
    expect('notices' in item).toBe(false);
    expect(item.updatedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(validateDocument(res.doc)).toEqual([]);

    // 範囲外のインデックスは outOfRange
    expect(() => removeNotice(res.doc, 'item', itemId, 0)).toThrowError(OpError);
    try {
      removeNotice(res.doc, 'item', itemId, 0);
    } catch (e) {
      expect((e as OpError).code).toBe('outOfRange');
    }
  });
});
