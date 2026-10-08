// 検索の条件・実行・候補提案。詳細設計UI 3.2、設計 9章 / 11章。

import { NIL_ID } from '../core/constants';
import { getIndexes } from '../core/indexes';
import type { Indexes } from '../core/indexes';
import { itemsWithin } from '../core/places';
import type { ArekokoDocument, Category, Id, Item, Tag } from '../core/types';
import { normalizeForMatch } from './normalize';

export interface SearchQuery {
  /** 名前と概要。空白で区切った語をすべて含む。 */
  text?: string;
  /** カテゴリID。子孫を含む。null は未分類。undefined は条件なし。 */
  category?: Id | null;
  /** タグの指定。ids が空なら条件なし。 */
  tags?: { ids: Id[]; mode: 'all' | 'any' };
  /** 置き場ID。中の収納の中まで含む（itemsWithin）。 */
  place?: Id;
  /** 未設定に置かれたモノだけ。 */
  unsetOnly?: boolean;
  /** 収納だけ。 */
  storageOnly?: boolean;
}

/** 名前と概要の正規化文字列のキャッシュ（Item は不変なので安全）。 */
const itemTextCache = new WeakMap<Item, string>();

function getItemSearchText(item: Item): string {
  let cached = itemTextCache.get(item);
  if (cached === undefined) {
    cached = normalizeForMatch(`${item.name}\n${item.summary ?? ''}`);
    itemTextCache.set(item, cached);
  }
  return cached;
}

/** タグ名の正規化キャッシュ。 */
const tagNameCache = new WeakMap<Tag, string>();

function getTagNameNorm(tag: Tag): string {
  let cached = tagNameCache.get(tag);
  if (cached === undefined) {
    cached = normalizeForMatch(tag.name);
    tagNameCache.set(tag, cached);
  }
  return cached;
}

/** カテゴリ名の正規化キャッシュ。 */
const categoryNameCache = new WeakMap<Category, string>();

function getCategoryNameNorm(category: Category): string {
  let cached = categoryNameCache.get(category);
  if (cached === undefined) {
    cached = normalizeForMatch(category.name);
    categoryNameCache.set(category, cached);
  }
  return cached;
}

/**
 * 検索クエリが条件を持たない（空のクエリ）かどうかを判定する。
 */
export function isEmptyQuery(q: SearchQuery): boolean {
  if (q.text !== undefined) {
    const words = normalizeForMatch(q.text)
      .split(/\s+/)
      .filter(w => w.length > 0);
    if (words.length > 0) {
      return false;
    }
  }
  if (q.category !== undefined) {
    return false;
  }
  if (q.tags !== undefined && q.tags.ids.length > 0) {
    return false;
  }
  if (q.place !== undefined) {
    return false;
  }
  if (q.unsetOnly) {
    return false;
  }
  if (q.storageOnly) {
    return false;
  }
  return true;
}

/**
 * 指定されたカテゴリおよびそのすべての子孫カテゴリのIDセットを返す。
 */
function getCategorySubtreeIds(indexes: Indexes, rootId: Id): Set<Id> {
  const result = new Set<Id>([rootId]);
  const queue: Id[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = indexes.childCategories.get(current);
    if (children) {
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      }
    }
  }
  return result;
}

/**
 * 複数の候補集合の積集合（交わり）を計算する。
 */
function intersectSets(sets: Set<Item>[]): Set<Item> {
  if (sets.length === 0) {
    return new Set<Item>();
  }
  sets.sort((a, b) => a.size - b.size);
  let current = sets[0]!;
  for (let i = 1; i < sets.length; i++) {
    const nextSet = sets[i]!;
    const nextIntersection = new Set<Item>();
    for (const item of current) {
      if (nextSet.has(item)) {
        nextIntersection.add(item);
      }
    }
    current = nextIntersection;
    if (current.size === 0) {
      break;
    }
  }
  return current;
}

/**
 * 条件に一致するモノを検索する。
 * place・tags・category の条件があれば索引から候補の集合を作って交わりを取り、残りの条件で照らす。
 * 結果の並びは doc.membership.items の順序。
 */
export function searchItems(doc: ArekokoDocument, q: SearchQuery): Item[] {
  const indexes = getIndexes(doc);
  const candidateSets: Set<Item>[] = [];

  // 1. place 条件（itemsWithin で収納の中まで再帰取得）
  if (q.place !== undefined) {
    const within = itemsWithin(doc, q.place);
    candidateSets.push(new Set(within));
  }

  // 2. category 条件（指定カテゴリおよび子孫、または未分類）
  if (q.category !== undefined) {
    const catItems: Item[] = [];
    if (q.category === null) {
      const list = indexes.itemsByCategory.get(null);
      if (list) {
        catItems.push(...list);
      }
    } else {
      const categoryIds = getCategorySubtreeIds(indexes, q.category);
      for (const cid of categoryIds) {
        const list = indexes.itemsByCategory.get(cid);
        if (list) {
          catItems.push(...list);
        }
      }
    }
    candidateSets.push(new Set(catItems));
  }

  // 3. tags 条件（all または any）
  if (q.tags !== undefined && q.tags.ids.length > 0) {
    if (q.tags.mode === 'all') {
      const tagItemSets: Set<Item>[] = [];
      for (const tagId of q.tags.ids) {
        const list = indexes.itemsByTag.get(tagId) ?? [];
        tagItemSets.push(new Set(list));
      }
      candidateSets.push(intersectSets(tagItemSets));
    } else {
      const anySet = new Set<Item>();
      for (const tagId of q.tags.ids) {
        const list = indexes.itemsByTag.get(tagId);
        if (list) {
          for (const item of list) {
            anySet.add(item);
          }
        }
      }
      candidateSets.push(anySet);
    }
  }

  // 候補集合の交わり（条件が1つ以上あれば交わりを取り、なければ全件対象）
  let candidateSet: Set<Item> | null = null;
  if (candidateSets.length > 0) {
    candidateSet = intersectSets(candidateSets);
  }

  // text の語をパース
  let words: string[] = [];
  if (q.text !== undefined) {
    words = normalizeForMatch(q.text)
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  const results: Item[] = [];

  // doc.membership.items の順序を保ちながら残りの条件で照合
  for (const item of doc.membership.items) {
    if (candidateSet !== null && !candidateSet.has(item)) {
      continue;
    }
    if (q.unsetOnly && item.place !== NIL_ID) {
      continue;
    }
    if (q.storageOnly && !indexes.kuukanByOwner.has(item.id)) {
      continue;
    }
    if (words.length > 0) {
      const text = getItemSearchText(item);
      let match = true;
      for (const word of words) {
        if (!text.includes(word)) {
          match = false;
          break;
        }
      }
      if (!match) {
        continue;
      }
    }
    results.push(item);
  }

  return results;
}

/**
 * 入力文字列に名前が一致するタグとカテゴリを候補として返す。
 * それぞれ最大10件、名前の短い順（同じ長さなら元の順序）。
 * text が空なら空の結果を返す。
 */
export function suggest(
  doc: ArekokoDocument,
  text: string,
): { tags: Tag[]; categories: Category[] } {
  const normQuery = normalizeForMatch(text).trim();
  if (normQuery === '') {
    return { tags: [], categories: [] };
  }

  const matchingTags: Tag[] = [];
  for (const tag of doc.membership.tags) {
    if (getTagNameNorm(tag).includes(normQuery)) {
      matchingTags.push(tag);
    }
  }
  matchingTags.sort((a, b) => a.name.length - b.name.length);

  const matchingCategories: Category[] = [];
  for (const cat of doc.membership.categories) {
    if (getCategoryNameNorm(cat).includes(normQuery)) {
      matchingCategories.push(cat);
    }
  }
  matchingCategories.sort((a, b) => a.name.length - b.name.length);

  return {
    tags: matchingTags.slice(0, 10),
    categories: matchingCategories.slice(0, 10),
  };
}
