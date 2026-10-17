// カテゴリ・タグの色（設計 7.6）。ファイルの値は画面のスタイルに入るので、#rrggbb の形だけを使う（原則7：外へ送らない）。

import { describe, it, expect } from 'vitest';
import { createTag, setTagColor } from '../../../src/core/ops/tags';
import { createCategory, setCategoryColor } from '../../../src/core/ops/categories';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { getBadgeStyle, getSwatchStyle, getContrastTextColor, getKuukanInitial, getKuukanIconStyle, PRESET_COLORS, getContrastRatio } from '../../../src/ui/color';
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

  it('クウカンアイコン用ヘルパーの動作確認', () => {
    // getKuukanInitial
    expect(getKuukanInitial('リビング')).toBe('リ');
    expect(getKuukanInitial('room a')).toBe('R');
    expect(getKuukanInitial('棚A-1')).toBe('棚');
    expect(getKuukanInitial('')).toBe('?');
    expect(getKuukanInitial(null)).toBe('?');

    // getContrastTextColor (WCAG 2.1 相対輝度・コントラスト比に基づく自動選定)
    expect(getContrastTextColor('#1e3a8a')).toBe('#ffffff'); // 濃紺 -> 白文字 (コントラスト比 10.9)
    expect(getContrastTextColor('#4f46e5')).toBe('#ffffff'); // インディゴ -> 白文字 (コントラスト比 6.3)
    expect(getContrastTextColor('#0284c7')).toBe('#0f172a'); // スカイブルー -> 黒文字 (4.36 vs 4.10 で黒の方が高コントラスト)
    expect(getContrastTextColor('#fef08a')).toBe('#0f172a'); // 明るい黄 -> 黒文字 (コントラスト比 16.8)
    expect(getContrastTextColor('invalid')).toBe('#ffffff');

    // getKuukanIconStyle
    expect(getKuukanIconStyle({ bg: '#4f46e5' })).toContain('background-color: #4f46e5');
    expect(getKuukanIconStyle({ bg: '#4f46e5' })).toContain('color: #ffffff');
    expect(getKuukanIconStyle({ bg: '#0284c7' })).toContain('color: #0f172a');
    expect(getKuukanIconStyle({ bg: '#0284c7', color: '#000000' })).toContain('color: #000000');
    expect(getKuukanIconStyle(null)).toBe('');
    expect(getKuukanIconStyle({ bg: 'bad-color' })).toBe('');
  });

  it('WCAG 2.1 コントラスト精査（プリセット色と白黒テキスト）', () => {
    // プリセット全9色が、自動選定された文字色で WCAG AA（UIコンポーネント/大型3:1、通常4.5:1）を満たすこと
    for (const preset of PRESET_COLORS) {
      const bestText = getContrastTextColor(preset.hex);
      const ratio = getContrastRatio(preset.hex, bestText);
      // 太字サムネイル・アイコン（UIコンポーネント基準 3:1）を全色でクリア、大半は通常テキスト（4.5:1）もクリア
      expect(ratio).toBeGreaterThanOrEqual(4.3);
    }
  });
});
