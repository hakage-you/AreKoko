import { describe, it, expect } from 'vitest';
import { scenarioDocument } from '../../src/app/memoryDeps';
import { validateDocument } from '../../src/core/validate';

describe('scenarioDocument', () => {
  it('見本の文書は不変条件を満たす', () => {
    expect(validateDocument(scenarioDocument())).toEqual([]);
  });
});
