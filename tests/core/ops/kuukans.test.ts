import { describe, it, expect } from 'vitest';
import {
  createKuukan,
  renameKuukan,
  setAreaLabel,
  setKuukanIcon,
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

  it('setKuukanIcon: アイコン（文字・背景色・文字色）を設定・更新・削除できる', () => {
    const base = createBaseDoc();
    const roomA = '01920000-0000-7000-8000-000000000001';
    const itemId = '01920000-0000-7000-8000-000000000002';
    const storageKuukan = '01920000-0000-7000-8000-000000000003';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: roomA, name: 'リビング', owner: null, areaLabel: 'エリア' },
          { id: storageKuukan, owner: itemId, areaLabel: '段' },
        ],
        items: [{ id: itemId, name: '棚', place: roomA, category: null, tags: [] }],
      },
    });

    // 正常系: クウカンにアイコンを設定
    const res1 = setKuukanIcon(doc, roomA, {
      char: 'リ',
      bg: '#0284c7',
      color: '#ffffff',
    });
    const k1 = res1.doc.membership.kuukans.find((k) => k.id === roomA)!;
    expect(k1.icon).toEqual({
      char: 'リ',
      bg: '#0284c7',
      color: '#ffffff',
    });
    expect(validateDocument(res1.doc)).toEqual([]);

    // 正常系: 複数文字を渡したときは先頭1文字に正規化される
    const res2 = setKuukanIcon(res1.doc, roomA, {
      char: 'LDK',
      bg: '#16a34a',
    });
    const k2 = res2.doc.membership.kuukans.find((k) => k.id === roomA)!;
    expect(k2.icon).toEqual({
      char: 'L',
      bg: '#16a34a',
    });

    // 正常系: 組み込みSVGアイコンを設定できる
    const resSvg = setKuukanIcon(res2.doc, roomA, {
      svg: 'shelf',
      bg: '#0284c7',
      color: '#ffffff',
    });
    const kSvg = resSvg.doc.membership.kuukans.find((k) => k.id === roomA)!;
    expect(kSvg.icon).toEqual({
      svg: 'shelf',
      bg: '#0284c7',
      color: '#ffffff',
    });

    // 正常系: 収納クウカンにもアイコンを設定できる
    const res3 = setKuukanIcon(resSvg.doc, storageKuukan, {
      char: '棚',
      bg: '#d97706',
    });
    const k3 = res3.doc.membership.kuukans.find((k) => k.id === storageKuukan)!;
    expect(k3.icon).toEqual({
      char: '棚',
      bg: '#d97706',
    });

    // 正常系: icon: null でアイコンを削除
    const res4 = setKuukanIcon(res3.doc, roomA, null);
    const k4 = res4.doc.membership.kuukans.find((k) => k.id === roomA)!;
    expect(k4.icon).toBeUndefined();

    // 異常系: NIL_ID は reserved エラー
    expect(() => setKuukanIcon(doc, NIL_ID, { char: '未' })).toThrowError(OpError);
    try {
      setKuukanIcon(doc, NIL_ID, { char: '未' });
    } catch (e) {
      expect((e as OpError).code).toBe('reserved');
    }

    // 異常系: 存在しないクウカンは notFound エラー
    expect(() => setKuukanIcon(doc, '01920000-0000-7000-8000-999999999999', { char: 'X' })).toThrowError(OpError);

    // 異常系: 不正な色形式は invalidInput エラー
    expect(() => setKuukanIcon(doc, roomA, { bg: 'red' })).toThrowError(OpError);
    expect(() => setKuukanIcon(doc, roomA, { color: 'rgba(0,0,0,1)' })).toThrowError(OpError);

    // 異常系: 不正な組み込みアイコンIDは invalidInput エラー
    expect(() => setKuukanIcon(doc, roomA, { svg: 'unknown' as any })).toThrowError(OpError);
    try {
      setKuukanIcon(doc, roomA, { svg: 'unknown' as any });
    } catch (e) {
      expect((e as OpError).code).toBe('invalidInput');
    }
  });
});
