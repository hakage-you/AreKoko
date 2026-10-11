// カテゴリ・タグの色（設計 7.6）。ファイルの値は画面のスタイルに入るので、#rrggbb の形だけを使う（原則7：外へ送らない）。

import { describe, it, expect } from 'vitest';
import { createTag, setTagColor } from '../../../src/core/ops/tags';
import { createCategory, setCategoryColor } from '../../../src/core/ops/categories';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { getBadgeStyle, getSwatchStyle } from '../../../src/ui/color';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';

const BAD = 'red; background-image: url(https://example.com/x)';

describe('カテゴリ・タグの色', () => {
  it('setTagColor：#rrggbb を付け、null で外す。ほかの形は断る', () => {
    const ctx = createTestContext({ startCount: 60 });
    const r1 = createTag(deepFreeze(createBaseDoc()), { name: '消耗品' }, ctx);
    const id = r1.created[0]!;
    const r2 = setTagColor(r1.doc, id, '#0284c7');
    expect(r2.doc.membership.tags.find(t => t.id === id)?.color).toBe('#0284c7');
    expect(validateDocument(r2.doc)).toEqual([]);
    const r3 = setTagColor(r2.doc, id, null);
    expect(r3.doc.membership.tags.find(t => t.id === id)).not.toHaveProperty('color');
    expect(() => setTagColor(r2.doc, id, BAD)).toThrow(OpError);
  });

  it('setCategoryColor：#rrggbb を付け、ほかの形は断る', () => {
    const ctx = createTestContext({ startCount: 70 });
    const r1 = createCategory(deepFreeze(createBaseDoc()), { name: '電池' }, ctx);
    const id = r1.created[0]!;
    const r2 = setCategoryColor(r1.doc, id, '#16a34a');
    expect(r2.doc.membership.categories.find(c => c.id === id)?.color).toBe('#16a34a');
    expect(() => setCategoryColor(r1.doc, id, BAD)).toThrow(OpError);
  });

  it('画面のスタイル：#rrggbb でない値（外で編集したファイルなど）は入れず、既定の色で出す', () => {
    expect(getBadgeStyle('#0284c7')).toContain('#0284c7');
    expect(getSwatchStyle('#0284c7')).toContain('#0284c7');
    for (const v of [BAD, 'red', '#fff', 'url(x)', '', null, undefined]) {
      expect(getBadgeStyle(v)).toBe('');
      expect(getSwatchStyle(v)).toBe('');
    }
  });
});
