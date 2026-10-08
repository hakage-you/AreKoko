// 結合試験：AI向けの説明ページ（段階7）。設計 13章の終わりの目安「説明ページだけを読んだAIが、
// モノを正しく追加できる」を、説明ページに載せた例で確かめる（詳細設計 段階7 2章）。
// 例は説明ページから取り出すので、ページの例がアプリとずれたら、この試験が落ちる。

import { describe, expect, it } from 'vitest';
import { analyzeDocument } from '../../src/core/load/index';
import { validateDocument } from '../../src/core/validate';
import { NIL_ID } from '../../src/core/constants';
import type { ArekokoDocument } from '../../src/core/types';
import { makeApp, MemoryFile, expectHealthy } from './harness';
import page from '../../public/ai.md?raw';
import llms from '../../public/llms.txt?raw';
import schemaText from '../../public/schema.json?raw';

function example(marker: 'before' | 'after'): string {
  const at = page.indexOf(`<!-- example:${marker} -->`);
  expect(at).toBeGreaterThanOrEqual(0);
  const m = /```json\n([\s\S]*?)\n```/.exec(page.slice(at));
  if (!m) throw new Error(`例（${marker}）の JSON が見つからない`);
  return m[1]!;
}

let n = 0;
const ctx = {
  newId: () => `01930000-0000-7000-8000-${(++n).toString(16).padStart(12, '0')}`,
  now: () => '2026-10-08T12:00:00.000Z',
};

describe('結合試験: AI向けの説明ページ (段階7)', () => {
  it('編集の前の例は、修復なしで読み込める', () => {
    const r = analyzeDocument(example('before'), ctx);
    expect(r.kind).toBe('ok');
  });

  it('編集の後の例は、仮IDの付け替えだけで読み込め、足したものが例のとおりに入る', () => {
    const before = JSON.parse(example('before')) as ArekokoDocument;
    const r = analyzeDocument(example('after'), ctx);
    expect(r.kind).toBe('repair');
    if (r.kind !== 'repair') return;
    expect(new Set(r.repairs.map(x => x.code))).toEqual(new Set(['tempId']));
    expect(r.repairs.some(x => x.message.includes('new:単3電池'))).toBe(true);

    const doc = r.doc;
    expect(validateDocument(doc)).toEqual([]);
    const ms = doc.membership;
    const byName = (name: string) => ms.items.find(i => i.name === name)!;
    const kuukan = (name: string) => ms.kuukans.find(k => k.name === name)!;
    const dan1 = ms.areas.find(a => a.name === '段1')!;
    const cat = ms.categories.find(c => c.name === '電池')!;
    const tag = ms.tags.find(t => t.name === '消耗品')!;

    // 仮IDは残らない
    expect(JSON.stringify(doc)).not.toContain('new:');
    expect(byName('単3電池')).toMatchObject({ place: dan1.id, category: cat.id, tags: [tag.id], qty: 8 });
    expect(byName('懐中電灯')).toMatchObject({ place: NIL_ID, category: null, tags: [], summary: '停電用' });
    expect(byName('懐中電灯').qty).toBeUndefined();
    expect(kuukan('物置')).toMatchObject({ owner: null, areaLabel: 'エリア' });
    expect(byName('脚立').place).toBe(kuukan('物置').id);

    // 編集の前からあったものと描画は変わらない
    for (const it of before.membership.items) expect(ms.items).toContainEqual(it);
    for (const a of before.membership.areas) expect(ms.areas).toContainEqual(a);
    expect(doc.drawing).toEqual(before.drawing);
  });

  it('アプリで開くと、承認後に保存した文書は修復なしで読み直せる', async () => {
    const file = new MemoryFile();
    file.text = example('after');
    const { app } = makeApp({ file });
    await app.openFile();
    expect(app.state.dialog?.kind).toBe('repair');
    app.approveRepair();
    expect(app.state.screen).toBe('kuukans');
    await app.flush();
    expectHealthy(app, file);
  });

  it('llms.txt は説明ページと schema.json を指し、そのファイルがある', () => {
    expect(llms).toContain('](./ai.md)');
    expect(llms).toContain('](./schema.json)');
    expect(JSON.parse(schemaText).$schema).toContain('json-schema.org');
    // 説明ページも schema.json を指す
    expect(page).toContain('](./schema.json)');
  });
});
