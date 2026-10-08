import { describe, it, expect } from 'vitest';
import { buildTemplate, TEMPLATE_LIST } from '../../src/editor/templates';
import { validateDraft, type TemplateId } from '../../src/editor/draft';
import { createTestContext } from '../helpers/ctx';

describe('templates', () => {
  it('TEMPLATE_LIST が5つのテンプレートを持ち1行の説明がある', () => {
    expect(TEMPLATE_LIST).toHaveLength(5);
    for (const t of TEMPLATE_LIST) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.description).not.toContain('\n');
    }
  });

  const ids: TemplateId[] = ['room6', 'livingL', 'shelf3', 'oshiire', 'chest4'];

  for (const id of ids) {
    it(`テンプレート ${id} の validateDraft が空`, () => {
      const ctx = createTestContext();
      const draft = buildTemplate(id, ctx);
      const violations = validateDraft(draft);
      expect(violations).toEqual([]);
    });
  }

  it('room6 の呼び名とマーカー', () => {
    const ctx = createTestContext();
    const draft = buildTemplate('room6', ctx);
    const k = draft.doc.membership.kuukans.find(ku => ku.id === draft.kuukan)!;
    expect(k.areaLabel).toBe('床');

    const door = draft.doc.drawing.markers.find(m => m.name === 'ドア')!;
    expect(door).toBeDefined();
    expect(door.notAPlace).toBe(false);
  });

  it('livingL の呼び名と柱マーカー (notAPlace)', () => {
    const ctx = createTestContext();
    const draft = buildTemplate('livingL', ctx);
    const k = draft.doc.membership.kuukans.find(ku => ku.id === draft.kuukan)!;
    expect(k.areaLabel).toBe('エリア');

    const pillar = draft.doc.drawing.markers.find(m => m.name === '柱')!;
    expect(pillar).toBeDefined();
    expect(pillar.notAPlace).toBe(true);
  });

  it('shelf3 は段1〜段3の3つのエリアを持つ', () => {
    const ctx = createTestContext();
    const draft = buildTemplate('shelf3', ctx);
    const areas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
    expect(areas).toHaveLength(3);
    expect(areas.map(a => a.name)).toEqual(['段1', '段2', '段3']);
  });

  it('oshiire は上段・下段・左・右のエリアを持つ', () => {
    const ctx = createTestContext();
    const draft = buildTemplate('oshiire', ctx);
    const areas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
    expect(areas).toHaveLength(4);
    const names = new Set(areas.map(a => a.name));
    expect(names.has('上段')).toBe(true);
    expect(names.has('下段')).toBe(true);
    expect(names.has('左')).toBe(true);
    expect(names.has('右')).toBe(true);
  });

  it('chest4 は引き出し1〜4の4つのエリアを持つ', () => {
    const ctx = createTestContext();
    const draft = buildTemplate('chest4', ctx);
    const areas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
    expect(areas).toHaveLength(4);
    expect(areas.map(a => a.name)).toEqual([
      '引き出し1',
      '引き出し2',
      '引き出し3',
      '引き出し4',
    ]);
  });
});
