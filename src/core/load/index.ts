import type { Id, EntityKind, ArekokoDocument } from '../types';
import { APP, SCHEMA_VERSION, DEFAULT_AREA_LABEL } from '../constants';
import { checkSchema } from '../schema';
import { NoticeManager } from './notices';
import { normalizeIds } from './ids';
import { repairMembership } from './membership';
import { checkCycles } from './cycles';
import { repairDrawing } from './drawing';
import { validateDocument } from '../validate';

export interface LoadContext {
  newId(): Id;
  now(): string;
}

export type RepairCode =
  | 'tempId'
  | 'reservedId'
  | 'duplicateId'
  | 'missingUnset'
  | 'placeMissing'
  | 'categoryMissing'
  | 'tagMissing'
  | 'tagDuplicate'
  | 'categoryParentMissing'
  | 'ownerMissing'
  | 'ownerShared'
  | 'unsetHasOwner'
  | 'areaKuukanMissing'
  | 'areaParentMissing'
  | 'unsetHasAreas'
  | 'unsetHasDrawing'
  | 'kuukanDrawingInvalid'
  | 'partitionMismatch'
  | 'markerInvalid'
  | 'itemDrawingInvalid'
  | 'drawingDropped';

export type RefusalCode =
  | 'notJson'
  | 'notArekoko'
  | 'newerVersion'
  | 'schema'
  | 'cycleCategory'
  | 'cycleArea'
  | 'cycleNesting';

export interface RepairEntry {
  code: RepairCode;
  message: string;
  target?: { kind: EntityKind; id: Id };
}

export interface Refusal {
  code: RefusalCode;
  message: string;
  path?: string;
}

export type LoadResult =
  | { kind: 'ok'; doc: ArekokoDocument }
  | { kind: 'repair'; doc: ArekokoDocument; repairs: RepairEntry[] }
  | { kind: 'refused'; reasons: Refusal[] };

export function analyzeDocument(input: string | unknown, ctx: LoadContext): LoadResult {
  // 1. JSON として読む
  let raw: unknown;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return {
        kind: 'refused',
        reasons: [{ code: 'notJson', message: 'JSON として読み込めません' }],
      };
    }
  } else {
    raw = input;
  }

  let doc: any;
  try {
    doc = structuredClone(raw);
  } catch {
    return {
      kind: 'refused',
      reasons: [{ code: 'notJson', message: 'JSON として読み込めません' }],
    };
  }

  // 2. 全体の確認
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      kind: 'refused',
      reasons: [{ code: 'notArekoko', message: 'アレココの文書ではありません' }],
    };
  }
  if (doc.app !== APP) {
    return {
      kind: 'refused',
      reasons: [{ code: 'notArekoko', message: 'アレココの文書ではありません' }],
    };
  }
  if (typeof doc.schemaVersion !== 'number' || !Number.isInteger(doc.schemaVersion)) {
    return {
      kind: 'refused',
      reasons: [{ code: 'schema', message: 'schemaVersion が整数ではありません', path: '/schemaVersion' }],
    };
  }
  if (doc.schemaVersion > SCHEMA_VERSION) {
    return {
      kind: 'refused',
      reasons: [{ code: 'newerVersion', message: '新しいバージョンのアレココで作成された文書です' }],
    };
  }
  if (doc.schemaVersion < 1) {
    return {
      kind: 'refused',
      reasons: [{ code: 'schema', message: 'schemaVersion は 1 以上である必要があります', path: '/schemaVersion' }],
    };
  }

  // 3. schema.json で検査する
  const schemaCheck = checkSchema(doc);
  if (schemaCheck.fatal.length > 0) {
    return {
      kind: 'refused',
      reasons: schemaCheck.fatal.map(f => ({
        code: 'schema',
        message: f.message,
        path: f.path,
      })),
    };
  }

  // 4. 既定値を補う（2.2）
  doc.membership = doc.membership ?? {};
  doc.membership.kuukans = doc.membership.kuukans ?? [];
  doc.membership.areas = doc.membership.areas ?? [];
  doc.membership.items = doc.membership.items ?? [];
  doc.membership.categories = doc.membership.categories ?? [];
  doc.membership.tags = doc.membership.tags ?? [];

  if (schemaCheck.dropDrawing) {
    doc.drawing = { kuukans: [], partitions: [], markers: [], items: [] };
  } else {
    doc.drawing = doc.drawing ?? {};
    if (schemaCheck.dropCollections.has('kuukans')) {
      doc.drawing.kuukans = [];
    } else {
      doc.drawing.kuukans = doc.drawing.kuukans ?? [];
    }
    if (schemaCheck.dropCollections.has('partitions')) {
      doc.drawing.partitions = [];
    } else {
      doc.drawing.partitions = doc.drawing.partitions ?? [];
    }
    if (schemaCheck.dropCollections.has('markers')) {
      doc.drawing.markers = [];
    } else {
      doc.drawing.markers = doc.drawing.markers ?? [];
    }
    if (schemaCheck.dropCollections.has('items')) {
      doc.drawing.items = [];
    } else {
      doc.drawing.items = doc.drawing.items ?? [];
    }
  }

  for (const k of doc.membership.kuukans) {
    k.owner = k.owner ?? null;
    k.areaLabel = k.areaLabel ?? DEFAULT_AREA_LABEL;
  }
  for (const a of doc.membership.areas) {
    a.parent = a.parent ?? null;
    a.order = a.order ?? 0;
  }
  for (const it of doc.membership.items) {
    it.category = it.category ?? null;
    it.tags = it.tags ?? [];
  }
  for (const c of doc.membership.categories) {
    c.parent = c.parent ?? null;
  }
  for (const m of doc.drawing.markers) {
    m.name = m.name ?? '';
    m.rotation = m.rotation ?? 0;
    m.notAPlace = m.notAPlace ?? false;
  }
  for (const di of doc.drawing.items) {
    di.rotation = di.rotation ?? 0;
  }

  const repairs: RepairEntry[] = [];
  const notices = new NoticeManager(ctx.now());

  // 5. IDを整える（4.3）
  // 形式違反で外れるマーカーは、IDの付け替えや重複の判定に入れない（4.5 の 1. で外す）。
  const droppedMarkers = schemaCheck.dropElements.get('markers') ?? new Set<number>();
  const markersForIds = (doc.drawing.markers as unknown[]).filter((_, i) => !droppedMarkers.has(i));
  const resolver = normalizeIds(doc.membership, markersForIds as ArekokoDocument['drawing']['markers'], ctx, notices, repairs);

  // 6. 所属の層の参照を直す（4.4）
  repairMembership(doc.membership, resolver, notices, repairs);

  // 7. 輪を調べる（4.6）
  const cycleRefusal = checkCycles(doc.membership);
  if (cycleRefusal) {
    return {
      kind: 'refused',
      reasons: [cycleRefusal],
    };
  }

  // 8. 描画の層を検査して、問題のある描画を外す（4.5）
  repairDrawing(doc.drawing, doc.membership, schemaCheck, resolver, notices, repairs);

  // 9. 修復メモを付ける（4.7） -> NoticeManager 経由で付加済み

  // 10. 最終の検査
  const violations = validateDocument(doc as ArekokoDocument);
  if (violations.length > 0) {
    throw new Error(`validateDocument failed: ${JSON.stringify(violations)}`);
  }

  // 11. 結果の返却
  if (repairs.length === 0) {
    return { kind: 'ok', doc: doc as ArekokoDocument };
  } else {
    return { kind: 'repair', doc: doc as ArekokoDocument, repairs };
  }
}
