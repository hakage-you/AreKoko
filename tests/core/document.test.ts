import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../../src/core/document';
import {
  APP,
  SCHEMA_VERSION,
  NIL_ID,
  UNSET_NAME,
  DEFAULT_AREA_LABEL,
} from '../../src/core/constants';

describe('createEmptyDocument', () => {
  it('未設定のクウカンだけを持つ初期文書を作成する', () => {
    const doc = createEmptyDocument();

    expect(doc.app).toBe(APP);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);

    // membership の検証
    expect(doc.membership.kuukans).toHaveLength(1);
    const unsetKuukan = doc.membership.kuukans[0]!;
    expect(unsetKuukan.id).toBe(NIL_ID);
    expect(unsetKuukan.name).toBe(UNSET_NAME);
    expect(unsetKuukan.owner).toBeNull();
    expect(unsetKuukan.areaLabel).toBe(DEFAULT_AREA_LABEL);

    expect(doc.membership.areas).toEqual([]);
    expect(doc.membership.items).toEqual([]);
    expect(doc.membership.categories).toEqual([]);
    expect(doc.membership.tags).toEqual([]);

    // drawing の検証
    expect(doc.drawing.kuukans).toEqual([]);
    expect(doc.drawing.partitions).toEqual([]);
    expect(doc.drawing.markers).toEqual([]);
    expect(doc.drawing.items).toEqual([]);
  });

  it('呼び出しごとに独立した新しいオブジェクトを返す', () => {
    const doc1 = createEmptyDocument();
    const doc2 = createEmptyDocument();

    expect(doc1).not.toBe(doc2);
    expect(doc1.membership).not.toBe(doc2.membership);
    expect(doc1.drawing).not.toBe(doc2.drawing);
    expect(doc1.membership.kuukans).not.toBe(doc2.membership.kuukans);

    // 一方を変更しても他方に影響しない
    doc1.membership.areas.push({
      id: 'test-id',
      kuukan: NIL_ID,
      parent: null,
      name: 'エリア1',
      order: 0,
    });
    expect(doc2.membership.areas).toHaveLength(0);
  });
});
