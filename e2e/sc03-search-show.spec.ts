// SC-03 サガシモノで探して、そのモノの場所を開く（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。

import { test, expect, type Page } from '@playwright/test';
import { expectHealthy, findItem, kuukanOwnedBy, openSample, snapshot } from './support/app';

/** サガシモノの表のモノの行（見出しの行を除く）。 */
function itemRows(page: Page) {
  return page.getByRole('table').getByRole('row').filter({ has: page.getByRole('checkbox') });
}

test('SC-03 サガシモノで探して、そのモノの場所を開く', async ({ page }) => {
  await test.step('SC-03-1 見本を開き、サガシモノへ → サガシモノの表', async () => {
    await openSample(page);
    await page.getByRole('button', { name: 'サガシモノ', exact: true }).click();
    expect((await snapshot(page)).screen).toBe('search');
    await expect(page.getByRole('table')).toBeVisible();
  });

  const search = page.getByRole('searchbox', { name: '検索キーワード' });

  await test.step('SC-03-2 文字に「電池」 → 単3電池・単4電池（名前）と懐中電灯（概要）の3件', async () => {
    await search.fill('電池');
    await expect(itemRows(page)).toHaveCount(3);
    for (const name of ['単3電池', '単4電池', '懐中電灯']) {
      await expect(itemRows(page).filter({ hasText: name })).toHaveCount(1);
    }
  });

  await test.step('SC-03-3 文字を「単３」（全角）に → 単3電池（名前）と懐中電灯（概要）の2件。単4電池は出ない', async () => {
    await search.fill('単３');
    await expect(itemRows(page)).toHaveCount(2);
    await expect(itemRows(page).filter({ hasText: '単3電池' })).toHaveCount(1);
    await expect(itemRows(page).filter({ hasText: '懐中電灯' })).toHaveCount(1);
  });

  await test.step('SC-03-4 単3電池の「クウカンで見る」 → BOX1 のクウカンビュー。簡易検索は「単3電池」、単3電池がフォーカス。経路は Room A › 棚A1 › BOX1', async () => {
    await page.getByRole('button', { name: '単3電池 をクウカンで見る' }).click();
    const s = await snapshot(page);
    const denchi = findItem(s.doc!, '単3電池');
    expect(s.screen).toBe('view');
    expect(s.view?.kuukan).toBe(kuukanOwnedBy(s.doc!, findItem(s.doc!, 'BOX1').id)!.id);
    expect(s.view?.quick).toBe('単3電池');
    expect(s.view?.focus).toBe(denchi.id);
    await expect(page.getByPlaceholder('モノの名前や概要…')).toHaveValue('単3電池');
    const breadcrumb = page.getByRole('navigation', { name: '経路' });
    await expect(breadcrumb).toHaveText(/Room A\s*›\s*棚A1\s*›\s*BOX1/);
  });

  await test.step('SC-03 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
