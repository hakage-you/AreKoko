// SC-01 部屋をエリアに分け、片方にモノを追加して図に置く（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。根拠は docs/scenarios.md の表。

import { test, expect } from '@playwright/test';
import {
  areasOf, clickCanvas, currentDoc, dragCanvas, draftDoc, expectHealthy, findItem, findKuukan,
  openSample, snapshot,
} from './support/app';
import { shapeCenter } from '../src/geometry/shape';

test('SC-01 部屋をエリアに分け、片方にモノを追加して図に置く', async ({ page }) => {
  await test.step('SC-01-1 見本を開く → クウカンの一覧', async () => {
    await openSample(page);
    expect((await snapshot(page)).screen).toBe('kuukans');
  });

  await test.step('SC-01-2 「書斎」を作る → 長方形の外形の下書き。文書はまだ変わらない', async () => {
    await page.getByRole('textbox', { name: 'クウカンの名前' }).fill('書斎');
    await page.getByRole('button', { name: '作る', exact: true }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('editor');
    expect(s.editor?.kind).toBe('draft');
    const draft = await draftDoc(page);
    const k = findKuukan(draft, '書斎');
    const outline = draft.drawing.kuukans.find(d => d.kuukan === k.id)!.outline;
    expect(outline).toHaveLength(4);
    expect(new Set(outline.map(p => p.join(',')))).toEqual(new Set(['0,0', '10000,0', '10000,10000', '0,10000']));
    expect(s.doc!.membership.kuukans.some(x => x.name === '書斎')).toBe(false);
  });

  await test.step('SC-01-3 「左右に分ける」で図の真ん中を押す → 左がエリア1、右がエリア2。文書は変わらない', async () => {
    await page.getByRole('button', { name: '左右に分ける' }).click();
    await clickCanvas(page, [5000, 5000]);
    const draft = await draftDoc(page);
    const k = findKuukan(draft, '書斎');
    const areas = areasOf(draft, k.id);
    expect(areas.map(a => a.name)).toEqual(['エリア1', 'エリア2']);
    const part = draft.drawing.partitions.find(p => p.area === k.id)!;
    expect(part.axis).toBe('x');
    expect(part.children).toEqual([areas[0]!.id, areas[1]!.id]); // 子は x の小さい順（左から）
    expect(part.at[0]).toBeGreaterThan(2500);
    expect(part.at[0]).toBeLessThan(7500);
    expect((await currentDoc(page)).membership.kuukans.some(x => x.name === '書斎')).toBe(false);
  });

  await test.step('SC-01-4 「確定する」 → 文書に書斎とエリア1・エリア2。確定したクウカンの編集へ', async () => {
    await page.getByRole('button', { name: '確定する' }).click();
    const s = await snapshot(page);
    const k = findKuukan(s.doc!, '書斎');
    expect(k.owner).toBeNull();
    expect(areasOf(s.doc!, k.id).map(a => a.name)).toEqual(['エリア1', 'エリア2']);
    expect(s.editor).toEqual({ kind: 'kuukan', kuukan: k.id });
  });

  await test.step('SC-01-5 編集を出て、一覧で書斎を開く → 書斎のクウカンビュー「書斎 のモノ 0件」', async () => {
    await page.getByRole('button', { name: /戻る/ }).click();
    expect((await snapshot(page)).screen).toBe('kuukans');
    await page.getByRole('button', { name: '書斎', exact: true }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('view');
    expect(s.view?.kuukan).toBe(findKuukan(s.doc!, '書斎').id);
    await expect(page.getByText('書斎 のモノ 0件')).toBeVisible();
  });

  await test.step('SC-01-6 図の右のエリアを押す → エリア2 を選び「エリア2 のモノ 0件」', async () => {
    await clickCanvas(page, [7500, 5000]);
    const s = await snapshot(page);
    const k = findKuukan(s.doc!, '書斎');
    expect(s.view?.area).toBe(areasOf(s.doc!, k.id)[1]!.id);
    await expect(page.getByText('エリア2 のモノ 0件')).toBeVisible();
  });

  await test.step('SC-01-7 「＋モノを追加」で「ノートPC」 → 置き場はエリア2、描画なし、詳細が開く', async () => {
    await page.getByRole('button', { name: '＋モノを追加' }).click();
    const input = page.getByRole('textbox', { name: 'モノの名前', exact: true });
    await input.fill('ノートPC');
    await input.press('Enter');
    const s = await snapshot(page);
    const pc = findItem(s.doc!, 'ノートPC');
    const k = findKuukan(s.doc!, '書斎');
    expect(pc.place).toBe(areasOf(s.doc!, k.id)[1]!.id);
    expect(s.doc!.drawing.items.some(d => d.item === pc.id)).toBe(false);
    expect(s.detail).toBe(pc.id);
  });

  let before: Awaited<ReturnType<typeof currentDoc>>;
  await test.step('SC-01-8 配置モードで、ノートPC に長方形の描画を付ける → 中心は右のエリアの中。置き場と更新日時は変わらず、ずれの印なし', async () => {
    before = await currentDoc(page);
    await page.getByRole('button', { name: '詳細を閉じる' }).click();
    await page.getByRole('button', { name: '配置モード' }).click();
    expect((await snapshot(page)).view?.placing).toBe(true);
    const row = page.getByRole('listitem').filter({ hasText: 'ノートPC' });
    await row.getByRole('button', { name: '描画を付ける', exact: true }).click();
    await page.getByRole('button', { name: '長方形で描く' }).click();
    await dragCanvas(page, [6000, 3000], [9000, 7000]);

    const doc = await currentDoc(page);
    const pcBefore = findItem(before, 'ノートPC');
    const pc = findItem(doc, 'ノートPC');
    const drawing = doc.drawing.items.find(d => d.item === pc.id);
    expect(drawing?.shape.type).toBe('rect');
    const [cx, cy] = shapeCenter(drawing!.shape);
    expect(cx).toBeGreaterThan(5000);
    expect(cx).toBeLessThan(10000);
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(10000);
    expect(pc.place).toBe(pcBefore.place);
    expect(pc.updatedAt).toBe(pcBefore.updatedAt);
    await expect(row.getByTitle('描画が置き場の外にあります')).toHaveCount(0);
  });

  await test.step('SC-01-9 「元に戻す」 → 描画だけが消え、ノートPC と置き場は残る', async () => {
    await page.getByRole('button', { name: '元に戻す' }).click();
    const doc = await currentDoc(page);
    const pc = findItem(doc, 'ノートPC');
    expect(doc.drawing.items.some(d => d.item === pc.id)).toBe(false);
    expect(pc.place).toBe(findItem(before, 'ノートPC').place);
  });

  await test.step('SC-01 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
