// 不変条件の検査。詳細設計 5章、付録A.9。

import { NIL_ID } from './constants';
import { isUuidV7 } from './ids';
import { buildAreaTree } from './indexes';
import type { ArekokoDocument, Id } from './types';
import type { Polygon } from '../geometry/types';
import { validateOutline } from '../geometry/polygon';
import { computeRegions } from '../geometry/regions';
import { isValidShape } from '../geometry/shape';
import { checkSchema } from './schema';

export interface Violation {
  code: string;
  message: string;
  ids: Id[];
}

/**
 * クウカンの描画と仕切りを検証する。
 */
export function validateKuukanDrawing(
  doc: ArekokoDocument,
  kuukan: Id,
): { ok: true; regions: Map<Id, Polygon> } | { ok: false; reason: string } {
  const kd = doc.drawing.kuukans.find(k => k.kuukan === kuukan);
  if (!kd) {
    return { ok: false, reason: 'クウカンの描画情報がありません' };
  }

  const outlineRes = validateOutline(kd.outline);
  if (!outlineRes.ok) {
    return { ok: false, reason: outlineRes.reason };
  }

  const tree = buildAreaTree(doc, kuukan);
  const nodeIds = new Set<Id>([kuukan]);
  for (const childIds of tree.children.values()) {
    for (const childId of childIds) {
      nodeIds.add(childId);
    }
  }

  const partitions = doc.drawing.partitions.filter(p => nodeIds.has(p.area));
  return computeRegions(kd.outline, tree, partitions);
}

/**
 * 文書の不変条件を検査する（線形時間）。
 */
export function validateDocument(doc: ArekokoDocument): Violation[] {
  const violations: Violation[] = [];

  // 0. schema.json に合うこと。アプリが書いたファイルは、読み込み時に1つも外されずに読めなければならない。
  const schema = checkSchema(doc);
  const schemaIssues = [
    ...schema.fatal.map(f => f.message),
    ...(schema.dropDrawing ? ['描画の層の形式が正しくありません'] : []),
    ...[...schema.dropCollections].map(c => `drawing.${c} の形式が正しくありません`),
    ...[...schema.dropElements].flatMap(([c, idx]) => [...idx].map(i => `drawing.${c}[${i}] の形式が正しくありません`)),
  ];
  for (const message of schemaIssues) {
    violations.push({ code: 'schema', message, ids: [] });
  }

  // 1. ID の一意性と UUID v7 形式の検査
  const idCounts = new Map<Id, number>();
  function recordId(id: Id) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const k of doc.membership.kuukans) recordId(k.id);
  for (const a of doc.membership.areas) recordId(a.id);
  for (const it of doc.membership.items) recordId(it.id);
  for (const c of doc.membership.categories) recordId(c.id);
  for (const t of doc.membership.tags) recordId(t.id);
  for (const m of doc.drawing.markers) recordId(m.id);

  // Nil UUID は未設定のクウカン専用（詳細設計 4.3）。
  const others = [doc.membership.areas, doc.membership.items, doc.membership.categories, doc.membership.tags, doc.drawing.markers];
  if (others.some(list => list.some(e => e.id === NIL_ID))) {
    violations.push({
      code: 'reservedId',
      message: '予約されたID（未設定）がクウカン以外に使われています',
      ids: [NIL_ID],
    });
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      violations.push({
        code: 'duplicateId',
        message: `ID「${id}」が重複しています`,
        ids: [id],
      });
    }
    if (id !== NIL_ID && !isUuidV7(id)) {
      violations.push({
        code: 'invalidId',
        message: `ID「${id}」は有効なUUID v7ではありません`,
        ids: [id],
      });
    }
  }

  // 2. 未設定クウカンの検査
  const unsetKuukan = doc.membership.kuukans.find(k => k.id === NIL_ID);
  if (!unsetKuukan) {
    violations.push({
      code: 'missingUnset',
      message: '未設定のクウカンが存在しません',
      ids: [],
    });
  } else if (unsetKuukan.owner !== null) {
    violations.push({
      code: 'unsetHasOwner',
      message: '未設定のクウカンに持ち主が設定されています',
      ids: [NIL_ID],
    });
  }

  for (const a of doc.membership.areas) {
    if (a.kuukan === NIL_ID) {
      violations.push({
        code: 'unsetHasAreas',
        message: `未設定のクウカンにエリア「${a.name}」が存在します`,
        ids: [a.id],
      });
    }
  }

  const unsetHasDrawing =
    doc.drawing.kuukans.some(kd => kd.kuukan === NIL_ID) ||
    doc.drawing.markers.some(m => m.kuukan === NIL_ID) ||
    doc.drawing.partitions.some(p => p.area === NIL_ID);
  if (unsetHasDrawing) {
    violations.push({
      code: 'unsetHasDrawing',
      message: '未設定のクウカンに描画情報が存在します',
      ids: [NIL_ID],
    });
  }

  // 高速参照マップの作成
  const kuukanById = new Map(doc.membership.kuukans.map(k => [k.id, k]));
  const areaById = new Map(doc.membership.areas.map(a => [a.id, a]));
  const itemById = new Map(doc.membership.items.map(it => [it.id, it]));
  const categoryById = new Map(doc.membership.categories.map(c => [c.id, c]));
  const tagById = new Map(doc.membership.tags.map(t => [t.id, t]));

  // 3. クウカンの持ち主・名前の検査
  const ownerToKuukans = new Map<Id, Id[]>();
  for (const k of doc.membership.kuukans) {
    if (k.owner !== null) {
      if (!itemById.has(k.owner)) {
        violations.push({
          code: 'ownerMissing',
          message: `クウカン「${k.id}」の持ち主のモノが見つかりません`,
          ids: [k.id, k.owner],
        });
      } else {
        let list = ownerToKuukans.get(k.owner);
        if (!list) {
          list = [];
          ownerToKuukans.set(k.owner, list);
        }
        list.push(k.id);
      }
    } else if (k.id !== NIL_ID) {
      if (typeof k.name !== 'string') {
        violations.push({
          code: 'kuukanMissingName',
          message: `どこにも置かれていないクウカン「${k.id}」に名前がありません`,
          ids: [k.id],
        });
      }
    }
  }

  for (const [ownerId, kuukanIds] of ownerToKuukans) {
    if (kuukanIds.length > 1) {
      violations.push({
        code: 'ownerShared',
        message: `モノ「${ownerId}」が複数のクウカンを持っています`,
        ids: kuukanIds,
      });
    }
  }

  // 4. モノの置き場・カテゴリ・タグの検査
  for (const it of doc.membership.items) {
    const placeExists = kuukanById.has(it.place) || areaById.has(it.place);
    if (!placeExists) {
      violations.push({
        code: 'placeMissing',
        message: `モノ「${it.name}」の置き場が見つかりません`,
        ids: [it.id, it.place],
      });
    }

    if (it.category !== null && !categoryById.has(it.category)) {
      violations.push({
        code: 'categoryMissing',
        message: `モノ「${it.name}」のカテゴリが見つかりません`,
        ids: [it.id, it.category],
      });
    }

    const seenTags = new Set<Id>();
    let hasDup = false;
    for (const tagId of it.tags) {
      if (!tagById.has(tagId)) {
        violations.push({
          code: 'tagMissing',
          message: `モノ「${it.name}」のタグが見つかりません`,
          ids: [it.id, tagId],
        });
      }
      if (seenTags.has(tagId)) {
        hasDup = true;
      }
      seenTags.add(tagId);
    }
    if (hasDup) {
      violations.push({
        code: 'tagDuplicate',
        message: `モノ「${it.name}」に重複したタグがあります`,
        ids: [it.id],
      });
    }
  }

  // 5. カテゴリの親と輪の検査（線形時間）
  for (const c of doc.membership.categories) {
    if (c.parent !== null && !categoryById.has(c.parent)) {
      violations.push({
        code: 'categoryParentMissing',
        message: `カテゴリ「${c.name}」の親カテゴリが見つかりません`,
        ids: [c.id, c.parent],
      });
    }
  }

  const catState = new Map<Id, number>();
  for (const c of doc.membership.categories) {
    if ((catState.get(c.id) ?? 0) === 0) {
      const path: Id[] = [];
      let curr: Id | null = c.id;
      while (curr !== null) {
        const state = catState.get(curr) ?? 0;
        if (state === 1) {
          const cycleStartIndex = path.indexOf(curr);
          violations.push({
            code: 'cycleCategory',
            message: 'カテゴリの親子関係が輪になっています',
            ids: path.slice(cycleStartIndex),
          });
          break;
        }
        if (state === 2) {
          break;
        }
        catState.set(curr, 1);
        path.push(curr);
        const catObj = categoryById.get(curr);
        curr = catObj?.parent ?? null;
      }
      for (const id of path) {
        catState.set(id, 2);
      }
    }
  }

  // 6. エリアの所属クウカン・親・輪の検査（線形時間）
  for (const a of doc.membership.areas) {
    if (!kuukanById.has(a.kuukan)) {
      violations.push({
        code: 'areaKuukanMissing',
        message: `エリア「${a.name}」の所属クウカンが見つかりません`,
        ids: [a.id, a.kuukan],
      });
    }
    if (a.parent !== null) {
      const parentArea = areaById.get(a.parent);
      if (!parentArea) {
        violations.push({
          code: 'areaParentMissing',
          message: `エリア「${a.name}」の親エリアが見つかりません`,
          ids: [a.id, a.parent],
        });
      } else if (parentArea.kuukan !== a.kuukan) {
        violations.push({
          code: 'areaParentDifferentKuukan',
          message: `エリア「${a.name}」の親エリアが別のクウカンに属しています`,
          ids: [a.id, a.parent],
        });
      }
    }
  }

  const areaState = new Map<Id, number>();
  for (const a of doc.membership.areas) {
    if ((areaState.get(a.id) ?? 0) === 0) {
      const path: Id[] = [];
      let curr: Id | null = a.id;
      while (curr !== null) {
        const state = areaState.get(curr) ?? 0;
        if (state === 1) {
          const cycleStartIndex = path.indexOf(curr);
          violations.push({
            code: 'cycleArea',
            message: 'エリアの親子関係が輪になっています',
            ids: path.slice(cycleStartIndex),
          });
          break;
        }
        if (state === 2) {
          break;
        }
        areaState.set(curr, 1);
        path.push(curr);
        const areaObj = areaById.get(curr);
        curr = areaObj?.parent ?? null;
      }
      for (const id of path) {
        areaState.set(id, 2);
      }
    }
  }

  // 7. 収納の入れ子の輪の検査（線形時間）
  const nestingParent = new Map<Id, Id>();
  for (const k of doc.membership.kuukans) {
    if (k.owner !== null) {
      const ownerItem = itemById.get(k.owner);
      if (ownerItem) {
        let parentKuukanId: Id | null = null;
        if (kuukanById.has(ownerItem.place)) {
          parentKuukanId = ownerItem.place;
        } else {
          const a = areaById.get(ownerItem.place);
          if (a) {
            parentKuukanId = a.kuukan;
          }
        }
        if (parentKuukanId !== null) {
          nestingParent.set(k.id, parentKuukanId);
        }
      }
    }
  }

  const nestingState = new Map<Id, number>();
  for (const k of doc.membership.kuukans) {
    if ((nestingState.get(k.id) ?? 0) === 0) {
      const path: Id[] = [];
      let curr: Id | null = k.id;
      while (curr !== null) {
        const state = nestingState.get(curr) ?? 0;
        if (state === 1) {
          const cycleStartIndex = path.indexOf(curr);
          violations.push({
            code: 'cycleNesting',
            message: '収納の入れ子が輪になっています',
            ids: path.slice(cycleStartIndex),
          });
          break;
        }
        if (state === 2) {
          break;
        }
        nestingState.set(curr, 1);
        path.push(curr);
        curr = nestingParent.get(curr) ?? null;
      }
      for (const id of path) {
        nestingState.set(id, 2);
      }
    }
  }

  // 8. 描画の層の検査
  const seenKuukanDrawing = new Set<Id>();
  const drawingKuukanIds = new Set<Id>();

  for (const kd of doc.drawing.kuukans) {
    if (!kuukanById.has(kd.kuukan)) {
      violations.push({
        code: 'kuukanDrawingMissingKuukan',
        message: 'クウカンの描画が指すクウカンが見つかりません',
        ids: [kd.kuukan],
      });
    }
    if (kd.kuukan !== NIL_ID && kuukanById.has(kd.kuukan)) {
      if (seenKuukanDrawing.has(kd.kuukan)) {
        violations.push({
          code: 'duplicateKuukanDrawing',
          message: `クウカン「${kd.kuukan}」に重複した描画があります`,
          ids: [kd.kuukan],
        });
      } else {
        seenKuukanDrawing.add(kd.kuukan);
        drawingKuukanIds.add(kd.kuukan);
      }

      const outlineResult = validateOutline(kd.outline);
      if (!outlineResult.ok) {
        violations.push({
          code: 'invalidOutline',
          message: `クウカン「${kd.kuukan}」の外形が正しくありません: ${outlineResult.reason}`,
          ids: [kd.kuukan],
        });
      }

      if (typeof kd.aspect !== 'number' || kd.aspect <= 0 || !Number.isFinite(kd.aspect)) {
        violations.push({
          code: 'invalidAspect',
          message: `クウカン「${kd.kuukan}」のアスペクト比が正しくありません`,
          ids: [kd.kuukan],
        });
      }
    }
  }

  for (const kId of drawingKuukanIds) {
    const res = validateKuukanDrawing(doc, kId);
    if (!res.ok) {
      violations.push({
        code: 'partitionMismatch',
        message: `クウカン「${kId}」の仕切りがエリアの木と一致しません: ${res.reason}`,
        ids: [kId],
      });
    }
  }

  for (const p of doc.drawing.partitions) {
    let pKuukanId: Id | null = null;
    if (kuukanById.has(p.area)) {
      pKuukanId = p.area;
    } else {
      const a = areaById.get(p.area);
      if (a) {
        pKuukanId = a.kuukan;
      }
    }
    if (pKuukanId === null) {
      violations.push({
        code: 'partitionMissingNode',
        message: '仕切りが指すクウカンまたはエリアが見つかりません',
        ids: [p.area],
      });
    } else if (!drawingKuukanIds.has(pKuukanId)) {
      violations.push({
        code: 'partitionMismatch',
        message: '描画のないクウカンに仕切りがあります',
        ids: [p.area],
      });
    }
  }

  for (const m of doc.drawing.markers) {
    if (!drawingKuukanIds.has(m.kuukan)) {
      violations.push({
        code: 'markerKuukanNoDrawing',
        message: `マーカー「${m.name}」のクウカンに描画がありません`,
        ids: [m.id, m.kuukan],
      });
    }
    if (!isValidShape(m.shape)) {
      violations.push({
        code: 'invalidMarkerShape',
        message: `マーカー「${m.name}」の形が正しくありません`,
        ids: [m.id],
      });
    }
    if (!Number.isInteger(m.rotation) || m.rotation < 0 || m.rotation > 7) {
      violations.push({
        code: 'invalidRotation',
        message: `マーカー「${m.name}」の回転が正しくありません`,
        ids: [m.id],
      });
    }
  }

  const seenItemDrawing = new Set<Id>();
  for (const idr of doc.drawing.items) {
    const it = itemById.get(idr.item);
    if (!it) {
      violations.push({
        code: 'itemDrawingMissingItem',
        message: 'モノの描画が指すモノが見つかりません',
        ids: [idr.item],
      });
    } else {
      if (seenItemDrawing.has(idr.item)) {
        violations.push({
          code: 'duplicateItemDrawing',
          message: `モノ「${it.name}」に重複した描画があります`,
          ids: [idr.item],
        });
      } else {
        seenItemDrawing.add(idr.item);
      }

      let placeKuukanId: Id | null = null;
      if (kuukanById.has(it.place)) {
        placeKuukanId = it.place;
      } else {
        const a = areaById.get(it.place);
        if (a) {
          placeKuukanId = a.kuukan;
        }
      }

      if (placeKuukanId === null || !drawingKuukanIds.has(placeKuukanId)) {
        violations.push({
          code: 'itemDrawingKuukanNoDrawing',
          message: `モノ「${it.name}」の置き場が属するクウカンに描画がありません`,
          ids: [idr.item],
        });
      }

      if (!isValidShape(idr.shape)) {
        violations.push({
          code: 'invalidItemDrawingShape',
          message: `モノ「${it.name}」の描画の形が正しくありません`,
          ids: [idr.item],
        });
      }

      if (!Number.isInteger(idr.rotation) || idr.rotation < 0 || idr.rotation > 7) {
        violations.push({
          code: 'invalidRotation',
          message: `モノ「${it.name}」の描画の回転が正しくありません`,
          ids: [idr.item],
        });
      }
    }
  }

  return violations;
}
