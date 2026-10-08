import { describe, expect, it } from 'vitest';
import { makeApp, MemoryFile, expectHealthy, makeDeterministicV7Id } from './harness';
import { NIL_ID, UNSET_NAME, DEFAULT_AREA_LABEL } from '../../src/core/constants';
import { timestampOfV7 } from '../../src/core/ids';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';
import { serializeDocument } from '../../src/core/serialize';
import { createEmptyDocument } from '../../src/core/document';
import { attachOutline, splitAt } from '../../src/core/ops/areas';
import { addItem, updateItem, moveItems } from '../../src/core/ops/items';
import { createKuukan, renameKuukan } from '../../src/core/ops/kuukans';
import { makeStorage } from '../../src/core/ops/storage';
import { createCategory, renameCategory, deleteCategory } from '../../src/core/ops/categories';
import { createTag, renameTag, deleteTag } from '../../src/core/ops/tags';
import { placeCandidates } from '../../src/core/places';
import { removeNotice } from '../../src/core/ops/notices';

describe('結合試験: データと操作の規則 (D1〜D9)', () => {
  it('D1: アプリが知らない項目は、編集して保存しても消えない', async () => {
    const rawDoc: any = createSampleDocument();
    rawDoc.unknownDocProp = 'custom-doc-value';
    rawDoc.membership.kuukans[1].unknownKuukanProp = 999;
    rawDoc.membership.items[0].unknownItemProp = { nested: true, key: 'keep-me' };

    const file = new MemoryFile('unknown-props.json', JSON.stringify(rawDoc));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    const targetItemId = rawDoc.membership.items[0].id;
    app.apply((d, ctx) => updateItem(d, targetItemId, { name: '編集された名前' }, ctx));
    app.apply((d, ctx) => moveItems(d, [targetItemId], NIL_ID, ctx));

    await clock.advance(1000);
    expect(file.writes).toBe(1);

    const saved = file.json();
    expect(saved.unknownDocProp).toBe('custom-doc-value');
    expect(saved.membership.kuukans[1].unknownKuukanProp).toBe(999);

    const savedItem = saved.membership.items.find((i: any) => i.id === targetItemId);
    expect(savedItem.unknownItemProp).toEqual({ nested: true, key: 'keep-me' });
    expect(savedItem.name).toBe('編集された名前');
    expect(savedItem.place).toBe(NIL_ID);

    expectHealthy(app, file);
  });

  it('D2: 計算で出せるデータは保存しない', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const kRes = app.apply((d, ctx) => createKuukan(d, { name: '部屋' }, ctx))!;
    const roomId = kRes.created[0]!;
    const itRes = app.apply((d, ctx) => addItem(d, { name: 'モノ', place: roomId }, ctx))!;
    const itemId = itRes.created[0]!;

    await clock.advance(1000);
    expect(file.writes).toBe(2);

    const saved = file.json();
    const itemObj = saved.membership.items[0];
    const kuukanObj = saved.membership.kuukans[1];

    expect(itemObj.path).toBeUndefined();
    expect(itemObj.route).toBeUndefined();
    expect(itemObj.count).toBeUndefined();
    expect(itemObj.createdAt).toBeUndefined();

    expect(kuukanObj.path).toBeUndefined();
    expect(kuukanObj.count).toBeUndefined();
    expect(kuukanObj.createdAt).toBeUndefined();

    expect(timestampOfV7(itemId)).toBeGreaterThan(0);

    // 保存される項目は、設計で決めた項目の範囲に収まる（経路・件数・作成日時などの計算できる値を足していない）
    const allowed: Record<string, string[]> = {
      top: ['app', 'schemaVersion', 'membership', 'drawing'],
      kuukan: ['id', 'name', 'owner', 'areaLabel', 'notices'],
      item: ['id', 'name', 'place', 'category', 'tags', 'summary', 'qty', 'updatedAt', 'notices'],
    };
    const within = (obj: object, keys: string[]) => expect(Object.keys(obj).filter(k => !keys.includes(k))).toEqual([]);
    within(saved, allowed.top!);
    for (const k of saved.membership.kuukans) within(k, allowed.kuukan!);
    for (const it of saved.membership.items) within(it, allowed.item!);

    expectHealthy(app, file);
  });

  it('D3: 処理はID、名前は表示専用（同じ名前があってよい）', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    // 同じ名前のタグ
    const t1 = app.apply((d, ctx) => createTag(d, { name: '同名タグ' }, ctx))!.created[0]!;
    const t2 = app.apply((d, ctx) => createTag(d, { name: '同名タグ' }, ctx))!.created[0]!;
    expect(t1).not.toBe(t2);

    app.apply((d) => renameTag(d, t1, 'タグA'));
    expect(app.state.doc?.membership.tags.find((t) => t.id === t1)?.name).toBe('タグA');
    expect(app.state.doc?.membership.tags.find((t) => t.id === t2)?.name).toBe('同名タグ');

    app.apply((d, ctx) => deleteTag(d, t2, ctx));
    expect(app.state.doc?.membership.tags.some((t) => t.id === t2)).toBe(false);
    expect(app.state.doc?.membership.tags.some((t) => t.id === t1)).toBe(true);

    // 同じ名前のカテゴリ
    const c1 = app.apply((d, ctx) => createCategory(d, { name: '同名カテゴリ' }, ctx))!.created[0]!;
    const c2 = app.apply((d, ctx) => createCategory(d, { name: '同名カテゴリ' }, ctx))!.created[0]!;
    expect(c1).not.toBe(c2);

    app.apply((d) => renameCategory(d, c1, 'カテゴリ1'));
    expect(app.state.doc?.membership.categories.find((c) => c.id === c1)?.name).toBe('カテゴリ1');
    expect(app.state.doc?.membership.categories.find((c) => c.id === c2)?.name).toBe('同名カテゴリ');

    // 同じ名前のクウカン
    const k1 = app.apply((d, ctx) => createKuukan(d, { name: '同名クウカン' }, ctx))!.created[0]!;
    const k2 = app.apply((d, ctx) => createKuukan(d, { name: '同名クウカン' }, ctx))!.created[0]!;
    expect(k1).not.toBe(k2);

    app.apply((d) => renameKuukan(d, k1, 'クウカン1'));
    expect(app.state.doc?.membership.kuukans.find((k) => k.id === k1)?.name).toBe('クウカン1');
    expect(app.state.doc?.membership.kuukans.find((k) => k.id === k2)?.name).toBe('同名クウカン');

    await clock.advance(1000);
    expectHealthy(app, file);
  });

  it('D4: カテゴリを消すと、中のモノと子カテゴリが親へ', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const rootId = app.apply((d, ctx) => createCategory(d, { name: '親カテゴリ' }, ctx))!.created[0]!;
    const midId = app.apply((d, ctx) => createCategory(d, { name: '中間カテゴリ', parent: rootId }, ctx))!.created[0]!;
    const leafId = app.apply((d, ctx) => createCategory(d, { name: '子カテゴリ', parent: midId }, ctx))!.created[0]!;

    const itemRes = app.apply((d, ctx) => addItem(d, { name: 'アイテム', category: midId }, ctx))!;
    const itemId = itemRes.created[0]!;

    app.apply((d, ctx) => deleteCategory(d, midId, ctx));

    const updatedDoc = app.state.doc!;
    expect(updatedDoc.membership.categories.some((c) => c.id === midId)).toBe(false);

    const leafCat = updatedDoc.membership.categories.find((c) => c.id === leafId)!;
    expect(leafCat.parent).toBe(rootId);

    const itemObj = updatedDoc.membership.items.find((i) => i.id === itemId)!;
    expect(itemObj.category).toBe(rootId);

    await clock.advance(1000);
    const saved = file.json();
    const savedLeaf = saved.membership.categories.find((c: any) => c.id === leafId);
    const savedItem = saved.membership.items.find((i: any) => i.id === itemId);
    expect(savedLeaf.parent).toBe(rootId);
    expect(savedItem.category).toBe(rootId);

    expectHealthy(app, file);
  });

  it('D5: タグを消すと、全部の参照が消える', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const t1 = app.apply((d, ctx) => createTag(d, { name: 'タグ1' }, ctx))!.created[0]!;
    const t2 = app.apply((d, ctx) => createTag(d, { name: 'タグ2' }, ctx))!.created[0]!;

    const it1 = app.apply((d, ctx) => addItem(d, { name: 'モノ1', tags: [t1, t2] }, ctx))!.created[0]!;
    const it2 = app.apply((d, ctx) => addItem(d, { name: 'モノ2', tags: [t1] }, ctx))!.created[0]!;

    app.apply((d, ctx) => deleteTag(d, t1, ctx));

    const updatedDoc = app.state.doc!;
    expect(updatedDoc.membership.tags.some((t) => t.id === t1)).toBe(false);

    const item1 = updatedDoc.membership.items.find((i) => i.id === it1)!;
    const item2 = updatedDoc.membership.items.find((i) => i.id === it2)!;
    expect(item1.tags).toEqual([t2]);
    expect(item2.tags).toEqual([]);

    await clock.advance(1000);
    const saved = file.json();
    const savedItem1 = saved.membership.items.find((i: any) => i.id === it1);
    const savedItem2 = saved.membership.items.find((i: any) => i.id === it2);
    expect(savedItem1.tags).toEqual([t2]);
    expect(savedItem2.tags).toEqual([]);

    expectHealthy(app, file);
  });

  it('D6: 収納を自分の中に置けない', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    const room = app.apply((d, ctx) => createKuukan(d, { name: '部屋' }, ctx))!.created[0]!;
    const shelf = app.apply((d, ctx) => addItem(d, { name: '棚', place: room }, ctx))!.created[0]!;
    const shelfKuukan = app.apply((d, ctx) => makeStorage(d, shelf, {}, ctx))!.created[0]!;

    const box = app.apply((d, ctx) => addItem(d, { name: '箱', place: shelfKuukan }, ctx))!.created[0]!;
    const boxKuukan = app.apply((d, ctx) => makeStorage(d, box, {}, ctx))!.created[0]!;

    // placeCandidates に自分自身や自分の中の収納のクウカンが出ない
    const candidates = placeCandidates(app.state.doc!, [shelf]);
    expect(candidates).not.toContain(shelfKuukan);
    expect(candidates).not.toContain(boxKuukan);

    // 自分の中へ移そうとすると null が返りトースト（error）が出て文書は変わらない
    const prevDoc = app.state.doc;
    const errRes1 = app.apply((d, ctx) => moveItems(d, [shelf], shelfKuukan, ctx));
    expect(errRes1).toBeNull();
    expect(app.state.toast?.kind).toBe('error');
    expect(app.state.doc).toBe(prevDoc);

    const errRes2 = app.apply((d, ctx) => moveItems(d, [shelf], boxKuukan, ctx));
    expect(errRes2).toBeNull();
    expect(app.state.toast?.kind).toBe('error');
    expect(app.state.doc).toBe(prevDoc);

    expectHealthy(app, file);
  });

  it('D7: 置き場を別のクウカンへ変えたら、描画は外れる（同じクウカンの中なら残る）', async () => {
    let n = 300;
    const ctx = { newId: () => makeDeterministicV7Id(n++), now: () => '2026-10-08T12:00:00.000Z' };
    let doc = createEmptyDocument();
    const k = createKuukan(doc, { name: '部屋', areaLabel: '床' }, ctx);
    doc = k.doc;
    const roomId = k.created[0]!;
    doc = attachOutline(doc, roomId, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 1 }, ctx).doc;
    const sp = splitAt(doc, roomId, 'x', [5000, 5000], ctx);
    doc = sp.doc;
    const [leftId, rightId] = sp.created;
    const it = addItem(doc, { name: '机', place: leftId! }, ctx);
    doc = it.doc;
    const deskId = it.created[0]!;
    doc = { ...doc, drawing: { ...doc.drawing, items: [{ item: deskId, shape: { type: 'rect', x: 1000, y: 1000, w: 2000, h: 1000 }, rotation: 0 }] } };

    const file = new MemoryFile('d7.json', serializeDocument(doc));
    const { app, clock } = makeApp({ file });
    await app.openFile();

    // 同じクウカンの中（床1 → 床2）：所属は変わるが描画は残る（ずれの印の対象になるだけ。設計 7.7）
    app.apply((d, c) => moveItems(d, [deskId], rightId!, c));
    expect(app.state.doc!.drawing.items.some(di => di.item === deskId)).toBe(true);

    // 別のクウカン（未設定）へ：描画は外れる
    app.apply((d, c) => moveItems(d, [deskId], NIL_ID, c));
    expect(app.state.doc!.drawing.items.some(di => di.item === deskId)).toBe(false);

    await clock.advance(1000);
    expect(file.json().drawing.items.some((di: { item: string }) => di.item === deskId)).toBe(false);
    expectHealthy(app, file);
  });

  it('D8: 修復メモは消すことだけできる', async () => {
    const brokenItemId = makeDeterministicV7Id(50);
    const brokenDocJson = JSON.stringify({
      app: 'arekoko',
      schemaVersion: 1,
      membership: {
        kuukans: [{ id: NIL_ID, name: UNSET_NAME, owner: null, areaLabel: DEFAULT_AREA_LABEL }],
        areas: [],
        items: [
          {
            id: brokenItemId,
            name: '修復対象モノ',
            place: makeDeterministicV7Id(999),
            category: null,
            tags: [],
          },
        ],
        categories: [],
        tags: [],
      },
      drawing: { kuukans: [], partitions: [], markers: [], items: [] },
    });

    const file = new MemoryFile('d8.json', brokenDocJson);
    const { app, clock } = makeApp({ file });
    await app.openFile();
    app.approveRepair();

    await clock.advance(1000);
    const initialSaved = file.json();
    const itemWithNotice = initialSaved.membership.items.find((i: any) => i.id === brokenItemId);
    expect(itemWithNotice.notices).toBeDefined();
    expect(itemWithNotice.notices.length).toBeGreaterThanOrEqual(1);

    // 修復メモを削除する
    app.apply((d) => removeNotice(d, 'item', brokenItemId, 0));

    await clock.advance(1000);
    const afterDeleteSaved = file.json();
    const itemAfterDelete = afterDeleteSaved.membership.items.find((i: any) => i.id === brokenItemId);
    expect(itemAfterDelete.notices).toBeUndefined();

    expectHealthy(app, file);
  });

  it('D9: 数量の「なし」と「0」は違う', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const itemRes = app.apply((d, ctx) => addItem(d, { name: '在庫モノ', qty: 0 }, ctx))!;
    const itemId = itemRes.created[0]!;

    await clock.advance(1000);
    const savedWithZero = file.json();
    const itemWithZero = savedWithZero.membership.items.find((i: any) => i.id === itemId);
    expect(itemWithZero.qty).toBe(0);

    // 数量を消す（qty: null）
    app.apply((d, ctx) => updateItem(d, itemId, { qty: null }, ctx));

    await clock.advance(1000);
    const savedWithoutQty = file.json();
    const itemWithoutQty = savedWithoutQty.membership.items.find((i: any) => i.id === itemId);
    expect('qty' in itemWithoutQty).toBe(false);

    expectHealthy(app, file);
  });
});
