import type { Id, Kuukan, Area, Item, Drawing, KuukanDrawing, Partition, Marker, ItemDrawing } from '../types';
import type { RepairEntry } from './index';
import type { IdResolver } from './ids';
import type { NoticeManager } from './notices';
import { NIL_ID } from '../constants';
import { validateOutline } from '../../geometry/polygon';
import { isValidShape } from '../../geometry/shape';
import { computeRegions, type AreaTree } from '../../geometry/regions';
import { getKuukanDisplayName } from './membership';
import { getMarkerInvalidNoticeText } from './notices';
import type { SchemaCheck } from '../schema';

export function repairDrawing(
  drawing: Drawing,
  membership: {
    kuukans: Kuukan[];
    areas: Area[];
    items: Item[];
  },
  schemaCheck: SchemaCheck,
  resolver: IdResolver,
  notices: NoticeManager,
  repairs: RepairEntry[]
): void {
  const kuukanMap = new Map<Id, Kuukan>(membership.kuukans.map(k => [k.id, k]));
  const itemMap = new Map<Id, Item>(membership.items.map(i => [i.id, i]));
  const areaMap = new Map<Id, Area>(membership.areas.map(a => [a.id, a]));

  function getKuukanOfPlace(placeId: Id): Id | null {
    if (kuukanMap.has(placeId)) return placeId;
    const a = areaMap.get(placeId);
    if (a) return a.kuukan;
    return null;
  }

  // この読み込みで描画ごと外れたクウカン。その仕切り・マーカー・モノの描画は黙って外す。
  const droppedKuukanDrawings = new Set<Id>();

  // 1. schema 違反の要素（4.2 の 3.）を外す
  const dropKuukanIndices = schemaCheck.dropElements.get('kuukans') ?? new Set<number>();
  const dropPartitionIndices = schemaCheck.dropElements.get('partitions') ?? new Set<number>();
  const dropMarkerIndices = schemaCheck.dropElements.get('markers') ?? new Set<number>();
  const dropItemIndices = schemaCheck.dropElements.get('items') ?? new Set<number>();

  const initialKuukanDrawings: KuukanDrawing[] = [];
  for (let i = 0; i < drawing.kuukans.length; i++) {
    const kd = drawing.kuukans[i]!;
    if (dropKuukanIndices.has(i)) {
      const kuukanId = resolver.resolveWithKind(kd.kuukan, ['kuukan']);
      const k = kuukanId ? kuukanMap.get(kuukanId) : undefined;
      if (k && k.id !== NIL_ID) {
        droppedKuukanDrawings.add(k.id);
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'kuukanDrawingInvalid',
          message: `クウカン「${name}」：描画に問題があるため、このクウカンの描画を外します`,
          target: { kind: 'kuukan', id: k.id },
        });
        notices.addNotice(k, 'kuukanDrawingInvalid');
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
    } else {
      initialKuukanDrawings.push(kd);
    }
  }

  const initialPartitions: Partition[] = [];
  const kuukansToDropFromPartitions = new Set<Id>();
  for (let i = 0; i < drawing.partitions.length; i++) {
    const p = drawing.partitions[i]!;
    if (dropPartitionIndices.has(i)) {
      const areaNode = resolver.resolve(p.area);
      const kuukanId = areaNode ? getKuukanOfPlace(areaNode) : null;
      if (kuukanId && kuukanId !== NIL_ID) {
        kuukansToDropFromPartitions.add(kuukanId);
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
    } else {
      initialPartitions.push(p);
    }
  }

  const initialMarkers: Marker[] = [];
  for (let i = 0; i < drawing.markers.length; i++) {
    const m = drawing.markers[i]!;
    if (dropMarkerIndices.has(i)) {
      const kuukanId = resolver.resolveWithKind(m.kuukan, ['kuukan']);
      const k = kuukanId ? kuukanMap.get(kuukanId) : undefined;
      if (k && k.id !== NIL_ID) {
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'markerInvalid',
          message: `クウカン「${name}」：マーカー「${m.name}」の描画に問題があるため外します`,
          target: { kind: 'kuukan', id: k.id },
        });
        notices.addNotice(k, 'markerInvalid', getMarkerInvalidNoticeText(m.name));
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
    } else {
      initialMarkers.push(m);
    }
  }

  const initialItems: ItemDrawing[] = [];
  for (let i = 0; i < drawing.items.length; i++) {
    const itd = drawing.items[i]!;
    if (dropItemIndices.has(i)) {
      const itemId = resolver.resolveWithKind(itd.item, ['item']);
      const it = itemId ? itemMap.get(itemId) : undefined;
      if (it) {
        repairs.push({
          code: 'itemDrawingInvalid',
          message: `モノ「${it.name}」：描画に問題があるため外します`,
          target: { kind: 'item', id: it.id },
        });
        notices.addNotice(it, 'itemDrawingInvalid');
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
    } else {
      initialItems.push(itd);
    }
  }

  // 2. クウカンの描画（drawing.kuukans）
  const kuukanDrawingCount = new Map<Id, number>();
  for (const kd of initialKuukanDrawings) {
    const kid = resolver.resolveWithKind(kd.kuukan, ['kuukan']);
    if (kid) {
      kuukanDrawingCount.set(kid, (kuukanDrawingCount.get(kid) ?? 0) + 1);
    }
  }

  const validKuukanDrawings = new Map<Id, KuukanDrawing>();
  for (const kd of initialKuukanDrawings) {
    const kid = resolver.resolveWithKind(kd.kuukan, ['kuukan']);
    if (!kid) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }
    if (kid === NIL_ID) {
      repairs.push({
        code: 'unsetHasDrawing',
        message: '未設定のクウカンの描画を外します',
        target: { kind: 'kuukan', id: NIL_ID },
      });
      continue;
    }
    const count = kuukanDrawingCount.get(kid) ?? 0;
    const k = kuukanMap.get(kid);
    if (!k) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }

    if (count > 1) {
      droppedKuukanDrawings.add(kid);
      const name = getKuukanDisplayName(k, itemMap);
      repairs.push({
        code: 'kuukanDrawingInvalid',
        message: `クウカン「${name}」：描画に問題があるため、このクウカンの描画を外します`,
        target: { kind: 'kuukan', id: kid },
      });
      notices.addNotice(k, 'kuukanDrawingInvalid');
      continue;
    }

    const outlineRes = validateOutline(kd.outline);
    if (!outlineRes.ok || kd.aspect <= 0) {
      droppedKuukanDrawings.add(kid);
      const name = getKuukanDisplayName(k, itemMap);
      repairs.push({
        code: 'kuukanDrawingInvalid',
        message: `クウカン「${name}」：描画に問題があるため、このクウカンの描画を外します`,
        target: { kind: 'kuukan', id: kid },
      });
      notices.addNotice(k, 'kuukanDrawingInvalid');
      continue;
    }

    kd.kuukan = kid;
    validKuukanDrawings.set(kid, kd);
  }

  // 3. 仕切り（drawing.partitions）
  const partitionsByKuukan = new Map<Id, Partition[]>();

  for (const p of initialPartitions) {
    const areaId = resolver.resolve(p.area);
    const resolvedChildren = p.children.map(c => resolver.resolveWithKind(c, ['area']));

    if (!areaId || resolvedChildren.some(c => c === null)) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }

    p.area = areaId;
    p.children = resolvedChildren as Id[];

    const kuukanId = getKuukanOfPlace(areaId);
    if (kuukanId && droppedKuukanDrawings.has(kuukanId)) {
      continue;
    }
    if (!kuukanId || !validKuukanDrawings.has(kuukanId)) {
      if (kuukanId && kuukanId !== NIL_ID) {
        const k = kuukanMap.get(kuukanId);
        if (k) {
          const name = getKuukanDisplayName(k, itemMap);
          repairs.push({
            code: 'partitionMismatch',
            message: `クウカン「${name}」：仕切りの記録がエリアと合わないため、このクウカンの描画を外します`,
            target: { kind: 'kuukan', id: kuukanId },
          });
          notices.addNotice(k, 'partitionMismatch');
        }
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
      continue;
    }

    let list = partitionsByKuukan.get(kuukanId);
    if (!list) {
      list = [];
      partitionsByKuukan.set(kuukanId, list);
    }
    list.push(p);
  }


  for (const kid of kuukansToDropFromPartitions) {
    if (validKuukanDrawings.has(kid)) {
      droppedKuukanDrawings.add(kid);
      validKuukanDrawings.delete(kid);
      const k = kuukanMap.get(kid);
      if (k) {
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'partitionMismatch',
          message: `クウカン「${name}」：仕切りの記録がエリアと合わないため、このクウカンの描画を外します`,
          target: { kind: 'kuukan', id: kid },
        });
        notices.addNotice(k, 'partitionMismatch');
      }
    }
  }

  for (const [kid, kd] of Array.from(validKuukanDrawings.entries())) {
    const partsOfK = partitionsByKuukan.get(kid) ?? [];
    const areasOfK = membership.areas.filter(a => a.kuukan === kid);

    const childrenMap = new Map<Id, Id[]>();
    const rootAreas = areasOfK
      .filter(a => a.parent === null)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(a => a.id);
    if (rootAreas.length > 0) {
      childrenMap.set(kid, rootAreas);
    }

    for (const a of areasOfK) {
      const childAreas = areasOfK
        .filter(ca => ca.parent === a.id)
        .sort((ca, cb) => ca.order - cb.order || ca.id.localeCompare(cb.id))
        .map(ca => ca.id);
      if (childAreas.length > 0) {
        childrenMap.set(a.id, childAreas);
      }
    }

    const tree: AreaTree = {
      root: kid,
      children: childrenMap,
    };

    const regResult = computeRegions(kd.outline, tree, partsOfK);
    if (!regResult.ok) {
      droppedKuukanDrawings.add(kid);
      validKuukanDrawings.delete(kid);
      const k = kuukanMap.get(kid);
      if (k) {
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'partitionMismatch',
          message: `クウカン「${name}」：仕切りの記録がエリアと合わないため、このクウカンの描画を外します`,
          target: { kind: 'kuukan', id: kid },
        });
        notices.addNotice(k, 'partitionMismatch');
      }
    }
  }

  // 元の並び順を保つ（修復のない文書は、読み込んでもそのままにする）。
  const keptPartitions = new Set<Partition>();
  for (const [kid, list] of partitionsByKuukan) {
    if (validKuukanDrawings.has(kid)) {
      for (const p of list) keptPartitions.add(p);
    }
  }
  const remainingPartitions = initialPartitions.filter(p => keptPartitions.has(p));

  // 4. マーカー（drawing.markers）
  const remainingMarkers: Marker[] = [];
  for (const m of initialMarkers) {
    const kid = resolver.resolveWithKind(m.kuukan, ['kuukan']);
    if (!kid) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }
    if (droppedKuukanDrawings.has(kid)) {
      continue;
    }
    if (!validKuukanDrawings.has(kid)) {
      // 描画のないクウカンを指すマーカー
      const k = kuukanMap.get(kid);
      if (k && k.id !== NIL_ID) {
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'markerInvalid',
          message: `クウカン「${name}」：マーカー「${m.name}」の描画に問題があるため外します`,
          target: { kind: 'kuukan', id: kid },
        });
        notices.addNotice(k, 'markerInvalid', getMarkerInvalidNoticeText(m.name));
      } else {
        repairs.push({
          code: 'drawingDropped',
          message: '参照先が見つからない描画を外します',
        });
      }
      continue;
    }
    if (!isValidShape(m.shape)) {
      const k = kuukanMap.get(kid);
      if (k) {
        const name = getKuukanDisplayName(k, itemMap);
        repairs.push({
          code: 'markerInvalid',
          message: `クウカン「${name}」：マーカー「${m.name}」の描画に問題があるため外します`,
          target: { kind: 'kuukan', id: kid },
        });
        notices.addNotice(k, 'markerInvalid', getMarkerInvalidNoticeText(m.name));
      }
      continue;
    }

    m.kuukan = kid;
    remainingMarkers.push(m);
  }

  // 5. モノの描画（drawing.items）
  const itemDrawingCount = new Map<Id, number>();
  for (const itd of initialItems) {
    const iid = resolver.resolveWithKind(itd.item, ['item']);
    if (iid) {
      itemDrawingCount.set(iid, (itemDrawingCount.get(iid) ?? 0) + 1);
    }
  }

  const remainingItems: ItemDrawing[] = [];
  for (const itd of initialItems) {
    const iid = resolver.resolveWithKind(itd.item, ['item']);
    if (!iid) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }
    const it = itemMap.get(iid);
    if (!it) {
      repairs.push({
        code: 'drawingDropped',
        message: '参照先が見つからない描画を外します',
      });
      continue;
    }

    const count = itemDrawingCount.get(iid) ?? 0;
    if (count > 1) {
      repairs.push({
        code: 'itemDrawingInvalid',
        message: `モノ「${it.name}」：描画に問題があるため外します`,
        target: { kind: 'item', id: iid },
      });
      notices.addNotice(it, 'itemDrawingInvalid');
      continue;
    }

    const kuukanId = getKuukanOfPlace(it.place);
    if (!kuukanId || droppedKuukanDrawings.has(kuukanId)) {
      continue;
    }

    if (!validKuukanDrawings.has(kuukanId)) {
      repairs.push({
        code: 'itemDrawingInvalid',
        message: `モノ「${it.name}」：描画に問題があるため外します`,
        target: { kind: 'item', id: iid },
      });
      notices.addNotice(it, 'itemDrawingInvalid');
      continue;
    }

    if (!isValidShape(itd.shape)) {
      repairs.push({
        code: 'itemDrawingInvalid',
        message: `モノ「${it.name}」：描画に問題があるため外します`,
        target: { kind: 'item', id: iid },
      });
      notices.addNotice(it, 'itemDrawingInvalid');
      continue;
    }

    itd.item = iid;
    remainingItems.push(itd);
  }

  drawing.kuukans = Array.from(validKuukanDrawings.values());
  drawing.partitions = remainingPartitions;
  drawing.markers = remainingMarkers;
  drawing.items = remainingItems;
}
