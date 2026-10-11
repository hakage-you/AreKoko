# アレココ 詳細設計（シナリオの試験）

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-10-09 |
| きっかけ | ユーザーの指示（2026-10-09）：「シナリオの単位の動作を試験で守る」「Playwright を開発用に足す。本番のビルドには入れない」「修正がどの操作に影響したかを見つけられるようにする」 |
| 関係する文書 | `docs/scenarios.md`（シナリオの一覧）、`docs/test-requirements.md`（TRS） |

## 0. 決めたこと

| # | 内容 |
|---|---|
| S1 | シナリオは `docs/scenarios.md` に一覧で持つ。ID は `SC-01` のように振り、手順にも番号を振る（`SC-01-3`）。TRS とは別の文書にする（TRS は「何を確かめるか」、シナリオは「利用者がたどる流れ」） |
| S2 | シナリオは2段で守る。すべてのシナリオを結合試験（`AppStore`）で通し、主なシナリオは E2E（Playwright）で本物の画面から通す |
| S3 | 画面の判断（置き場の決め方、確認するかどうかと確認の中身）は `AppStore` の操作にして、画面はそれを呼ぶだけにする（1章）。図の上の指の動き（押した位置の座標・吸着・ドラッグ）は画面に残し、E2E で守る |
| S4 | Playwright は `devDependencies` だけに入れる。試験は `e2e/` に置き、ファイル名は `*.spec.ts` にする（Vitest の `tests/**/*.test.ts` と混ざらない）。`npm run test:e2e` で動かし、`npm test` には入れない |
| S5 | E2E は開発サーバーの `?memory` で動かす（ファイルを選ぶダイアログが出ない）。試験から文書と保存先を読む口（`globalThis.arekokoMemory`）は `?memory` のときだけ作る。`import.meta.env.DEV` の中にあるので本番のビルドには入らない（ビルドの結果に入っていないことを確かめる） |
| S6 | E2E は手順ごとに `test.step` で区切り、手順の名前に手順の番号と画面の操作を入れる（例：「SC-01-3 左右に分ける：図の真ん中を押す」）。結果は手順ごとに確かめる（最後にまとめて確かめない）。落ちたとき、どの手順（どの操作）が壊れたかが報告に出る |
| S7 | 図を押す位置は、図の比率の座標（0〜10000）から計算する（`e2e/support/app.ts`）。画面の余白や拡大率が変わっても、試験を直さなくて済む |
| S8 | 画面の文言を変える直しでは、E2E の押すボタンの名前も同じ直しで変える（E2E はボタンを見えている名前で探す） |
| S9 | **期待する結果は設計から決める**（ユーザーの指示、2026-10-09「既存の試験が通るように試験設計してはだめ」）。シナリオの期待ごとに根拠の節を書く。画面を見て調べてよいのは「どう操作するか」（ボタンの名前・押す場所）だけで、「どうなるべきか」は設計から決める。試験が落ちたら、操作の書き間違いでない限り試験を直さず、不具合として `docs/scenarios.md` の「見つかった不具合」に記録する。設計に書いていない動きは、期待を決めずに設計の抜けとして挙げる |

---

## 1. 画面の判断をストアへ移す（`AppStore` に足す操作）

| 操作 | 内容 | 今の場所 |
|---|---|---|
| `addItemInView(name): Id \| null` | クウカンビューの「＋モノを追加」。名前は前後の空白を除き、空なら何もしない。置き場は選んでいるエリア、なければ開いているクウカン（V2）。追加したモノの詳細を開き、そのIDを返す | `view/ItemList.svelte` |
| `deleteItem(id)` | 1件の削除。確認しない（設計 8.4。元に戻すで補う） | `components/ItemDetail.svelte` |
| `requestDeleteSelection()` | 複数選択のまとめて削除。件数と影響を見せて確認し、削除したら選択を空にする | `components/BulkBar.svelte` |
| `requestRemoveStorage(item)` | 収納設定の削除。影響を見せて確認する | `components/ItemDetail.svelte` |
| `requestDeleteKuukan(kuukan)` | どこにも置かれていないクウカンの削除。影響を見せて確認する | `screens/KuukanScreen.svelte` |
| `requestDeleteTag(tag)` | タグの削除。付いている件数を見せて確認する | `screens/ManageScreen.svelte` |
| `requestDeleteLine(node, lineIndex, onDone?)` | 仕切りの線を消す。確定したクウカンなら影響を見せて確認し、下書きなら確認せずに消す。消したら `onDone` を呼ぶ | `editor/SidePanel.svelte`（2か所） |
| `requestConfirmDraft(mode)` | 下書きの確定。置き換え（`replace`）なら、消えるエリアと影響を見せて確認する。それ以外はすぐ確定する | `screens/EditorScreen.svelte` |
| `editorApply(op)` | クウカン編集の操作。下書きなら下書きに、確定したクウカンなら文書にかける | `editor/target.ts` |
| `tryApply(op)` | トーストを出さずに操作を試す。成功すれば `apply` と同じ（履歴・保存・ハイライト）で `{ ok: true, result }`、`OpError` なら文書を変えずに `{ ok: false, message }`。配置モードで、断られた理由を図の上の案内に出すため | `view/ViewCanvas.svelte`（5か所） |

- 影響の文（「棚A1 › 段2 から 1件 → 棚A1」）を作る処理は、`src/app/impact.ts` の `describeRelocations(doc, relocations)` に1つにまとめる（今は画面の6か所に同じ処理がある）。
- 確認の題・本文・ボタンの文言は、今の画面のものをそのまま移す（見た目は変えない）。
- 画面の部品は、上の操作を呼ぶだけにする。名前の変更のように判断のない操作は、今のまま `app.apply` を呼んでよい。

---

## 2. E2E の仕組み

### 2.1 置き場所

```
playwright.config.ts      設定（開発サーバーを立てる、Chromium、パソコンの幅）
e2e/
  support/app.ts          補助（開く・文書を読む・図を押す・ドラッグする・健全性の確認）
  sc01-*.spec.ts …        シナリオごとに1ファイル
```

- 開発サーバーは試験用に別のポート（5180）で立てる（`npm run dev -- --port 5180 --strictPort`）。
- ブラウザは Chromium、画面は 1280×800。スマホの幅は、スマホのシナリオを足すときに足す。
- `tsconfig.json` の `include` に `e2e` と `playwright.config.ts` を足し、`npm run check` で型も確かめる。

### 2.2 試験の口（`globalThis.arekokoMemory`。`?memory` のときだけ）

| 名前 | 内容 |
|---|---|
| `store` | 画面が使っている `AppStore`。試験は `store.state` を読むだけにして、操作は画面から行う |
| `sample` | 見本のファイル（「ファイルを開く」で開く） |
| `files` | 「新しく作る」「別の名前で保存」で作ったファイル（名前 → 保存先） |
| `queueOpen(name, text)` | 次の「ファイルを開く」で開くファイルを差し替える（壊れたファイルの試験用） |

保存先には、外での変更をまねる `touchFromOutside()` がある（今のまま）。

### 2.3 補助（`e2e/support/app.ts`）

| 補助 | 内容 |
|---|---|
| `openSample(page)` / `createNew(page)` | `?memory` を開き、「ファイルを開く」（見本）または「新しく作る」 |
| `currentDoc(page)` | 画面の文書（`store.state.doc`） |
| `savedDoc(page, file?)` | 保存先のファイルを読み直した文書。`analyzeDocument` が `ok` であることも確かめる |
| `canvasPoint(page, [x, y])` | 図の比率の座標を画面の座標にする（`svg[aria-label="クウカンの図"]` の `getScreenCTM` と縦横比） |
| `clickCanvas(page, p)` / `dragCanvas(page, from, to)` | 図を押す・ドラッグする |
| `expectHealthy(page)` | 画面の文書が `validateDocument` を通ることを確かめる |

補助は Node の側で `src/core` の関数（`validateDocument`、`analyzeDocument`）をそのまま使う。

### 2.4 書き方の約束

- 手順は `test.step('SC-01-3 左右に分ける：図の真ん中を押す', …)` の形にする（S6）。手順の番号は `docs/scenarios.md` と同じにする。
- ボタンは見えている名前で探す（`getByRole('button', { name: '左右に分ける' })`）。同じ名前のボタンが複数あるときは、まとまり（ダイアログ、横の欄など）で絞る。
- 時間の経過は待たない。自動保存は `expect.poll` で「保存済み」になるのを待つ。
- 1つのシナリオは1つの `test` にする（手順が前の手順の結果を使うため）。

---

## 3. 結合試験のシナリオ（`tests/integration/scenarios.test.ts`）

`docs/scenarios.md` のすべてのシナリオを、`AppStore` の公開の操作（1章の操作を含む）だけで通す。図の上の操作（仕切りを入れる、描画を付ける）は、画面が呼ぶのと同じ中核の操作を `editorApply`・`tryApply` で呼ぶ。手順の名前は E2E と同じにする。
