import { describe, expect, it } from 'vitest';
import { NIL_ID } from '../../src/core/constants';
import type { ArekokoDocument } from '../../src/core/types';
import { isEmptyQuery, searchItems, suggest, type SearchQuery } from '../../src/search/search';
import { createBaseDoc } from '../helpers/ctx';

function createSearchTestDoc(): {
  doc: ArekokoDocument;
  ids: {
    living: string;
    kitchen: string;
    shelf: string;
    shelfKuukan: string;
    dan1: string;
    dan1Left: string;
    dan2: string;
    box: string;
    boxKuukan: string;
    radio: string;
    battery: string;
    flashlight: string;
    notebook: string;
    scissors: string;
    catAppliance: string;
    catAudio: string;
    catBattery: string;
    catDaily: string;
    catStationery: string;
    tagEmergency: string;
    tagSmall: string;
    tagHeavy: string;
    tagFrequent: string;
  };
} {
  const ids = {
    living: '01920000-0000-7000-8000-000000000001',
    kitchen: '01920000-0000-7000-8000-000000000002',
    shelf: '01920000-0000-7000-8000-000000000010',
    shelfKuukan: '01920000-0000-7000-8000-000000000011',
    dan1: '01920000-0000-7000-8000-000000000020',
    dan1Left: '01920000-0000-7000-8000-000000000021',
    dan2: '01920000-0000-7000-8000-000000000022',
    box: '01920000-0000-7000-8000-000000000030',
    boxKuukan: '01920000-0000-7000-8000-000000000031',
    radio: '01920000-0000-7000-8000-000000000040',
    battery: '01920000-0000-7000-8000-000000000041',
    flashlight: '01920000-0000-7000-8000-000000000042',
    notebook: '01920000-0000-7000-8000-000000000043',
    scissors: '01920000-0000-7000-8000-000000000044',
    catAppliance: '01920000-0000-7000-8000-000000000050',
    catAudio: '01920000-0000-7000-8000-000000000051',
    catBattery: '01920000-0000-7000-8000-000000000052',
    catDaily: '01920000-0000-7000-8000-000000000053',
    catStationery: '01920000-0000-7000-8000-000000000054',
    tagEmergency: '01920000-0000-7000-8000-000000000060',
    tagSmall: '01920000-0000-7000-8000-000000000061',
    tagHeavy: '01920000-0000-7000-8000-000000000062',
    tagFrequent: '01920000-0000-7000-8000-000000000063',
  };

  const base = createBaseDoc();
  const doc: ArekokoDocument = {
    ...base,
    membership: {
      kuukans: [
        base.membership.kuukans[0]!,
        { id: ids.living, name: 'リビング', owner: null, areaLabel: 'エリア' },
        { id: ids.kitchen, name: 'キッチン', owner: null, areaLabel: 'エリア' },
        { id: ids.shelfKuukan, owner: ids.shelf, areaLabel: '段' },
        { id: ids.boxKuukan, owner: ids.box, areaLabel: 'エリア' },
      ],
      areas: [
        { id: ids.dan1, kuukan: ids.shelfKuukan, parent: null, name: '段1', order: 0 },
        { id: ids.dan1Left, kuukan: ids.shelfKuukan, parent: ids.dan1, name: '段1左', order: 0 },
        { id: ids.dan2, kuukan: ids.shelfKuukan, parent: null, name: '段2', order: 1 },
      ],
      categories: [
        { id: ids.catAppliance, name: '家電', parent: null },
        { id: ids.catAudio, name: 'オーディオ', parent: ids.catAppliance },
        { id: ids.catBattery, name: '電池', parent: ids.catAppliance },
        { id: ids.catDaily, name: '日用品', parent: null },
        { id: ids.catStationery, name: '文房具', parent: ids.catDaily },
      ],
      tags: [
        { id: ids.tagEmergency, name: '防災' },
        { id: ids.tagSmall, name: '小型' },
        { id: ids.tagHeavy, name: '重量物' },
        { id: ids.tagFrequent, name: '常用' },
      ],
      items: [
        {
          id: ids.shelf,
          name: '棚A',
          place: ids.living,
          category: null,
          tags: [ids.tagHeavy],
          summary: '木製の3段棚',
        },
        {
          id: ids.box,
          name: '箱B',
          place: ids.dan1Left,
          category: ids.catDaily,
          tags: [ids.tagSmall],
          summary: 'プラスチック製ボックス',
        },
        {
          id: ids.radio,
          name: 'ポータブルラジオ',
          place: ids.dan1Left,
          category: ids.catAudio,
          tags: [ids.tagEmergency, ids.tagSmall],
          summary: 'AM/FM対応 防災用',
        },
        {
          id: ids.battery,
          name: 'デンチ単3',
          place: ids.boxKuukan,
          category: ids.catBattery,
          tags: [ids.tagEmergency, ids.tagSmall, ids.tagFrequent],
          summary: '備蓄用 12本パック',
        },
        {
          id: ids.flashlight,
          name: 'カイチュウ電灯',
          place: ids.dan2,
          category: ids.catAppliance,
          tags: [ids.tagEmergency],
          summary: 'LED 単3デンチ式',
        },
        {
          id: ids.notebook,
          name: 'ノートA5',
          place: ids.living,
          category: ids.catStationery,
          tags: [ids.tagFrequent],
          summary: '方眼罫 80枚',
        },
        {
          id: ids.scissors,
          name: 'ハサミ',
          place: NIL_ID,
          category: null,
          tags: [ids.tagFrequent],
          summary: 'ステンレス製',
        },
      ],
    },
  };

  return { doc, ids };
}

describe('isEmptyQuery', () => {
  it('空オブジェクトは空クエリと判定される', () => {
    expect(isEmptyQuery({})).toBe(true);
  });

  it('text 条件の判定', () => {
    expect(isEmptyQuery({ text: '' })).toBe(true);
    expect(isEmptyQuery({ text: '   ' })).toBe(true);
    expect(isEmptyQuery({ text: '　\t　' })).toBe(true);
    expect(isEmptyQuery({ text: '電池' })).toBe(false);
  });

  it('category 条件の判定（null は未分類の指定なので空ではない）', () => {
    expect(isEmptyQuery({ category: undefined })).toBe(true);
    expect(isEmptyQuery({ category: null })).toBe(false);
    expect(isEmptyQuery({ category: 'some-id' })).toBe(false);
  });

  it('tags 条件の判定（ids が空なら空クエリ）', () => {
    expect(isEmptyQuery({ tags: undefined })).toBe(true);
    expect(isEmptyQuery({ tags: { ids: [], mode: 'all' } })).toBe(true);
    expect(isEmptyQuery({ tags: { ids: ['tag-1'], mode: 'all' } })).toBe(false);
  });

  it('place 条件の判定', () => {
    expect(isEmptyQuery({ place: undefined })).toBe(true);
    expect(isEmptyQuery({ place: 'place-id' })).toBe(false);
  });

  it('unsetOnly と storageOnly の判定', () => {
    expect(isEmptyQuery({ unsetOnly: false })).toBe(true);
    expect(isEmptyQuery({ unsetOnly: true })).toBe(false);
    expect(isEmptyQuery({ storageOnly: false })).toBe(true);
    expect(isEmptyQuery({ storageOnly: true })).toBe(false);
  });
});

describe('searchItems', () => {
  it('条件なしで全件が doc.membership.items の順序で返る', () => {
    const { doc } = createSearchTestDoc();
    const results = searchItems(doc, {});
    expect(results.map(it => it.id)).toEqual(doc.membership.items.map(it => it.id));
  });

  describe('文字検索（text）', () => {
    it('名前に一致するモノを検索できる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { text: 'ポータブル' });
      expect(results.map(r => r.id)).toEqual([ids.radio]);
    });

    it('概要に一致するモノを検索できる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { text: '備蓄' });
      expect(results.map(r => r.id)).toEqual([ids.battery]);
    });

    it('空白区切りの複数語はすべて含む（かつ）条件になる', () => {
      const { doc, ids } = createSearchTestDoc();
      const match = searchItems(doc, { text: 'ラジオ 防災' });
      expect(match.map(r => r.id)).toEqual([ids.radio]);

      const noMatch = searchItems(doc, { text: 'ラジオ ノート' });
      expect(noMatch).toEqual([]);
    });

    it('ひらがなで入力してカタカナの名前に当たる', () => {
      const { doc, ids } = createSearchTestDoc();
      const batteryResults = searchItems(doc, { text: 'でんち' });
      expect(batteryResults.map(r => r.id)).toEqual([ids.battery, ids.flashlight]);

      const flashlightResults = searchItems(doc, { text: 'かいちゅう' });
      expect(flashlightResults.map(r => r.id)).toEqual([ids.flashlight]);

      const scissorsResults = searchItems(doc, { text: 'はさみ' });
      expect(scissorsResults.map(r => r.id)).toEqual([ids.scissors]);
    });

    it('全角英数・大文字小文字の違いを吸収して一致する', () => {
      const { doc, ids } = createSearchTestDoc();
      const notebookResults = searchItems(doc, { text: 'ａ５' });
      expect(notebookResults.map(r => r.id)).toEqual([ids.notebook]);

      const ledResults = searchItems(doc, { text: 'led' });
      expect(ledResults.map(r => r.id)).toEqual([ids.flashlight]);
    });

    it('全角空白や余分な空白を含んでいても正しく検索できる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { text: '　デンチ　　備蓄　' });
      expect(results.map(r => r.id)).toEqual([ids.battery]);
    });

    it('名前の語と概要欄の語を組み合わせた複数語（AND）検索ができる', () => {
      const { doc, ids } = createSearchTestDoc();
      // 名前「デンチ単3」 + 概要「備蓄用 12本パック」
      const results = searchItems(doc, { text: 'デンチ 備蓄' });
      expect(results.map(r => r.id)).toEqual([ids.battery]);
    });

    it('概要欄に含まれるカタカナをひらがなで検索できる', () => {
      const { doc, ids } = createSearchTestDoc();
      // 懐中電灯の概要: 'LED 単3デンチ式'（デンチ -> でんち）
      // batteryの名前「デンチ単3」とflashlightの概要「LED 単3デンチ式」の両方にヒットする
      const results = searchItems(doc, { text: 'でんち' });
      expect(results.map(r => r.id)).toEqual([ids.battery, ids.flashlight]);
    });
  });

  describe('カテゴリ検索（category）', () => {
    it('親カテゴリを指定すると子孫カテゴリのモノも含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { category: ids.catAppliance });
      expect(results.map(r => r.id)).toEqual([ids.radio, ids.battery, ids.flashlight]);
    });

    it('末端カテゴリを指定するとそのカテゴリのモノだけが含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { category: ids.catAudio });
      expect(results.map(r => r.id)).toEqual([ids.radio]);
    });

    it('null を明示したときは未分類のモノだけが含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { category: null });
      expect(results.map(r => r.id)).toEqual([ids.shelf, ids.scissors]);
    });
  });

  describe('タグ検索（tags）', () => {
    it('mode: all は指定されたすべてのタグを持つモノだけが含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, {
        tags: { ids: [ids.tagEmergency, ids.tagSmall], mode: 'all' },
      });
      expect(results.map(r => r.id)).toEqual([ids.radio, ids.battery]);
    });

    it('mode: any は指定されたいずれかのタグを持つモノが含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, {
        tags: { ids: [ids.tagHeavy, ids.tagSmall], mode: 'any' },
      });
      expect(results.map(r => r.id)).toEqual([ids.shelf, ids.box, ids.radio, ids.battery]);
    });

    it('ids が空配列のときはタグ条件なしとして扱われる', () => {
      const { doc } = createSearchTestDoc();
      const results = searchItems(doc, { tags: { ids: [], mode: 'all' } });
      expect(results.length).toBe(doc.membership.items.length);
    });
  });

  describe('置き場検索（place）', () => {
    it('置き場を指定すると中の収納の中まで含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { place: ids.living });
      expect(results.map(r => r.id)).toEqual([
        ids.shelf,
        ids.box,
        ids.radio,
        ids.battery,
        ids.flashlight,
        ids.notebook,
      ]);
    });

    it('特定のエリアを指定するとその子孫エリアと収納の中身が含まれる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { place: ids.dan1 });
      expect(results.map(r => r.id)).toEqual([ids.box, ids.radio, ids.battery]);
    });

    it('収納のクウカンを直接指定できる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { place: ids.boxKuukan });
      expect(results.map(r => r.id)).toEqual([ids.battery]);
    });
  });

  describe('未設定・収納限定', () => {
    it('unsetOnly: true は place が未設定（NIL_ID）のモノだけを返す', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { unsetOnly: true });
      expect(results.map(r => r.id)).toEqual([ids.scissors]);
    });

    it('storageOnly: true はクウカンを持つ収納のモノだけを返す', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, { storageOnly: true });
      expect(results.map(r => r.id)).toEqual([ids.shelf, ids.box]);
    });
  });

  describe('条件の組み合わせと並び順', () => {
    it('複数の条件を「かつ」で組み合わせて絞り込める', () => {
      const { doc, ids } = createSearchTestDoc();
      const query: SearchQuery = {
        place: ids.living,
        category: ids.catAppliance,
        tags: { ids: [ids.tagEmergency], mode: 'all' },
        text: '備蓄',
      };
      const results = searchItems(doc, query);
      expect(results.map(r => r.id)).toEqual([ids.battery]);
    });

    it('両立しない条件を組み合わせると0件になる', () => {
      const { doc, ids } = createSearchTestDoc();
      const results = searchItems(doc, {
        place: ids.living,
        unsetOnly: true,
      });
      expect(results).toEqual([]);
    });

    it('絞り込み結果の並び順は常に doc.membership.items の出現順になる', () => {
      const { doc } = createSearchTestDoc();
      const results = searchItems(doc, {
        tags: {
          ids: [
            doc.membership.tags[0]!.id,
            doc.membership.tags[1]!.id,
            doc.membership.tags[3]!.id,
          ],
          mode: 'any',
        },
      });
      const expectedItemIds = doc.membership.items
        .filter(it => results.some(r => r.id === it.id))
        .map(it => it.id);
      expect(results.map(r => r.id)).toEqual(expectedItemIds);
    });
  });
});

describe('suggest', () => {
  it('入力文字に名前が当てはまるタグとカテゴリを返す', () => {
    const { doc, ids } = createSearchTestDoc();
    const result1 = suggest(doc, '防災');
    expect(result1.tags.map(t => t.id)).toEqual([ids.tagEmergency]);
    expect(result1.categories).toEqual([]);

    const result2 = suggest(doc, '家電');
    expect(result2.tags).toEqual([]);
    expect(result2.categories.map(c => c.id)).toEqual([ids.catAppliance]);

    const result3 = suggest(doc, '電池');
    expect(result3.tags).toEqual([]);
    expect(result3.categories.map(c => c.id)).toEqual([ids.catBattery]);

    const result4 = suggest(doc, '用品');
    expect(result4.categories.map(c => c.id)).toEqual([ids.catDaily]);
  });

  it('名前の短い順、同じなら元の順で並ぶ', () => {
    const base = createBaseDoc();
    const doc: ArekokoDocument = {
      ...base,
      membership: {
        ...base.membership,
        tags: [
          { id: 't1', name: '単3乾電池パック' }, // 長さ 8
          { id: 't2', name: '乾電池' },         // 長さ 3
          { id: 't3', name: '電池' },           // 長さ 2
          { id: 't4', name: '蓄電池' },         // 長さ 3 (同じ長さ)
        ],
      },
    };

    const res = suggest(doc, '電池');
    expect(res.tags.map(t => t.name)).toEqual([
      '電池',
      '乾電池',
      '蓄電池',
      '単3乾電池パック',
    ]);
  });

  it('最大10件までに制限される', () => {
    const base = createBaseDoc();
    const tags = Array.from({ length: 15 }, (_, i) => ({
      id: `t-${i}`,
      name: `テスト用タグ${i.toString().padStart(2, '0')}`,
    }));
    const doc: ArekokoDocument = {
      ...base,
      membership: {
        ...base.membership,
        tags,
      },
    };

    const res = suggest(doc, 'てすと');
    expect(res.tags.length).toBe(10);
    expect(res.tags.map(t => t.id)).toEqual(tags.slice(0, 10).map(t => t.id));
  });

  it('空文字や空白のみの入力では空の結果を返す', () => {
    const { doc } = createSearchTestDoc();
    expect(suggest(doc, '')).toEqual({ tags: [], categories: [] });
    expect(suggest(doc, '   ')).toEqual({ tags: [], categories: [] });
    expect(suggest(doc, '　')).toEqual({ tags: [], categories: [] });
    expect(suggest(doc, '該当なしの文字列')).toEqual({ tags: [], categories: [] });
  });
});
