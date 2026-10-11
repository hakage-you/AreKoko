// E2E 試験の補助（詳細設計(シナリオ) 2.3）。
// 操作は画面から行い、結果は画面と `globalThis.arekokoMemory`（`?memory` のときだけある口）で確かめる。

import { expect, type Locator, type Page } from '@playwright/test';
import type { ArekokoDocument, Id, Point } from '../../src/core/types';
import type { ArekokoMemoryHook } from '../../src/app/memoryDeps';

declare global {
  // eslint-disable-next-line no-var
  var arekokoMemory: ArekokoMemoryHook;
}

/** 画面の状態の写し（関数や Set を含まない、試験で比べられる形）。 */
export interface StateSnapshot {
  screen: string;
  doc: ArekokoDocument | null;
  fileName: string | null;
  saveStatus: string | null;
  view: { kuukan: Id; area: Id | null; quick: string; focus: Id | null; placing: boolean } | null;
  editor: { kind: 'draft'; kuukan: Id; doc: ArekokoDocument } | { kind: 'kuukan'; kuukan: Id } | null;
  dialog: {
    kind: string; title?: string; message?: string; details?: string[];
    repairs?: { code: string; message: string }[]; reasons?: { code: string; message: string }[];
  } | null;
  highlights: Id[];
  selection: Id[];
  detail: Id | null;
  toast: { kind: string; text: string } | null;
}

export async function snapshot(page: Page): Promise<StateSnapshot> {
  return page.evaluate(() => {
    const s = globalThis.arekokoMemory.store!.state;
    const d = s.dialog;
    return {
      screen: s.screen,
      doc: s.doc,
      fileName: s.fileName,
      saveStatus: s.saveStatus,
      view: s.view,
      editor: s.editor === null ? null
        : s.editor.kind === 'draft'
          ? { kind: 'draft' as const, kuukan: s.editor.draft.kuukan, doc: s.editor.draft.doc }
          : { kind: 'kuukan' as const, kuukan: s.editor.kuukan },
      dialog: d === null ? null
        : d.kind === 'confirm' ? { kind: d.kind, title: d.title, message: d.message, details: d.details }
          : d.kind === 'repair' ? { kind: d.kind, repairs: d.repairs.map(r => ({ code: r.code, message: r.message })) }
            : d.kind === 'refused' ? { kind: d.kind, reasons: d.reasons.map(r => ({ code: r.code, message: r.message })) }
              : { kind: d.kind },
      highlights: [...s.highlights],
      selection: [...s.selection],
      detail: s.detail,
      toast: s.toast,
    };
  });
}

/** 画面の文書（開いていなければ例外）。 */
export async function currentDoc(page: Page): Promise<ArekokoDocument> {
  const s = await snapshot(page);
  if (!s.doc) throw new Error('文書が開かれていない');
  return s.doc;
}

/** 下書きの文書（下書きを開いていなければ例外）。 */
export async function draftDoc(page: Page): Promise<ArekokoDocument> {
  const s = await snapshot(page);
  if (s.editor?.kind !== 'draft') throw new Error('下書きが開かれていない');
  return s.editor.doc;
}

export function findItem(doc: ArekokoDocument, name: string) {
  const found = doc.membership.items.filter(i => i.name === name);
  if (found.length !== 1) throw new Error(`モノ「${name}」が ${found.length} 個ある`);
  return found[0]!;
}
export function findKuukan(doc: ArekokoDocument, name: string) {
  const found = doc.membership.kuukans.filter(k => k.name === name);
  if (found.length !== 1) throw new Error(`クウカン「${name}」が ${found.length} 個ある`);
  return found[0]!;
}
export function kuukanOwnedBy(doc: ArekokoDocument, item: Id) {
  return doc.membership.kuukans.find(k => k.owner === item);
}
/** クウカンのエリアを order の順に。 */
export function areasOf(doc: ArekokoDocument, kuukan: Id) {
  return doc.membership.areas.filter(a => a.kuukan === kuukan).sort((a, b) => a.order - b.order);
}
export function findArea(doc: ArekokoDocument, kuukan: Id, name: string) {
  const found = areasOf(doc, kuukan).filter(a => a.name === name);
  if (found.length !== 1) throw new Error(`エリア「${name}」が ${found.length} 個ある`);
  return found[0]!;
}

// ---- 開く ----

export async function openApp(page: Page): Promise<void> {
  await page.goto('/?memory');
  await page.waitForFunction(() => globalThis.arekokoMemory?.store != null);
}

/** 見本の文書を開く（クウカンの一覧まで）。 */
export async function openSample(page: Page): Promise<void> {
  await openApp(page);
  await page.getByRole('button', { name: 'ファイルを開く' }).click();
  await expect.poll(async () => (await snapshot(page)).screen).toBe('kuukans');
}

/** 見本のファイルの中身（JSON）。 */
export async function sampleJson(page: Page): Promise<ArekokoDocument> {
  return JSON.parse(await page.evaluate(() => globalThis.arekokoMemory.sample.peek()));
}

/** 見本のファイルが外で変わったことにする（更新日時だけを進める）。 */
export async function touchSampleFromOutside(page: Page): Promise<void> {
  await page.evaluate(() => globalThis.arekokoMemory.sample.touchFromOutside());
}

/** 次の「ファイルを開く」で開くファイルを差し替える。 */
export async function queueOpen(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(([n, t]) => globalThis.arekokoMemory.queueOpen(n!, t!), [name, text]);
}

// ---- 保存と健全性 ----

/** 保存先の中身。kind は読み込みの検査の結果。 */
export async function readFile(page: Page, name?: string): Promise<{ text: string; kind: string }> {
  return page.evaluate(n => globalThis.arekokoMemory.readFile(n ?? undefined), name ?? null);
}

/** 自動保存を待つ（約1秒。設計 10章）。 */
export async function waitSaved(page: Page): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).saveStatus, { timeout: 5000 }).toBe('saved');
}

/**
 * 共通の確認：画面の文書が不変条件を満たし、保存されたファイルは修復なしで読めて、画面の文書と同じ
 * （10章、詳細 4.6.1、結合試験の expectHealthy と同じ観点）。
 */
export async function expectHealthy(page: Page): Promise<void> {
  const violations = await page.evaluate(() => globalThis.arekokoMemory.violations());
  expect(violations, '画面の文書が不変条件を満たす').toEqual([]);
  await waitSaved(page);
  const file = await readFile(page);
  expect(file.kind, '保存されたファイルは修復なしで読める').toBe('ok');
  expect(file.text, '保存されたファイルは改行・空白なし').toBe(JSON.stringify(JSON.parse(file.text)));
  expect(JSON.parse(file.text), '保存済みのとき、画面の文書とファイルが同じ').toEqual(await currentDoc(page));
}

// ---- 図 ----

/** 今出ている図（クウカン編集かクウカンビュー）。 */
export function canvas(page: Page): Locator {
  return page.locator('svg[aria-label="クウカンの図"], svg[aria-label="クウカンビューの図"]');
}

/** 図の比率の座標（0〜10000）を、画面の座標にする（S7）。 */
export async function canvasPoint(page: Page, p: Point): Promise<{ x: number; y: number }> {
  await expect(canvas(page)).toBeVisible();
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector<SVGSVGElement>('svg[aria-label="クウカンの図"], svg[aria-label="クウカンビューの図"]')!;
    const s = globalThis.arekokoMemory.store!.state;
    let doc = s.doc;
    let kuukan: string | undefined;
    if (s.editor?.kind === 'draft') {
      doc = s.editor.draft.doc;
      kuukan = s.editor.draft.kuukan;
    } else if (s.editor?.kind === 'kuukan') {
      kuukan = s.editor.kuukan;
    } else {
      kuukan = s.view?.kuukan;
    }
    const aspect = doc?.drawing.kuukans.find(d => d.kuukan === kuukan)?.aspect;
    if (aspect === undefined) throw new Error('図のあるクウカンが開かれていない');
    const pt = svg.createSVGPoint();
    pt.x = x! * aspect;
    pt.y = y!;
    const q = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, p);
}

export async function clickCanvas(page: Page, p: Point): Promise<void> {
  const q = await canvasPoint(page, p);
  await page.mouse.click(q.x, q.y);
}

export async function dragCanvas(page: Page, from: Point, to: Point): Promise<void> {
  const a = await canvasPoint(page, from);
  const b = await canvasPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** 確認のダイアログ。 */
export function dialog(page: Page): Locator {
  return page.getByRole('dialog');
}
