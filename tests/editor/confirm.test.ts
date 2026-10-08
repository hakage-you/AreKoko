import { setDraftOutline } from '../../src/editor/draft';
import { moveEdge } from '../../src/editor/outline';
import { addItem } from '../../src/core/ops/items';
import { attachOutline, splitEven, deleteLine } from '../../src/core/ops/areas';
import { createKuukan } from '../../src/core/ops/kuukans';
import { createEmptyDocument } from '../../src/core/document';
import { describe, it, expect } from 'vitest';
import {
  confirmModes,
  planConfirm,
  confirmDraft,
} from '../../src/editor/confirm';
import {
  newDraft,
  templateDraft,
  storageDraft,
  duplicateDraft,
  removeDraftOutline,
} from '../../src/editor/draft';
import { validateDocument } from '../../src/core/validate';
import { createTestContext, deepFreeze } from '../helpers/ctx';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';

describe('confirm', () => {
  it('confirmModes の判定', () => {
    const ctx = createTestContext();
    const doc = createSampleDocument();
    deepFreeze(doc);

    expect(confirmModes(newDraft({ name: '部屋' }, ctx))).toEqual(['create']);
    expect(confirmModes(templateDraft('room6', ctx))).toEqual(['create']);
    expect(confirmModes(storageDraft(doc, FIXTURE_IDS.battery, ctx))).toEqual(['create']);
    expect(confirmModes(duplicateDraft(doc, FIXTURE_IDS.shelfKuukan, ctx))).toEqual(['keep', 'replace']);
  });

  describe('confirm create', () => {
    it('newDraft を確定すると文書に追加され validateDocument を通る', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = newDraft({ name: '新しい部屋' }, ctx);

      const res = confirmDraft(doc, draft, 'create', ctx);
      expect(res.created).toEqual([draft.kuukan]);
      expect(res.doc.membership.kuukans.some(k => k.id === draft.kuukan)).toBe(true);
      expect(validateDocument(res.doc)).toEqual([]);
    });

    it('templateDraft を確定すると文書に追加され validateDocument を通る', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = templateDraft('shelf3', ctx);

      const res = confirmDraft(doc, draft, 'create', ctx);
      expect(res.created).toEqual([draft.kuukan]);
      expect(validateDocument(res.doc)).toEqual([]);
    });

    it('storageDraft を確定するとモノの収納として追加される', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = storageDraft(doc, FIXTURE_IDS.battery, ctx);

      const res = confirmDraft(doc, draft, 'create', ctx);
      const createdKuukan = res.doc.membership.kuukans.find(k => k.id === draft.kuukan)!;
      expect(createdKuukan.owner).toBe(FIXTURE_IDS.battery);
      expect(createdKuukan.name).toBeUndefined();
      expect(validateDocument(res.doc)).toEqual([]);
    });

    it('外形を外した storageDraft を確定すると描画なしの収納になる', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      let draft = storageDraft(doc, FIXTURE_IDS.battery, ctx);
      const removed = removeDraftOutline(draft);
      if ('error' in removed) throw new Error('error');

      const res = confirmDraft(doc, removed, 'create', ctx);
      const createdKuukan = res.doc.membership.kuukans.find(k => k.id === draft.kuukan)!;
      expect(createdKuukan.owner).toBe(FIXTURE_IDS.battery);
      expect(res.doc.drawing.kuukans.some(k => k.kuukan === draft.kuukan)).toBe(false);
      expect(validateDocument(res.doc)).toEqual([]);
    });
  });

  describe('confirm keep', () => {
    it('duplicateDraft を keep するとすべてのIDが新しく振り直され収納の複製は owner null で名前つき', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = duplicateDraft(doc, FIXTURE_IDS.shelfKuukan, ctx);

      const res = confirmDraft(doc, draft, 'keep', ctx);
      expect(res.created).toHaveLength(1);
      const newKuukanId = res.created[0]!;
      expect(newKuukanId).not.toBe(FIXTURE_IDS.shelfKuukan);

      const newKuukan = res.doc.membership.kuukans.find(k => k.id === newKuukanId)!;
      expect(newKuukan.owner).toBeNull();
      expect(newKuukan.name).toBe('棚A1のコピー'); // E5：元を残す複製の名前は「〇〇のコピー」

      // 新しいエリアのIDもすべて元と異なり、新クウカンに属する
      const newAreas = res.doc.membership.areas.filter(a => a.kuukan === newKuukanId);
      expect(newAreas).toHaveLength(2);
      expect(newAreas.some(a => a.id === FIXTURE_IDS.dan1)).toBe(false);
      expect(newAreas.some(a => a.id === FIXTURE_IDS.dan2)).toBe(false);

      expect(validateDocument(res.doc)).toEqual([]);
    });
  });

  describe('confirm replace', () => {
    // 描画つきの棚（4段）に、段2・段3 にモノ、段2 のモノに描画。中核の操作で正しく組み立てる。
    function shelfDoc() {
      const ctx = createTestContext();
      let doc = createEmptyDocument();
      const k = createKuukan(doc, { name: '棚', areaLabel: '段' }, ctx);
      doc = k.doc;
      const shelf = k.created[0]!;
      doc = attachOutline(doc, shelf, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 0.5, realSize: { w: 90, d: 180 } }, ctx).doc;
      const sp = splitEven(doc, shelf, 'y', 4, ctx);
      doc = sp.doc;
      const [d1, d2, d3, d4] = sp.created as [string, string, string, string];
      const a = addItem(doc, { name: 'A', place: d2 }, ctx);
      doc = a.doc;
      const b = addItem(doc, { name: 'B', place: d3 }, ctx);
      doc = b.doc;
      doc = { ...doc, drawing: { ...doc.drawing, items: [{ item: a.created[0]!, shape: { type: 'point', at: [5000, 3700] }, rotation: 0 }] } };
      expect(validateDocument(doc)).toEqual([]);
      return { doc: deepFreeze(doc), shelf, d1, d2, d3, d4, itemA: a.created[0]!, itemB: b.created[0]!, ctx };
    }

    it('下書きで消したエリアの中身が祖先へ移り、planConfirm と一致し、残ったエリアのIDとモノの描画は残る', () => {
      const { doc, shelf, d1, d2, d3, d4, itemA, itemB, ctx } = shelfDoc();
      let draft = duplicateDraft(doc, shelf, ctx);
      // 下書きで、段2 と 段3 の間の線を消す（段2・段3 が消え、空の新しいエリアができる）
      draft = { ...draft, doc: deleteLine(draft.doc, shelf, 1, ctx).doc };

      const plan = planConfirm(doc, draft, 'replace');
      expect(new Set(plan.removedAreas)).toEqual(new Set([d2, d3]));
      expect(new Set(plan.relocations.flatMap(r => r.items))).toEqual(new Set([itemA, itemB]));
      expect(plan.relocations.every(r => r.to === shelf)).toBe(true);

      const res = confirmDraft(doc, draft, 'replace', ctx);
      expect(new Set(res.moved)).toEqual(new Set([itemA, itemB]));
      for (const id of [itemA, itemB]) expect(res.doc.membership.items.find(i => i.id === id)!.place).toBe(shelf);
      // 同じクウカンの中の移動なので、モノの描画は残る
      expect(res.doc.drawing.items.some(d => d.item === itemA)).toBe(true);
      // 残ったエリアのIDは同じ（置き換えはIDを引き継ぐ）
      const ids = new Set(res.doc.membership.areas.map(a => a.id));
      expect(ids.has(d1) && ids.has(d4)).toBe(true);
      expect(ids.has(d2) || ids.has(d3)).toBe(false);
      // 修復メモは付かない（アプリ内の操作。設計 6.7）
      expect(res.doc.membership.items.every(i => i.notices === undefined)).toBe(true);
      expect(validateDocument(res.doc)).toEqual([]);
    });

    it('外形を変えて置き換えても、文書は正しく、モノの描画は残る（はみ出しは利用者の責任）', () => {
      const { doc, shelf, itemA, ctx } = shelfDoc();
      const draft = duplicateDraft(doc, shelf, ctx);
      const kd = draft.doc.drawing.kuukans[0]!;
      // 右の辺を外へ広げる（外接長方形が変わり、付け直される）
      const wider = moveEdge(kd.outline, kd.outline.findIndex((p, i) => {
        const q = kd.outline[(i + 1) % kd.outline.length]!;
        return p[0] === 10000 && q[0] === 10000;
      }), 5000)!;
      const next = setDraftOutline(draft, wider);
      expect('error' in next).toBe(false);
      if ('error' in next) return;
      const res = confirmDraft(doc, next, 'replace', ctx);
      expect(res.doc.drawing.items.some(d => d.item === itemA)).toBe(true);
      const newKd = res.doc.drawing.kuukans.find(k => k.kuukan === shelf)!;
      expect(newKd.realSize?.w).toBeCloseTo(135, 1);
      expect(validateDocument(res.doc)).toEqual([]);
    });
  });
});
