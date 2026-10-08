import { describe, expect, it } from 'vitest';
import { makeApp, MemoryFile, expectHealthy, FakeClock, makeDeterministicV7Id } from './harness';
import { NIL_ID, UNSET_NAME, DEFAULT_AREA_LABEL } from '../../src/core/constants';
import { isUuidV7 } from '../../src/core/ids';
import { serializeDocument } from '../../src/core/serialize';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';
import { addItem, moveItems, setItemsCategory, addTagToItems } from '../../src/core/ops/items';
import { createKuukan } from '../../src/core/ops/kuukans';
import { makeStorage } from '../../src/core/ops/storage';
import { createCategory } from '../../src/core/ops/categories';
import { createTag } from '../../src/core/ops/tags';
import { searchItems } from '../../src/search/search';

describe('結合試験: 段階の終わりの目安 (S1〜S5)', () => {
  it('S1: 壊れた文書・仮IDを含む文書を読み込み、修復案どおりに直せる', async () => {
    const tempKuukanId = 'new:room-temp';
    const tempItemId = 'new:battery-temp';
    const v4Id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const brokenItemId = makeDeterministicV7Id(1);
    const nonExistentPlace = makeDeterministicV7Id(999);
    const nonExistentCategory = makeDeterministicV7Id(998);
    const nonExistentTag = makeDeterministicV7Id(997);

    const brokenDocJson = JSON.stringify({
      app: 'arekoko',
      schemaVersion: 1,
      membership: {
        kuukans: [
          { id: NIL_ID, name: UNSET_NAME, owner: null, areaLabel: DEFAULT_AREA_LABEL },
          { id: tempKuukanId, name: '仮部屋', owner: null, areaLabel: DEFAULT_AREA_LABEL },
        ],
        areas: [],
        items: [
          {
            id: tempItemId,
            name: '仮電池',
            place: tempKuukanId,
            category: null,
            tags: [],
          },
          {
            id: v4Id,
            name: 'v4アイテム',
            place: NIL_ID,
            category: null,
            tags: [],
          },
          {
            id: brokenItemId,
            name: '参照切れアイテム',
            place: nonExistentPlace,
            category: nonExistentCategory,
            tags: [nonExistentTag],
          },
        ],
        categories: [],
        tags: [],
      },
      drawing: { kuukans: [], partitions: [], markers: [], items: [] },
    });

    const file = new MemoryFile('broken.json', brokenDocJson);
    const { app, clock } = makeApp({ file });

    await app.openFile();
    expect(app.state.screen).toBe('start');
    expect(app.state.dialog?.kind).toBe('repair');

    if (app.state.dialog?.kind === 'repair') {
      const repairs = app.state.dialog.repairs;
      expect(repairs.length).toBe(6);
      expect(repairs.filter((r) => r.code === 'tempId')).toHaveLength(3);
      expect(repairs.some((r) => r.code === 'placeMissing')).toBe(true);
      expect(repairs.some((r) => r.code === 'categoryMissing')).toBe(true);
      expect(repairs.some((r) => r.code === 'tagMissing')).toBe(true);
    }

    app.approveRepair();
    expect(app.state.screen).toBe('search');
    expect(app.state.dirty).toBe(true);
    expect(app.state.saveStatus).toBe('pending');
    expect(file.writes).toBe(0);

    await clock.advance(1000);
    expect(app.state.saveStatus).toBe('saved');
    expect(app.state.dirty).toBe(false);
    expect(file.writes).toBe(1);

    const saved = file.json();
    const savedKuukan = saved.membership.kuukans.find((k: any) => k.name === '仮部屋')!;
    expect(isUuidV7(savedKuukan.id)).toBe(true);

    const savedTempItem = saved.membership.items.find((it: any) => it.name === '仮電池')!;
    expect(isUuidV7(savedTempItem.id)).toBe(true);
    expect(savedTempItem.place).toBe(savedKuukan.id);
    expect(savedTempItem.notices).toBeUndefined();

    const savedV4Item = saved.membership.items.find((it: any) => it.name === 'v4アイテム')!;
    expect(isUuidV7(savedV4Item.id)).toBe(true);
    expect(savedV4Item.notices).toBeUndefined();

    const savedBrokenItem = saved.membership.items.find((it: any) => it.name === '参照切れアイテム')!;
    expect(savedBrokenItem.place).toBe(NIL_ID);
    expect(savedBrokenItem.category).toBeNull();
    expect(savedBrokenItem.tags).toEqual([]);
    // 外したり移したりした3つ（置き場・カテゴリ・タグ）それぞれに修復メモ（設計 6.7）
    const texts: string[] = savedBrokenItem.notices.map((n: { text: string }) => n.text);
    expect(texts).toHaveLength(3);
    expect(texts.some(t => t.includes('置き場') && t.includes('未設定'))).toBe(true);
    expect(texts.some(t => t.includes('カテゴリ') && t.includes('未分類'))).toBe(true);
    expect(texts.some(t => t.includes('タグ'))).toBe(true);
    expect(savedBrokenItem.notices.every((n: { at: string }) => n.at === '2026-10-08T12:00:00.000Z')).toBe(true);

    expectHealthy(app, file);
  });

  it('S2: 修復を断れば何も変わらない', async () => {
    const tempItemId = 'new:item-cancel';
    const brokenDocJson = JSON.stringify({
      app: 'arekoko',
      schemaVersion: 1,
      membership: {
        kuukans: [{ id: NIL_ID, name: UNSET_NAME, owner: null, areaLabel: DEFAULT_AREA_LABEL }],
        areas: [],
        items: [
          { id: tempItemId, name: '仮アイテム', place: NIL_ID, category: null, tags: [] },
        ],
        categories: [],
        tags: [],
      },
      drawing: { kuukans: [], partitions: [], markers: [], items: [] },
    });

    const file = new MemoryFile('repair-cancel.json', brokenDocJson);
    const { app, clock } = makeApp({ file });

    await app.openFile();
    expect(app.state.screen).toBe('start');
    expect(app.state.dialog?.kind).toBe('repair');

    app.rejectRepair();
    expect(app.state.screen).toBe('start');
    expect(app.state.doc).toBeNull();
    expect(app.state.dialog).toBeNull();
    expect(file.writes).toBe(0);

    await clock.advance(2000);
    expect(file.writes).toBe(0);
    expect(file.text).toBe(brokenDocJson);
  });

  it('S3: 輪のあるファイルは断る', async () => {
    const box1ItemId = makeDeterministicV7Id(10);
    const box1KuukanId = makeDeterministicV7Id(11);
    const box2ItemId = makeDeterministicV7Id(12);
    const box2KuukanId = makeDeterministicV7Id(13);

    const cyclicDocJson = JSON.stringify({
      app: 'arekoko',
      schemaVersion: 1,
      membership: {
        kuukans: [
          { id: NIL_ID, name: UNSET_NAME, owner: null, areaLabel: DEFAULT_AREA_LABEL },
          { id: box1KuukanId, owner: box1ItemId, areaLabel: DEFAULT_AREA_LABEL },
          { id: box2KuukanId, owner: box2ItemId, areaLabel: DEFAULT_AREA_LABEL },
        ],
        areas: [],
        items: [
          { id: box1ItemId, name: '箱1', place: box2KuukanId, category: null, tags: [] },
          { id: box2ItemId, name: '箱2', place: box1KuukanId, category: null, tags: [] },
        ],
        categories: [],
        tags: [],
      },
      drawing: { kuukans: [], partitions: [], markers: [], items: [] },
    });

    const file = new MemoryFile('cycle.json', cyclicDocJson);
    const { app, clock } = makeApp({ file });

    await app.openFile();
    expect(app.state.screen).toBe('start');
    expect(app.state.doc).toBeNull();
    expect(app.state.dialog?.kind).toBe('refused');

    if (app.state.dialog?.kind === 'refused') {
      const cycleReason = app.state.dialog.reasons.find((r) => r.code === 'cycleNesting')!;
      expect(cycleReason).toBeDefined();
      expect(cycleReason.message).toContain('箱1');
      expect(cycleReason.message).toContain('箱2');
    }

    expect(file.writes).toBe(0);
    await clock.advance(2000);
    expect(file.writes).toBe(0);
  });

  it('S4: 2つのタブで同じファイルを開いても、変更が黙って消えない', async () => {
    const sampleDoc = createSampleDocument();
    const file = new MemoryFile('shared.json', serializeDocument(sampleDoc));
    const clockA = new FakeClock();
    const clockB = new FakeClock();

    const { app: appA } = makeApp({ file, clock: clockA, idStart: 1000 });
    const { app: appB } = makeApp({ file, clock: clockB, idStart: 2000 });

    await appA.openFile();
    await appB.openFile();

    // 1. A で変更 → 保存
    appA.apply((d, ctx) => addItem(d, { name: 'Aの追加アイテム', place: NIL_ID }, ctx));
    await clockA.advance(1000);
    expect(file.writes).toBe(1);
    expect(file.text).toContain('Aの追加アイテム');

    // 2. B で変更 → B は conflict（書かない）、A の内容が残る
    appB.apply((d, ctx) => addItem(d, { name: 'Bの追加アイテム', place: NIL_ID }, ctx));
    await clockB.advance(1000);
    expect(appB.state.saveStatus).toBe('conflict');
    expect(appB.state.dialog?.kind).toBe('conflict');
    expect(file.writes).toBe(1);
    expect(file.text).toContain('Aの追加アイテム');
    expect(file.text).not.toContain('Bの追加アイテム');

    // 3. B が「読み込み直す」→ A の変更が見える
    await appB.resolveConflict('reload');
    expect(appB.state.dialog).toBeNull();
    expect(appB.state.saveStatus).toBe('saved');
    expect(appB.state.doc?.membership.items.some((i) => i.name === 'Aの追加アイテム')).toBe(true);
    expect(appB.state.doc?.membership.items.some((i) => i.name === 'Bの追加アイテム')).toBe(false);

    // 4. B が「それでも上書きする」→ B の内容になる
    appB.apply((d, ctx) => addItem(d, { name: 'Bの上書きアイテム', place: NIL_ID }, ctx));
    appA.apply((d, ctx) => addItem(d, { name: 'Aの再追加', place: NIL_ID }, ctx));
    await clockA.advance(1000);
    expect(file.writes).toBe(2);

    await clockB.advance(1000);
    expect(appB.state.saveStatus).toBe('conflict');
    await appB.resolveConflict('overwrite');
    expect(appB.state.saveStatus).toBe('saved');
    expect(file.writes).toBe(3);
    expect(file.text).toContain('Bの上書きアイテム');

    expectHealthy(appB, file);
  });

  it('S5: 描画なしで、登録・検索・移動が一通りできる', async () => {
    const { app, file, clock } = makeApp();

    // 1. 新しく作る
    await app.newDocument();
    expect(app.state.screen).toBe('search');
    expect(file.writes).toBe(1);

    // 2. クウカンを作る
    const kuukanRes = app.apply((d, ctx) => createKuukan(d, { name: 'リビング' }, ctx))!;
    const livingId = kuukanRes.created[0]!;

    // 3. モノを追加（置き場あり／なし）
    const unsetRes = app.apply((d, ctx) => addItem(d, { name: '未設定の本', place: NIL_ID }, ctx))!;
    const bookId = unsetRes.created[0]!;

    const shelfRes = app.apply((d, ctx) => addItem(d, { name: '木製棚', place: livingId }, ctx))!;
    const shelfId = shelfRes.created[0]!;

    // 4. 収納にする
    const storageRes = app.apply((d, ctx) => makeStorage(d, shelfId, { areaLabel: '段' }, ctx))!;
    const shelfKuukanId = storageRes.created[0]!;

    // 5. 収納の中へ移す
    app.apply((d, ctx) => moveItems(d, [bookId], shelfKuukanId, ctx));

    // カテゴリとタグを登録して付ける
    const catRes = app.apply((d, ctx) => createCategory(d, { name: '本' }, ctx))!;
    const catId = catRes.created[0]!;
    app.apply((d, ctx) => setItemsCategory(d, [bookId], catId, ctx));

    const tagRes = app.apply((d, ctx) => createTag(d, { name: '愛読書' }, ctx))!;
    const tagId = tagRes.created[0]!;
    app.apply((d, ctx) => addTagToItems(d, [bookId], tagId, ctx));

    // 6. 検索（文字・置き場〔中の収納まで〕・カテゴリ・タグ）
    const foundText = searchItems(app.state.doc!, { text: '未設定の本' });
    expect(foundText).toHaveLength(1);
    expect(foundText[0]?.id).toBe(bookId);

    const foundPlace = searchItems(app.state.doc!, { place: livingId });
    expect(foundPlace.some((i) => i.id === shelfId)).toBe(true);
    expect(foundPlace.some((i) => i.id === bookId)).toBe(true);

    const foundCategory = searchItems(app.state.doc!, { category: catId });
    expect(foundCategory).toHaveLength(1);
    expect(foundCategory[0]?.id).toBe(bookId);

    const foundTag = searchItems(app.state.doc!, { tags: { ids: [tagId], mode: 'all' } });
    expect(foundTag).toHaveLength(1);
    expect(foundTag[0]?.id).toBe(bookId);

    // 7. 閉じて開き直すと同じ
    await clock.advance(1000);
    const beforeCloseDoc = app.state.doc;
    await app.closeDocument();
    expect(app.state.screen).toBe('start');
    expect(app.state.doc).toBeNull();

    await app.openFile();
    expect(app.state.screen).toBe('search');
    expect(app.state.doc).toEqual(beforeCloseDoc);

    expectHealthy(app, file);
  });
});
