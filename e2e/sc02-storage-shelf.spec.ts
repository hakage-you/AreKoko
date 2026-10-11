// SC-02 部屋に棚を置き、棚を収納にして段に分け、段にモノを入れる（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。

import { test, expect } from '@playwright/test';
import {
  areasOf, clickCanvas, currentDoc, draftDoc, expectHealthy, findItem, findKuukan, kuukanOwnedBy,
  openSample, snapshot,
} from './support/app';

test('SC-02 部屋に棚を置き、棚を収納にして段に分け、段にモノを入れる', async ({ page }) => {
  const breadcrumb = page.getByRole('navigation', { name: '経路' });

  await test.step('SC-02-1 見本を開き、Room A を開く → Room A のクウカンビュー', async () => {
    await openSample(page);
    await page.getByRole('button', { name: 'Room A', exact: true }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('view');
    expect(s.view?.kuukan).toBe(findKuukan(s.doc!, 'Room A').id);
  });

  await test.step('SC-02-2 「＋モノを追加」で「本棚」 → 置き場は Room A そのもの、詳細が開く', async () => {
    await page.getByRole('button', { name: '＋モノを追加' }).click();
    const input = page.getByRole('textbox', { name: 'モノの名前', exact: true });
    await input.fill('本棚');
    await input.press('Enter');
    const s = await snapshot(page);
    const shelf = findItem(s.doc!, '本棚');
    expect(shelf.place).toBe(findKuukan(s.doc!, 'Room A').id);
    expect(s.detail).toBe(shelf.id);
  });

  let shelfId = '';
  await test.step('SC-02-3 詳細の「収納として設定する」 → 収納の下書き（外形は長方形）。文書はまだ変わらない', async () => {
    const before = await currentDoc(page);
    shelfId = findItem(before, '本棚').id;
    await page.getByRole('button', { name: '収納として設定する' }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('editor');
    expect(s.editor?.kind).toBe('draft');
    const draft = await draftDoc(page);
    const k = draft.membership.kuukans.find(x => x.owner === shelfId);
    expect(k).toBeDefined();
    const outline = draft.drawing.kuukans.find(d => d.kuukan === k!.id)!.outline;
    expect(outline).toHaveLength(4);
    expect(kuukanOwnedBy(s.doc!, shelfId)).toBeUndefined();
  });

  await test.step('SC-02-4 呼び名を「段」にし、全体を上下に3等分 → 上から段1・段2・段3', async () => {
    const label = page.getByRole('textbox', { name: 'エリアの呼び名' });
    await label.fill('段');
    await label.press('Enter');
    await clickCanvas(page, [5000, 5000]); // 「選ぶ」で全体を選ぶ
    await page.getByRole('combobox', { name: '同じ大きさに分ける' }).selectOption('3');
    await page.getByRole('button', { name: '上下に分ける', exact: true }).last().click();
    const draft = await draftDoc(page);
    const k = draft.membership.kuukans.find(x => x.owner === shelfId)!;
    expect(areasOf(draft, k.id).map(a => a.name)).toEqual(['段1', '段2', '段3']);
    const part = draft.drawing.partitions.find(p => p.area === k.id)!;
    expect(part.axis).toBe('y');
  });

  await test.step('SC-02-5 「確定する」 → 本棚が収納になる（名前を持たないクウカン、本棚のIDは同じ、段1〜段3）', async () => {
    await page.getByRole('button', { name: '確定する' }).click();
    const doc = await currentDoc(page);
    const shelf = findItem(doc, '本棚');
    expect(shelf.id).toBe(shelfId);
    const k = kuukanOwnedBy(doc, shelfId);
    expect(k).toBeDefined();
    expect(k!.name).toBeUndefined();
    expect(areasOf(doc, k!.id).map(a => a.name)).toEqual(['段1', '段2', '段3']);
  });

  await test.step('SC-02-6 編集を出る → Room A のクウカンビュー。本棚に「収納」の札と「開く」', async () => {
    await page.getByRole('button', { name: /戻る/ }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('view');
    expect(s.view?.kuukan).toBe(findKuukan(s.doc!, 'Room A').id);
    const row = page.getByRole('listitem').filter({ hasText: '本棚' });
    await expect(row.getByText('収納', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: '開く', exact: true })).toBeVisible();
  });

  await test.step('SC-02-7 本棚の「開く」 → 本棚のクウカンビュー。経路は Room A › 本棚', async () => {
    await page.getByRole('listitem').filter({ hasText: '本棚' }).getByRole('button', { name: '開く', exact: true }).click();
    const s = await snapshot(page);
    expect(s.view?.kuukan).toBe(kuukanOwnedBy(s.doc!, shelfId)!.id);
    await expect(breadcrumb).toContainText('Room A');
    await expect(breadcrumb).toContainText('本棚');
  });

  await test.step('SC-02-8 図の段2 を押して「辞書」を追加 → 置き場は段2', async () => {
    await clickCanvas(page, [5000, 5000]);
    await page.getByRole('button', { name: '＋モノを追加' }).click();
    const input = page.getByRole('textbox', { name: 'モノの名前', exact: true });
    await input.fill('辞書');
    await input.press('Enter');
    const doc = await currentDoc(page);
    const k = kuukanOwnedBy(doc, shelfId)!;
    expect(findItem(doc, '辞書').place).toBe(areasOf(doc, k.id)[1]!.id);
  });

  await test.step('SC-02-9 経路の「Room A」 → Room A のビュー。本棚はあり、辞書はない', async () => {
    await page.getByRole('button', { name: '詳細を閉じる' }).click();
    await breadcrumb.getByRole('button', { name: 'Room A', exact: true }).click();
    const s = await snapshot(page);
    expect(s.view?.kuukan).toBe(findKuukan(s.doc!, 'Room A').id);
    const list = page.getByRole('list').filter({ has: page.getByRole('listitem') }).first();
    await expect(list.getByRole('listitem').filter({ hasText: '本棚' })).toHaveCount(1);
    await expect(list.getByRole('listitem').filter({ hasText: '辞書' })).toHaveCount(0);
  });

  await test.step('SC-02 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
