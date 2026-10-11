# アレココ 詳細設計（段階1〜2：中核・幾何）

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-10-08 |
| もとにした設計 | `docs/design.md`（2026-10-08 承認の最終版） |
| 範囲 | 段階1（中核）、段階2（幾何）。段階3・4は区切りで書き足す |

`docs/design.md` を「設計」、この文書を「詳細設計」と呼ぶ。設計にない判断はここに書き、ユーザーの確認を得たものには **（確認済み）** と付ける。

---

## 0. 追加で決めたこと（確認済み）

設計の修復表（設計 6.7）にない場合と、新しく出てきた観点。2026-10-08 にユーザーの確認を得た。

| # | 内容 |
|---|---|
| D1 | 修復表にない問題の補完（4.6 の表の「補完」の行） |
| D2 | UUID v7（と予約の Nil）以外のIDは、`new:` と同じく仮IDとして付け替える |
| D3 | 収納のクウカンは名前を持たない。表示には持ち主のモノの名前を使う。修復で持ち主が外れて名前がなければ「名前なし」にする |
| D4 | 描画の層の schema.json 違反は、その描画だけを外す。読み込みを断るのは、全体の形と所属の層が schema.json に合わないときだけ |
| D5 | 段階4では、クウカン編集（段階5）の代わりに仮の入口を作る（描画なしのクウカンの作成・名前の変更・削除、描画なしの収納として設定する） |
| D6 | 「新しく作る」では、作るときにすぐ保存先を選ぶ（Chrome・Edge）。最初の操作から自動保存が効く（段階3） |

---

## 1. モジュールの構成

中核と幾何は、フレームワークに依存しない素の TypeScript で書く（設計 5.3）。DOM も使わない。

```
src/
  core/
    types.ts          文書の型
    constants.ts      定数（APP, SCHEMA_VERSION, NIL_ID, 既定の呼び名など）
    ids.ts            UUID v7 の生成と判定
    schema.ts         public/schema.json による検査と、違反の振り分け
    load/             読み込み時の検査と修復（analyzeDocument）
    validate.ts       不変条件の検査（validateDocument）
    serialize.ts      書き出し（serializeDocument）
    indexes.ts        索引（getIndexes。文書ごとに WeakMap で覚える）
    places.ts         置き場の計算（経路、所属するクウカン、入れ子、候補）
    relocate.ts       統一規則（設計 7.8）
    ops/              操作（items, categories, tags, kuukans, storage, notices, areas）
    history.ts        元に戻す・やり直す
    document.ts       新しい文書を作る
  geometry/
    types.ts          Polygon, Rect など
    polygon.ts        直角多角形の検査、正規化、点の位置、長方形への分解
    partition.ts      境界で止める仕切り、多角形の分割、N等分
    regions.ts        仕切りの記録からエリアの領域を計算・検証する
    drag.ts           仕切りのドラッグ範囲
public/
  schema.json         形式の定義（アプリの検査とAI向けの説明で共有）
tests/                Vitest のテスト（core/、geometry/、property/）
```

依存の向き：`geometry` は `core/types.ts` の型（Point, Axis, Partition）だけを使う。`core` は `geometry` を使ってよい。逆はしない。

---

## 2. 文書の型

型は `src/core/types.ts` のとおり。補足は次のとおり。

### 2.1 不変として扱う

- 操作は入力の文書を書き換えない。変える要素だけを新しいオブジェクトにして返す（構造の共有）。
- テストでは、操作に渡す文書を deep freeze して、書き換えていないことを確かめる。
- アプリが知らない項目は、スプレッド（`{ ...item, place }`）で写して運ぶ。型には書かない。
- 省略できる項目（`summary`、`qty`、`notices`、`realSize`、`name`（収納のクウカン）、`seed`）を消すときは、キーごと消す（`undefined` を入れない）。

### 2.2 既定値の補い（修復ではない）

読み込み時、schema.json の検査が通った後に、省略された項目へ既定値を入れる。修復の一覧には出さず、修復メモも付けない。アプリが書き出す文書は常にすべての項目を持つので、書き出した文書の往復（書き出し → 読み込み）では何も変わらない。

| 場所 | 既定値 |
|---|---|
| `membership` の各一覧、`drawing`、`drawing` の各一覧 | `[]`（`drawing` は4つの空の一覧） |
| `kuukans[].owner` | `null` |
| `kuukans[].areaLabel` | `"エリア"` |
| `areas[].parent` | `null` |
| `areas[].order` | `0` |
| `items[].category` | `null` |
| `items[].tags` | `[]` |
| `categories[].parent` | `null` |
| `markers[].name` | `""` |
| `markers[].rotation`、`drawing.items[].rotation` | `0` |
| `markers[].notAPlace` | `false` |

### 2.3 座標と軸

- 座標は整数の目盛り。クウカンの外形の外接長方形が、ちょうど `[0,10000]×[0,10000]`。
- x は右へ、y は下へ増える（SVG と同じ）。
- `axis: "x"` は x = at の縦の線。子は x の小さい順（左から）。`axis: "y"` は y = at の横の線。子は y の小さい順（上から）。
- 描画（モノ・マーカー）の座標は、はみ出してもよいので範囲を限らない（整数）。

### 2.4 未設定のクウカン

- ID は Nil UUID（`NIL_ID`）。`owner: null`、エリアなし、描画なし。
- 表示名はいつも「未設定」（`name` の値は使わない）。名前の変更と削除はできない。
- 新しい文書では `kuukans` の先頭に置く：`{ "id": NIL_ID, "name": "未設定", "owner": null, "areaLabel": "エリア" }`。

### 2.5 名前の表示

| 対象 | 表示名 |
|---|---|
| 未設定のクウカン | 「未設定」 |
| どこにも置かれていないクウカン | `name`（空文字なら「名前なし」。A-11、TRS 付録B I-07、2026-10-11 ユーザーが決定） |
| 収納のクウカン | 持ち主のモノの `name`（D3。`name` があっても使わない） |
| エリア | `name`（空文字でもそのまま） |

---

## 3. ID（`core/ids.ts`）

- `newId(): string`：UUID v7（RFC 9562）を作る。小文字。
  - 先頭48ビット：Unix 時刻（ミリ秒）。
  - 同じミリ秒の中でも順序が保たれるよう、`rand_a`（12ビット）を単調増加のカウンタとして使う（RFC 9562 6.2 の方式1）。同じミリ秒で使い切ったら、時刻を1ミリ秒進めた扱いにする。時計が戻ったときも、直前の値より大きくする。
  - 乱数は `crypto.getRandomValues`。
  - テスト用に、時刻と乱数を差し込める `createIdGenerator({ now, random })` を用意する。
- `NIL_ID = "00000000-0000-0000-0000-000000000000"`。
- `isUuidV7(s)`：`/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`。大文字は v7 とみなさない（付け替えの対象になる）。
- `timestampOfV7(id): number`：作成日時（ミリ秒）を読み出す。

---

## 4. 読み込み時の検査と修復（`core/load/`）

### 4.1 入口

```ts
interface LoadContext { newId(): Id; now(): string /* ISO 8601 */ }

function analyzeDocument(input: string | unknown, ctx: LoadContext): LoadResult;

type LoadResult =
  | { kind: 'ok'; doc: ArekokoDocument }                          // 直すものがない
  | { kind: 'repair'; doc: ArekokoDocument; repairs: RepairEntry[] } // doc は直した後のもの。承認されたら使う
  | { kind: 'refused'; reasons: Refusal[] };                        // 読み込みを断る

interface RepairEntry {
  code: RepairCode;
  message: string;                 // 日本語。一覧にそのまま出す
  target?: { kind: EntityKind; id: Id };   // 直した後のID
}

interface Refusal {
  code: RefusalCode;
  message: string;                 // 日本語
  path?: string;                   // schema 違反のとき、JSON Pointer
}
```

- 入力が文字列なら `JSON.parse` する。入力の値は書き換えない（最初に深い複製を作ってから作業する）。
- 修復の結果は決定的にする（`ctx` 以外の乱数や時刻を使わない）。

### 4.2 手順

順番に行う。断る条件に当たったら、その時点で `refused` を返す（ただし 4.2.2 の schema 違反は全部を集めてから返す）。

1. **JSON として読む**。読めなければ断る（`notJson`）。
1.1 新しく振るIDは、文書にすでにあるIDと重ならないことを確かめる（生成器に依存しない）。
2. **全体の確認**。オブジェクトでない、`app !== "arekoko"` なら断る（`notArekoko`）。`schemaVersion` が整数でなければ断る（`schema`）。アプリより新しければ断る（`newerVersion`）。1 より小さければ断る（`schema`）。
3. **schema.json で検査する**（Ajv、draft 2020-12、`allErrors: true`）。違反を JSON Pointer（`instancePath`）で振り分ける（D4）。
   - `/drawing/<一覧>/<番号>` 以下の違反 → その描画の要素を外す（4.5 で扱う）。
   - `/drawing/<一覧>` そのものの違反（配列でないなど）→ その一覧を空にする。
   - `/drawing` そのものの違反（オブジェクトでないなど）→ 描画の層をすべて空にする。
   - それ以外（ルート、`/membership` 以下）→ 違反をすべて `schema` として断る。
4. **既定値を補う**（2.2）。
5. **IDを整える**（4.3）。
6. **所属の層の参照を直す**（4.4）。
7. **輪を調べる**（4.6）。輪があれば断る。
8. **描画の層を検査して、問題のある描画を外す**（4.5）。
9. **修復メモを付ける**（4.7）。
10. **最終の検査**：`validateDocument` を通す。通らなければアプリの不具合なので例外を投げる。
11. 修復が1件もなければ `ok`、あれば `repair` を返す。

### 4.3 IDを整える

IDを持つ要素（以下「定義」）は、所属の層の5つの一覧と、描画の層の `markers`。IDは文書全体で共有する。

1. 定義のIDの出現回数を数える。
2. **Nil UUID**：未設定のクウカン専用。
   - Nil を ID に持つクウカンがちょうど1つなら、それが未設定。
   - Nil を ID に持つクウカン以外の定義 → 新しいIDに付け替える（`reservedId`）。
   - Nil を ID に持つクウカンが2つ以上 → 下の「重複」と同じ。すべてを新しいIDにし、未設定は 4.4 で作る。
   - **参照の中の Nil は、いつも未設定のクウカンを指す**（未設定は 4.4 で必ず存在する状態にする）。
3. **重複**（Nil 以外で2回以上）：重複したものすべてに新しいIDを振る（`duplicateId`）。そのIDへの参照は、どれを指すか決められないので「参照先なし」として扱う。推測はしない。
4. **v7 でないID**（`new:` で始まるもの、UUID v4、任意の文字列。重複していないもの）：新しい UUID v7 に付け替え、対応表に入れる（`tempId`。D2）。
5. **v7 のID**（重複していないもの）：そのまま。

参照を引くときの規則（`resolve(raw)`）：

| 参照の値 | 結果 |
|---|---|
| 重複したID | 参照先なし |
| 対応表にある（付け替えた） | 新しいID |
| そのまま残った v7 のID | そのID |
| Nil | 未設定のクウカン |
| それ以外（どの定義にもない） | 参照先なし |

引いた先の**種類**も確かめる。種類が違う参照（置き場がモノを指している、など）は「参照先なし」と同じに扱う。

### 4.4 所属の層の参照を直す

この順に行う。

1. **クウカン**
   1. `owner` を引く。モノでなければ `null` にする（`ownerMissing`）。
   2. 同じモノを持ち主にするクウカンが2つ以上あれば、それらすべての `owner` を `null` にする（`ownerShared`。推測しない）。
   3. 未設定のクウカンの `owner` が `null` でなければ `null` にする（`unsetHasOwner`）。
   4. `owner` が `null` になったのに `name` がないクウカンは、`name` を「名前なし」にする（D3。修復メモは 1. 2. のものに含める）。
   5. 未設定のクウカンがなければ作り、`kuukans` の先頭に置く（`missingUnset`）。
2. **エリア**
   1. `kuukan` を引く。クウカンでなければ、そのエリアを外す（`areaKuukanMissing`）。
   2. `kuukan` が未設定のクウカンなら、そのエリアを外す（`unsetHasAreas`）。
   3. 残ったエリアの `parent` を引く。残ったエリアで、かつ同じクウカンのものでなければ `null` にする（`areaParentMissing`）。
   - 子孫は、それぞれのエリアが自分で判定される（同じ欠けたクウカンを指す子孫は 1. で外れ、別の正しいクウカンを指す子孫は 3. で直下へ移る）。
3. **モノ**
   1. `place` を引く。クウカンか、残ったエリアでなければ、未設定（Nil）へ移す。外れたエリアを指していた場合は、外れた理由の修復コード（`areaKuukanMissing` か `unsetHasAreas`）、それ以外は `placeMissing`。
   2. `category` を引く。カテゴリでなければ `null`（`categoryMissing`）。
   3. `tags` の各要素を引く。タグでないものを外す（`tagMissing`）。そのあと、同じタグの2回目以降を外す（`tagDuplicate`。最初のものを残す）。
4. **カテゴリ**：`parent` を引く。カテゴリでなければ `null`（`categoryParentMissing`）。

### 4.5 描画の層を検査する

ここで外したものは、所属には触れない（設計 原則2）。

1. **schema 違反の要素**（4.2 の 3.）を外す。外した要素の参照先が引ければ、その要素に修復メモを付ける（クウカンの描画 → そのクウカン、マーカー → そのクウカン、モノの描画 → そのモノ、仕切り → そのクウカン）。仕切りを外した場合は、そのクウカンの描画全体を外す（2. と同じ扱い）。
2. **クウカンの描画**（`drawing.kuukans`）
   - `kuukan` を引く。クウカンでなければ外す（参照先が分からないので修復メモなし。一覧には出す）。
   - 未設定のクウカンを指していれば外す（`unsetHasDrawing`）。
   - 同じクウカンを指す描画が2つ以上あれば、すべて外す（`kuukanDrawingInvalid`）。
   - 外形が正しくなければ外す（`kuukanDrawingInvalid`。`validateOutline`、9.2）。
3. **仕切り**：`area` と `children` を引く。描画が残ったクウカン K ごとに、K と K のエリアに属する仕切りを集め、`computeRegions`（9.4）で対応と幾何を検査する。通らなければ、**K の描画をまとめて外す**：クウカンの描画、K の仕切り、K のマーカー、置き場が K にあるモノの描画（`partitionMismatch`。修復メモは K にだけ付ける）。
   - 描画のないクウカンのエリアを指す仕切り、`area` が引けない仕切りは外す。前者は、そのクウカンに `partitionMismatch` を付ける（同じクウカンに同じコードは1回だけ）。
4. **マーカー**：`kuukan` を引く。描画が残ったクウカンでなければ外す。形が正しくなければ外す（`markerInvalid`。修復メモはクウカンに付ける。ただし 3. でクウカンの描画ごと外れた場合は付けない）。
5. **モノの描画**（`drawing.items`）：`item` を引く。モノでなければ外す。同じモノを指す描画が2つ以上あれば、すべて外す。モノの置き場が属するクウカンに描画が残っていなければ外す。形が正しくなければ外す（`itemDrawingInvalid`。修復メモはそのモノに付ける。ただし 3. でクウカンの描画ごと外れた場合は付けない）。

形が正しいとは：`point` と `rect` は schema.json のとおり。`poly` は `validateRectilinearPolygon`（9.2）が通ること（外接長方形の制約はない）。

### 4.6 輪を調べる（断る）

4.4 の後の所属の層で調べる。輪があれば、輪になっている要素の名前を並べて断る（設計 6.7。想定外の外部ツールによる破損として扱う）。

| コード | 調べる関係 |
|---|---|
| `cycleCategory` | カテゴリの `parent` |
| `cycleArea` | エリアの `parent` |
| `cycleNesting` | 収納の入れ子：クウカン K の持ち主 O の置き場が属するクウカン → その持ち主 → … と辿って K に戻る |

メッセージの例：「カテゴリの親子関係が輪になっています：家電 → 台所 → 家電」「収納の入れ子が輪になっています：箱A → 箱B → 箱A」（クウカンは表示名で示す）。

### 4.6.1 変えないこと

修復の要らない文書は、読み込んでも何も変えない（要素の並び順も含む）。アプリが書いた文書は、`analyzeDocument(serializeDocument(doc))` が `ok` で、文書が等しい（ランダム検査で確かめる）。

### 4.7 修復メモ

- 修復した要素に `notices: [{ at, text }]` を足す（既にあれば後ろに足す）。`at` は `ctx.now()`。
- `text` に日付は入れない（`at` から出せるので。設計 原則6）。表示のときに日付を前に付ける。
- 同じ要素に同じ修復コードのメモは1つだけにする。
- 付けるもの・付けないもの：

| 修復コード | 一覧に出す | 修復メモを付ける先 | メモの本文 |
|---|---|---|---|
| `tempId` | ○ | 付けない | ― |
| `reservedId` | ○ | 付け替えた要素 | 読み込み時の修復で、予約されたIDが使われていたため、新しいIDに付け替えました |
| `duplicateId` | ○ | 付け替えた要素 | 読み込み時の修復で、IDが重複していたため、新しいIDを振りました |
| `missingUnset` | ○ | 付けない | ― |
| `placeMissing` | ○ | モノ | 読み込み時の修復で、置き場の参照先が見つからなかったため未設定へ移しました |
| `categoryMissing` | ○ | モノ | 読み込み時の修復で、カテゴリの参照先が見つからなかったため未分類にしました |
| `tagMissing` | ○ | モノ | 読み込み時の修復で、タグの参照先が見つからなかったため、そのタグを外しました |
| `tagDuplicate` | ○ | モノ | 読み込み時の修復で、同じタグが重複していたため1つにまとめました |
| `categoryParentMissing` | ○ | カテゴリ | 読み込み時の修復で、親カテゴリの参照先が見つからなかったため、いちばん上へ移しました |
| `ownerMissing` | ○ | クウカン | 読み込み時の修復で、持ち主のモノが見つからなかったため、どこにも置かれていないクウカンにしました |
| `ownerShared` | ○ | クウカン | 読み込み時の修復で、1つのモノが複数のクウカンを持っていたため、持ち主を外しました |
| `unsetHasOwner` | ○ | 付けない | ― |
| `areaKuukanMissing` | ○ | 移したモノ | 読み込み時の修復で、置き場のエリアが属するクウカンが見つからなかったため未設定へ移しました |
| `areaParentMissing` | ○ | エリア | 読み込み時の修復で、親のエリアの参照先が見つからなかったため、クウカンの直下へ移しました |
| `unsetHasAreas` | ○ | 移したモノ | 読み込み時の修復で、未設定のクウカンはエリアを持てないため、未設定へ移しました |
| `unsetHasDrawing` | ○ | 付けない | ― |
| `kuukanDrawingInvalid` | ○ | クウカン | 読み込み時の修復で、描画に問題があったため、このクウカンの描画を外しました |
| `partitionMismatch` | ○ | クウカン | 読み込み時の修復で、仕切りの記録がエリアと合わなかったため、このクウカンの描画を外しました |
| `markerInvalid` | ○ | クウカン | 読み込み時の修復で、マーカー「{名前}」の描画に問題があったため外しました |
| `itemDrawingInvalid` | ○ | モノ | 読み込み時の修復で、描画に問題があったため外しました |
| `drawingDropped` | ○ | 付けない | ―（参照先が分からない描画を外したとき） |

- 一覧（`RepairEntry.message`）は、承認の前に見せるので「〜します」の形にする。修復メモの本文は記録なので「〜しました」。
- 一覧（`RepairEntry.message`）は、何に何をするかが分かる文にする。例：「モノ「単3電池」：置き場の参照先が見つからないため、未設定へ移します」「仮ID「new:電池」を新しいIDに付け替えます（モノ「単3電池」）」。
- 未設定のクウカンは修復メモを表示する場所がないため、未設定に関わる修復ではメモを付けない（`unsetHasOwner`、`unsetHasDrawing`）。

### 4.8 断る理由のコード

| コード | 内容 |
|---|---|
| `notJson` | JSON として読めない |
| `notArekoko` | アレココの文書ではない（`app` が違う、オブジェクトでない） |
| `newerVersion` | 新しい版のアプリで作られた文書 |
| `schema` | schema.json に合わない（所属の層または全体）。`path` に場所 |
| `cycleCategory` / `cycleArea` / `cycleNesting` | 輪（4.6） |

---

## 5. 不変条件の検査（`core/validate.ts`）

```ts
interface Violation { code: string; message: string; ids: Id[] }
function validateDocument(doc: ArekokoDocument): Violation[];
```

アプリが文書を書き出す前と、テスト（1操作ごと）で使う。速さより確かさを優先する（ただし1万件で数十ミリ秒以内を目安にする。2026-10-08 の計測で約40ms）。

**schema.json の検査も含める。** アプリが書いたファイルは、読み込み時に1つも外されずに（修復なしで）読めなければならない。たとえば数量が負の数のファイルを書くと、次に開いたとき全体が断られる。操作の入口でも同じ値を弾く（数量は0以上の整数、実際の長さは正の数）。

### 5.1 所属の層（設計 6.5）

1. IDは文書全体（所属の層の5つの一覧と `markers`）で重複しない。未設定以外のIDは UUID v7。
2. 未設定のクウカン（Nil）が存在し、`owner` が `null`、エリアなし、描画なし。
3. モノの `place` は、存在するクウカンかエリア。
4. モノの `category` は、存在するカテゴリか `null`。`tags` は存在するタグで、重複しない。
5. カテゴリの `parent` は、存在するカテゴリか `null`。輪にならない。
6. エリアの `kuukan` は存在するクウカン。`parent` は同じクウカンのエリアか `null`。輪にならない。
7. クウカンの `owner` は、存在するモノか `null`。1つのモノが持つクウカンは1つまで。
8. 入れ子が輪にならない。
9. （D3）`owner` が `null` のクウカンは `name` を持つ。

### 5.2 描画の層（設計 6.6）

1. クウカンの描画は、存在する未設定以外のクウカンを指し、クウカンごとに1つまで。外形が `validateOutline` を通る。`aspect > 0`。
2. 仕切りは、描画のあるクウカンのものだけ。クウカンごとに `computeRegions` が通る。
3. マーカーは、描画のあるクウカンを指す。形が正しい。回転は 0〜7 の整数。
4. モノの描画は、存在するモノを指し、モノごとに1つまで。そのモノの置き場が属するクウカンに描画がある。形が正しい。回転は 0〜7 の整数。

---

## 6. 書き出し（`core/serialize.ts`）

```ts
function serializeDocument(doc: ArekokoDocument): string;   // 違反があれば SerializeError を投げる
```

- `validateDocument` を通してから `JSON.stringify(doc)`（改行・空白なし。設計 6.1）。
- キーの順はオブジェクトのまま（読み込んだ順＋足した順）。

---

## 7. 索引と置き場（`core/indexes.ts`、`core/places.ts`）

### 7.1 索引

`getIndexes(doc)` は、文書ごとに1回だけ作って WeakMap で覚える（文書は不変なので安全）。

| 索引 | 内容 |
|---|---|
| `kindOf` | ID → 種類 |
| `kuukanById` ほか | 種類ごとの ID → 要素 |
| `childAreas` | 親（クウカンのID か エリアのID）→ 子のエリア（`order`、次にIDの順） |
| `itemsByPlace` | 置き場 → モノ |
| `itemsByCategory` | カテゴリ（未分類は `null`）→ モノ |
| `itemsByTag` | タグ → モノ |
| `kuukanByOwner` | モノ → 持っているクウカン |
| `childCategories` | 親（いちばん上は `null`）→ 子のカテゴリ |
| `kuukanDrawingOf`、`partitionOf`、`markersOf`、`itemDrawingOf` | 描画の層の引き当て |

### 7.2 置き場の計算

- `kuukanOfPlace(doc, place)`：置き場が属するクウカン。
- `placePath(doc, place)`：いちばん外のクウカンから置き場までの並び。収納のクウカンは、持ち主のモノの置き場へ続く。例：`Room A › 床1 › 棚A1 › 段1`。
- `displayName(doc, id)`：2.5 のとおり。
- `isInsideKuukan(doc, place, kuukan)`：置き場が、そのクウカンの中（中の収納の中まで含む）にあるか。
- `placeCandidates(doc, itemIds)`：置き場の候補。対象のモノが持つクウカンの中（中の収納の中まで含む）は除く（設計 7.5、8.6）。
- `itemsWithin(doc, place)`：その置き場と、その下のエリア、中の収納の中まで含めたモノ（検索の「置き場」条件で使う）。

---

## 8. 操作（`core/ops/`）

### 8.1 共通の約束

```ts
interface OpContext { newId(): Id; now(): string }
interface OpResult {
  doc: ArekokoDocument;
  moved: Id[];          // 統一規則で置き場が変わったモノ（ハイライトする）
  created: Id[];        // 作った要素
}
class OpError extends Error { code: OpErrorCode }
```

- 前提を満たさない呼び出し（存在しないID、輪を作る置き場、未設定の削除など）は `OpError` を投げる。壊れた文書は決して返さない。
- 所属の層でモノの項目（名前・置き場・カテゴリ・タグ・概要・数量）が変わったら、そのモノの `updatedAt` を `ctx.now()` にする。描画だけの変更では変えない。
- モノの置き場が**別のクウカン**に変わったら、そのモノの描画を外す（設計 7.7）。同じクウカンの中の移動では外さない。
- 影響を見せる操作には、実行前に呼ぶ `plan〜` 関数を用意する。戻り値は移動の一覧：

```ts
interface Relocation { from: Id; to: Id; items: Id[] }   // from/to は置き場
```

### 8.2 一覧

| ファイル | 関数 | 内容 |
|---|---|---|
| items | `addItem(doc, { name, place?, category?, tags?, summary?, qty? }, ctx)` | 置き場の既定は未設定。描画なし |
| items | `updateItem(doc, id, { name?, summary?, qty? }, ctx)` | `summary`・`qty` に `null` を渡すと項目を消す |
| items | `moveItems(doc, ids, place, ctx)` | 候補（7.2）にない置き場は `OpError`。既にそこにあるモノは変えない |
| items | `setItemsCategory(doc, ids, category, ctx)` | |
| items | `addTagToItems(doc, ids, tag, ctx)` / `removeTagFromItems(doc, ids, tag, ctx)` | |
| items | `deleteItems(doc, ids, ctx)` | 収納なら、そのクウカンも消え、中身は収納があった置き場へ（統一規則）。消すモノどうしが入れ子でも、順に処理すれば正しくなる |
| notices | `removeNotice(doc, kind, id, index)` | 修復メモを消す。書き換えはできない |
| categories | `createCategory`、`renameCategory`、`moveCategory(doc, id, parent)`、`deleteCategory` | `moveCategory` は輪になる親を `OpError`。削除：中のモノと子カテゴリを親へ（親がなければ未分類・いちばん上） |
| tags | `createTag`、`renameTag`、`deleteTag` | 削除：タグと全部の参照を消す。件数は `getIndexes` で数える |
| kuukans | `createKuukan(doc, { name, areaLabel? }, ctx)` | どこにも置かれていない、描画なしのクウカン |
| kuukans | `renameKuukan`、`setAreaLabel` | `renameKuukan` は、どこにも置かれていないクウカンだけ（未設定は不可） |
| kuukans | `planDeleteKuukan` / `deleteKuukan` | 中身は未設定へ。中の収納は中身ごと移る。エリア・描画・仕切り・マーカーも消す |
| storage | `makeStorage(doc, itemId, { areaLabel? }, ctx)` | モノを、描画なしの収納にする（段階5で描画つきに広げる） |
| storage | `planRemoveStorage` / `removeStorage` | 中のクウカンを消す。中身は収納があった置き場へ |
| areas | 9.6 | 仕切りとエリアの操作（段階2） |

---

## 9. 幾何（`src/geometry/`）

### 9.1 型

```ts
type Polygon = Point[];   // 正規化済み：重複点と一直線上の途中の点がない。向きは符号付き面積が正。始点は y が最小（同じなら x が最小）の頂点
interface Rect { x0: number; y0: number; x1: number; y1: number }   // x0 < x1, y0 < y1
interface Segment { from: Point; to: Point }   // 軸に平行
```

座標はすべて整数で計算する。点の位置の判定では、半整数（図形の中心）も受け付ける（JS の数値で正確に表せる）。

### 9.2 多角形（`polygon.ts`）

- `normalizePolygon(points)`：連続する同じ点と、一直線上の途中の点を除き、向きをそろえる。退化していれば `null`。
- `validateRectilinearPolygon(points)`：`{ ok: true, polygon } | { ok: false, reason }`。条件：整数、正規化後に4点以上、辺はすべて縦か横（正規化後は縦横が交互）、自己交差も接触もしない（隣り合わない辺が共有点を持たない）、面積が正。
- `validateOutline(points)`：上に加えて、外接長方形がちょうど `[0,10000]×[0,10000]`。
- `boundingRect(poly)`、`polygonArea(poly)`、`isRectangle(poly)`。
- `locatePoint(poly, p)`：`'inside' | 'boundary' | 'outside'`。
- `decomposeToRects(poly)`：長方形の並び。y の値で横の帯に切り、帯ごとの x の区間を求め、上下で同じ区間をまとめる。

### 9.3 仕切り（`partition.ts`）

- `boundedSegment(poly, axis, seed)`：seed が多角形の内部（境界を除く）になければ `null`。あれば、seed を通る線（`axis: 'x'` なら x = seed[0] の縦線）を両方向に伸ばし、最初に境界に触れた点で止めた線分を返す。
  - 縦線の場合：x 範囲が seed[0] を含む（端点も含む）横の辺の y のうち、seed[1] より小さい最大と、大きい最小が止まる位置。
  - この規則で、角を通る場合（反り返った角で止まる）と、辺に重なる場合（重なる手前の角で止まる）が自然に扱える。
- `splitPolygon(poly, segment)`：線分の両端を境界に差し込み、境界を2つに分けて2つの多角形にする。座標の小さい側を先に返す。どちらも正規化する。
- `evenSplitPositions(lo, hi, n)`：`lo + (hi - lo) * i / n` を丸めた整数（i = 1..n-1）。狭義の昇順にならなければ `null`。
- `splitRect(rect, axis, ats)`：長方形を帯に分ける。

### 9.4 エリアの領域（`regions.ts`）

```ts
interface AreaTree { root: Id; children: Map<Id, Id[]> }   // 所属の層の木。root はクウカンのID
function computeRegions(outline: Point[], tree: AreaTree, partitions: Partition[]):
  { ok: true; regions: Map<Id, Polygon> } | { ok: false; reason: string };
```

検査すること：

1. 外形が `validateOutline` を通る。
2. 木の、子を持つ節（根か、エリア）ごとに、`area` がその節である仕切りがちょうど1つある。その `children` は、所属の層の子と同じ集合（重複なし）。子を持たない節を指す仕切り、木にない節を指す仕切りはない。
3. `children.length === at.length + 1`。`at` は狭義の昇順の整数。
4. `at.length === 1`：`seed` があり、`seed[軸] === at[0]`、`boundedSegment(親の領域, axis, seed)` が `null` でない。分けた2つが `children[0]`（座標の小さい側）と `children[1]`。
5. `at.length >= 2`：`seed` はない。親の領域が長方形で、すべての `at` がその内側（端を含まない）。帯を順に `children` へ。
6. できた領域はすべて面積が正。

`leafAt(regions, tree, p)`：p を内部に含む、いちばん深い節。p が境界（仕切りの線を含む）の上なら `null`。

### 9.5 ドラッグの範囲（`drag.ts`）

```ts
function dragRange(outline, tree, partitions, node: Id, lineIndex: number): { min: number; max: number };
```

「エリアの分かれ方が変わらない範囲」（設計 7.2）を、次の**形の署名**が変わらない、連続した整数の範囲と定める。

- 署名：`computeRegions` が通ること、動かす線分の長さ方向の両端の座標、動かす節の部分木にあるすべての領域の頂点の数。
- 署名が変わりうる座標（臨界値）は、親の領域の頂点の座標、同じ仕切りの隣の線、部分木の中の同じ軸の線、部分木の中の別の軸の仕切りの seed の座標。臨界値と、その間の1点で署名を調べ、今の位置から両側へ、署名が同じあいだ広げる。
- 今の位置が臨界値で、両側とも署名が変わる場合（例：反り返った角で止まっている線）は、`min === max === 今の位置`（動かせない）。
- 境界で止める仕切りを動かすときは、`seed[軸]` も同じだけ動かす。

### 9.6 仕切りとエリアの操作（`core/ops/areas.ts`）

| 関数 | 内容 |
|---|---|
| `attachOutline(doc, kuukan, { outline, aspect, realSize? }, ctx)` | 描画のない、エリアのないクウカンに外形を付ける（段階5の「確定」の土台。テストでも使う） |
| `splitAt(doc, kuukan, axis, point, ctx)` | `leafAt` で葉を探し、そこを境界で止める仕切りで2つに分ける。境界の上なら `OpError('onLine')` |
| `splitEven(doc, node, axis, n, ctx)` | 子のない節（長方形）をN等分。`n === 2` なら境界で止める仕切りとして記録する（seed は線の中点。整数にできなければ `OpError`） |
| `planDeleteLine` / `deleteLine(doc, node, lineIndex, ctx)` | 下の規則 |
| `moveLine(doc, node, lineIndex, at)` | `dragRange` の外なら `OpError` |
| `renameArea(doc, area, name)` | |

- **名前**：根を分けると「呼び名＋番号」（床1、床2）。エリアを分けると「親の名前-番号」（床1-1、床1-2）。
- **`order`**：仕切りの `children` の中の位置と同じにする。
- **線を消す**（設計 7.2）：
  - `at.length === 1`：仕切りを消し、2つの子を子孫ごと消す。中身は節へ（節が根ならクウカンそのもの）。
  - `at.length >= 2` で k 番目の線（子 k と k+1 の間）：子 k と k+1 を子孫ごと消し、中身は節へ。その位置に空の新しいエリアを1つ作る（名前は「呼び名＋次の番号」、エリアの下なら「親の名前-次の番号」。次の番号は、消す前の兄弟の番号の最大＋1）。`at` から k 番目を除く。残りが1本になったら seed を線の中点にする。
- 消したエリアの子孫の仕切りも消す。中身の移動は統一規則（`relocate.ts`）で行い、`moved` に入れる。同じクウカンの中の移動なので描画は外さない。
- 文書の中の名前は空でもよく、そのまま処理する（名前は表示専用。設計 原則5）。画面の入力欄は空を受け付けない（空にして入力を終えると元の名前に戻る）（TRS 付録B I-07、2026-10-11 ユーザーが決定）。

---

## 10. 元に戻す・やり直す（`core/history.ts`）

- 文書は不変なので、操作の前の文書を積むだけでよい（スナップショット）。
- 直近50回まで。戻した後に新しい操作をしたら、やり直すの履歴を消す。
- `record(prev)`、`undo(current)`、`redo(current)`、`clear()`、`canUndo`、`canRedo`。
- いつ消すか（画面を切り替えたとき等）は画面の側が決める（設計 10章）。

---

## 11. テスト

### 11.1 単体テスト

- **ID**：形式、単調増加（同じミリ秒で1万個）、時刻の読み出し、時計が戻ったとき。
- **読み込み**：修復コードごとに、最小の壊れた文書 → 期待する `repairs` と、直した後の文書。断るコードごとに1つ以上。仮IDの付け替えで参照もまとめて変わること。重複したIDへの参照が「参照先なし」になること。
- **幾何**：設計 14章の境目（角を通る、辺に重なる、コの字の腕、伸び縮み）を含める。L字・コの字・凸凹のある外形で、`boundedSegment` と `splitPolygon` の結果を座標で確かめる。
- **操作**：統一規則の各場面（設計 7.8 の表の6行）。

### 11.2 ランダム検査（fast-check）

- 操作の列をランダムに作って実行し、1操作ごとに次を確かめる。
  - `validateDocument(doc)` が空。
  - 往復：`analyzeDocument(serializeDocument(doc))` が `ok` で、文書が等しい。
- 対象の操作（作るたびに足す）：モノの追加・移動・削除、カテゴリとタグの作成・削除・付け外し、クウカンの作成・削除、収納として設定する・収納設定を削除する、外形を付ける、仕切りを入れる（境界で止める・N等分）・消す・動かす、元に戻す・やり直す。
- 壊す方向のランダム検査：正しい文書の参照をランダムに壊して読み込み、結果が `refused` か、`repair` の文書が `validateDocument` を通ることを確かめる。

---

## 付録A：モジュール間の契約（エクスポート）

並行して作るため、モジュールの外へ出す名前と型をここで固定する。**名前・引数・戻り値を変えないこと。** 内部の補助関数は自由に足してよい。型は `src/core/types.ts`、`src/geometry/types.ts`、定数は `src/core/constants.ts` にある（書き換えない）。

### A.1 `src/core/ids.ts`

```ts
export function newId(): string;                       // 既定の生成器で UUID v7
export function createIdGenerator(opts?: { now?: () => number; random?: (bytes: Uint8Array) => void }): () => string;
export function isUuidV7(s: string): boolean;
export function timestampOfV7(id: string): number;     // v7 でなければ例外
```

### A.2 `src/geometry/polygon.ts`

```ts
export function normalizePolygon(points: Point[]): Polygon | null;
export function validateRectilinearPolygon(points: unknown): { ok: true; polygon: Polygon } | { ok: false; reason: string };
export function validateOutline(points: unknown): { ok: true; polygon: Polygon } | { ok: false; reason: string };
export function boundingRect(poly: Point[]): Rect;
export function polygonArea(poly: Point[]): number;     // 絶対値
export function isRectangle(poly: Polygon): boolean;
export function locatePoint(poly: Polygon, p: Point): PointLocation;
export function decomposeToRects(poly: Polygon): Rect[];
```

### A.3 `src/geometry/partition.ts`

```ts
export function boundedSegment(poly: Polygon, axis: Axis, seed: Point): Segment | null;
export function splitPolygon(poly: Polygon, axis: Axis, segment: Segment): [Polygon, Polygon];  // 座標の小さい側が先
export function evenSplitPositions(lo: number, hi: number, n: number): number[] | null;
export function splitRect(rect: Rect, axis: Axis, ats: number[]): Rect[];
export function rectToPolygon(rect: Rect): Polygon;
```

### A.4 `src/geometry/shape.ts`

```ts
export function isValidShape(shape: Shape): boolean;   // point/rect は形式どおりか、poly は validateRectilinearPolygon
export function shapeCenter(shape: Shape): Point;      // point: at、rect: 中心、poly: 外接長方形の中心（半整数がありうる）
```

### A.5 `src/geometry/regions.ts`

```ts
export interface AreaTree { root: Id; children: Map<Id, Id[]> }   // 子を持たない節はキーがないか空配列
export function computeRegions(outline: Point[], tree: AreaTree, partitions: Partition[]):
  { ok: true; regions: Map<Id, Polygon> } | { ok: false; reason: string };
export function leafAt(regions: Map<Id, Polygon>, tree: AreaTree, p: Point): Id | null;
```

### A.6 `src/geometry/drag.ts`

```ts
export function dragRange(outline: Point[], tree: AreaTree, partitions: Partition[], node: Id, lineIndex: number):
  { min: number; max: number };
```

### A.7 `src/core/indexes.ts`

```ts
export interface Indexes {
  kindOf: Map<Id, EntityKind>;
  kuukanById: Map<Id, Kuukan>;
  areaById: Map<Id, Area>;
  itemById: Map<Id, Item>;
  categoryById: Map<Id, Category>;
  tagById: Map<Id, Tag>;
  markerById: Map<Id, Marker>;
  childAreas: Map<Id, Area[]>;            // 親（クウカンID か エリアID）→ 子（order, id の順）
  itemsByPlace: Map<Id, Item[]>;
  itemsByCategory: Map<Id | null, Item[]>;
  itemsByTag: Map<Id, Item[]>;
  kuukanByOwner: Map<Id, Kuukan>;
  childCategories: Map<Id | null, Category[]>;
  kuukanDrawingOf: Map<Id, KuukanDrawing>;
  partitionOf: Map<Id, Partition>;         // 節（クウカンID か エリアID）→ 仕切り
  markersOf: Map<Id, Marker[]>;            // クウカン → マーカー
  itemDrawingOf: Map<Id, ItemDrawing>;
}
export function getIndexes(doc: ArekokoDocument): Indexes;   // WeakMap で覚える
export function buildAreaTree(doc: ArekokoDocument, kuukan: Id): AreaTree;
```

### A.8 `src/core/places.ts`

```ts
export interface PathStep { id: Id; kind: 'kuukan' | 'area' | 'item'; name: string }
export function kuukanOfPlace(doc: ArekokoDocument, place: Id): Id;
export function placePath(doc: ArekokoDocument, place: Id): PathStep[];   // 収納のクウカンは持ち主のモノ（kind: 'item'）として出す
export function formatPlacePath(doc: ArekokoDocument, place: Id): string; // "Room A › 床1 › 棚A1 › 段1"
export function displayName(doc: ArekokoDocument, id: Id): string;        // 詳細設計 2.5
export function isInsideKuukan(doc: ArekokoDocument, place: Id, kuukan: Id): boolean;
export function placeCandidates(doc: ArekokoDocument, itemIds: Id[]): Id[];
export function itemsWithin(doc: ArekokoDocument, place: Id): Item[];
export function areaSubtree(doc: ArekokoDocument, area: Id): Id[];       // そのエリアと子孫のエリアのID
```

### A.9 `src/core/validate.ts`、`src/core/serialize.ts`

```ts
export interface Violation { code: string; message: string; ids: Id[] }
export function validateDocument(doc: ArekokoDocument): Violation[];
export function validateKuukanDrawing(doc: ArekokoDocument, kuukan: Id):
  { ok: true; regions: Map<Id, Polygon> } | { ok: false; reason: string };

export class SerializeError extends Error { violations: Violation[] }
export function serializeDocument(doc: ArekokoDocument): string;
```

### A.10 `src/core/load/index.ts`、`src/core/schema.ts`

```ts
export interface LoadContext { newId(): Id; now(): string }
export type RepairCode = 'tempId' | 'reservedId' | 'duplicateId' | 'missingUnset' | 'placeMissing' | 'categoryMissing'
  | 'tagMissing' | 'tagDuplicate' | 'categoryParentMissing' | 'ownerMissing' | 'ownerShared' | 'unsetHasOwner'
  | 'areaKuukanMissing' | 'areaParentMissing' | 'unsetHasAreas' | 'unsetHasDrawing' | 'kuukanDrawingInvalid'
  | 'partitionMismatch' | 'markerInvalid' | 'itemDrawingInvalid' | 'drawingDropped';
export type RefusalCode = 'notJson' | 'notArekoko' | 'newerVersion' | 'schema' | 'cycleCategory' | 'cycleArea' | 'cycleNesting';
export interface RepairEntry { code: RepairCode; message: string; target?: { kind: EntityKind; id: Id } }
export interface Refusal { code: RefusalCode; message: string; path?: string }
export type LoadResult =
  | { kind: 'ok'; doc: ArekokoDocument }
  | { kind: 'repair'; doc: ArekokoDocument; repairs: RepairEntry[] }
  | { kind: 'refused'; reasons: Refusal[] };
export function analyzeDocument(input: string | unknown, ctx: LoadContext): LoadResult;

// schema.ts
export interface SchemaIssue { path: string; message: string }
export interface SchemaCheck {
  fatal: SchemaIssue[];                         // ルート・所属の層の違反（断る）
  dropDrawing: boolean;                         // /drawing そのものの違反
  dropCollections: Set<string>;                 // /drawing/<一覧> そのものの違反
  dropElements: Map<string, Set<number>>;       // /drawing/<一覧>/<番号> 以下の違反
}
export function checkSchema(json: unknown): SchemaCheck;
```

### A.11 `src/core/ops/common.ts`

```ts
export interface OpContext { newId(): Id; now(): string }
export interface OpResult { doc: ArekokoDocument; moved: Id[]; created: Id[] }
export interface Relocation { from: Id; to: Id; items: Id[] }
export type OpErrorCode = 'notFound' | 'invalidPlace' | 'cycle' | 'reserved' | 'alreadyStorage' | 'notStorage'
  | 'notTopLevel' | 'noDrawing' | 'hasAreas' | 'onLine' | 'notLeaf' | 'notRectangle' | 'tooSmall'
  | 'outOfRange' | 'invalidInput';
export class OpError extends Error { readonly code: OpErrorCode; constructor(code: OpErrorCode, message: string) }
export function touch<T extends { updatedAt?: string }>(item: T, ctx: OpContext): T;   // updatedAt を更新した写し
```

### A.12 `src/core/relocate.ts`

```ts
// 置き場の対応（なくなる置き場 → 行き先）に従ってモノを移す。
// 別のクウカンへ移るモノの描画は外す。移ったモノの updatedAt を更新する。
export function relocateItems(doc: ArekokoDocument, mapping: Map<Id, Id>, ctx: OpContext):
  { doc: ArekokoDocument; moved: Id[]; relocations: Relocation[] };
```

クウカンを中身ごと片付ける処理（収納のモノの削除、収納設定の削除、どこにも置かれていないクウカンの削除で共通）：

```ts
export function removeKuukan(doc, kuukan: Id, destination: Id, ctx): { doc; moved: Id[]; relocations: Relocation[] };
export function planRemoveKuukan(doc, kuukan: Id, destination: Id): Relocation[];
```

### A.13 操作（`src/core/ops/*.ts`）

`doc` は `ArekokoDocument`、`ctx` は `OpContext`、戻り値は `OpResult`（plan〜 を除く）。

```ts
// items.ts
addItem(doc, input: { name: string; place?: Id; category?: Id | null; tags?: Id[]; summary?: string; qty?: number }, ctx)
updateItem(doc, id: Id, patch: { name?: string; summary?: string | null; qty?: number | null }, ctx)
moveItems(doc, ids: Id[], place: Id, ctx)
setItemsCategory(doc, ids: Id[], category: Id | null, ctx)
addTagToItems(doc, ids: Id[], tag: Id, ctx)
removeTagFromItems(doc, ids: Id[], tag: Id, ctx)
planDeleteItems(doc, ids: Id[]): Relocation[]
deleteItems(doc, ids: Id[], ctx)
// notices.ts
removeNotice(doc, kind: 'kuukan' | 'area' | 'item' | 'category' | 'tag', id: Id, index: number)
// categories.ts
createCategory(doc, input: { name: string; parent?: Id | null }, ctx)
renameCategory(doc, id: Id, name: string)
moveCategory(doc, id: Id, parent: Id | null)
deleteCategory(doc, id: Id, ctx)
// tags.ts
createTag(doc, input: { name: string }, ctx)
renameTag(doc, id: Id, name: string)
deleteTag(doc, id: Id, ctx)
// kuukans.ts
createKuukan(doc, input: { name: string; areaLabel?: string }, ctx)
renameKuukan(doc, id: Id, name: string)
setAreaLabel(doc, id: Id, label: string)
planDeleteKuukan(doc, id: Id): Relocation[]
deleteKuukan(doc, id: Id, ctx)
// storage.ts
makeStorage(doc, itemId: Id, input: { areaLabel?: string }, ctx)
planRemoveStorage(doc, itemId: Id): Relocation[]
removeStorage(doc, itemId: Id, ctx)
// areas.ts（段階2）
attachOutline(doc, kuukan: Id, input: { outline: Point[]; aspect: number; realSize?: RealSize }, ctx)
splitAt(doc, kuukan: Id, axis: Axis, point: Point, ctx)
splitEven(doc, node: Id, axis: Axis, n: number, ctx)
planDeleteLine(doc, node: Id, lineIndex: number): { removedAreas: Id[]; relocations: Relocation[]; createsArea: boolean }
deleteLine(doc, node: Id, lineIndex: number, ctx)
moveLine(doc, node: Id, lineIndex: number, at: number)
renameArea(doc, id: Id, name: string)
```

ctx を取らない操作（名前の変更など、モノの updatedAt を変えないもの）は ctx を取らない。

### A.14 `src/core/history.ts`、`src/core/document.ts`

```ts
export class History {
  constructor(limit?: number);           // 既定 MAX_HISTORY
  record(prev: ArekokoDocument): void;   // 操作の前の文書を積む。やり直すの履歴を消す
  undo(current: ArekokoDocument): ArekokoDocument | null;
  redo(current: ArekokoDocument): ArekokoDocument | null;
  clear(): void;
  get canUndo(): boolean;
  get canRedo(): boolean;
}
export function createEmptyDocument(): ArekokoDocument;   // 未設定のクウカンだけを持つ
```

---

## 付録B：ワーカーへの共通の約束

- TypeScript（strict、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`）。型だけの import は `import type`。
- import はファイル拡張子なしの相対パス（例：`../core/types`）。
- 外部ライブラリは使わない（例外：`core/schema.ts` の Ajv、テストの Vitest と fast-check）。
- テストは `tests/` の下に、`src/` と同じ並びで置く（例：`tests/geometry/polygon.test.ts`）。`import { describe, it, expect } from 'vitest'`。
- コメントは日本語で、少なめに。何をするかより、なぜそうするかを書く。
- エラーメッセージ（利用者に見せるもの）は日本語。
