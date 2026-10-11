// SC-06 壊れたファイルを開いて、修復を承認する（docs/scenarios.md）。
// 期待は設計から決める（詳細設計(シナリオ) S9）。修復コードと文は詳細設計 4.7。

import { test, expect } from '@playwright/test';
import {
  currentDoc, dialog, expectHealthy, findItem, openApp, queueOpen, readFile, sampleJson, snapshot, waitSaved,
} from './support/app';
import { NIL_ID } from '../src/core/constants';

const FILE = '壊れた.json';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('SC-06 壊れたファイルを開いて、修復を承認する', async ({ page }) => {
  await openApp(page);
  // 見本に、置き場の参照先がないモノと、仮IDのモノを足したファイル
  const broken = await sampleJson(page);
  broken.membership.items.push(
    { id: '01900000-0000-7000-8000-00000000a001', name: '迷子の傘', place: '01900000-0000-7000-8000-00000000a999', category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'new:メモ帳', name: 'メモ帳', place: NIL_ID, category: null, tags: [], updatedAt: '2026-10-01T00:00:00.000Z' },
  );
  const brokenText = JSON.stringify(broken);

  await test.step('SC-06-1 そのファイルを開く → 修復案の一覧（迷子の傘を未設定へ、メモ帳の仮IDを付け替え）', async () => {
    await queueOpen(page, FILE, brokenText);
    await page.getByRole('button', { name: 'ファイルを開く' }).click();
    await expect(dialog(page)).toBeVisible();
    const s = await snapshot(page);
    expect(s.dialog?.kind).toBe('repair');
    const repairs = s.dialog!.repairs!;
    expect(repairs).toHaveLength(2);
    const place = repairs.find(r => r.code === 'placeMissing');
    const temp = repairs.find(r => r.code === 'tempId');
    expect(place?.message).toContain('迷子の傘');
    expect(place?.message).toContain('未設定');
    expect(place?.message).toMatch(/ます$/);
    expect(temp?.message).toContain('new:メモ帳');
    expect(temp?.message).toMatch(/ます(（.*）)?$/);
    for (const r of repairs) await expect(dialog(page)).toContainText(r.message);
  });

  await test.step('SC-06-2 「読み込まない」 → 最初の画面のまま。ファイルは書かれない', async () => {
    await dialog(page).getByRole('button', { name: '読み込まない' }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('start');
    expect(s.doc).toBeNull();
    expect((await readFile(page, FILE)).text).toBe(brokenText);
  });

  await test.step('SC-06-3 もう一度開いて「直して読み込む」 → クウカンの一覧。迷子の傘は未設定、メモ帳のIDは v7。直した結果がファイルに書かれる', async () => {
    await queueOpen(page, FILE, brokenText);
    await page.getByRole('button', { name: 'ファイルを開く' }).click();
    await dialog(page).getByRole('button', { name: '直して読み込む' }).click();
    const s = await snapshot(page);
    expect(s.screen).toBe('kuukans');
    expect(findItem(s.doc!, '迷子の傘').place).toBe(NIL_ID);
    expect(findItem(s.doc!, 'メモ帳').id).toMatch(UUID_V7);
    await waitSaved(page);
    const file = await readFile(page, FILE);
    expect(file.kind).toBe('ok');
    expect(findItem(JSON.parse(file.text), 'メモ帳').id).toMatch(UUID_V7);
  });

  await test.step('SC-06-4 未設定を開いて迷子の傘の詳細 → 修復メモが出る', async () => {
    await page.getByRole('button', { name: '未設定', exact: true }).click();
    await page.getByRole('listitem').filter({ hasText: '迷子の傘' }).getByText('迷子の傘').click();
    const detail = page.getByLabel('モノの詳細');
    await expect(detail).toContainText('修復メモ');
    await expect(detail).toContainText(/置き場の参照先が見つからなかったため.*未設定へ移しました/);
  });

  await test.step('SC-06-5 修復メモを消す → 詳細から消え、ファイルからも消える', async () => {
    const detail = page.getByLabel('モノの詳細');
    await detail.getByRole('button', { name: '消す', exact: true }).click();
    await expect(detail).not.toContainText('修復メモ');
    await waitSaved(page);
    const saved = JSON.parse((await readFile(page, FILE)).text);
    expect(findItem(saved, '迷子の傘').notices).toBeUndefined();
    expect(findItem(await currentDoc(page), '迷子の傘').notices).toBeUndefined();
  });

  await test.step('SC-06 保存されたファイルは修復なしで読め、画面の文書と同じ', async () => {
    await expectHealthy(page);
  });
});
