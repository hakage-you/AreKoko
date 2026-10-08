import { describe, it, expect } from 'vitest';
import type { Point } from '../../src/core/types';
import {
  newDraft,
  duplicateDraft,
  storageDraft,
  validateDraft,
  setDraftOutline,
  removeDraftOutline,
  addDraftOutline,
} from '../../src/editor/draft';
import { addStep } from '../../src/editor/outline';
import { splitAt } from '../../src/core/ops/areas';
import { createTestContext, deepFreeze } from '../helpers/ctx';
import { createSampleDocument, FIXTURE_IDS } from '../helpers/fixtures';

describe('draft', () => {
  it('newDraft で初期状態の下書きが作成され validateDraft が通る', () => {
    const ctx = createTestContext();
    const draft = newDraft({ name: '新規部屋' }, ctx);
    deepFreeze(draft.doc);

    expect(draft.origin).toEqual({ kind: 'new' });
    expect(draft.doc.membership.kuukans[1]!.name).toBe('新規部屋');
    expect(validateDraft(draft)).toEqual([]);
  });

  describe('setDraftOutline', () => {
    it('仕切りがある下書きで仕切りと矛盾しない広げ方は通る', () => {
      const ctx = createTestContext();
      let draft = newDraft({ name: '部屋' }, ctx);
      draft.doc = splitAt(draft.doc, draft.kuukan, 'x', [5000, 5000], ctx).doc;
      deepFreeze(draft.doc);

      // 右へ広げる
      const wider: Point[] = [
        [0, 0],
        [15000, 0],
        [15000, 10000],
        [0, 10000],
      ];

      const res = setDraftOutline(draft, wider);
      expect('error' in res).toBe(false);
      if ('error' in res) return;
      expect(validateDraft(res)).toEqual([]);
    });

    it('仕切りをまたぐ段差は error（E2）になる', () => {
      const ctx = createTestContext();
      let draft = newDraft({ name: '部屋' }, ctx);
      // x = 5000 に縦の仕切りを入れる
      draft.doc = splitAt(draft.doc, draft.kuukan, 'x', [5000, 5000], ctx).doc;
      deepFreeze(draft.doc);

      // 上の辺で x=4000〜10000 を深さ 6000 凹ませる（仕切りの始点を削る）
      const points = draft.doc.drawing.kuukans[0]!.outline;
      const stepped = addStep(points, 0, 4000, 6000, 'end');
      expect(stepped).not.toBeNull();

      const res = setDraftOutline(draft, stepped!);
      expect('error' in res).toBe(true);
    });
  });

  describe('removeDraftOutline / addDraftOutline', () => {
    it('エリアがある下書きで removeDraftOutline は error', () => {
      const ctx = createTestContext();
      let draft = newDraft({ name: '部屋' }, ctx);
      draft.doc = splitAt(draft.doc, draft.kuukan, 'x', [5000, 5000], ctx).doc;
      deepFreeze(draft.doc);

      const res = removeDraftOutline(draft);
      expect('error' in res).toBe(true);
    });

    it('エリアのない下書きの外形を外し、addDraftOutline で長方形を再付与できる', () => {
      const ctx = createTestContext();
      const draft = newDraft({ name: '部屋' }, ctx);
      deepFreeze(draft.doc);

      const removed = removeDraftOutline(draft);
      expect('error' in removed).toBe(false);
      if ('error' in removed) return;
      expect(removed.doc.drawing.kuukans).toHaveLength(0);

      const added = addDraftOutline(removed);
      expect(added.doc.drawing.kuukans).toHaveLength(1);
      expect(added.doc.drawing.kuukans[0]!.aspect).toBeCloseTo(4 / 3);
    });
  });

  describe('storageDraft', () => {
    it('長方形の描画を持つモノからはその縦横比を取得する', () => {
      const doc = createSampleDocument();
      // shelf (棚A1) に親クウカン roomA 内での描画を与える
      doc.drawing.kuukans.push({
        kuukan: FIXTURE_IDS.roomA,
        outline: [
          [0, 0],
          [10000, 0],
          [10000, 10000],
          [0, 10000],
        ],
        aspect: 2,
      });
      doc.drawing.items.push({
        item: FIXTURE_IDS.battery,
        shape: { type: 'rect', x: 1000, y: 1000, w: 200, h: 100 },
        rotation: 0,
      });
      deepFreeze(doc);

      const ctx = createTestContext();
      // box1Kuukan に描画はないので w / h = 2
      const draft = storageDraft(doc, FIXTURE_IDS.battery, ctx);
      expect(draft.origin).toEqual({ kind: 'storage', item: FIXTURE_IDS.battery });
      expect(draft.doc.drawing.kuukans[0]!.aspect).toBeCloseTo(2);
      expect(validateDraft(draft)).toEqual([]);
    });

    it('描画なしのモノからは標準の長方形 (4/3) になる', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = storageDraft(doc, FIXTURE_IDS.battery, ctx);
      expect(draft.doc.drawing.kuukans[0]!.aspect).toBeCloseTo(4 / 3);
      expect(validateDraft(draft)).toEqual([]);
    });
  });

  describe('duplicateDraft', () => {
    it('元のクウカン情報と仕切りを引き継いで下書きを作成する', () => {
      const doc = createSampleDocument();
      deepFreeze(doc);
      const ctx = createTestContext();
      const draft = duplicateDraft(doc, FIXTURE_IDS.shelfKuukan, ctx);

      expect(draft.origin).toEqual({ kind: 'duplicate', source: FIXTURE_IDS.shelfKuukan });
      expect(draft.kuukan).toBe(FIXTURE_IDS.shelfKuukan);
      expect(draft.doc.membership.areas).toHaveLength(2);
      expect(validateDraft(draft)).toEqual([]);
    });
  });
});
