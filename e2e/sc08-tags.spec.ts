// SC-08 タグを作ってモノに付け、絞り込み、消す（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。

import { test, expect, type Page } from '@playwright/test';
import { currentDoc, dialog, expectHealthy, findItem, openSample, snapshot } from './support/app';

function itemRows(page: Page) {
  return page.getByRole('table').getByRole('row').filter({ has: page.getByRole('checkbox') });
}

test('SC-08 タグを作ってモノに付け、絞り込み、消す', async ({ page }) => {
  const picker = page.getByRole('dialog');

  await test.step('SC-08-1 サガシモノで延長コードの詳細を開く → タグは付いていない', async () => {
    await openSample(page);
    await page.getByRole('button', { name: 'サガシモノ', exact: true }).click();
    await page.getByRole('searchbox', { name: '検索キーワード' }).fill('延長コード');
    await itemRows(page).filter({ hasText: '延長コード' }).getByText('延長コード', { exact: true }).click();
    const s = await snapshot(page);
    const cord = findItem(s.doc!, '延長コード');
    expect(s.detail).toBe(cord.id);
    expect(cord.tags).toEqual([]);
  });

  await test.step('SC-08-2 タグを足すで「電源まわり」と入力 → 候補の最後に作る候補が出る。入力しただけでは作られない', async () => {
    const tagsBefore = (await currentDoc(page)).membership.tags.length;
    await page.getByRole('button', { name: '＋ タグを追加' }).click();
    await picker.getByRole('searchbox', { name: 'タグを検索' }).fill('電源まわり');
    const create = picker.getByText(/新しいタグ.電源まわり.を作る/);
    await expect(create).toBeVisible();
    const options = picker.locator('.items-list').getByRole('button');
    await expect(options.last()).toContainText(/新しいタグ.電源まわり.を作る/);
    expect((await currentDoc(page)).membership.tags.length).toBe(tagsBefore);
  });

  await test.step('SC-08-3 作る候補を選ぶ → タグ「電源まわり」ができ、延長コードに付く', async () => {
    await picker.getByText(/新しいタグ.電源まわり.を作る/).click();
    const doc = await currentDoc(page);
    const tag = doc.membership.tags.find(t => t.name === '電源まわり');
    expect(tag).toBeDefined();
    expect(findItem(doc, '延長コード').tags).toEqual([tag!.id]);
  });

  await test.step('SC-08-4 絞り込みでタグ「電源まわり」 → 延長コードだけ', async () => {
    await page.getByRole('button', { name: '詳細を閉じる' }).click();
    await page.getByRole('searchbox', { name: '検索キーワード' }).fill('');
    await page.getByRole('button', { name: '＋タグ' }).click();
    await picker.getByRole('searchbox', { name: 'タグを検索' }).fill('電源まわり');
    await picker.getByRole('button', { name: '電源まわり', exact: true }).click();
    await expect(itemRows(page)).toHaveCount(1);
    await expect(itemRows(page).filter({ hasText: '延長コード' })).toHaveCount(1);
  });

  await test.step('SC-08-5 管理画面でタグ「電源まわり」を消す → 確認に付いている件数（1件）', async () => {
    await page.getByRole('button', { name: '管理', exact: true }).click();
    const row = page.locator('.row-item').filter({ hasText: '電源まわり' });
    await row.getByRole('button', { name: '削除', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    const s = await snapshot(page);
    expect(s.dialog?.kind).toBe('confirm');
    expect(s.dialog!.message).toContain('電源まわり');
    expect(s.dialog!.message).toContain('1件');
  });

  await test.step('SC-08-6 確認で消す → タグがなくなり、延長コードからも外れる', async () => {
    await dialog(page).getByRole('button', { name: '削除する' }).click();
    const doc = await currentDoc(page);
    expect(doc.membership.tags.some(t => t.name === '電源まわり')).toBe(false);
    expect(findItem(doc, '延長コード').tags).toEqual([]);
  });

  await test.step('SC-08 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
