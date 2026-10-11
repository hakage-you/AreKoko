import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ArekokoDocument, Id, Point } from '../../src/core/types';
import { createEmptyDocument } from '../../src/core/document';
import { History } from '../../src/core/history';
import { validateDocument, validateKuukanDrawing } from '../../src/core/validate';
import { serializeDocument } from '../../src/core/serialize';
import { analyzeDocument } from '../../src/core/load';
import { buildAreaTree } from '../../src/core/indexes';
import { createKuukan } from '../../src/core/ops/kuukans';
import { addItem } from '../../src/core/ops/items';
import { attachOutline } from '../../src/core/ops/areas';
import { polygonArea } from '../../src/geometry/polygon';
import { applyOp, createPropertyTestContext, type OpCommand, type OpType } from './arbitraries';

// 仕切りの操作に偏らせたランダム検査。描画のあるクウカン（長方形・L字・コの字）から始めるので、
// 線を入れる・消す・動かす操作が空振りしにくい。

const OUTLINES: Point[][] = [
  [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
  [[0, 0], [10000, 0], [10000, 5000], [5000, 5000], [5000, 10000], [0, 10000]],
  [[0, 0], [10000, 0], [10000, 10000], [7000, 10000], [7000, 3000], [3000, 3000], [3000, 10000], [0, 10000]],
];

function initialDoc(ctx: ReturnType<typeof createPropertyTestContext>): ArekokoDocument {
  let doc = createEmptyDocument();
  OUTLINES.forEach((outline, i) => {
    const k = createKuukan(doc, { name: `部屋${i + 1}`, areaLabel: '床' }, ctx);
    doc = attachOutline(k.doc, k.created[0]!, { outline, aspect: 1.5 }, ctx).doc;
    doc = addItem(doc, { name: `モノ${i + 1}`, place: k.created[0]! }, ctx).doc;
  });
  return doc;
}

const WEIGHTS: Array<[OpType, number]> = [
  ['splitAt', 6],
  ['splitEven', 3],
  ['deleteLine', 3],
  ['moveLine', 4],
  ['addItem', 3],
  ['moveItems', 3],
  ['deleteItems', 1],
  ['undo', 2],
  ['redo', 1],
];

const geometryOps = fc.array(
  fc.record({
    type: fc.oneof(...WEIGHTS.map(([type, weight]) => ({ arbitrary: fc.constant(type), weight }))),
    seed1: fc.nat(),
    seed2: fc.nat(),
    seed3: fc.nat(),
  }),
  { minLength: 10, maxLength: 60, size: 'max' },
);

/** 分けていないエリアの面積の合計が、外形の面積に等しい（領域がすき間なく分かれている）。 */
function leafAreasCoverOutline(doc: ArekokoDocument): void {
  for (const kd of doc.drawing.kuukans) {
    const res = validateKuukanDrawing(doc, kd.kuukan);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const tree = buildAreaTree(doc, kd.kuukan);
    const nodes: Id[] = [kd.kuukan, ...[...tree.children.values()].flat()];
    const leaves = nodes.filter(n => (tree.children.get(n)?.length ?? 0) === 0);
    const sum = leaves.reduce((acc, n) => acc + polygonArea(res.regions.get(n)!), 0);
    expect(sum).toBe(polygonArea(kd.outline));
  }
}

describe('geometry.property.test: 仕切りに偏った操作のランダム検査', () => {
  it('各操作の後に、不変条件・書き出しの往復・領域の面積が保たれる', () => {
    fc.assert(
      fc.property(geometryOps, (ops: OpCommand[]) => {
        const ctx = createPropertyTestContext();
        let doc = initialDoc(ctx);
        const history = new History();
        for (const op of ops) {
          doc = applyOp(doc, history, op, ctx).doc;
          expect(validateDocument(doc)).toEqual([]);
          leafAreasCoverOutline(doc);
          const roundtrip = analyzeDocument(serializeDocument(doc), ctx);
          expect(roundtrip.kind).toBe('ok');
          if (roundtrip.kind === 'ok') expect(roundtrip.doc).toEqual(doc);
        }
      }),
      { numRuns: 100 },
    );
  });
});
