// SC-05 複製した下書きで作り直し、元と置き換える（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。

import { test, expect } from '@playwright/test';
import {
  areasOf, clickCanvas, currentDoc, dialog, draftDoc, expectHealthy, findArea, findItem, kuukanOwnedBy,
  openSample, snapshot,
} from './support/app';
import type { ArekokoDocument } from '../src/core/types';

test('SC-05 複製した下書きで作り直し、元と置き換える', async ({ page }) => {
  let before: ArekokoDocument;
  let tanaK = '';

  await test.step('SC-05-1 収納「棚A1」を複製 → 段1〜段3 の下書き。文書は変わらない', async () => {
    await openSample(page);
    before = await currentDoc(page);
    tanaK = kuukanOwnedBy(before, findItem(before, '棚A1').id)!.id;
    const card = page.locator('.storage-card').filter({ has: page.getByRole('button', { name: '棚A1', exact: true }) });
    await card.getByRole('button', { name: 'ほかの操作' }).click();
    await page.getByRole('menuitem', { name: '複製' }).click();
    const s = await snapshot(page);
    expect(s.editor?.kind).toBe('draft');
    const draft = await draftDoc(page);
    expect(areasOf(draft, tanaK).map(a => a.name)).toEqual(['段1', '段2', '段3']);
    expect(s.doc).toEqual(before);
  });

  await test.step('SC-05-2 下書きで段2 と段3 の間の線を消す → 確認なし。下書きは段1・段4。文書は変わらない', async () => {
    const part = before.drawing.partitions.find(p => p.area === tanaK)!;
    await page.getByRole('button', { name: '選ぶ', exact: true }).click();
    await clickCanvas(page, [5000, part.at[1]!]);
    await page.getByRole('button', { name: 'この線を消す' }).click();
    const s = await snapshot(page);
    expect(s.dialog).toBeNull();
    const draft = await draftDoc(page);
    expect(areasOf(draft, tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    expect(s.doc).toEqual(before);
  });

  await test.step('SC-05-3 「確定する」 → 「元を残す（複製）」と「元と置き換える（作り直し）」を選ぶ', async () => {
    await page.getByRole('button', { name: '確定する' }).click();
    await expect(page.getByRole('button', { name: '元を残す（複製）' })).toBeVisible();
    await expect(page.getByRole('button', { name: '元と置き換える（作り直し）' })).toBeVisible();
  });

  await test.step('SC-05-4 「元と置き換える」 → 確認に消えるエリア（段2・段3）と、段2 の懐中電灯が棚A1 へ。置き換えた後は元に戻せないと出る。文書はまだ変わらない', async () => {
    await page.getByRole('button', { name: '元と置き換える（作り直し）' }).click();
    await expect(dialog(page)).toBeVisible();
    const s = await snapshot(page);
    const details = s.dialog!.details!;
    expect(details.some(d => d.includes('段2') && d.includes('消える'))).toBe(true);
    expect(details.some(d => d.includes('段3') && d.includes('消える'))).toBe(true);
    expect(details.some(d => /段2 から 1件（懐中電灯）→ (.* › )?棚A1$/.test(d))).toBe(true);
    for (const d of details) await expect(dialog(page)).toContainText(d);
    expect(s.dialog!.message).toContain('元に戻す');
    await expect(dialog(page)).toContainText(s.dialog!.message!);
    expect(s.doc).toEqual(before);
  });

  await test.step('SC-05-5 置き換える → 棚A1 と段1 のIDは同じ。段2・段3 がなくなり段4。懐中電灯は棚A1 そのものへ移る。BOX1 は段1 のまま', async () => {
    await dialog(page).getByRole('button', { name: '置き換える' }).click();
    const s = await snapshot(page);
    const doc = s.doc!;
    expect(kuukanOwnedBy(doc, findItem(doc, '棚A1').id)!.id).toBe(tanaK);
    const dan1Before = findArea(before, tanaK, '段1');
    expect(findArea(doc, tanaK, '段1').id).toBe(dan1Before.id);
    expect(areasOf(doc, tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    const light = findItem(doc, '懐中電灯');
    expect(light.place).toBe(tanaK);
    expect(findItem(doc, 'BOX1').place).toBe(dan1Before.id);
  });

  await test.step('SC-05-6 「元に戻す」（Ctrl+Z） → 確定は取り消されない（段1・段4 のまま。懐中電灯は棚A1）', async () => {
    await page.keyboard.press('Control+z');
    const doc = await currentDoc(page);
    expect(areasOf(doc, tanaK).map(a => a.name).sort()).toEqual(['段1', '段4']);
    expect(findItem(doc, '懐中電灯').place).toBe(tanaK);
  });

  await test.step('SC-05 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
