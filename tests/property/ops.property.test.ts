import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createEmptyDocument } from '../../src/core/document';
import { History } from '../../src/core/history';
import { validateDocument } from '../../src/core/validate';
import { serializeDocument } from '../../src/core/serialize';
import { analyzeDocument, type LoadContext } from '../../src/core/load';
import {
  applyOp,
  createPropertyTestContext,
  opsListArbitrary,
  type OpCommand,
} from './arbitraries';

describe('ops.property.test: 操作のランダム検査（モデルなし）', () => {
  it('操作の列を実行し、各操作後に不変条件と書き出し往復が保たれる', () => {
    fc.assert(
      fc.property(opsListArbitrary(60), (ops: OpCommand[]) => {
        let doc = createEmptyDocument();
        const history = new History();
        const ctx = createPropertyTestContext();
        const loadCtx: LoadContext = {
          newId: ctx.newId,
          now: ctx.now,
        };

        for (const op of ops) {
          const res = applyOp(doc, history, op, ctx);
          doc = res.doc;

          // 1操作ごとに不変条件を検証
          const violations = validateDocument(doc);
          expect(violations).toEqual([]);

          // 1操作ごとにシリアライズ往復を検証
          const serialized = serializeDocument(doc);
          const roundtrip = analyzeDocument(serialized, loadCtx);
          expect(roundtrip.kind).toBe('ok');
          if (roundtrip.kind === 'ok') {
            expect(roundtrip.doc).toEqual(doc);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
