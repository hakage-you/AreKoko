// テスト用の補助。決定的な OpContext と deepFreeze。

import type { ArekokoDocument } from '../../src/core/types';
import { APP, SCHEMA_VERSION, NIL_ID, UNSET_NAME, DEFAULT_AREA_LABEL } from '../../src/core/constants';
import type { OpContext } from '../../src/core/ops/common';

export function createTestContext(opts?: { now?: string; startCount?: number }): OpContext {
  let counter = opts?.startCount ?? 1;
  const fixedNow = opts?.now ?? '2026-10-08T12:00:00.000Z';

  return {
    now: () => fixedNow,
    newId: () => {
      const hex = (counter++).toString(16).padStart(12, '0');
      return `01920000-0000-7000-8000-${hex}`;
    },
  };
}

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export function createBaseDoc(): ArekokoDocument {
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
