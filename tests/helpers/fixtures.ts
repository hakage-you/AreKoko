// テスト用のフィクスチャとID生成補助。

import { APP, DEFAULT_AREA_LABEL, NIL_ID, SCHEMA_VERSION, UNSET_NAME } from '../../src/core/constants';
import type { ArekokoDocument, Id } from '../../src/core/types';

/**
 * 決定的な UUID v7 形式の文字列を生成する。
 */
export function makeDeterministicId(index: number): Id {
  const hex = index.toString(16).padStart(12, '0');
  return `018f0000-0000-7000-8000-${hex}`;
}

export const FIXTURE_IDS = {
  roomA: makeDeterministicId(1),
  shelf: makeDeterministicId(2),
  shelfKuukan: makeDeterministicId(3),
  dan1: makeDeterministicId(4),
  dan2: makeDeterministicId(5),
  box1: makeDeterministicId(6),
  box1Kuukan: makeDeterministicId(7),
  battery: makeDeterministicId(8),
  categorySmallItems: makeDeterministicId(9),
  tagEmergency: makeDeterministicId(10),
} as const;

/**
 * 「Room A（描画なし）の中に棚A1（収納、エリア 段1・段2）、段1 の中に BOX1（収納）、BOX1 の中に単3電池」
 * を構成する標準的なテスト文書を作成する。
 */
export function createSampleDocument(): ArekokoDocument {
  return {
    app: APP,
    schemaVersion: SCHEMA_VERSION,
    membership: {
      kuukans: [
        {
          id: NIL_ID,
          name: UNSET_NAME,
          owner: null,
          areaLabel: DEFAULT_AREA_LABEL,
        },
        {
          id: FIXTURE_IDS.roomA,
          name: 'Room A',
          owner: null,
          areaLabel: DEFAULT_AREA_LABEL,
        },
        {
          id: FIXTURE_IDS.shelfKuukan,
          owner: FIXTURE_IDS.shelf,
          areaLabel: '段',
        },
        {
          id: FIXTURE_IDS.box1Kuukan,
          owner: FIXTURE_IDS.box1,
          areaLabel: DEFAULT_AREA_LABEL,
        },
      ],
      areas: [
        {
          id: FIXTURE_IDS.dan1,
          kuukan: FIXTURE_IDS.shelfKuukan,
          parent: null,
          name: '段1',
          order: 0,
        },
        {
          id: FIXTURE_IDS.dan2,
          kuukan: FIXTURE_IDS.shelfKuukan,
          parent: null,
          name: '段2',
          order: 1,
        },
      ],
      items: [
        {
          id: FIXTURE_IDS.shelf,
          name: '棚A1',
          place: FIXTURE_IDS.roomA,
          category: null,
          tags: [],
        },
        {
          id: FIXTURE_IDS.box1,
          name: 'BOX1',
          place: FIXTURE_IDS.dan1,
          category: null,
          tags: [],
        },
        {
          id: FIXTURE_IDS.battery,
          name: '単3電池',
          place: FIXTURE_IDS.box1Kuukan,
          category: FIXTURE_IDS.categorySmallItems,
          tags: [FIXTURE_IDS.tagEmergency],
        },
      ],
      categories: [
        {
          id: FIXTURE_IDS.categorySmallItems,
          name: '小物',
          parent: null,
        },
      ],
      tags: [
        {
          id: FIXTURE_IDS.tagEmergency,
          name: '防災',
        },
      ],
    },
    drawing: {
      kuukans: [],
      partitions: [],
      markers: [],
      items: [],
    },
  };
}
