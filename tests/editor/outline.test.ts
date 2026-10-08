import { describe, it, expect } from 'vitest';
import type { Point } from '../../src/core/types';
import { moveEdge, addStep, edgeAt, reframeDraft } from '../../src/editor/outline';
import { newDraft } from '../../src/editor/draft';
import { splitAt } from '../../src/core/ops/areas';
import { createTestContext, deepFreeze } from '../helpers/ctx';

describe('outline', () => {
  const rect: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  const lShape: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 5500],
    [6000, 5500],
    [6000, 10000],
    [0, 10000],
  ];

  describe('moveEdge', () => {
    it('長方形の右の辺を外へ動かす', () => {
      const res = moveEdge(deepFreeze([...rect]), 1, 2000);
      expect(res).not.toBeNull();
      expect(res).toEqual([
        [0, 0],
        [12000, 0],
        [12000, 10000],
        [0, 10000],
      ]);
    });

    it('長方形の右の辺を内へ動かす', () => {
      const res = moveEdge(deepFreeze([...rect]), 1, -2000);
      expect(res).not.toBeNull();
      expect(res).toEqual([
        [0, 0],
        [8000, 0],
        [8000, 10000],
        [0, 10000],
      ]);
    });

    it('L字の内側の辺を動かす', () => {
      // 辺2: (10000, 5500) -> (6000, 5500) は横の辺。y を -1000 動かす
      const res = moveEdge(deepFreeze([...lShape]), 2, -1000);
      expect(res).not.toBeNull();
      expect(res).toEqual([
        [0, 0],
        [10000, 0],
        [10000, 4500],
        [6000, 4500],
        [6000, 10000],
        [0, 10000],
      ]);
    });

    it('辺の長さが0になる動きは null を返す', () => {
      const res = moveEdge(deepFreeze([...rect]), 1, -10000);
      expect(res).toBeNull();
    });

    it('自己交差する動きは null を返す', () => {
      const res = moveEdge(deepFreeze([...rect]), 1, -12000);
      expect(res).toBeNull();
    });
  });

  describe('addStep', () => {
    it('上の辺に凹みを足す（例の座標）', () => {
      // 辺0: (0,0) -> (10000,0) を at=4000, side='end', depth=3000
      const res = addStep(deepFreeze([...rect]), 0, 4000, 3000, 'end');
      expect(res).not.toBeNull();
      expect(res).toEqual([
        [0, 0],
        [4000, 0],
        [4000, 3000],
        [10000, 3000],
        [10000, 10000],
        [0, 10000],
      ]);
    });

    it('上の辺に凸（外へ）を足す', () => {
      const res = addStep(deepFreeze([...rect]), 0, 4000, -3000, 'end');
      expect(res).not.toBeNull();
      expect(res).toEqual([
        [4000, -3000],
        [10000, -3000],
        [10000, 10000],
        [0, 10000],
        [0, 0],
        [4000, 0],
      ]);
    });

    it('端の位置の指定は null を返す', () => {
      expect(addStep(deepFreeze([...rect]), 0, 0, 3000, 'end')).toBeNull();
      expect(addStep(deepFreeze([...rect]), 0, 10000, 3000, 'end')).toBeNull();
    });

    it('段差が反対の辺に届く（交差・接触）場合は null を返す', () => {
      // 下の辺は y=10000 なので depth=10000 や 12000 は null
      expect(addStep(deepFreeze([...rect]), 0, 4000, 10000, 'end')).toBeNull();
      expect(addStep(deepFreeze([...rect]), 0, 4000, 12000, 'end')).toBeNull();
    });
  });

  describe('edgeAt', () => {
    it('点に最も近い辺の番号を返す', () => {
      expect(edgeAt(deepFreeze([...rect]), [5000, 100], 200)).toBe(0);
      expect(edgeAt(deepFreeze([...rect]), [9900, 5000], 200)).toBe(1);
      expect(edgeAt(deepFreeze([...rect]), [5000, 5000], 200)).toBeNull();
    });
  });

  describe('reframeDraft', () => {
    it('右へ広げたとき、外形が 0〜10000 に付け直され aspect・realSize・仕切り・マーカーが写る', () => {
      const ctx = createTestContext();
      let draft = newDraft({ name: '部屋' }, ctx);
      // realSize を設定
      draft.doc.drawing.kuukans[0]!.realSize = { w: 100, d: 100 };
      draft.doc.drawing.kuukans[0]!.aspect = 1;
      // 仕切り（x = 5000）を足す
      draft.doc = splitAt(draft.doc, draft.kuukan, 'x', [5000, 5000], ctx).doc;
      // マーカーを足す
      draft.doc.drawing.markers.push({
        id: ctx.newId(),
        kuukan: draft.kuukan,
        name: '目印',
        shape: { type: 'point', at: [5000, 5000] },
        rotation: 0,
        notAPlace: false,
      });

      deepFreeze(draft.doc);

      // 右へ 5000 広げた外形（x が 0〜15000、y が 0〜10000）
      const newOutline: Point[] = [
        [0, 0],
        [15000, 0],
        [15000, 10000],
        [0, 10000],
      ];

      const reframed = reframeDraft(draft, newOutline);
      expect('error' in reframed).toBe(false);
      if ('error' in reframed) return;

      const kd = reframed.doc.drawing.kuukans[0]!;
      expect(kd.outline).toEqual(rect);
      expect(kd.aspect).toBeCloseTo(1.5);
      expect(kd.realSize?.w).toBe(150);
      expect(kd.realSize?.d).toBe(100);

      // 仕切りの at は 5000 * 10000 / 15000 = 3333
      const partition = reframed.doc.drawing.partitions[0]!;
      expect(partition.at).toEqual([3333]);
      expect(partition.seed).toEqual([3333, 5000]);

      // マーカーの at も写る
      const marker = reframed.doc.drawing.markers[0]!;
      expect(marker.shape).toEqual({ type: 'point', at: [3333, 5000] });
    });

    it('縮める場合も正しく写る', () => {
      const ctx = createTestContext();
      let draft = newDraft({ name: '部屋' }, ctx);
      draft.doc.drawing.kuukans[0]!.realSize = { w: 100, d: 100 };
      draft.doc.drawing.kuukans[0]!.aspect = 1;

      // x が 0〜5000 に縮んだ外形
      const newOutline: Point[] = [
        [0, 0],
        [5000, 0],
        [5000, 10000],
        [0, 10000],
      ];

      const reframed = reframeDraft(draft, newOutline);
      expect('error' in reframed).toBe(false);
      if ('error' in reframed) return;

      const kd = reframed.doc.drawing.kuukans[0]!;
      expect(kd.outline).toEqual(rect);
      expect(kd.aspect).toBeCloseTo(0.5);
      expect(kd.realSize?.w).toBe(50);
      expect(kd.realSize?.d).toBe(100);
    });

    it('不正な外形は error を返す', () => {
      const ctx = createTestContext();
      const draft = newDraft({ name: '部屋' }, ctx);
      // 自己交差する外形
      const invalidOutline: Point[] = [
        [0, 0],
        [10000, 10000],
        [10000, 0],
        [0, 10000],
      ];
      const res = reframeDraft(draft, invalidOutline);
      expect('error' in res).toBe(true);
    });
  });
});
