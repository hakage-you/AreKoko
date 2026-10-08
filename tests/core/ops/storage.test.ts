import { describe, it, expect } from 'vitest';
import { makeStorage, planRemoveStorage, removeStorage } from '../../../src/core/ops/storage';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('storage ops', () => {
  it('makeStorage: モノを収納として設定する（クウカンは name を持たない）', () => {
    const ctx = createTestContext({ startCount: 20 });
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        items: [{ id: itemId, name: '本棚', place: NIL_ID, category: null, tags: [] }],
      },
    });

    const res = makeStorage(doc, itemId, { areaLabel: '段' }, ctx);
    expect(res.created.length).toBe(1);
    const newKuukan = res.doc.membership.kuukans.find(k => k.id === res.created[0])!;
    expect(newKuukan.owner).toBe(itemId);
    expect(newKuukan.areaLabel).toBe('段');
    expect('name' in newKuukan).toBe(false); // D3: name は持たない
    expect(validateDocument(res.doc)).toEqual([]);

    // 既に収納なら alreadyStorage
    expect(() => makeStorage(res.doc, itemId, {}, ctx)).toThrowError(OpError);
    try {
      makeStorage(res.doc, itemId, {}, ctx);
    } catch (e) {
      expect((e as OpError).code).toBe('alreadyStorage');
    }
  });

  it('removeStorage: 収納設定を削除すると、中身がモノの置き場へ移る', () => {
    const ctx = createTestContext({ now: '2026-10-08T16:00:00.000Z' });
    const base = createBaseDoc();
    const roomA = '01920000-0000-7000-8000-000000000001';
    const storageItem = '01920000-0000-7000-8000-000000000002';
    const storageKuukan = '01920000-0000-7000-8000-000000000003';
    const insideItem = '01920000-0000-7000-8000-000000000004';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: roomA, name: '部屋A', owner: null, areaLabel: 'エリア' },
          { id: storageKuukan, owner: storageItem, areaLabel: '段' },
        ],
        items: [
          { id: storageItem, name: '棚', place: roomA, category: null, tags: [] },
          { id: insideItem, name: 'コップ', place: storageKuukan, category: null, tags: [] },
        ],
      },
    });

    const plan = planRemoveStorage(doc, storageItem);
    expect(plan).toEqual([
      { from: storageKuukan, to: roomA, items: [insideItem] },
    ]);

    const res = removeStorage(doc, storageItem, ctx);
    expect(res.moved).toEqual([insideItem]);
    expect(res.doc.membership.items.find(i => i.id === insideItem)?.place).toBe(roomA);
    expect(res.doc.membership.kuukans.some(k => k.id === storageKuukan)).toBe(false);
    // モノ自身は残る
    expect(res.doc.membership.items.some(i => i.id === storageItem)).toBe(true);
    expect(validateDocument(res.doc)).toEqual([]);
  });

  it('removeStorage: 収納でなければ notStorage エラー', () => {
    const ctx = createTestContext();
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        items: [{ id: itemId, name: 'モノ', place: NIL_ID, category: null, tags: [] }],
      },
    });

    expect(() => removeStorage(doc, itemId, ctx)).toThrowError(OpError);
    try {
      removeStorage(doc, itemId, ctx);
    } catch (e) {
      expect((e as OpError).code).toBe('notStorage');
    }
  });
});
