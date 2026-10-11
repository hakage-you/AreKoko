// SC-04 確定したクウカンの仕切りを消して、中身が親へ移る（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。

import { test, expect } from '@playwright/test';
import {
  areasOf, clickCanvas, currentDoc, dialog, expectHealthy, findArea, findItem, kuukanOwnedBy,
  openSample, snapshot,
} from './support/app';
import type { ArekokoDocument } from '../src/core/types';

test('SC-04 確定したクウカンの仕切りを消して、中身が親へ移る', async ({ page }) => {
  let before: ArekokoDocument;
  let tanaK = '';

  await test.step('SC-04-1 見本を開き、棚A1 を開いて「編集」 → 棚A1 の編集', async () => {
    await openSample(page);
    await page.getByRole('button', { name: '棚A1', exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const s = await snapshot(page);
    before = s.doc!;
    tanaK = kuukanOwnedBy(before, findItem(before, '棚A1').id)!.id;
    expect(s.editor).toEqual({ kind: 'kuukan', kuukan: tanaK });
  });

  await test.step('SC-04-2 「選ぶ」で段1 と段2 の間の線を押す → その線が選ばれる', async () => {
    await page.getByRole('button', { name: '選ぶ', exact: true }).click();
    const part = before.drawing.partitions.find(p => p.area === tanaK)!;
    await clickCanvas(page, [5000, part.at[0]!]);
    await expect(page.getByRole('button', { name: 'この線を消す' })).toBeVisible();
  });

  await test.step('SC-04-3 選んだ線を消す → 確認に、段1 の BOX1・段2 の懐中電灯が棚A1 へ移ると出る。文書はまだ変わらない', async () => {
    await page.getByRole('button', { name: 'この線を消す' }).click();
    await expect(dialog(page)).toBeVisible();
    const s = await snapshot(page);
    expect(s.dialog?.kind).toBe('confirm');
    const details = s.dialog!.details!;
    expect(details).toHaveLength(2);
    expect(details.some(d => /段1 から 1件（BOX1）→ (.* › )?棚A1$/.test(d))).toBe(true);
    expect(details.some(d => /段2 から 1件（懐中電灯）→ (.* › )?棚A1$/.test(d))).toBe(true);
    for (const d of details) await expect(dialog(page)).toContainText(d);
    expect(s.doc).toEqual(before);
  });

  await test.step('SC-04-4 確認で消す → 段1・段2 がなくなり空の「段4」。BOX1・懐中電灯は棚A1 そのものへ移る。BOX1 の中身は残る。修復メモなし', async () => {
    await dialog(page).getByRole('button', { name: '削除する' }).click();
    const s = await snapshot(page);
    const doc = s.doc!;
    expect(areasOf(doc, tanaK).map(a => a.name).sort()).toEqual(['段3', '段4']);
    const dan4 = findArea(doc, tanaK, '段4');
    expect(doc.membership.items.filter(i => i.place === dan4.id)).toEqual([]);
    const box = findItem(doc, 'BOX1');
    const light = findItem(doc, '懐中電灯');
    expect(box.place).toBe(tanaK);
    expect(light.place).toBe(tanaK);
    const boxK = kuukanOwnedBy(doc, box.id)!.id;
    expect(findItem(doc, '単3電池').place).toBe(boxK);
    expect(findItem(doc, '単4電池').place).toBe(boxK);
    expect(box.notices).toBeUndefined();
    expect(light.notices).toBeUndefined();
  });

  await test.step('SC-04-5 「元に戻す」 → 段1〜段3 と置き場が元に戻る', async () => {
    await page.getByRole('button', { name: '元に戻す' }).click();
    const doc = await currentDoc(page);
    expect(areasOf(doc, tanaK).map(a => a.name)).toEqual(['段1', '段2', '段3']);
    expect(findItem(doc, 'BOX1').place).toBe(findItem(before, 'BOX1').place);
    expect(findItem(doc, '懐中電灯').place).toBe(findItem(before, '懐中電灯').place);
  });

  await test.step('SC-04 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
