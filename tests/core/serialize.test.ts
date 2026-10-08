import { describe, expect, it } from 'vitest';
import { serializeDocument, SerializeError } from '../../src/core/serialize';
import { createSampleDocument } from '../helpers/fixtures';

describe('serializeDocument', () => {
  it('正常な文書を改行・空白なしの JSON 文字列として書き出す', () => {
    const doc = createSampleDocument();
    const json = serializeDocument(doc);

    expect(typeof json).toBe('string');
    expect(json).not.toContain('\n');
    expect(json).not.toContain('\r');

    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('arekoko');
    expect(parsed.membership.items.length).toBe(doc.membership.items.length);
  });

  it('違反がある文書では SerializeError を投げる', () => {
    const doc = createSampleDocument();
    doc.membership.items[0]!.id = 'invalid-id';

    expect(() => serializeDocument(doc)).toThrow(SerializeError);

    try {
      serializeDocument(doc);
    } catch (err) {
      expect(err).toBeInstanceOf(SerializeError);
      const serErr = err as SerializeError;
      expect(serErr.violations.length).toBeGreaterThan(0);
      expect(serErr.violations.some(v => v.code === 'invalidId')).toBe(true);
    }
  });
});
