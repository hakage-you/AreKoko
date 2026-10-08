// 操作の共通の型と関数。付録A.11。

import type { Id, ArekokoDocument } from '../types';

export interface OpContext {
  newId(): Id;
  now(): string;
}

export interface OpResult {
  doc: ArekokoDocument;
  moved: Id[];
  created: Id[];
}

export interface Relocation {
  from: Id;
  to: Id;
  items: Id[];
}

export type OpErrorCode =
  | 'notFound'
  | 'invalidPlace'
  | 'cycle'
  | 'reserved'
  | 'alreadyStorage'
  | 'notStorage'
  | 'notTopLevel'
  | 'noDrawing'
  | 'hasAreas'
  | 'onLine'
  | 'notLeaf'
  | 'notRectangle'
  | 'tooSmall'
  | 'outOfRange'
  | 'onNotAPlace'
  | 'invalidInput';

export class OpError extends Error {
  readonly code: OpErrorCode;

  constructor(code: OpErrorCode, message: string) {
    super(message);
    this.name = 'OpError';
    this.code = code;
  }
}

/**
 * updatedAt を更新した写しを返す。
 */
export function touch<T extends { updatedAt?: string }>(item: T, ctx: OpContext): T {
  return {
    ...item,
    updatedAt: ctx.now(),
  };
}
