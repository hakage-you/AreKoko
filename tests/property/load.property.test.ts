import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateDocument } from '../../src/core/validate';
import { serializeDocument } from '../../src/core/serialize';
import { analyzeDocument, type LoadContext } from '../../src/core/load';
import {
  applyOps,
  corruptDocument,
  corruptionsListArbitrary,
  createPropertyTestContext,
  opsListArbitrary,
  type CorruptionSpec,
  type OpCommand,
} from './arbitraries';

describe('load.property.test: 読み込みと修復のランダム検査（壊す方向）', () => {
  it('正しい文書をランダムに壊して読み込み、ok/repair（validateDocument通過・再往復ok）または refused となる', () => {
    fc.assert(
      fc.property(
        opsListArbitrary(25),
        corruptionsListArbitrary(5),
        (ops: OpCommand[], corruptions: CorruptionSpec[]) => {
          // 1. 操作列を適用して正しい文書を構築
          const { doc: validDoc } = applyOps(ops);

          // 2. 作成した文書を JSON にしてランダムに壊す
          const corruptedRaw = corruptDocument(validDoc, corruptions);
          const corruptedJson = JSON.stringify(corruptedRaw);

          // 3. analyzeDocument で検査・修復
          const ctx = createPropertyTestContext();
          const loadCtx: LoadContext = {
            newId: ctx.newId,
            now: ctx.now,
          };

          let res;
          try {
            res = analyzeDocument(corruptedJson, loadCtx);
          } catch (e) {
            expect.fail(`analyzeDocument は例外を投げてはならない: ${e}`);
            return;
          }

          // 4. 結果の検証
          if (res.kind === 'refused') {
            expect(res.reasons.length).toBeGreaterThan(0);
          } else {
            // kind: 'ok' または 'repair'
            // doc が validateDocument を通る
            const violations = validateDocument(res.doc);
            expect(violations).toEqual([]);

            // もう一度 serialize -> analyze すると 'ok'（修復は1回で終わる）
            const serialized = serializeDocument(res.doc);
            const secondRes = analyzeDocument(serialized, loadCtx);
            expect(secondRes.kind).toBe('ok');
            if (secondRes.kind === 'ok') {
              expect(secondRes.doc).toEqual(res.doc);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
