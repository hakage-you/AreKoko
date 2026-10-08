import type { Point } from '../../../src/core/types';
import { describe, it, expect } from 'vitest';
import {
  addItem,
  updateItem,
  moveItems,
  setItemsCategory,
  addTagToItems,
  removeTagFromItems,
  deleteItems,
  planDeleteItems,
} from '../../../src/core/ops/items';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createTestContext, deepFreeze, createBaseDoc } from '../../helpers/ctx';
import { NIL_ID } from '../../../src/core/constants';

describe('items ops', () => {
  it('addItem: 既定で未設定へ追加され、プロパティが反映される', () => {
    const ctx = createTestContext({ now: '2026-10-08T12:00:00.000Z', startCount: 10 });
    const doc = deepFreeze(createBaseDoc());

    const res = addItem(doc, { name: '電池', summary: '単3', qty: 4 }, ctx);

    expect(res.created.length).toBe(1);
    const item = res.doc.membership.items[0]!;
    expect(item.name).toBe('電池');
    expect(item.place).toBe(NIL_ID);
    expect(item.summary).toBe('単3');
    expect(item.qty).toBe(4);
    expect(item.updatedAt).toBe('2026-10-08T12:00:00.000Z');
    expect(validateDocument(res.doc)).toEqual([]);
  });

  it('updateItem: null で summary と qty がキーごと消え、updatedAt が更新される', () => {
    const ctx = createTestContext({ now: '2026-10-08T13:00:00.000Z' });
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        items: [
          {
            id: itemId,
            name: 'ノート',
            place: NIL_ID,
            category: null,
            tags: [],
            summary: 'B5',
            qty: 2,
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    });

    const res = updateItem(doc, itemId, { summary: null, qty: null }, ctx);
    const updated = res.doc.membership.items[0]!;
    expect('summary' in updated).toBe(false);
    expect('qty' in updated).toBe(false);
    expect(updated.updatedAt).toBe('2026-10-08T13:00:00.000Z');
    expect(validateDocument(res.doc)).toEqual([]);
  });

  it('moveItems: 候補外・自分の中の収納への移動は invalidPlace エラー', () => {
    const ctx = createTestContext();
    const base = createBaseDoc();
    const itemId = '01920000-0000-7000-8000-000000000001';
    const storageKuukanId = '01920000-0000-7000-8000-000000000002';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: storageKuukanId, owner: itemId, areaLabel: 'エリア' },
        ],
        items: [{ id: itemId, name: '箱', place: NIL_ID, category: null, tags: [] }],
      },
    });

    expect(() => moveItems(doc, [itemId], storageKuukanId, ctx)).toThrowError(OpError);
    try {
      moveItems(doc, [itemId], storageKuukanId, ctx);
    } catch (e) {
      expect((e as OpError).code).toBe('invalidPlace');
    }
  });

  it('moveItems: 同じ置き場なら変更されず、別クウカンなら描画が外れる', () => {
    const ctx = createTestContext({ now: '2026-10-08T14:00:00.000Z' });
    const base = createBaseDoc();
    const kuukanA = '01920000-0000-7000-8000-000000000001';
    const kuukanB = '01920000-0000-7000-8000-000000000002';
    const itemId = '01920000-0000-7000-8000-000000000010';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: kuukanA, name: 'クウカンA', owner: null, areaLabel: 'エリア' },
          { id: kuukanB, name: 'クウカンB', owner: null, areaLabel: 'エリア' },
        ],
        items: [
          {
            id: itemId,
            name: 'ペン',
            place: kuukanA,
            category: null,
            tags: [],
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
      drawing: {
        ...base.drawing,
        kuukans: [
          { kuukan: kuukanA, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]] as Point[], aspect: 1 },
          { kuukan: kuukanB, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]] as Point[], aspect: 1 },
        ],
        items: [{ item: itemId, shape: { type: 'point' as const, at: [100, 100] as Point }, rotation: 0 as const }],
      },
    });

    // 既にそこにある置き場への移動
    const resNoop = moveItems(doc, [itemId], kuukanA, ctx);
    expect(resNoop.moved).toEqual([]);
    expect(resNoop.doc.membership.items[0]?.updatedAt).toBe('2026-10-01T00:00:00.000Z');

    // 別のクウカンへの移動
    const resMove = moveItems(doc, [itemId], kuukanB, ctx);
    expect(resMove.moved).toEqual([itemId]);
    expect(resMove.doc.membership.items[0]?.place).toBe(kuukanB);
    expect(resMove.doc.membership.items[0]?.updatedAt).toBe('2026-10-08T14:00:00.000Z');
    expect(resMove.doc.drawing.items).toEqual([]);
    expect(validateDocument(resMove.doc)).toEqual([]);
  });

  it('deleteItems: 収納のモノを削除すると中身がその置き場へ移り、入れ子でも正しく動く', () => {
    const ctx = createTestContext({ now: '2026-10-08T15:00:00.000Z' });
    const base = createBaseDoc();

    const roomA = '01920000-0000-7000-8000-000000000001';
    const boxA = '01920000-0000-7000-8000-000000000002';
    const kuukanBoxA = '01920000-0000-7000-8000-000000000003';
    const boxB = '01920000-0000-7000-8000-000000000004';
    const kuukanBoxB = '01920000-0000-7000-8000-000000000005';
    const itemC = '01920000-0000-7000-8000-000000000006';

    const doc = deepFreeze({
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          { id: roomA, name: '部屋A', owner: null, areaLabel: 'エリア' },
          { id: kuukanBoxA, owner: boxA, areaLabel: 'エリア' },
          { id: kuukanBoxB, owner: boxB, areaLabel: 'エリア' },
        ],
        items: [
          { id: boxA, name: '箱A', place: roomA, category: null, tags: [] },
          { id: boxB, name: '箱B', place: kuukanBoxA, category: null, tags: [] },
          { id: itemC, name: 'モノC', place: kuukanBoxB, category: null, tags: [] },
        ],
      },
    });

    // planDeleteItems の確認
    const plan = planDeleteItems(doc, [boxA, boxB]);
    expect(plan).toEqual([
      { from: kuukanBoxB, to: roomA, items: [itemC] },
    ]);

    // 両方を削除
    const res = deleteItems(doc, [boxA, boxB], ctx);

    // 箱A・箱Bは消え、モノCだけが残る
    expect(res.doc.membership.items.map(i => i.id)).toEqual([itemC]);
    // モノC は最終的に roomA へ移る
    const movedItem = res.doc.membership.items[0]!;
    expect(movedItem.place).toBe(roomA);
    expect(movedItem.updatedAt).toBe('2026-10-08T15:00:00.000Z');
    // moved には消されずに移ったモノCだけが入る
    expect(res.moved).toEqual([itemC]);
    // 箱Aと箱Bの収納クウカンも消えている
    expect(res.doc.membership.kuukans.map(k => k.id)).toEqual([NIL_ID, roomA]);
    expect(validateDocument(res.doc)).toEqual([]);
  });
});
