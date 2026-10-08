import { describe, expect, it } from 'vitest';
import { makeApp, MemoryFile, expectHealthy, makeDeterministicV7Id } from './harness';
import { NIL_ID } from '../../src/core/constants';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';
import { serializeDocument } from '../../src/core/serialize';
import { addItem, moveItems, setItemsCategory, addTagToItems } from '../../src/core/ops/items';
import { createKuukan } from '../../src/core/ops/kuukans';
import { createCategory } from '../../src/core/ops/categories';
import { createTag } from '../../src/core/ops/tags';
import { searchItems } from '../../src/search/search';

describe('結合試験: 検索 (Q1〜Q5)', () => {
  it('Q1: 1つの仕組みで、条件はすべて「かつ」', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    const roomA = app.apply((d, ctx) => createKuukan(d, { name: 'Room A' }, ctx))!.created[0]!;
    const roomB = app.apply((d, ctx) => createKuukan(d, { name: 'Room B' }, ctx))!.created[0]!;

    const catKomono = app.apply((d, ctx) => createCategory(d, { name: '小物' }, ctx))!.created[0]!;
    const catKaden = app.apply((d, ctx) => createCategory(d, { name: '家電' }, ctx))!.created[0]!;

    const tagBousai = app.apply((d, ctx) => createTag(d, { name: '防災' }, ctx))!.created[0]!;
    const tagDaily = app.apply((d, ctx) => createTag(d, { name: '日用品' }, ctx))!.created[0]!;

    // 1. 全条件を満たすアイテム
    const targetItem = app.apply((d, ctx) =>
      addItem(d, { name: '非常用デンチ', place: roomA, category: catKomono, tags: [tagBousai] }, ctx),
    )!.created[0]!;

    // 2. カテゴリだけ違うアイテム
    app.apply((d, ctx) =>
      addItem(d, { name: '非常用デンチ', place: roomA, category: catKaden, tags: [tagBousai] }, ctx),
    );

    // 3. タグだけ違うアイテム
    app.apply((d, ctx) =>
      addItem(d, { name: '非常用デンチ', place: roomA, category: catKomono, tags: [tagDaily] }, ctx),
    );

    // 4. 置き場だけ違うアイテム
    app.apply((d, ctx) =>
      addItem(d, { name: '非常用デンチ', place: roomB, category: catKomono, tags: [tagBousai] }, ctx),
    );

    // すべての条件を「かつ」で検索
    const results = searchItems(app.state.doc!, {
      text: 'デンチ',
      category: catKomono,
      tags: { ids: [tagBousai], mode: 'all' },
      place: roomA,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(targetItem);

    expectHealthy(app, file);
  });

  it('Q2: 置き場は中の収納の中まで', async () => {
    // createSampleDocument: Room A に棚A1（収納）、棚A1の段1にBOX1（収納）、BOX1の中に単3電池
    const doc = createSampleDocument();
    const { app, file } = makeApp({ file: new MemoryFile('q2.json', serializeDocument(doc)) });
    await app.openFile();

    // 別の置き場（Room B）に別のアイテムを追加
    const roomB = app.apply((d, ctx) => createKuukan(d, { name: 'Room B' }, ctx))!.created[0]!;
    app.apply((d, ctx) => addItem(d, { name: '無関係なモノ', place: roomB }, ctx));

    // Room A で探すと、棚自身、中のBOX1、およびBOX1の中の単3電池が含まれる
    const resultsInRoomA = searchItems(app.state.doc!, { place: FIXTURE_IDS.roomA });
    const resultIds = resultsInRoomA.map((i) => i.id);

    expect(resultIds).toContain(FIXTURE_IDS.shelf);
    expect(resultIds).toContain(FIXTURE_IDS.box1);
    expect(resultIds).toContain(FIXTURE_IDS.battery);
    expect(resultsInRoomA.some(i => i.name === '無関係なモノ')).toBe(false);

    // 文字列検索と組み合わせても中の収納の電池がヒットする
    const foundBattery = searchItems(app.state.doc!, { place: FIXTURE_IDS.roomA, text: '電池' });
    expect(foundBattery).toHaveLength(1);
    expect(foundBattery[0]?.id).toBe(FIXTURE_IDS.battery);

    expectHealthy(app, file);
  });

  it('Q3: カテゴリは子孫を含む', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    const parentCat = app.apply((d, ctx) => createCategory(d, { name: '道具' }, ctx))!.created[0]!;
    const childCat = app.apply((d, ctx) => createCategory(d, { name: '工具', parent: parentCat }, ctx))!.created[0]!;
    const grandchildCat = app.apply((d, ctx) => createCategory(d, { name: '切削', parent: childCat }, ctx))!.created[0]!;
    const otherCat = app.apply((d, ctx) => createCategory(d, { name: '食品' }, ctx))!.created[0]!;

    const it1 = app.apply((d, ctx) => addItem(d, { name: '道具モノ', category: parentCat }, ctx))!.created[0]!;
    const it2 = app.apply((d, ctx) => addItem(d, { name: '工具モノ', category: childCat }, ctx))!.created[0]!;
    const it3 = app.apply((d, ctx) => addItem(d, { name: '切削モノ', category: grandchildCat }, ctx))!.created[0]!;
    app.apply((d, ctx) => addItem(d, { name: '食品モノ', category: otherCat }, ctx));

    const results = searchItems(app.state.doc!, { category: parentCat });
    const resultIds = results.map((i) => i.id);

    expect(resultIds).toContain(it1);
    expect(resultIds).toContain(it2);
    expect(resultIds).toContain(it3);
    expect(results).toHaveLength(3);

    expectHealthy(app, file);
  });

  it('Q4: 全角半角、ひらがなカタカナを同じに扱う', async () => {
    const { app, file } = makeApp();
    await app.newDocument();

    const batteryId = app.apply((d, ctx) => addItem(d, { name: 'デンチ' }, ctx))!.created[0]!;

    // 半角カタカナ
    const rHalf = searchItems(app.state.doc!, { text: 'ﾃﾞﾝﾁ' });
    expect(rHalf.map((i) => i.id)).toContain(batteryId);

    // ひらがな
    const rHira = searchItems(app.state.doc!, { text: 'でんち' });
    expect(rHira.map((i) => i.id)).toContain(batteryId);

    // 全角カタカナ
    const rKata = searchItems(app.state.doc!, { text: 'デンチ' });
    expect(rKata.map((i) => i.id)).toContain(batteryId);

    // 英大文字・小文字・全角英字
    const englishId = app.apply((d, ctx) => addItem(d, { name: 'Battery' }, ctx))!.created[0]!;
    expect(searchItems(app.state.doc!, { text: 'battery' }).map((i) => i.id)).toContain(englishId);
    expect(searchItems(app.state.doc!, { text: 'ＢＡＴＴＥＲＹ' }).map((i) => i.id)).toContain(englishId);

    expectHealthy(app, file);
  });

  it('Q5: 文書が変わったら結果も変わる', async () => {
    const { app, file, clock } = makeApp();
    await app.newDocument();

    const roomA = app.apply((d, ctx) => createKuukan(d, { name: 'Room A' }, ctx))!.created[0]!;
    const roomB = app.apply((d, ctx) => createKuukan(d, { name: 'Room B' }, ctx))!.created[0]!;
    const item = app.apply((d, ctx) => addItem(d, { name: '移動モノ', place: roomA }, ctx))!.created[0]!;

    // 移動前: Room A の結果に含まれる
    const resultsBefore = searchItems(app.state.doc!, { place: roomA });
    expect(resultsBefore.map((i) => i.id)).toContain(item);

    // Room B へ移動
    app.apply((d, ctx) => moveItems(d, [item], roomB, ctx));

    // 移動後: Room A の結果から外れ、Room B の結果に入る
    const resultsAfterA = searchItems(app.state.doc!, { place: roomA });
    expect(resultsAfterA.map((i) => i.id)).not.toContain(item);

    const resultsAfterB = searchItems(app.state.doc!, { place: roomB });
    expect(resultsAfterB.map((i) => i.id)).toContain(item);

    await clock.advance(1000);
    expectHealthy(app, file);
  });
});
