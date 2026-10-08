import type { Area, ArekokoDocument, Id, Kuukan, KuukanDrawing, Marker, Partition, Point } from '../core/types';
import { OpError, type OpContext, type OpResult, type Relocation } from '../core/ops/common';
import { relocateItems } from '../core/relocate';
import { validateDocument } from '../core/validate';
import { displayName } from '../core/places';
import { NAMELESS_NAME } from '../core/constants';
import type { Draft } from './draft';

export type ConfirmMode = 'create' | 'keep' | 'replace';

/**
 * 下書きの由来に応じた確定モードを返す。
 */
export function confirmModes(draft: Draft): ConfirmMode[] {
  if (draft.origin.kind === 'duplicate') {
    return ['keep', 'replace'];
  }
  return ['create'];
}


/**
 * 置き換えで消えるエリアと、その中身の行き先（元の木でいちばん近い、残っている祖先。なければクウカンそのもの）。
 * 設計 7.8「複製で置き換えて、エリアがなくなった」。
 */
function replaceMapping(doc: ArekokoDocument, draft: Draft): { removedAreas: Id[]; mapping: Map<Id, Id> } {
  const originalAreas = doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
  const draftAreaIds = new Set(draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan).map(a => a.id));
  const removedAreas = originalAreas.filter(a => !draftAreaIds.has(a.id)).map(a => a.id);
  const removedSet = new Set(removedAreas);
  const origAreaMap = new Map(originalAreas.map(a => [a.id, a]));
  const mapping = new Map<Id, Id>();
  for (const removedId of removedAreas) {
    let curr = origAreaMap.get(removedId);
    let dest: Id = draft.kuukan;
    while (curr && curr.parent !== null) {
      if (!removedSet.has(curr.parent)) {
        dest = curr.parent;
        break;
      }
      curr = origAreaMap.get(curr.parent);
    }
    mapping.set(removedId, dest);
  }
  return { removedAreas, mapping };
}

/**
 * 下書きの確定による影響（消えるエリアとモノの移動）を算出する。影響があるのは replace のみ。
 */
export function planConfirm(
  doc: ArekokoDocument,
  draft: Draft,
  mode: ConfirmMode,
): { removedAreas: Id[]; relocations: Relocation[] } {
  if (mode !== 'replace') {
    return { removedAreas: [], relocations: [] };
  }

  const { removedAreas, mapping } = replaceMapping(doc, draft);

  function resolveDestination(start: Id): Id {
    let current = start;
    const visited = new Set<Id>();
    while (mapping.has(current)) {
      visited.add(current);
      const next = mapping.get(current)!;
      if (visited.has(next)) {
        break;
      }
      current = next;
    }
    return current;
  }

  const relocationMap = new Map<string, Relocation>();
  for (const item of doc.membership.items) {
    if (!mapping.has(item.place)) {
      continue;
    }
    const finalDest = resolveDestination(item.place);
    if (finalDest === item.place) {
      continue;
    }
    const key = `${item.place}\0${finalDest}`;
    let r = relocationMap.get(key);
    if (!r) {
      r = { from: item.place, to: finalDest, items: [] };
      relocationMap.set(key, r);
    }
    r.items.push(item.id);
  }

  return {
    removedAreas,
    relocations: Array.from(relocationMap.values()),
  };
}

/**
 * 下書きを文書に確定する。
 */
export function confirmDraft(
  doc: ArekokoDocument,
  draft: Draft,
  mode: ConfirmMode,
  ctx: OpContext,
): OpResult {
  const draftKuukan = draft.doc.membership.kuukans.find(k => k.id === draft.kuukan);
  if (!draftKuukan) {
    throw new OpError('notFound', '下書きのクウカンが見つかりません');
  }

  if (mode === 'create') {
    let newKuukan: Kuukan;
    if (draft.origin.kind === 'storage') {
      const itemId = draft.origin.item;
      const alreadyStorage = doc.membership.kuukans.some(k => k.owner === itemId);
      if (alreadyStorage) {
        throw new OpError('alreadyStorage', 'すでに収納として設定されています');
      }
      const targetItem = doc.membership.items.find(i => i.id === itemId);
      if (!targetItem) {
        throw new OpError('notFound', '持ち主のモノが見つかりません');
      }

      newKuukan = {
        id: draft.kuukan,
        owner: itemId,
        areaLabel: draftKuukan.areaLabel,
      };
    } else {
      newKuukan = {
        id: draft.kuukan,
        name: draftKuukan.name ?? '名前なし',
        owner: null,
        areaLabel: draftKuukan.areaLabel,
      };
    }

    const draftAreas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
    const draftKuukanDrawing = draft.doc.drawing.kuukans.filter(k => k.kuukan === draft.kuukan);
    const draftNodeIds = new Set([draft.kuukan, ...draftAreas.map(a => a.id)]);
    const draftPartitions = draft.doc.drawing.partitions.filter(p => draftNodeIds.has(p.area));
    const draftMarkers = draft.doc.drawing.markers.filter(m => m.kuukan === draft.kuukan);

    const newDoc: ArekokoDocument = {
      ...doc,
      membership: {
        ...doc.membership,
        kuukans: [...doc.membership.kuukans, newKuukan],
        areas: [...doc.membership.areas, ...draftAreas],
      },
      drawing: {
        ...doc.drawing,
        kuukans: [...doc.drawing.kuukans, ...draftKuukanDrawing],
        partitions: [...doc.drawing.partitions, ...draftPartitions],
        markers: [...doc.drawing.markers, ...draftMarkers],
      },
    };

    const violations = validateDocument(newDoc);
    if (violations.length > 0) {
      throw new OpError('invalidInput', violations[0]!.message);
    }

    return {
      doc: newDoc,
      moved: [],
      created: [draft.kuukan],
    };
  }

  if (mode === 'keep') {
    const idMap = new Map<Id, Id>();
    const newKuukanId = ctx.newId();
    idMap.set(draft.kuukan, newKuukanId);

    const draftAreas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
    for (const a of draftAreas) {
      idMap.set(a.id, ctx.newId());
    }

    const draftMarkers = draft.doc.drawing.markers.filter(m => m.kuukan === draft.kuukan);
    for (const m of draftMarkers) {
      idMap.set(m.id, ctx.newId());
    }

    const baseName = draftKuukan.owner === null ? (draftKuukan.name ?? NAMELESS_NAME) : displayName(doc, draft.kuukan);
    const newKuukan: Kuukan = {
      id: newKuukanId,
      name: `${baseName}のコピー`,
      owner: null,
      areaLabel: draftKuukan.areaLabel,
    };

    const newAreas: Area[] = draftAreas.map(a => ({
      id: idMap.get(a.id)!,
      kuukan: newKuukanId,
      parent: a.parent !== null ? (idMap.get(a.parent) ?? null) : null,
      name: a.name,
      order: a.order,
    }));

    const draftKd = draft.doc.drawing.kuukans.find(k => k.kuukan === draft.kuukan);
    const newKd: KuukanDrawing[] = draftKd
      ? [
          {
            kuukan: newKuukanId,
            outline: draftKd.outline.map(p => [p[0], p[1]] as Point),
            aspect: draftKd.aspect,
            ...(draftKd.realSize ? { realSize: { ...draftKd.realSize } } : {}),
          },
        ]
      : [];

    const draftNodeIds = new Set([draft.kuukan, ...draftAreas.map(a => a.id)]);
    const draftPartitions = draft.doc.drawing.partitions.filter(p => draftNodeIds.has(p.area));
    const newPartitions: Partition[] = draftPartitions.map(p => ({
      area: idMap.get(p.area)!,
      axis: p.axis,
      at: [...p.at],
      ...(p.seed ? { seed: [p.seed[0], p.seed[1]] as Point } : {}),
      children: p.children.map(cid => idMap.get(cid)!),
    }));

    const newMarkers: Marker[] = draftMarkers.map(m => ({
      id: idMap.get(m.id)!,
      kuukan: newKuukanId,
      name: m.name,
      shape: m.shape.type === 'point'
        ? { type: 'point' as const, at: [m.shape.at[0], m.shape.at[1]] as Point }
        : m.shape.type === 'rect'
        ? { type: 'rect' as const, x: m.shape.x, y: m.shape.y, w: m.shape.w, h: m.shape.h }
        : { type: 'poly' as const, points: m.shape.points.map(p => [p[0], p[1]] as Point) },
      rotation: m.rotation,
      notAPlace: m.notAPlace,
    }));

    const newDoc: ArekokoDocument = {
      ...doc,
      membership: {
        ...doc.membership,
        kuukans: [...doc.membership.kuukans, newKuukan],
        areas: [...doc.membership.areas, ...newAreas],
      },
      drawing: {
        ...doc.drawing,
        kuukans: [...doc.drawing.kuukans, ...newKd],
        partitions: [...doc.drawing.partitions, ...newPartitions],
        markers: [...doc.drawing.markers, ...newMarkers],
      },
    };

    const violations = validateDocument(newDoc);
    if (violations.length > 0) {
      throw new OpError('invalidInput', violations[0]!.message);
    }

    return {
      doc: newDoc,
      moved: [],
      created: [newKuukanId],
    };
  }

  // mode === 'replace'
  const { removedAreas, mapping } = replaceMapping(doc, draft);
  const removedSet = new Set(removedAreas);
  const originalAreas = doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
  const { doc: docAfterRelocate, moved } = relocateItems(doc, mapping, ctx);

  const draftAreas = draft.doc.membership.areas.filter(a => a.kuukan === draft.kuukan);
  const draftAreaMap = new Map(draftAreas.map(a => [a.id, a]));
  const otherAreas = docAfterRelocate.membership.areas.filter(a => a.kuukan !== draft.kuukan);
  const remainingOriginalAreas = originalAreas.filter(a => !removedSet.has(a.id));

  const updatedOriginalAreas = remainingOriginalAreas.map(a => {
    const draftA = draftAreaMap.get(a.id)!;
    return {
      ...a,
      name: draftA.name,
      order: draftA.order,
    };
  });
  const originalAreaIds = new Set(originalAreas.map(a => a.id));
  const newlyAddedAreas = draftAreas.filter(a => !originalAreaIds.has(a.id));
  const finalAreas = [...otherAreas, ...updatedOriginalAreas, ...newlyAddedAreas];

  const otherKd = docAfterRelocate.drawing.kuukans.filter(k => k.kuukan !== draft.kuukan);
  const draftKd = draft.doc.drawing.kuukans.filter(k => k.kuukan === draft.kuukan);
  const finalKd = [...otherKd, ...draftKd];

  const draftNodeIds = new Set([draft.kuukan, ...draftAreas.map(a => a.id)]);
  const otherPartitions = docAfterRelocate.drawing.partitions.filter(
    p => p.area !== draft.kuukan && !originalAreaIds.has(p.area),
  );
  const draftPartitions = draft.doc.drawing.partitions.filter(p => draftNodeIds.has(p.area));
  const finalPartitions = [...otherPartitions, ...draftPartitions];

  const otherMarkers = docAfterRelocate.drawing.markers.filter(m => m.kuukan !== draft.kuukan);
  const draftMarkers = draft.doc.drawing.markers.filter(m => m.kuukan === draft.kuukan);
  const finalMarkers = [...otherMarkers, ...draftMarkers];

  const finalKuukans = docAfterRelocate.membership.kuukans.map(k => {
    if (k.id === draft.kuukan) {
      return {
        ...k,
        ...(k.owner === null && draftKuukan.name !== undefined ? { name: draftKuukan.name } : {}),
        areaLabel: draftKuukan.areaLabel,
      };
    }
    return k;
  });

  const placesInKuukan = new Set<Id>([draft.kuukan, ...finalAreas.filter(a => a.kuukan === draft.kuukan).map(a => a.id)]);
  const itemsInKuukan = new Set(docAfterRelocate.membership.items.filter(i => placesInKuukan.has(i.place)).map(i => i.id));
  const finalItemDrawings =
    draftKd.length > 0 ? docAfterRelocate.drawing.items : docAfterRelocate.drawing.items.filter(d => !itemsInKuukan.has(d.item));
  const finalDoc: ArekokoDocument = {
    ...docAfterRelocate,
    membership: {
      ...docAfterRelocate.membership,
      kuukans: finalKuukans,
      areas: finalAreas,
    },
    drawing: {
      ...docAfterRelocate.drawing,
      kuukans: finalKd,
      partitions: finalPartitions,
      markers: finalMarkers,
      items: finalItemDrawings,
    },
  };

  const violations = validateDocument(finalDoc);
  if (violations.length > 0) {
    throw new OpError('invalidInput', violations[0]!.message);
  }

  return {
    doc: finalDoc,
    moved,
    created: [draft.kuukan],
  };
}
