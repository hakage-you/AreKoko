# アレココ 詳細設計（段階3〜4：ファイル操作・リストで使える版）

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-10-08 |
| もとにした設計 | `docs/design.md`（設計）、`docs/detailed-design.md`（詳細設計 段階1〜2） |
| 範囲 | 段階3（ファイル操作）、段階4（リストで使える版） |

---

## 1. 構成

画面とロジックを分ける（設計 5.2）。Svelte に依存するのは `src/ui/` だけにする。

```
src/
  file/        ファイル操作（ブラウザのAPIに触れる薄い層と、テストできる中心部分）
    backend.ts       FileBackend（読み書きの抽象）と、File System Access API・ダウンロードによる実装
    session.ts       DocumentSession：保存の状態、自動保存、外での変更の検知（ブラウザに依存しない）
    recent.ts        最近開いたファイル（IndexedDB にファイルハンドルだけを残す）
    settings.ts      アプリの設定（localStorage。今は自動保存のオン・オフだけ）
  search/      検索（ブラウザに依存しない）
    normalize.ts     照らし合わせのための正規化
    search.ts        検索の条件と実行、候補
  app/         画面の状態と操作の流れ（ブラウザに依存しない。Svelte にも依存しない）
    store.ts         AppStore：今の文書、履歴、ハイライト、画面、選択、通知
  ui/          Svelte の画面
```

---

## 2. ファイル操作（段階3）

### 2.1 FileBackend

```ts
interface FileStat { lastModified: number }
interface FileBackend {
  readonly name: string;                         // 表示用のファイル名
  readonly canOverwrite: boolean;                // false ならダウンロードで書き出すだけ
  read(): Promise<{ text: string } & FileStat>;
  stat(): Promise<FileStat>;
  write(text: string): Promise<FileStat>;        // 書いた後の更新日時を返す
}
```

- **FsAccessBackend**（Chrome・Edge）：`FileSystemFileHandle` を包む。`write` は `createWritable()` → `write` → `close` の後、`getFile().lastModified` を返す。
- **DownloadBackend**（それ以外）：`write` は Blob をダウンロードさせる。`canOverwrite: false`。`stat` は常に同じ値を返す（外での変更は検知できない）。
- 開く：`showOpenFilePicker`（なければ `<input type="file">`）。別の名前で保存：`showSaveFilePicker`（なければダウンロード）。
- 新しく作る：作るときにすぐ `showSaveFilePicker` で保存先を選び、空の文書を書いてから始める（D6）。選ばなかったら作らない。File System Access API のない環境では、保存先なしで始め、保存は書き出し（ダウンロード）になる。
- 判定：`'showOpenFilePicker' in window`。

### 2.2 DocumentSession（`file/session.ts`）

ブラウザに依存しない。時計とタイマーを差し込めるようにして、テストでは偽物を使う。

```ts
type SaveStatus =
  | 'saved'          // 保存済み
  | 'dirty'          // 変更あり（自動保存オフ、または保存先なし）
  | 'pending'        // 自動保存の待ち（約1秒）
  | 'saving'         // 書き込み中
  | 'conflict'       // 外で変更された。自動保存を止めている
  | 'invalid'        // 不変条件の違反で書けない（アプリの不具合）
  | 'error';         // 書き込みに失敗した

class DocumentSession {
  constructor(opts: { backend: FileBackend | null; doc: ArekokoDocument; baseline: FileStat | null;
                      autosave: boolean; timers?: Timers });
  get doc(): ArekokoDocument;
  get status(): SaveStatus;
  get dirty(): boolean;
  update(doc: ArekokoDocument): void;           // 変更のたびに呼ぶ。自動保存なら約1秒後に書く
  flush(): Promise<void>;                        // 待たずにすぐ書く（タブを隠す・閉じるとき）
  save(): Promise<void>;                         // 手で保存（自動保存オフのとき、Ctrl+S）
  setAutosave(on: boolean): void;
  resolveConflict(choice: 'reload' | 'overwrite'): Promise<void>;  // 「別の名前で保存」は attach で行う
  attach(backend: FileBackend, baseline: FileStat): void;           // 保存先を付け替える（別の名前で保存の後）
  onChange(listener: () => void): () => void;   // 状態が変わったら知らせる
}
```

- **書く手順**（設計 10章）：
  1. `serializeDocument`（不変条件の検査つき）。違反があれば書かずに `invalid`。
  2. `backend.stat()` の更新日時が、覚えている値（読み込んだとき・前に書いたとき）と違えば、書かずに `conflict` にして、自動保存を止める。
  3. `backend.write(text)`。返った更新日時を覚える。書いている間に次の変更が来ていれば、続けてもう一度書く。
- **自動保存**：オンのとき、`update` のたびに約1秒（1000ms）のタイマーを張り直す（続けて操作している間はまとめて1回）。`flush` はタイマーを待たずにすぐ書く。保存先がない（新しい文書で保存先が未定）か `canOverwrite: false` のときは、自動保存しない（`dirty` のまま）。
- **外での変更**（`conflict`）：画面は3つの選択肢を出す。「読み込み直す（こちらの変更は捨てる）」→ `resolveConflict('reload')`。「別の名前で保存する」→ 画面が保存先を選ばせて `attach` → `save`。「それでも上書きする」→ `resolveConflict('overwrite')`。
- **読み込み直す**：`backend.read()` → `analyzeDocument`。修復が要るときや断るときは、最初の読み込みと同じ流れ（画面側）に渡す。そのため `resolveConflict('reload')` は読んだ文字列を返し、画面が `analyzeDocument` をかける。

### 2.3 最近開いたファイル（`file/recent.ts`）

- Chrome・Edge だけ（ハンドルを保存できる環境）。IndexedDB のデータベース `arekoko`、ストア `recent` に `{ name, handle, openedAt }` を新しい順に最大10件。
- 中身は残さない（設計 原則7）。開くときは `handle.requestPermission({ mode: 'readwrite' })` で許可をもう一度求める（設計 8.1）。
- 一覧から外す操作を付ける（ファイルが消えた・移ったとき用）。

### 2.4 設定（`file/settings.ts`）

- localStorage のキー `arekoko.settings` に `{ autosave: boolean }`（初期値 true）。読めないとき（プライベートウィンドウなど）は初期値で動く。
- cookie は使わない（設計 原則7）。

### 2.5 閉じるときの警告

- `beforeunload`：保存していない変更（`dirty` か `pending` か `conflict`）があれば警告する。
- `visibilitychange`（hidden）と `pagehide`：`flush()`。

---

## 3. 検索（段階4。`src/search/`）

### 3.1 正規化（`normalize.ts`）

照らし合わせ用の文字列を作る（設計 9章）。

1. `String.prototype.normalize('NFKC')`（全角と半角をそろえる）。
2. カタカナ（U+30A1〜U+30F6）をひらがな（−0x60）にする。
3. 小文字にする。

### 3.2 条件と実行（`search.ts`）

```ts
interface SearchQuery {
  text?: string;                                    // 名前と概要。空白で区切った語をすべて含む
  category?: Id | null;                             // 子孫を含む。null は未分類
  tags?: { ids: Id[]; mode: 'all' | 'any' };
  place?: Id;                                       // 中の収納の中まで含む（itemsWithin）
  unsetOnly?: boolean;                              // 未設定に置かれたモノだけ
  storageOnly?: boolean;                            // 収納だけ
}
function searchItems(doc: ArekokoDocument, q: SearchQuery): Item[];   // 文書の items の並び順
function suggest(doc: ArekokoDocument, text: string): { tags: Tag[]; categories: Category[] };
```

- 条件はすべて「かつ」。
- 索引（`getIndexes`）で候補を絞ってから、残りの条件で照らす（設計 11章）。カテゴリ・タグ・置き場の条件があれば、その索引から候補を作る。
- 名前と概要の正規化した文字列は、文書ごとに WeakMap で覚える。
- `suggest`：入力した文字に名前が当てはまるタグとカテゴリ（絞り込みの候補として出す）。
- 簡易検索（段階6）は、この関数を「文字＋置き場は今のクウカン」で呼ぶ。

---

## 4. 画面の状態（段階4。`src/app/store.ts`）

Svelte に依存しない。画面は `subscribe` で変化を受け取る（Svelte のストア契約と同じ形にして、そのまま `$store` で使えるようにする）。

```ts
type Screen = 'start' | 'search' | 'kuukans' | 'manage' | 'settings';
class AppStore {
  // 状態
  doc: ArekokoDocument | null;
  screen: Screen;
  highlights: Set<Id>;            // 移ったモノ（その場限り）
  session: DocumentSession | null;
  // 操作（中身は core/ops を呼んで、履歴に積み、セッションに渡す）
  apply(op: (doc, ctx) => OpResult): OpResult;   // OpError は呼び出し側へ投げる
  undo(): void; redo(): void;
  setScreen(s: Screen): void;     // 画面を切り替えたら履歴を消す（設計 10章）
}
```

- `apply` の後、`moved` をハイライトにする（次の操作か、画面の切り替えで消す）。
- ID と時刻は `newId`、`new Date().toISOString()`。

---

## 5. 画面（段階4。`src/ui/`）

パソコンが主。スマホでは、探す・見る・置き場を変える、といったリストの操作だけ（設計 5.2）。マウスを重ねたときだけ出る表示に頼らない。

| 画面 | 内容 |
|---|---|
| 最初の画面 | 「新しく作る」「ファイルを開く」、最近開いたファイル（Chrome・Edge） |
| 修復の確認 | 修復案の一覧。「直して読み込む」「読み込まない」。断るときは理由の一覧と「閉じる」 |
| 外での変更 | 2.2 の3つの選択肢 |
| 上部 | ファイル名、保存の状態（「保存済み」「自動保存オフ」「保存先なし」「外で変更されました」など）、元に戻す・やり直す、画面の切り替え |
| サガシモノ | 設計 8.4。検索の条件、まとめ方の切り替え（なし／カテゴリの木／置き場の木／タグ）、仮想スクロールの表、複数選択とまとめての操作、モノの追加 |
| モノの詳細 | 設計 8.6。サガシモノの横（スマホでは全画面）に出す |
| 管理画面 | 設計 8.5。タグとカテゴリ |
| クウカン（仮の入口） | D5。どこにも置かれていないクウカンの一覧と、作成・名前の変更・削除（影響を見せて確認）。行を選ぶと、置き場をそのクウカンにしてサガシモノを開く |
| 設定 | 設計 8.7。自動保存のオン・オフ、クレジット、AI向けの説明ページへの入口（ページ自体は段階7） |

### 5.1 サガシモノの表

- 列：名前（数量があれば名前の横に「×8」）、置き場の経路、カテゴリ（空なら「未分類」）、タグ。
- 行の高さは一定にして、見えている行だけを描く（仮想スクロール）。まとめ方が木のときは、まとまりの見出しの行と、モノの行を平らに並べてから仮想スクロールする。
- 修復メモがあるモノには印を出す（中身は詳細で見る）。
- ハイライト中のモノは行の背景を変え、印も付ける（色だけに頼らない）。

### 5.2 確認のルール

- 確認するのは、まとめて削除するとき（件数を見せる）、タグを消すとき（付いている件数を見せる）、収納設定を削除するとき・クウカンを消すとき（影響：どこから何件がどこへ移るか）。1件だけのモノの削除は確認しない（設計 8.4。元に戻すで補う）。
