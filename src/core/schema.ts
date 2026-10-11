// public/schema.json による検査と、違反の振り分け。詳細設計 4.2 の 3.、付録A.10。

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import schema from './schema.json';

export interface SchemaIssue {
  path: string;
  message: string;
}

export interface SchemaCheck {
  fatal: SchemaIssue[];
  dropDrawing: boolean;
  dropCollections: Set<string>;
  dropElements: Map<string, Set<number>>;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

export function checkSchema(json: unknown): SchemaCheck {
  const valid = validate(json);
  const fatalErrors: ErrorObject[] = [];
  let dropDrawing = false;
  const dropCollections = new Set<string>();
  const dropElements = new Map<string, Set<number>>();

  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      const p = err.instancePath;
      if (p === '/drawing') {
        dropDrawing = true;
        continue;
      }
      const elemMatch = p.match(/^\/drawing\/([^/]+)\/(\d+)(?:\/.*)?$/);
      if (elemMatch) {
        const col = elemMatch[1]!;
        const idx = parseInt(elemMatch[2]!, 10);
        let s = dropElements.get(col);
        if (!s) {
          s = new Set<number>();
          dropElements.set(col, s);
        }
        s.add(idx);
        continue;
      }
      const colMatch = p.match(/^\/drawing\/([^/]+)$/);
      if (colMatch) {
        dropCollections.add(colMatch[1]!);
        continue;
      }
      fatalErrors.push(err);
    }
  }

  return { fatal: describeErrors(fatalErrors), dropDrawing, dropCollections, dropElements };
}

const TYPE_NAMES: Record<string, string> = {
  string: '文字列',
  number: '数値',
  integer: '整数',
  object: 'オブジェクト',
  array: '配列',
  boolean: '真偽値',
  null: 'null',
};

/** "/membership/items/0/name" → "membership.items[0].name" */
function readablePath(pointer: string): string {
  if (pointer === '') return '文書全体';
  return pointer
    .split('/')
    .slice(1)
    .map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, seg) => (/^\d+$/.test(seg) ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');
}

function typeList(types: unknown): string {
  const list = Array.isArray(types) ? types : [types];
  return list.map(t => TYPE_NAMES[String(t)] ?? String(t)).join(' か ');
}

function describeOne(err: ErrorObject): string {
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `必須の項目「${String(params.missingProperty)}」がありません`;
    case 'type':
      return `${typeList(params.type)}であるべきです`;
    case 'const':
      return `値は ${JSON.stringify(params.allowedValue)} であるべきです`;
    case 'enum':
      return `値は ${(params.allowedValues as unknown[]).map(v => JSON.stringify(v)).join('、')} のどれかであるべきです`;
    case 'minimum':
      return `${String(params.limit)} 以上であるべきです`;
    case 'maximum':
      return `${String(params.limit)} 以下であるべきです`;
    case 'exclusiveMinimum':
      return `${String(params.limit)} より大きい値であるべきです`;
    case 'minLength':
      return `${String(params.limit)} 文字以上であるべきです`;
    case 'minItems':
      return `要素は ${String(params.limit)} 個以上であるべきです`;
    case 'maxItems':
      return `要素は ${String(params.limit)} 個以下であるべきです`;
    default:
      return '形式が正しくありません';
  }
}

/**
 * Ajv の違反を、場所ごとに1つの日本語の文にする。
 * anyOf（ID か null など）は、型の違反が選択肢の数だけ並ぶので、まとめて「A か B であるべき」にする。
 */
function describeErrors(errors: ErrorObject[]): SchemaIssue[] {
  const byPath = new Map<string, ErrorObject[]>();
  for (const err of errors) {
    // if/then/else の失敗は、中の required などが別に報告されるので出さない。
    if (err.keyword === 'if') continue;
    const list = byPath.get(err.instancePath) ?? [];
    list.push(err);
    byPath.set(err.instancePath, list);
  }

  const issues: SchemaIssue[] = [];
  for (const [path, list] of byPath) {
    const where = readablePath(path);
    const hasAlternatives = list.some(e => e.keyword === 'anyOf' || e.keyword === 'oneOf');
    if (hasAlternatives) {
      const types = list.filter(e => e.keyword === 'type').map(e => (e.params as { type: unknown }).type);
      const message = types.length > 0 ? `${typeList(types.flat())}であるべきです` : '形式が正しくありません';
      issues.push({ path, message: `${where}：${message}` });
      continue;
    }
    const seen = new Set<string>();
    for (const err of list) {
      const message = describeOne(err);
      if (seen.has(message)) continue;
      seen.add(message);
      issues.push({ path, message: `${where}：${message}` });
    }
  }
  return issues;
}
