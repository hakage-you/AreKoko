import { describe, it, expect } from 'vitest';
import { analyzeDocument, type LoadContext } from '../../src/core/load';
import { NIL_ID, UNSET_NAME, DEFAULT_AREA_LABEL, NAMELESS_NAME } from '../../src/core/constants';
import { NOTICE_TEXTS } from '../../src/core/load/notices';

function createDeterministicContext(start = 1, fixedNow = '2026-10-08T12:00:00.000Z'): LoadContext {
  let counter = start;
  return {
    newId: () => {
      const hex = (counter++).toString(16).padStart(12, '0');
      return `018f0000-0000-7000-8000-${hex}`;
    },
    now: () => fixedNow,
  };
}

function makeMinimalDoc(): any {
  return {
    app: 'arekoko',
    schemaVersion: 1,
    membership: {
      kuukans: [{ id: NIL_ID, name: UNSET_NAME, owner: null, areaLabel: DEFAULT_AREA_LABEL }],
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

describe('analyzeDocument', () => {
  it('正しい最小の文書（未設定だけ）→ ok', () => {
    const doc = makeMinimalDoc();
    const ctx = createDeterministicContext();
    const res = analyzeDocument(doc, ctx);
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect(res.doc.membership.kuukans[0]?.id).toBe(NIL_ID);
    }
  });

  describe('各修復コードの最小の壊れた文書', () => {
    it('tempId: 仮IDが新しいIDになり、修復メモは付かない', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: 'new:電池',
        name: '単3電池',
        place: NIL_ID,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'tempId')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.id).toBe('018f0000-0000-7000-8000-000000000001');
        expect(item.notices).toBeUndefined();
      }
    });

    it('reservedId: 予約IDの要素に新しいIDが振られ、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: NIL_ID,
        name: '単3電池',
        place: NIL_ID,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'reservedId')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.id).toBe('018f0000-0000-7000-8000-000000000001');
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.reservedId);
      }
    });

    it('duplicateId: 重複したIDの両方に新しいIDが振られ、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const dupId = '018f0000-0000-7000-8000-0000000000aa';
      doc.membership.items.push(
        { id: dupId, name: 'アイテム1', place: NIL_ID },
        { id: dupId, name: 'アイテム2', place: NIL_ID }
      );
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        const dupRepairs = res.repairs.filter(r => r.code === 'duplicateId');
        expect(dupRepairs.length).toBe(2);
        const [it1, it2] = res.doc.membership.items;
        expect(it1!.id).not.toBe(dupId);
        expect(it2!.id).not.toBe(dupId);
        expect(it1!.id).not.toBe(it2!.id);
        expect(it1!.notices?.[0]?.text).toBe(NOTICE_TEXTS.duplicateId);
      }
    });

    it('missingUnset: 未設定クウカンがなければ作成され、修復メモは付かない', () => {
      const doc = makeMinimalDoc();
      doc.membership.kuukans = [];
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'missingUnset')).toBe(true);
        expect(res.doc.membership.kuukans[0]?.id).toBe(NIL_ID);
        expect(res.doc.membership.kuukans[0]?.name).toBe(UNSET_NAME);
        expect(res.doc.membership.kuukans[0]?.notices).toBeUndefined();
      }
    });

    it('placeMissing: 置き場の参照先がないモノは未設定に移り、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '電池',
        place: '018f0000-0000-7000-8000-000000000099',
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'placeMissing')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.place).toBe(NIL_ID);
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.placeMissing);
      }
    });

    it('categoryMissing: カテゴリが見つからないモノは未分類になり、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '電池',
        place: NIL_ID,
        category: '018f0000-0000-7000-8000-000000000099',
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'categoryMissing')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.category).toBeNull();
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.categoryMissing);
      }
    });

    it('tagMissing: タグが見つからないモノはタグが外れ、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '電池',
        place: NIL_ID,
        tags: ['018f0000-0000-7000-8000-000000000099'],
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'tagMissing')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.tags).toEqual([]);
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.tagMissing);
      }
    });

    it('tagDuplicate: 重複したタグは1つにまとめられ、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const tagId = '018f0000-0000-7000-8000-000000000010';
      doc.membership.tags.push({ id: tagId, name: '重要' });
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '電池',
        place: NIL_ID,
        tags: [tagId, tagId],
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'tagDuplicate')).toBe(true);
        const item = res.doc.membership.items[0]!;
        expect(item.tags).toEqual([tagId]);
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.tagDuplicate);
      }
    });

    it('categoryParentMissing: 親カテゴリがないものは最上位へ移り、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.categories.push({
        id: '018f0000-0000-7000-8000-000000000010',
        name: '子カテゴリ',
        parent: '018f0000-0000-7000-8000-000000000099',
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'categoryParentMissing')).toBe(true);
        const cat = res.doc.membership.categories[0]!;
        expect(cat.parent).toBeNull();
        expect(cat.notices?.[0]?.text).toBe(NOTICE_TEXTS.categoryParentMissing);
      }
    });

    it('ownerMissing: 持ち主のモノが見つからないクウカンは owner が外れ、名前なしになり修復メモが付く', () => {
      const doc = makeMinimalDoc();
      doc.membership.kuukans.push({
        id: '018f0000-0000-7000-8000-000000000020',
        owner: '018f0000-0000-7000-8000-000000000099',
        areaLabel: '段',
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'ownerMissing')).toBe(true);
        const kuukan = res.doc.membership.kuukans.find(k => k.id === '018f0000-0000-7000-8000-000000000020')!;
        expect(kuukan.owner).toBeNull();
        expect(kuukan.name).toBe(NAMELESS_NAME);
        expect(kuukan.notices?.[0]?.text).toBe(NOTICE_TEXTS.ownerMissing);
      }
    });

    it('ownerShared: 1つのモノが複数のクウカンを持つ場合、すべて持ち主が外れる', () => {
      const doc = makeMinimalDoc();
      const itemId = '018f0000-0000-7000-8000-000000000001';
      doc.membership.items.push({ id: itemId, name: '箱', place: NIL_ID });
      doc.membership.kuukans.push(
        { id: '018f0000-0000-7000-8000-000000000021', owner: itemId, areaLabel: '段' },
        { id: '018f0000-0000-7000-8000-000000000022', owner: itemId, areaLabel: '段' }
      );
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.filter(r => r.code === 'ownerShared').length).toBe(2);
        const k1 = res.doc.membership.kuukans.find(k => k.id === '018f0000-0000-7000-8000-000000000021')!;
        expect(k1.owner).toBeNull();
        expect(k1.name).toBe(NAMELESS_NAME);
        expect(k1.notices?.[0]?.text).toBe(NOTICE_TEXTS.ownerShared);
      }
    });

    it('unsetHasOwner: 未設定クウカンの owner は外れ、修復メモは付かない', () => {
      const doc = makeMinimalDoc();
      const itemId = '018f0000-0000-7000-8000-000000000001';
      doc.membership.items.push({ id: itemId, name: '箱', place: NIL_ID });
      doc.membership.kuukans[0].owner = itemId;
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'unsetHasOwner')).toBe(true);
        expect(res.doc.membership.kuukans[0]?.owner).toBeNull();
        expect(res.doc.membership.kuukans[0]?.notices).toBeUndefined();
      }
    });

    it('areaKuukanMissing: クウカンが見つからないエリアは外れ、そのエリアを置き場にするモノは未設定に移る', () => {
      const doc = makeMinimalDoc();
      const areaId = '018f0000-0000-7000-8000-000000000030';
      doc.membership.areas.push({
        id: areaId,
        kuukan: '018f0000-0000-7000-8000-000000000099',
        name: '床1',
      });
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '本',
        place: areaId,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'areaKuukanMissing')).toBe(true);
        expect(res.doc.membership.areas.length).toBe(0);
        const item = res.doc.membership.items[0]!;
        expect(item.place).toBe(NIL_ID);
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.areaKuukanMissing);
      }
    });

    it('areaParentMissing: 親エリアが見つからないエリアは直下へ移り、修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const kuukanId = '018f0000-0000-7000-8000-000000000020';
      doc.membership.kuukans.push({ id: kuukanId, name: '部屋', owner: null, areaLabel: '床' });
      doc.membership.areas.push({
        id: '018f0000-0000-7000-8000-000000000030',
        kuukan: kuukanId,
        name: '子エリア',
        parent: '018f0000-0000-7000-8000-000000000099',
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'areaParentMissing')).toBe(true);
        const area = res.doc.membership.areas[0]!;
        expect(area.parent).toBeNull();
        expect(area.notices?.[0]?.text).toBe(NOTICE_TEXTS.areaParentMissing);
      }
    });

    it('unsetHasAreas: 未設定クウカンのエリアは外れ、そのエリアにあったモノは未設定に移る', () => {
      const doc = makeMinimalDoc();
      const areaId = '018f0000-0000-7000-8000-000000000030';
      doc.membership.areas.push({
        id: areaId,
        kuukan: NIL_ID,
        name: '床1',
      });
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        name: '本',
        place: areaId,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'unsetHasAreas')).toBe(true);
        expect(res.doc.membership.areas.length).toBe(0);
        const item = res.doc.membership.items[0]!;
        expect(item.place).toBe(NIL_ID);
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.unsetHasAreas);
      }
    });

    it('unsetHasDrawing: 未設定クウカンの描画は外れ、修復メモは付かない', () => {
      const doc = makeMinimalDoc();
      doc.drawing.kuukans.push({
        kuukan: NIL_ID,
        outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
        aspect: 1,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'unsetHasDrawing')).toBe(true);
        expect(res.doc.drawing.kuukans.length).toBe(0);
        expect(res.doc.membership.kuukans[0]?.notices).toBeUndefined();
      }
    });

    it('kuukanDrawingInvalid: 重複したクウカン描画は外れ、クウカンに修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const kuukanId = '018f0000-0000-7000-8000-000000000020';
      doc.membership.kuukans.push({ id: kuukanId, name: '部屋', owner: null, areaLabel: '床' });
      doc.drawing.kuukans.push(
        { kuukan: kuukanId, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 1 },
        { kuukan: kuukanId, outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 1 }
      );
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'kuukanDrawingInvalid')).toBe(true);
        expect(res.doc.drawing.kuukans.length).toBe(0);
        const k = res.doc.membership.kuukans.find(x => x.id === kuukanId)!;
        expect(k.notices?.[0]?.text).toBe(NOTICE_TEXTS.kuukanDrawingInvalid);
      }
    });

    it('partitionMismatch: 描画のないクウカンのエリアを指す仕切りは外れ、クウカンに修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const kuukanId = '018f0000-0000-7000-8000-000000000020';
      const a1 = '018f0000-0000-7000-8000-000000000031';
      const a2 = '018f0000-0000-7000-8000-000000000032';
      doc.membership.kuukans.push({ id: kuukanId, name: '部屋', owner: null, areaLabel: '床' });
      doc.membership.areas.push(
        { id: a1, kuukan: kuukanId, name: '床1' },
        { id: a2, kuukan: kuukanId, name: '床2' }
      );
      doc.drawing.partitions.push({
        area: kuukanId,
        axis: 'x',
        at: [5000],
        children: [a1, a2],
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'partitionMismatch')).toBe(true);
        expect(res.doc.drawing.partitions.length).toBe(0);
        const k = res.doc.membership.kuukans.find(x => x.id === kuukanId)!;
        expect(k.notices?.[0]?.text).toBe(NOTICE_TEXTS.partitionMismatch);
      }
    });

    it('markerInvalid: 形状の不正なマーカーは外れ、クウカンに修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const kuukanId = '018f0000-0000-7000-8000-000000000020';
      doc.membership.kuukans.push({ id: kuukanId, name: '部屋', owner: null, areaLabel: '床' });
      doc.drawing.kuukans.push({
        kuukan: kuukanId,
        outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
        aspect: 1,
      });
      doc.drawing.markers.push({
        id: '018f0000-0000-7000-8000-000000000040',
        kuukan: kuukanId,
        name: '柱',
        shape: { type: 'rect', x: 0, y: 0, w: 0, h: 0 } as any,
        rotation: 0,
        notAPlace: true,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'markerInvalid')).toBe(true);
        expect(res.doc.drawing.markers.length).toBe(0);
        const k = res.doc.membership.kuukans.find(x => x.id === kuukanId)!;
        expect(k.notices?.[0]?.text).toBe('読み込み時の修復で、マーカー「柱」の描画に問題があったため外しました');
      }
    });

    it('itemDrawingInvalid: 形状の不正なモノ描画は外れ、モノに修復メモが付く', () => {
      const doc = makeMinimalDoc();
      const kuukanId = '018f0000-0000-7000-8000-000000000020';
      const itemId = '018f0000-0000-7000-8000-000000000001';
      doc.membership.kuukans.push({ id: kuukanId, name: '部屋', owner: null, areaLabel: '床' });
      doc.drawing.kuukans.push({
        kuukan: kuukanId,
        outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
        aspect: 1,
      });
      doc.membership.items.push({ id: itemId, name: '本', place: kuukanId });
      doc.drawing.items.push({
        item: itemId,
        shape: { type: 'rect', x: 0, y: 0, w: 0, h: 0 } as any,
        rotation: 0,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'itemDrawingInvalid')).toBe(true);
        expect(res.doc.drawing.items.length).toBe(0);
        const item = res.doc.membership.items.find(x => x.id === itemId)!;
        expect(item.notices?.[0]?.text).toBe(NOTICE_TEXTS.itemDrawingInvalid);
      }
    });

    it('drawingDropped: 参照先がない描画は外れ、修復メモは付かない', () => {
      const doc = makeMinimalDoc();
      doc.drawing.items.push({
        item: '018f0000-0000-7000-8000-000000000099',
        shape: { type: 'point', at: [100, 100] },
        rotation: 0,
      });
      const ctx = createDeterministicContext();
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('repair');
      if (res.kind === 'repair') {
        expect(res.repairs.some(r => r.code === 'drawingDropped')).toBe(true);
        expect(res.doc.drawing.items.length).toBe(0);
      }
    });
  });

  it('仮ID：new:電池 のモノ、それを参照する描画、new:箱 のクウカンを置き場にするモノがすべて同じ新IDに変わる', () => {
    const doc = makeMinimalDoc();
    const kuukanId = 'new:箱';
    const itemId = 'new:電池';

    doc.membership.kuukans.push({ id: kuukanId, name: '箱', owner: null, areaLabel: '段' });
    doc.drawing.kuukans.push({
      kuukan: kuukanId,
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    });
    doc.membership.items.push({ id: itemId, name: '単3電池', place: kuukanId });
    doc.drawing.items.push({
      item: itemId,
      shape: { type: 'point', at: [1000, 1000] },
      rotation: 0,
    });

    const ctx = createDeterministicContext();
    const res = analyzeDocument(doc, ctx);
    expect(res.kind).toBe('repair');
    if (res.kind === 'repair') {
      const newKuukan = res.doc.membership.kuukans.find(k => k.id !== NIL_ID)!;
      const newItem = res.doc.membership.items[0]!;
      const newKuukanDrawing = res.doc.drawing.kuukans[0]!;
      const newItemDrawing = res.doc.drawing.items[0]!;

      expect(newKuukan.id).toMatch(/^018f0000-0000-7000-8000-/);
      expect(newItem.id).toMatch(/^018f0000-0000-7000-8000-/);
      expect(newKuukanDrawing.kuukan).toBe(newKuukan.id);
      expect(newItem.place).toBe(newKuukan.id);
      expect(newItemDrawing.item).toBe(newItem.id);
    }
  });

  it('重複したID：2つのモノが同じID → 両方に新しいID、そのIDを参照していた描画は参照先なしで外れる', () => {
    const doc = makeMinimalDoc();
    const dupId = '018f0000-0000-7000-8000-0000000000aa';
    doc.membership.items.push(
      { id: dupId, name: 'アイテム1', place: NIL_ID },
      { id: dupId, name: 'アイテム2', place: NIL_ID }
    );
    doc.drawing.items.push({
      item: dupId,
      shape: { type: 'point', at: [100, 100] },
      rotation: 0,
    });
    const ctx = createDeterministicContext();
    const res = analyzeDocument(doc, ctx);
    expect(res.kind).toBe('repair');
    if (res.kind === 'repair') {
      const [it1, it2] = res.doc.membership.items;
      expect(it1!.id).not.toBe(dupId);
      expect(it2!.id).not.toBe(dupId);
      expect(res.doc.drawing.items.length).toBe(0);
      expect(res.repairs.some(r => r.code === 'drawingDropped')).toBe(true);
    }
  });

  describe('拒絶（refused）', () => {
    const ctx = createDeterministicContext();

    it('JSON でない', () => {
      const res = analyzeDocument('{ invalid json', ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('notJson');
      }
    });

    it('app が違う', () => {
      const doc = makeMinimalDoc();
      doc.app = 'other_app';
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('notArekoko');
      }
    });

    it('schemaVersion が 2', () => {
      const doc = makeMinimalDoc();
      doc.schemaVersion = 2;
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('newerVersion');
      }
    });

    it('membership.items[0].name がない（path が出る）', () => {
      const doc = makeMinimalDoc();
      doc.membership.items.push({
        id: '018f0000-0000-7000-8000-000000000001',
        place: NIL_ID,
      });
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons.some(r => r.code === 'schema' && r.path?.startsWith('/membership/items/0'))).toBe(true);
      }
    });

    it('カテゴリの輪', () => {
      const doc = makeMinimalDoc();
      const c1 = '018f0000-0000-7000-8000-000000000011';
      const c2 = '018f0000-0000-7000-8000-000000000012';
      doc.membership.categories.push(
        { id: c1, name: '家電', parent: c2 },
        { id: c2, name: '台所', parent: c1 }
      );
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('cycleCategory');
        expect(res.reasons[0]?.message).toContain('カテゴリの親子関係が輪になっています');
      }
    });

    it('エリアの輪', () => {
      const doc = makeMinimalDoc();
      const kId = '018f0000-0000-7000-8000-000000000020';
      const a1 = '018f0000-0000-7000-8000-000000000031';
      const a2 = '018f0000-0000-7000-8000-000000000032';
      doc.membership.kuukans.push({ id: kId, name: '部屋', owner: null, areaLabel: '床' });
      doc.membership.areas.push(
        { id: a1, kuukan: kId, name: 'エリア1', parent: a2 },
        { id: a2, kuukan: kId, name: 'エリア2', parent: a1 }
      );
      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('cycleArea');
        expect(res.reasons[0]?.message).toContain('エリアの親子関係が輪になっています');
      }
    });

    it('入れ子の輪（箱A の中に箱B、箱B の中に箱A）', () => {
      const doc = makeMinimalDoc();
      const boxA = '018f0000-0000-7000-8000-000000000001';
      const boxB = '018f0000-0000-7000-8000-000000000002';
      const kA = '018f0000-0000-7000-8000-000000000021';
      const kB = '018f0000-0000-7000-8000-000000000022';

      doc.membership.kuukans.push(
        { id: kA, owner: boxA, areaLabel: '段' },
        { id: kB, owner: boxB, areaLabel: '段' }
      );
      doc.membership.items.push(
        { id: boxA, name: '箱A', place: kB },
        { id: boxB, name: '箱B', place: kA }
      );

      const res = analyzeDocument(doc, ctx);
      expect(res.kind).toBe('refused');
      if (res.kind === 'refused') {
        expect(res.reasons[0]?.code).toBe('cycleNesting');
        expect(res.reasons[0]?.message).toContain('収納の入れ子が輪になっています');
      }
    });
  });

  it('描画の層の schema 違反（rotation が 9）→ 断らずに、その描画だけ外れる', () => {
    const doc = makeMinimalDoc();
    const kId = '018f0000-0000-7000-8000-000000000020';
    const itemId = '018f0000-0000-7000-8000-000000000001';
    doc.membership.kuukans.push({ id: kId, name: '部屋', owner: null, areaLabel: '床' });
    doc.drawing.kuukans.push({
      kuukan: kId,
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    });
    doc.membership.items.push({ id: itemId, name: '本', place: kId });
    doc.drawing.items.push({
      item: itemId,
      shape: { type: 'point', at: [100, 100] },
      rotation: 9 as any,
    });

    const ctx = createDeterministicContext();
    const res = analyzeDocument(doc, ctx);
    expect(res.kind).toBe('repair');
    if (res.kind === 'repair') {
      expect(res.doc.drawing.items.length).toBe(0);
      expect(res.repairs.some(r => r.code === 'itemDrawingInvalid')).toBe(true);
      expect(res.doc.membership.items[0]?.notices?.[0]?.text).toBe(NOTICE_TEXTS.itemDrawingInvalid);
    }
  });

  it('未知の項目が残る', () => {
    const doc = makeMinimalDoc();
    doc.customMeta = 'preserved_top_level';
    doc.membership.items.push({
      id: '018f0000-0000-7000-8000-000000000001',
      name: '本',
      place: NIL_ID,
      customProperty: 42,
    });
    const ctx = createDeterministicContext();
    const res = analyzeDocument(doc, ctx);
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect((res.doc as any).customMeta).toBe('preserved_top_level');
      expect((res.doc.membership.items[0] as any).customProperty).toBe(42);
    }
  });
});
