import type { ArekokoDocument, Id, KuukanDrawing, Point } from '../core/types';
import { COORD_MAX, DEFAULT_AREA_LABEL, NIL_ID, UNSET_NAME } from '../core/constants';
import { OpError, type OpContext } from '../core/ops/common';
import { displayName, kuukanOfPlace } from '../core/places';
import { validateDocument, type Violation } from '../core/validate';
import { reframeDraft } from './outline';
import { buildTemplate } from './templates';

export type TemplateId = 'room6' | 'livingL' | 'shelf3' | 'oshiire' | 'chest4';

export type DraftOrigin =
  | { kind: 'new' }
  | { kind: 'template'; template: TemplateId }
  | { kind: 'duplicate'; source: Id }
  | { kind: 'storage'; item: Id }
  /** 図のないクウカンに図を描く（レビュー1 R-A1）。確定は元と置き換えるだけ。 */
  | { kind: 'redraw'; source: Id };

export interface Draft {
  origin: DraftOrigin;
  kuukan: Id;
  doc: ArekokoDocument;
}

/**
 * 新しいクウカンの下書きを作成する。
 * 外形は [0,0]-[10000,10000] の長方形、aspect 4/3。
 */
export function newDraft(input: { name: string; areaLabel?: string }, ctx: OpContext): Draft {
  const kuukanId = ctx.newId();
  const doc: ArekokoDocument = {
    app: 'arekoko',
    schemaVersion: 1,
    membership: {
      kuukans: [
        {
          id: NIL_ID,
          name: UNSET_NAME,
          owner: null,
          areaLabel: DEFAULT_AREA_LABEL,
        },
        {
          id: kuukanId,
          name: input.name,
          owner: null,
          areaLabel: input.areaLabel ?? DEFAULT_AREA_LABEL,
        },
      ],
      areas: [],
      items: [],
      categories: [],
      tags: [],
    },
    drawing: {
      kuukans: [
        {
          kuukan: kuukanId,
          outline: [
            [0, 0],
            [COORD_MAX, 0],
            [COORD_MAX, COORD_MAX],
            [0, COORD_MAX],
          ],
          aspect: 4 / 3,
        },
      ],
      partitions: [],
      markers: [],
      items: [],
    },
  };

  return {
    origin: { kind: 'new' },
    kuukan: kuukanId,
    doc,
  };
}

/**
 * 組み込みテンプレートから下書きを作成する。
 */
export function templateDraft(template: TemplateId, ctx: OpContext): Draft {
  return buildTemplate(template, ctx);
}

/**
 * 既存のクウカンを複製した下書きを作成する。IDはそのまま維持する。
 */
export function duplicateDraft(doc: ArekokoDocument, source: Id, _ctx: OpContext): Draft {
  const sourceKuukan = doc.membership.kuukans.find(k => k.id === source);
  if (!sourceKuukan) {
    throw new Error(`クウカンが見つかりません: ${source}`);
  }

  const unsetKuukan = doc.membership.kuukans.find(k => k.id === NIL_ID) ?? {
    id: NIL_ID,
    name: UNSET_NAME,
    owner: null,
    areaLabel: DEFAULT_AREA_LABEL,
  };

  const name = displayName(doc, source);
  const draftKuukan = {
    id: source,
    name,
    owner: null,
    areaLabel: sourceKuukan.areaLabel,
  };

  const areas = doc.membership.areas
    .filter(a => a.kuukan === source)
    .map(a => ({ ...a }));
  const areaIds = new Set([source, ...areas.map(a => a.id)]);

  const kuukanDrawings = doc.drawing.kuukans
    .filter(k => k.kuukan === source)
    .map(k => ({
      ...k,
      outline: k.outline.map(p => [p[0], p[1]] as Point),
      ...(k.realSize ? { realSize: { ...k.realSize } } : {}),
    }));

  const partitions = doc.drawing.partitions
    .filter(p => areaIds.has(p.area))
    .map(p => ({
      ...p,
      at: [...p.at],
      ...(p.seed ? { seed: [p.seed[0], p.seed[1]] as Point } : {}),
      children: [...p.children],
    }));

  const markers = doc.drawing.markers
    .filter(m => m.kuukan === source)
    .map(m => ({
      ...m,
      shape: m.shape.type === 'point'
        ? { type: 'point' as const, at: [m.shape.at[0], m.shape.at[1]] as Point }
        : m.shape.type === 'rect'
        ? { type: 'rect' as const, x: m.shape.x, y: m.shape.y, w: m.shape.w, h: m.shape.h }
        : { type: 'poly' as const, points: m.shape.points.map(p => [p[0], p[1]] as Point) },
    }));

  const draftDoc: ArekokoDocument = {
    app: 'arekoko',
    schemaVersion: 1,
    membership: {
      kuukans: [{ ...unsetKuukan }, draftKuukan],
      areas,
      items: [],
      categories: [],
      tags: [],
    },
    drawing: {
      kuukans: kuukanDrawings,
      partitions,
      markers,
      items: [],
    },
  };

  return {
    origin: { kind: 'duplicate', source },
    kuukan: source,
    doc: draftDoc,
  };
}

/**
 * 図のないクウカンに図を描くための下書き。元のクウカンを写し（ID はそのまま）、長方形の外形を付ける。
 * 確定は元と置き換えるだけなので、ID・名前・持ち主・中のモノはそのまま、外形と仕切りとマーカーが付く。
 */
export function redrawDraft(doc: ArekokoDocument, source: Id, ctx: OpContext): Draft {
  if (source === NIL_ID) {
    throw new OpError('reserved', '未設定のクウカンには図を描けません');
  }
  if (doc.drawing.kuukans.some(k => k.kuukan === source)) {
    throw new OpError('invalidInput', 'このクウカンにはもう図があります。形を変えるには複製してください');
  }
  const base = duplicateDraft(doc, source, ctx);
  return { ...addDraftOutline(base), origin: { kind: 'redraw', source } };
}

/**
 * モノを収納として設定するための下書きを作成する。
 */
export function storageDraft(doc: ArekokoDocument, item: Id, ctx: OpContext): Draft {
  const targetItem = doc.membership.items.find(i => i.id === item);
  if (!targetItem) {
    throw new Error(`モノが見つかりません: ${item}`);
  }

  const itemDrawing = doc.drawing.items.find(d => d.item === item);
  let aspect = 4 / 3;

  if (itemDrawing && itemDrawing.shape.type === 'rect') {
    const { w, h } = itemDrawing.shape;
    if (w > 0 && h > 0) {
      const parentKuukanId = kuukanOfPlace(doc, targetItem.place);
      const parentKd = doc.drawing.kuukans.find(k => k.kuukan === parentKuukanId);
      if (parentKd && parentKd.aspect > 0) {
        aspect = (w * parentKd.aspect) / h;
      } else {
        aspect = w / h;
      }
    }
  }

  const kuukanId = ctx.newId();
  const draftDoc: ArekokoDocument = {
    app: 'arekoko',
    schemaVersion: 1,
    membership: {
      kuukans: [
        {
          id: NIL_ID,
          name: UNSET_NAME,
          owner: null,
          areaLabel: DEFAULT_AREA_LABEL,
        },
        {
          id: kuukanId,
          owner: item,
          areaLabel: DEFAULT_AREA_LABEL,
        },
      ],
      areas: [],
      items: [],
      categories: [],
      tags: [],
    },
    drawing: {
      kuukans: [
        {
          kuukan: kuukanId,
          outline: [
            [0, 0],
            [COORD_MAX, 0],
            [COORD_MAX, COORD_MAX],
            [0, COORD_MAX],
          ],
          aspect,
        },
      ],
      partitions: [],
      markers: [],
      items: [],
    },
  };

  return {
    origin: { kind: 'storage', item },
    kuukan: kuukanId,
    doc: draftDoc,
  };
}

/**
 * 下書きを検査する。
 * 下書き文書の owner を一時的に null、名前がなければ補ってから validateDocument を呼ぶ。
 */
export function validateDraft(draft: Draft): Violation[] {
  const tempDoc: ArekokoDocument = {
    ...draft.doc,
    membership: {
      ...draft.doc.membership,
      kuukans: draft.doc.membership.kuukans.map(k => {
        if (k.id === draft.kuukan) {
          return {
            ...k,
            owner: null,
            name: k.name ?? '下書き',
          };
        }
        return k;
      }),
    },
  };
  return validateDocument(tempDoc);
}

/**
 * 下書きの外形を変更する。外接長方形を 0〜10000 に付け直し、仕切りと矛盾すれば error。
 */
export function setDraftOutline(draft: Draft, outline: Point[]): Draft | { error: string } {
  const reframed = reframeDraft(draft, outline);
  if ('error' in reframed) {
    return reframed;
  }
  const violations = validateDraft(reframed);
  if (violations.length > 0) {
    return { error: violations[0]!.message };
  }
  return reframed;
}

/**
 * 下書きの外形を外す。エリアやマーカーが存在する場合は error。
 */
export function removeDraftOutline(draft: Draft): Draft | { error: string } {
  const hasAreas = draft.doc.membership.areas.some(a => a.kuukan === draft.kuukan);
  const hasMarkers = draft.doc.drawing.markers.some(m => m.kuukan === draft.kuukan);
  if (hasAreas || hasMarkers) {
    return { error: 'エリアまたはマーカーが存在するため外形を外せません' };
  }

  const newDoc: ArekokoDocument = {
    ...draft.doc,
    drawing: {
      ...draft.doc.drawing,
      kuukans: draft.doc.drawing.kuukans.filter(k => k.kuukan !== draft.kuukan),
      partitions: draft.doc.drawing.partitions.filter(p => p.area !== draft.kuukan),
    },
  };
  return {
    ...draft,
    doc: newDoc,
  };
}

/**
 * 描画がない下書きに長方形の外形を付ける。
 */
export function addDraftOutline(draft: Draft): Draft {
  const existing = draft.doc.drawing.kuukans.find(k => k.kuukan === draft.kuukan);
  if (existing) {
    return draft;
  }

  const newDrawing: KuukanDrawing = {
    kuukan: draft.kuukan,
    outline: [
      [0, 0],
      [COORD_MAX, 0],
      [COORD_MAX, COORD_MAX],
      [0, COORD_MAX],
    ],
    aspect: 4 / 3,
  };

  const newDoc: ArekokoDocument = {
    ...draft.doc,
    drawing: {
      ...draft.doc.drawing,
      kuukans: [...draft.doc.drawing.kuukans, newDrawing],
    },
  };
  return {
    ...draft,
    doc: newDoc,
  };
}
