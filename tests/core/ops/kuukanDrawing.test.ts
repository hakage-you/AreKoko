import { describe, it, expect } from 'vitest';
import type { ArekokoDocument, Id, Point, RealSize } from '../../../src/core/types';
import { NIL_ID } from '../../../src/core/constants';
import { OpError } from '../../../src/core/ops/common';
import { validateDocument } from '../../../src/core/validate';
import { createBaseDoc, createTestContext, deepFreeze } from '../../helpers/ctx';
import { splitAt } from '../../../src/core/ops/areas';
import { addMarker } from '../../../src/core/ops/markers';
import {
  stretchKuukan,
  setRealSize,
} from '../../../src/core/ops/kuukanDrawing';

describe('kuukanDrawing ops', () => {
  const rectOutline: Point[] = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];

  function createDocWithDrawing(kuukanId: Id, opts?: { aspect?: number; realSize?: RealSize }): ArekokoDocument {
    const base = createBaseDoc();
    return {
      ...base,
      membership: {
        ...base.membership,
        kuukans: [
          ...base.membership.kuukans,
          {
            id: kuukanId,
            name: '部屋A',
            owner: null,
            areaLabel: '床',
          },
        ],
      },
      drawing: {
        ...base.drawing,
        kuukans: [
          {
            kuukan: kuukanId,
            outline: rectOutline,
            aspect: opts?.aspect ?? 1.333,
            ...(opts?.realSize ? { realSize: opts.realSize } : {}),
          },
        ],
      },
    };
  }

  describe('stretchKuukan', () => {
    it('x・y軸の伸び縮みで aspect と realSize が正しく更新される（realSize があるとき・ないとき）', () => {
      const kId = '01920000-0000-7000-8000-000000000010';

      // realSize があるとき
      const docWithReal = deepFreeze(
        createDocWithDrawing(kId, { aspect: 1.5, realSize: { w: 300, d: 200 } }),
      );

      // x 方向：aspect × factor、w × factor（小数第1位）
      const resX = stretchKuukan(docWithReal, kId, { axis: 'x', factor: 1.5 });
      expect(validateDocument(resX.doc)).toEqual([]);
      const kdX = resX.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdX.aspect).toBe(2.25);
      expect(kdX.realSize).toEqual({ w: 450, d: 200 });

      // y 方向：aspect ÷ factor、d × factor（小数第1位）
      const resY = stretchKuukan(docWithReal, kId, { axis: 'y', factor: 2 });
      expect(validateDocument(resY.doc)).toEqual([]);
      const kdY = resY.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdY.aspect).toBe(0.75);
      expect(kdY.realSize).toEqual({ w: 300, d: 400 });

      // realSize がないとき
      const docWithoutReal = deepFreeze(createDocWithDrawing(kId, { aspect: 2.0 }));
      const resNoReal = stretchKuukan(docWithoutReal, kId, { axis: 'x', factor: 1.25 });
      expect(validateDocument(resNoReal.doc)).toEqual([]);
      const kdNoReal = resNoReal.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdNoReal.aspect).toBe(2.5);
      expect(kdNoReal.realSize).toBeUndefined();
    });

    it('比率の座標（外形・仕切り・マーカー）が変わらないこと', () => {
      const ctx = createTestContext();
      const kId = '01920000-0000-7000-8000-000000000010';
      let doc = deepFreeze(
        createDocWithDrawing(kId, { aspect: 1.0, realSize: { w: 400, d: 400 } }),
      );

      // 仕切りを追加
      const splitRes = splitAt(doc, kId, 'x', [5000, 5000], ctx);
      doc = deepFreeze(splitRes.doc);

      // マーカーを追加
      const markerRes = addMarker(
        doc,
        kId,
        { name: 'ドア', shape: { type: 'rect', x: 1000, y: 2000, w: 800, h: 400 } },
        ctx,
      );
      doc = deepFreeze(markerRes.doc);

      const beforeKd = doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      const beforePartitions = doc.drawing.partitions;
      const beforeMarkers = doc.drawing.markers;

      // 伸び縮みを実行
      const stretchRes = stretchKuukan(doc, kId, { axis: 'x', factor: 1.5 });
      expect(validateDocument(stretchRes.doc)).toEqual([]);

      const afterKd = stretchRes.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(afterKd.outline).toEqual(beforeKd.outline);
      expect(stretchRes.doc.drawing.partitions).toEqual(beforePartitions);
      expect(stretchRes.doc.drawing.markers).toEqual(beforeMarkers);
    });

    it('描画のないクウカンで OpError(noDrawing)', () => {
      const base = createBaseDoc();
      const noDrawingId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze({
        ...base,
        membership: {
          ...base.membership,
          kuukans: [
            ...base.membership.kuukans,
            { id: noDrawingId, name: '描画なし', owner: null, areaLabel: '床' },
          ],
        },
      });

      expect(() => stretchKuukan(doc, noDrawingId, { axis: 'x', factor: 1.5 })).toThrowError(
        OpError,
      );
      try {
        stretchKuukan(doc, noDrawingId, { axis: 'x', factor: 1.5 });
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }

      // 未設定
      expect(() => stretchKuukan(doc, NIL_ID, { axis: 'x', factor: 1.5 })).toThrowError(OpError);
      try {
        stretchKuukan(doc, NIL_ID, { axis: 'x', factor: 1.5 });
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }
    });

    it('倍率が 0 または負で OpError(invalidInput)', () => {
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      expect(() => stretchKuukan(doc, kId, { axis: 'x', factor: 0 })).toThrowError(OpError);
      expect(() => stretchKuukan(doc, kId, { axis: 'x', factor: -1 })).toThrowError(OpError);
    });
  });

  describe('setRealSize', () => {
    it('両方指定で aspect = w / d、片方指定で aspect そのまま、undefined の項目は消える', () => {
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(
        createDocWithDrawing(kId, { aspect: 1.333, realSize: { w: 400, d: 300 } }),
      );

      // 両方指定：aspect = w / d
      const resBoth = setRealSize(doc, kId, { w: 600, d: 300 });
      expect(validateDocument(resBoth.doc)).toEqual([]);
      const kdBoth = resBoth.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdBoth.aspect).toBe(2.0);
      expect(kdBoth.realSize).toEqual({ w: 600, d: 300 });

      // 片方（w のみ）：aspect は変わらず、d は消える
      const resWOnly = setRealSize(doc, kId, { w: 500 });
      expect(validateDocument(resWOnly.doc)).toEqual([]);
      const kdWOnly = resWOnly.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdWOnly.aspect).toBe(1.333);
      expect(kdWOnly.realSize).toEqual({ w: 500 });
      expect('d' in (kdWOnly.realSize ?? {})).toBe(false);

      // 片方（d のみ）：aspect は変わらず、w は消える
      const resDOnly = setRealSize(doc, kId, { d: 250 });
      expect(validateDocument(resDOnly.doc)).toEqual([]);
      const kdDOnly = resDOnly.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdDOnly.aspect).toBe(1.333);
      expect(kdDOnly.realSize).toEqual({ d: 250 });
      expect('w' in (kdDOnly.realSize ?? {})).toBe(false);

      // 空のオブジェクト：realSize のキーごと消え、aspect はそのまま
      const resNone = setRealSize(doc, kId, {});
      expect(validateDocument(resNone.doc)).toEqual([]);
      const kdNone = resNone.doc.drawing.kuukans.find(k => k.kuukan === kId)!;
      expect(kdNone.aspect).toBe(1.333);
      expect('realSize' in kdNone).toBe(false);
    });

    it('0 や負で OpError(invalidInput)', () => {
      const kId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze(createDocWithDrawing(kId));

      expect(() => setRealSize(doc, kId, { w: 0 })).toThrowError(OpError);
      try {
        setRealSize(doc, kId, { w: 0 });
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }

      expect(() => setRealSize(doc, kId, { d: -10 })).toThrowError(OpError);
      try {
        setRealSize(doc, kId, { d: -10 });
      } catch (e) {
        expect((e as OpError).code).toBe('invalidInput');
      }
    });

    it('描画のないクウカンで OpError(noDrawing)', () => {
      const base = createBaseDoc();
      const noDrawingId = '01920000-0000-7000-8000-000000000010';
      const doc = deepFreeze({
        ...base,
        membership: {
          ...base.membership,
          kuukans: [
            ...base.membership.kuukans,
            { id: noDrawingId, name: '描画なし', owner: null, areaLabel: '床' },
          ],
        },
      });

      expect(() => setRealSize(doc, noDrawingId, { w: 100 })).toThrowError(OpError);
      try {
        setRealSize(doc, noDrawingId, { w: 100 });
      } catch (e) {
        expect((e as OpError).code).toBe('noDrawing');
      }
    });
  });
});
