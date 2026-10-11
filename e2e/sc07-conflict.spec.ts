// SC-07 外で変更されたファイルに対処する（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。根拠は設計 10章。

import { test, expect, type Page } from '@playwright/test';
import {
  currentDoc, dialog, expectHealthy, openSample, readFile, snapshot, touchSampleFromOutside, waitSaved,
} from './support/app';

async function addToUnset(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '＋モノを追加' }).click();
  const input = page.getByRole('textbox', { name: 'モノの名前', exact: true });
  await input.fill(name);
  await input.press('Enter');
  await page.getByRole('button', { name: '詳細を閉じる' }).click();
}
function names(text: string): string[] {
  return (JSON.parse(text) as { membership: { items: { name: string }[] } }).membership.items.map(i => i.name);
}

/** SC-07-1・SC-07-2：保存した後、外で変わってから次の変更をする。 */
async function reachConflict(page: Page): Promise<void> {
  await test.step('SC-07-1 未設定に「メモ1」を追加 → 約1秒後にファイルに書かれ「保存済み」', async () => {
    await openSample(page);
    await page.getByRole('button', { name: '未設定', exact: true }).click();
    await addToUnset(page, 'メモ1');
    await waitSaved(page);
    expect(names((await readFile(page)).text)).toContain('メモ1');
    await expect(page.getByText('保存済み')).toBeVisible();
  });

  await test.step('SC-07-2 外でファイルが変わった後に「メモ2」を追加 → 書かれず、外での変更を知らせ、3つから選ぶ', async () => {
    await touchSampleFromOutside(page);
    await addToUnset(page, 'メモ2');
    await expect.poll(async () => (await snapshot(page)).dialog?.kind, { timeout: 5000 }).toBe('conflict');
    expect(names((await readFile(page)).text)).not.toContain('メモ2');
    await expect(dialog(page).getByRole('button', { name: '読み込み直す（こちらの変更は捨てる）' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: '別の名前で保存する' })).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'それでも上書きする' })).toBeVisible();
  });
}

test('SC-07 外で変更されたファイルに対処する（それでも上書きする）', async ({ page }) => {
  await reachConflict(page);

  await test.step('SC-07-3 「それでも上書きする」 → ファイルにメモ2 が書かれ「保存済み」', async () => {
    await dialog(page).getByRole('button', { name: 'それでも上書きする' }).click();
    await waitSaved(page);
    expect(names((await readFile(page)).text)).toContain('メモ2');
  });

  await test.step('SC-07 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});

test('SC-07b 外で変更されたファイルに対処する（読み込み直す）', async ({ page }) => {
  await reachConflict(page);

  await test.step('SC-07b-3 「読み込み直す」 → ファイルの内容で開き直し、こちらの変更（メモ2）は捨てられる', async () => {
    await dialog(page).getByRole('button', { name: '読み込み直す（こちらの変更は捨てる）' }).click();
    await expect.poll(async () => (await snapshot(page)).dialog).toBeNull();
    const doc = await currentDoc(page);
    const itemNames = doc.membership.items.map(i => i.name);
    expect(itemNames).toContain('メモ1');
    expect(itemNames).not.toContain('メモ2');
  });

  await test.step('SC-07b 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
