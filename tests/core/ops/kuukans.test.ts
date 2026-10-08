import { describe, it, expect } from 'vitest';
import {
  createKuukan,
  renameKuukan,
  setAreaLabel,
  deleteKuukan,
  planDeleteKuukan,
} from '../../../src/core/ops/kuukans';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('kuukans ops', () => {
  it('createKuukan: どこにも置かれていないクウカンを作成できる', () => {
    const ctx = createTestContext({ startCount: 30 });
    const doc = deepFreeze(createBaseDoc());

    const res = createKuukan(doc, { name: 'リビング', areaLabel: '床' }, ctx);
    expect(res.created.length).toBe(1);
    const k = res.doc.membership.kuukans.find(k => k.id === res.created[0])!;
    expect(k.name).toBe('リビング');
    expect(k.owner).toBeNull();
    expect(k.areaLabel).toBe('床');
    expect(validateDocument(res.doc)).toEqual([]);
  });

  it('renameKuukan & setAreaLabel: NIL_ID は reserved エラー、収納は invalidInput エラー', () => {
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';
    const storageKuukan = '01920000-0000-7000-8000-000000000002';
    const normalKuukan = '01920000-0000-7000-8000-000000000003';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: storageKuukan, owner: itemId, areaLabel: '段' },
          { id: normalKuukan, name: '物置', owner: null, areaLabel: 'エリア' },
        ],
        items: [{ id: itemId, name: '棚', place: NIL_ID, category: null, tags: [] }],
      },
    });

    expect(() => renameKuukan(doc, NIL_ID, '新しい名前')).toThrowError(OpError);
    expect(() => setAreaLabel(doc, NIL_ID, '新しいラベル')).toThrowError(OpError);

    expect(() => renameKuukan(doc, storageKuukan, '収納の名前')).toThrowError(OpError);
    try {
      renameKuukan(doc, storageKuukan, '収納の名前');
    } catch (e) {
      expect((e as OpError).code).toBe('invalidInput');
    }

    const res = renameKuukan(doc, normalKuukan, '納戸');
    expect(res.doc.membership.kuukans.find(k => k.id === normalKuukan)?.name).toBe('納戸');
  });

  it('deleteKuukan: どこにも置かれていないクウカンを削除すると中身は未設定へ、中の収納は中身ごと移る', () => {
    const ctx = createTestContext({ now: '2026-10-08T17:00:00.000Z' });
    const base = createBaseDoc();
    const roomA = '01920000-0000-7000-8000-000000000001';
    const storageItem = '01920000-0000-7000-8000-000000000002';
    const storageKuukan = '01920000-0000-7000-8000-000000000003';
    const insideStorageItem = '01920000-0000-7000-8000-000000000004';
    const roomItem = '01920000-0000-7000-8000-000000000005';

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
          { id: storageItem, name: '箱', place: roomA, category: null, tags: [] },
          { id: roomItem, name: '机', place: roomA, category: null, tags: [] },
          { id: insideStorageItem, name: '書類', place: storageKuukan, category: null, tags: [] },
        ],
      },
    });

    const plan = planDeleteKuukan(doc, roomA);
    expect(plan).toEqual([
      { from: roomA, to: NIL_ID, items: [storageItem, roomItem] },
    ]);

    const res = deleteKuukan(doc, roomA, ctx);
    expect(res.moved).toEqual([storageItem, roomItem]);
    expect(res.doc.membership.items.find(i => i.id === storageItem)?.place).toBe(NIL_ID);
    expect(res.doc.membership.items.find(i => i.id === roomItem)?.place).toBe(NIL_ID);
    // 箱の中の書類の置き場は変わらない
    expect(res.doc.membership.items.find(i => i.id === insideStorageItem)?.place).toBe(storageKuukan);
    expect(res.doc.membership.kuukans.some(k => k.id === roomA)).toBe(false);
    expect(validateDocument(res.doc)).toEqual([]);
  });

  it('deleteKuukan: NIL_ID は reserved エラー、収納のクウカンは notTopLevel エラー', () => {
    const ctx = createTestContext();
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';
    const storageKuukan = '01920000-0000-7000-8000-000000000002';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: storageKuukan, owner: itemId, areaLabel: '段' },
        ],
        items: [{ id: itemId, name: '棚', place: NIL_ID, category: null, tags: [] }],
      },
    });

    expect(() => deleteKuukan(doc, NIL_ID, ctx)).toThrowError(OpError);
    try {
      deleteKuukan(doc, NIL_ID, ctx);
    } catch (e) {
      expect((e as OpError).code).toBe('reserved');
    }

    expect(() => deleteKuukan(doc, storageKuukan, ctx)).toThrowError(OpError);
    try {
      deleteKuukan(doc, storageKuukan, ctx);
    } catch (e) {
      expect((e as OpError).code).toBe('notTopLevel');
    }
  });
});
