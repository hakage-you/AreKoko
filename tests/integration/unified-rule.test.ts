import { describe, expect, it } from 'vitest';
import { makeApp, MemoryFile, expectHealthy, expectOnlyMoved, makeDeterministicV7Id } from './harness';
import { NIL_ID } from '../../src/core/constants';
import type { ArekokoDocument, Point } from '../../src/core/types';
import { createEmptyDocument } from '../../src/core/document';
import { serializeDocument } from '../../src/core/serialize';
import { attachOutline, splitAt, splitEven, deleteLine, planDeleteLine } from '../../src/core/ops/areas';
import { deleteItems, planDeleteItems, addItem } from '../../src/core/ops/items';
import { removeStorage, planRemoveStorage, makeStorage } from '../../src/core/ops/storage';
import { deleteKuukan, planDeleteKuukan, createKuukan } from '../../src/core/ops/kuukans';

describe('結合試験: 統一規則 (U1〜U6)', () => {
  it('U1: 仕切りを消して、エリアがなくなった（親のエリアへ移動、描画は維持）', async () => {
    let idCounter = 1;
    const ctx = {
      newId: () => makeDeterministicV7Id(idCounter++),
      now: () => '2026-10-08T12:00:00.000Z',
    };

    let doc = createEmptyDocument();
    const kRes = createKuukan(doc, { name: '部屋1' }, ctx);
    doc = kRes.doc;
    const roomId = kRes.created[0]!;

    const outline: Point[] = [
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000],
    ];
    doc = attachOutline(doc, roomId, { outline, aspect: 1 }, ctx).doc;
    const splitRes = splitAt(doc, roomId, 'x', [5000, 5000], ctx);
    doc = splitRes.doc;
    const area1Id = splitRes.created[0]!;

    const itemRes = addItem(doc, { name: '机', place: area1Id }, ctx);
    doc = itemRes.doc;
    const itemId = itemRes.created[0]!;

    doc = {
      ...doc,
      drawing: {
        ...doc.drawing,
        items: [
          {
            item: itemId,
            shape: { type: 'point', at: [2500, 5000] },
            rotation: 0,
          },
        ],
      },
    };

    const file = new MemoryFile('u1.json', serializeDocument(doc));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    const before1 = app.state.doc!;

    const result = app.apply((d, opCtx) => deleteLine(d, roomId, 0, opCtx))!;

    expectOnlyMoved(before1, result.doc, result.moved);

    expect(result.moved).toEqual([itemId]);
    expect(app.state.highlights.has(itemId)).toBe(true);
    expect(app.state.highlights.size).toBe(1);

    const movedItem = result.doc.membership.items.find((i) => i.id === itemId)!;
    expect(movedItem.place).toBe(roomId);
    expect(movedItem.notices).toBeUndefined();

    // 同じクウカンの中なので描画は残る
    expect(result.doc.drawing.items.some((d) => d.item === itemId)).toBe(true);

    await clock.advance(1000);
    const saved = file.json();
    const savedItem = saved.membership.items.find((i: any) => i.id === itemId);
    expect(savedItem.place).toBe(roomId);
    expect(savedItem.notices).toBeUndefined();

    expectHealthy(app, file);
  });

  it('U1b: 入れ子の仕切りを消すと、中身は親のエリアへ（クウカンそのものではない）', async () => {
    let idCounter = 50;
    const ctx = { newId: () => makeDeterministicV7Id(idCounter++), now: () => '2026-10-08T12:00:00.000Z' };
    let doc = createEmptyDocument();
    const k = createKuukan(doc, { name: '押し入れ', areaLabel: '段' }, ctx);
    doc = k.doc;
    const roomId = k.created[0]!;
    doc = attachOutline(doc, roomId, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 1.5 }, ctx).doc;
    const top = splitAt(doc, roomId, 'y', [5000, 5000], ctx);
    doc = top.doc;
    const upperId = top.created[0]!;
    const inner = splitAt(doc, roomId, 'x', [5000, 2500], ctx);
    doc = inner.doc;
    const upperLeftId = inner.created[0]!;
    const it1 = addItem(doc, { name: '布団', place: upperLeftId }, ctx);
    doc = it1.doc;
    const futonId = it1.created[0]!;

    const file = new MemoryFile('u1b.json', serializeDocument(doc));
    const { app, clock } = makeApp({ file });
    await app.openFile();
    const before = app.state.doc!;
    const result = app.apply((d, opCtx) => deleteLine(d, upperId, 0, opCtx))!;
    expectOnlyMoved(before, result.doc, result.moved);
    expect(result.moved).toEqual([futonId]);
    expect(result.doc.membership.items.find(i => i.id === futonId)!.place).toBe(upperId);
    await clock.advance(1000);
    expect(file.json().membership.items.find((i: { id: string }) => i.id === futonId).place).toBe(upperId);
    expectHealthy(app, file);
  });

  it('U2: N等分の兄弟の間の仕切りを消した（親へ移動、合わさった範囲に空の新しいエリア）', async () => {
    let idCounter = 10;
    const ctx = {
      newId: () => makeDeterministicV7Id(idCounter++),
      now: () => '2026-10-08T12:00:00.000Z',
    };

    let doc = createEmptyDocument();
    const kRes = createKuukan(doc, { name: '部屋2' }, ctx);
    doc = kRes.doc;
    const roomId = kRes.created[0]!;

    const outline: Point[] = [
      [0, 0],
      [10000, 0],
      [10000, 10000],
      [0, 10000],
    ];
    doc = attachOutline(doc, roomId, { outline, aspect: 1 }, ctx).doc;
    const splitRes = splitEven(doc, roomId, 'x', 3, ctx);
    doc = splitRes.doc;
    const [area1Id, area2Id] = splitRes.created;

    const item1Res = addItem(doc, { name: 'モノ1', place: area1Id }, ctx);
    doc = item1Res.doc;
    const item1Id = item1Res.created[0]!;

    const item2Res = addItem(doc, { name: 'モノ2', place: area2Id }, ctx);
    doc = item2Res.doc;
    const item2Id = item2Res.created[0]!;

    const file = new MemoryFile('u2.json', serializeDocument(doc));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    const before2 = app.state.doc!;

    const result = app.apply((d, opCtx) => deleteLine(d, roomId, 0, opCtx))!;

    expectOnlyMoved(before2, result.doc, result.moved);

    expect(new Set(result.moved)).toEqual(new Set([item1Id, item2Id]));
    expect(app.state.highlights.has(item1Id)).toBe(true);
    expect(app.state.highlights.has(item2Id)).toBe(true);
    expect(app.state.highlights.size).toBe(2);

    const docItem1 = result.doc.membership.items.find((i) => i.id === item1Id)!;
    const docItem2 = result.doc.membership.items.find((i) => i.id === item2Id)!;
    expect(docItem1.place).toBe(roomId);
    expect(docItem2.place).toBe(roomId);
    expect(docItem1.notices).toBeUndefined();
    expect(docItem2.notices).toBeUndefined();

    // 合わさった範囲に新しい空エリアが作られている
    expect(result.created).toHaveLength(1);
    const newAreaId = result.created[0]!;
    const itemsInNewArea = result.doc.membership.items.filter((i) => i.place === newAreaId);
    expect(itemsInNewArea).toHaveLength(0);

    await clock.advance(1000);
    const saved = file.json();
    const savedItem1 = saved.membership.items.find((i: any) => i.id === item1Id);
    const savedItem2 = saved.membership.items.find((i: any) => i.id === item2Id);
    expect(savedItem1.place).toBe(roomId);
    expect(savedItem2.place).toBe(roomId);
    expect(savedItem1.notices).toBeUndefined();
    expect(savedItem2.notices).toBeUndefined();

    expectHealthy(app, file);
  });

  it('U3: 収納のモノを削除した（収納があった置き場へ移動、中の収納は中身ごと）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const roomRes = app.apply((d, ctx) => createKuukan(d, { name: 'リビング' }, ctx))!;
    const roomId = roomRes.created[0]!;

    const shelfRes = app.apply((d, ctx) => addItem(d, { name: '棚', place: roomId }, ctx))!;
    const shelfId = shelfRes.created[0]!;
    const shelfKRes = app.apply((d, ctx) => makeStorage(d, shelfId, {}, ctx))!;
    const shelfKuukanId = shelfKRes.created[0]!;

    const boxRes = app.apply((d, ctx) => addItem(d, { name: '箱', place: shelfKuukanId }, ctx))!;
    const boxId = boxRes.created[0]!;
    const boxKRes = app.apply((d, ctx) => makeStorage(d, boxId, {}, ctx))!;
    const boxKuukanId = boxKRes.created[0]!;

    const batteryRes = app.apply((d, ctx) => addItem(d, { name: '電池', place: boxKuukanId }, ctx))!;
    const batteryId = batteryRes.created[0]!;

    // 収納「棚」を削除する
    const before3 = app.state.doc!;
    const result = app.apply((d, ctx) => deleteItems(d, [shelfId], ctx))!;
    expectOnlyMoved(before3, result.doc, result.moved);

    expect(result.moved).toEqual([boxId]);
    expect(app.state.highlights.has(boxId)).toBe(true);
    expect(app.state.highlights.has(batteryId)).toBe(false);

    const docBox = result.doc.membership.items.find((i) => i.id === boxId)!;
    const docBattery = result.doc.membership.items.find((i) => i.id === batteryId)!;
    expect(docBox.place).toBe(roomId);
    expect(docBattery.place).toBe(boxKuukanId);
    expect(docBox.notices).toBeUndefined();
    expect(docBattery.notices).toBeUndefined();

    await clock.advance(1000);
    const saved = file.json();
    const savedBox = saved.membership.items.find((i: any) => i.id === boxId);
    const savedBattery = saved.membership.items.find((i: any) => i.id === batteryId);
    expect(savedBox.place).toBe(roomId);
    expect(savedBattery.place).toBe(boxKuukanId);

    expectHealthy(app, file);
  });

  it('U4: 収納設定を削除した（収納があった置き場へ移動、モノのIDは不変）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const roomRes = app.apply((d, ctx) => createKuukan(d, { name: 'クローゼット' }, ctx))!;
    const roomId = roomRes.created[0]!;

    const shelfRes = app.apply((d, ctx) => addItem(d, { name: 'ラック', place: roomId }, ctx))!;
    const shelfId = shelfRes.created[0]!;
    const shelfKRes = app.apply((d, ctx) => makeStorage(d, shelfId, {}, ctx))!;
    const shelfKuukanId = shelfKRes.created[0]!;

    const itemRes = app.apply((d, ctx) => addItem(d, { name: '帽子', place: shelfKuukanId }, ctx))!;
    const itemId = itemRes.created[0]!;

    const before4 = app.state.doc!;

    const result = app.apply((d, ctx) => removeStorage(d, shelfId, ctx))!;

    expectOnlyMoved(before4, result.doc, result.moved);

    expect(result.moved).toEqual([itemId]);
    expect(app.state.highlights.has(itemId)).toBe(true);
    expect(app.state.highlights.size).toBe(1);

    expect(result.doc.membership.items.some((i) => i.id === shelfId)).toBe(true);
    const movedItem = result.doc.membership.items.find((i) => i.id === itemId)!;
    expect(movedItem.place).toBe(roomId);
    expect(movedItem.notices).toBeUndefined();

    await clock.advance(1000);
    const saved = file.json();
    const savedItem = saved.membership.items.find((i: any) => i.id === itemId);
    expect(savedItem.place).toBe(roomId);
    expect(savedItem.notices).toBeUndefined();

    expectHealthy(app, file);
  });

  it('U5: どこにも置かれていないクウカンを消した（未設定へ移動、中の収納は中身ごと）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const roomRes = app.apply((d, ctx) => createKuukan(d, { name: '倉庫' }, ctx))!;
    const roomId = roomRes.created[0]!;

    const boxRes = app.apply((d, ctx) => addItem(d, { name: '段ボール', place: roomId }, ctx))!;
    const boxId = boxRes.created[0]!;
    const boxKRes = app.apply((d, ctx) => makeStorage(d, boxId, {}, ctx))!;
    const boxKuukanId = boxKRes.created[0]!;

    const toolRes = app.apply((d, ctx) => addItem(d, { name: '工具', place: boxKuukanId }, ctx))!;
    const toolId = toolRes.created[0]!;

    const before5 = app.state.doc!;

    const result = app.apply((d, ctx) => deleteKuukan(d, roomId, ctx))!;

    expectOnlyMoved(before5, result.doc, result.moved);

    expect(result.moved).toEqual([boxId]);
    expect(app.state.highlights.has(boxId)).toBe(true);
    expect(app.state.highlights.has(toolId)).toBe(false);

    const docBox = result.doc.membership.items.find((i) => i.id === boxId)!;
    const docTool = result.doc.membership.items.find((i) => i.id === toolId)!;
    expect(docBox.place).toBe(NIL_ID);
    expect(docTool.place).toBe(boxKuukanId);
    expect(docBox.notices).toBeUndefined();
    expect(docTool.notices).toBeUndefined();

    await clock.advance(1000);
    const saved = file.json();
    const savedBox = saved.membership.items.find((i: any) => i.id === boxId);
    expect(savedBox.place).toBe(NIL_ID);

    expectHealthy(app, file);
  });

  it('U6: 移る前に影響を見せる（plan〜 の内容が実行後の移動と一致する）', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    const roomRes = app.apply((d, ctx) => createKuukan(d, { name: '部屋' }, ctx))!;
    const roomId = roomRes.created[0]!;

    const shelfRes = app.apply((d, ctx) => addItem(d, { name: '棚', place: roomId }, ctx))!;
    const shelfId = shelfRes.created[0]!;
    const shelfKRes = app.apply((d, ctx) => makeStorage(d, shelfId, {}, ctx))!;
    const shelfKuukanId = shelfKRes.created[0]!;

    const itemRes = app.apply((d, ctx) => addItem(d, { name: '荷物', place: shelfKuukanId }, ctx))!;
    const itemId = itemRes.created[0]!;

    // 1. planRemoveStorage の検証
    const storagePlan = planRemoveStorage(app.state.doc!, shelfId);
    expect(storagePlan).toHaveLength(1);
    expect(storagePlan[0]!.from).toBe(shelfKuukanId);
    expect(storagePlan[0]!.to).toBe(roomId);
    expect(storagePlan[0]!.items).toEqual([itemId]);

    const storageExec = app.apply((d, ctx) => removeStorage(d, shelfId, ctx))!;
    expect(storageExec.moved).toEqual(storagePlan[0]!.items);
    expect(storageExec.doc.membership.items.find((i) => i.id === itemId)?.place).toBe(storagePlan[0]!.to);

    // 2. planDeleteKuukan の検証
    const kuukanPlan = planDeleteKuukan(storageExec.doc, roomId);
    expect(kuukanPlan).toHaveLength(1);
    expect(kuukanPlan[0]!.from).toBe(roomId);
    expect(kuukanPlan[0]!.to).toBe(NIL_ID);
    expect(new Set(kuukanPlan[0]!.items)).toEqual(new Set([shelfId, itemId]));

    const kuukanExec = app.apply((d, ctx) => deleteKuukan(d, roomId, ctx))!;
    expect(new Set(kuukanExec.moved)).toEqual(new Set(kuukanPlan[0]!.items));

    expectHealthy(app, file);
  });

  it('U6b: 線を消す・収納のモノを消すときも、plan〜 が実際の移動と一致する', async () => {
    let idCounter = 80;
    const ctx = { newId: () => makeDeterministicV7Id(idCounter++), now: () => '2026-10-08T12:00:00.000Z' };
    let doc = createEmptyDocument();
    const k = createKuukan(doc, { name: '棚', areaLabel: '段' }, ctx);
    doc = k.doc;
    const shelfId = k.created[0]!;
    doc = attachOutline(doc, shelfId, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 1 }, ctx).doc;
    const sp = splitEven(doc, shelfId, 'y', 4, ctx);
    doc = sp.doc;
    const [d1, d2, d3] = sp.created;
    const a = addItem(doc, { name: 'A', place: d2! }, ctx);
    doc = a.doc;
    const b = addItem(doc, { name: 'B', place: d3! }, ctx);
    doc = b.doc;
    const box = addItem(doc, { name: '箱', place: d1! }, ctx);
    doc = box.doc;
    const boxK = makeStorage(doc, box.created[0]!, {}, ctx);
    doc = boxK.doc;
    const c = addItem(doc, { name: 'C', place: boxK.created[0]! }, ctx);
    doc = c.doc;

    const file = new MemoryFile('u6b.json', serializeDocument(doc));
    const { app } = makeApp({ file });
    await app.openFile();

    const linePlan = planDeleteLine(app.state.doc!, shelfId, 1);
    const lineExec = app.apply((dd, opCtx) => deleteLine(dd, shelfId, 1, opCtx))!;
    expect(new Set(linePlan.relocations.flatMap(r => r.items))).toEqual(new Set(lineExec.moved));
    for (const r of linePlan.relocations) {
      for (const id of r.items) expect(lineExec.doc.membership.items.find(i => i.id === id)!.place).toBe(r.to);
    }
    expect(linePlan.createsArea).toBe(true);
    expect(new Set(linePlan.removedAreas)).toEqual(new Set([d2, d3]));

    const delPlan = planDeleteItems(app.state.doc!, [box.created[0]!]);
    const delExec = app.apply((dd, opCtx) => deleteItems(dd, [box.created[0]!], opCtx))!;
    expect(new Set(delPlan.flatMap(r => r.items))).toEqual(new Set(delExec.moved));
    for (const r of delPlan) {
      for (const id of r.items) expect(delExec.doc.membership.items.find(i => i.id === id)!.place).toBe(r.to);
    }
    expectHealthy(app, file);
  });
});
