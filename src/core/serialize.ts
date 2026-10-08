// 書き出し。設計 6.1、詳細設計 6章、付録A.9。

import type { ArekokoDocument } from './types';
import { validateDocument, type Violation } from './validate';

export class SerializeError extends Error {
  violations: Violation[];

  constructor(violations: Violation[]) {
    super(`文書に不変条件の違反があります: ${violations.map(v => v.code).join(', ')}`);
    this.name = 'SerializeError';
    this.violations = violations;
  }
}

/**
 * 文書を書き出す。不変条件を検証し、改行・空白なしの JSON 文字列を返す。
 * 違反があれば SerializeError を投げる。
 */
export function serializeDocument(doc: ArekokoDocument): string {
  const violations = validateDocument(doc);
  if (violations.length > 0) {
    throw new SerializeError(violations);
  }
  return JSON.stringify(doc);
}
