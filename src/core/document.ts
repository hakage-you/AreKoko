// 新しい文書を作る。詳細設計 2.4、付録A.14。

import type { ArekokoDocument } from './types';
import {
  APP,
  SCHEMA_VERSION,
  NIL_ID,
  UNSET_NAME,
  DEFAULT_AREA_LABEL,
} from './constants';

/** 未設定のクウカンだけを持つ、空の文書を作る。 */
export function createEmptyDocument(): ArekokoDocument {
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
      ],
      areas: [],
      items: [],
      categories: [],
      tags: [],
    },
    drawing: {
      kuukans: [],
      partitions: [],
      markers: [],
      items: [],
    },
  };
}
