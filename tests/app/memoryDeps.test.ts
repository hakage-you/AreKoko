import { describe, it, expect } from 'vitest';
import { sampleDocument } from '../../src/app/memoryDeps';
import { validateDocument } from '../../src/core/validate';

describe('sampleDocument', () => {
  it('見本の文書は不変条件を満たす', () => {
    expect(validateDocument(sampleDocument())).toEqual([]);
  });
});
