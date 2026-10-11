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

## 4. 画面の状態（段階4。`src/app/`）

Svelte に依存しない。ブラウザにも直接は依存しない（ブラウザのAPIは差し込む）。画面は Svelte のストア契約（`subscribe`）で状態を受け取り、`$app` で使う。状態は不変のスナップショットで、変わるたびに新しいオブジェクトになる。

### 4.1 状態（`src/app/store.ts`）

```ts
export type Screen = 'start' | 'search' | 'kuukans' | 'manage' | 'settings';
export type Grouping = 'none' | 'category' | 'place' | 'tag';

export type ConfirmDialog = {
  kind: 'confirm'; title: string; message: string; details: string[]; confirmLabel: string; danger: boolean;
  onConfirm: () => void;
};
export type Dialog =
  | { kind: 'repair'; fileName: string; repairs: RepairEntry[] }   // 修復の確認
  | { kind: 'refused'; fileName: string; reasons: Refusal[] }     // 読み込みを断った
  | { kind: 'conflict' }                                           // 外での変更
  | ConfirmDialog;                                                 // 汎用の確認

export interface AppState {
  screen: Screen;
  doc: ArekokoDocument | null;
  fileName: string | null;
  saveStatus: SaveStatus | null;   // セッションがなければ null
  dirty: boolean;
  hasBackend: boolean;             // 保存先があるか
  canOverwrite: boolean;           // 上書きできるか（false なら保存は書き出し）
  autosave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  highlights: ReadonlySet<Id>;     // 統一規則で移ったモノ（その場限り）
  dialog: Dialog | null;
  toast: { kind: 'info' | 'error'; text: string } | null;
  query: SearchQuery;              // サガシモノの検索の条件
  grouping: Grouping;              // サガシモノのまとめ方
  detail: Id | null;               // モノの詳細に出しているモノ
  selection: ReadonlySet<Id>;      // サガシモノの複数選択
  recent: RecentEntry[];           // 最初の画面に出す最近開いたファイル
  supportsOverwrite: boolean;      // File System Access API があるか（最初の画面の表示に使う）
}
```

### 4.2 差し込むもの

```ts
export interface AppDeps {
  pickFileToOpen(): Promise<{ backend: FileBackend; text: string; stat: FileStat } | null>;
  pickFileToSave(suggestedName: string): Promise<FileBackend | null>;
  supportsFileSystemAccess(): boolean;
  listRecent(): Promise<RecentEntry[]>;
  addRecent(backend: FileBackend): Promise<void>;     // FsAccessBackend のときだけ記録する
  openRecent(entry: RecentEntry): Promise<{ backend: FileBackend; text: string; stat: FileStat } | null>;
  removeRecent(entry: RecentEntry): Promise<void>;
  loadSettings(): AppSettings;
  saveSettings(s: AppSettings): void;
  newId(): Id;
  now(): string;
  timers?: Timers;
}
export function browserDeps(): AppDeps;   // src/app/browserDeps.ts。file/* を使った本物
```

### 4.3 AppStore の操作

```ts
export class AppStore {
  constructor(deps: AppDeps);
  subscribe(run: (s: AppState) => void): () => void;   // Svelte のストア契約（登録したらすぐ1回呼ぶ）
  get state(): AppState;

  // 最初の画面
  init(): Promise<void>;                     // 設定と最近開いたファイルを読む
  newDocument(): Promise<void>;              // D6：保存先を選んでから、空の文書を書いて始める。キャンセルなら何もしない
  openFile(): Promise<void>;                 // 開く → 検査。ok なら始める。修復が要るなら dialog 'repair'、断るなら 'refused'
  openRecent(entry: RecentEntry): Promise<void>;
  removeRecent(entry: RecentEntry): Promise<void>;
  approveRepair(): void;                     // 直した文書で始める（変更ありとして扱い、自動保存が効けば書く）
  rejectRepair(): void;                      // 読み込まない（最初の画面のまま）
  closeDocument(): Promise<void>;            // 最初の画面へ（自動保存の待ちを書き切り、まだ保存されていない変更があれば confirm を出す）

  // 文書の操作
  apply(op: (doc: ArekokoDocument, ctx: OpContext) => OpResult): OpResult | null;
    // 操作を実行し、文書が変われば履歴に積み、セッションへ渡し、moved をハイライトにする。
    // OpError は toast（error）にして null を返す。それ以外の例外は投げ直す。
  undo(): void;
  redo(): void;
  confirm(d: Omit<ConfirmDialog, 'kind'>): void;   // 汎用の確認を出す（押されたら onConfirm を呼んで閉じる）
  closeDialog(): void;
  showToast(kind: 'info' | 'error', text: string): void;
  dismissToast(): void;

  // 保存
  save(): Promise<void>;                     // 手で保存（保存先がなければ pickFileToSave してから）
  saveAs(): Promise<void>;                   // 別の名前で保存
  flush(): Promise<void>;                    // タブを隠す・閉じるとき
  setAutosave(on: boolean): void;            // 設定に書き、セッションにも伝える
  resolveConflict(choice: 'reload' | 'overwrite' | 'saveAs'): Promise<void>;
  openConflictDialog(): void;                // 外での変更のダイアログをもう一度出す（上部の保存の状態から）

  // 画面
  setScreen(s: Exclude<Screen, 'start'>): void;   // 履歴とハイライトと選択を消す（設計 10章）。最初の画面へは closeDocument
  setQuery(q: SearchQuery): void;
  setGrouping(g: Grouping): void;            // 履歴は消さない（設計 10章）
  showDetail(id: Id | null): void;
  setSelection(ids: Iterable<Id>): void;
  toggleSelection(id: Id): void;
}
```

- ハイライトは、次に文書を変える操作をしたとき、元に戻す・やり直すとき、画面を切り替えたときに消す。
- セッションの `onChange` を受けて、`saveStatus`・`dirty` を状態に写す。`conflict` になったら `dialog: { kind: 'conflict' }` を出す。
- 文書が変わったとき、`detail` と `selection` のうち、もう存在しないモノのIDは外す。
- 操作の `ctx` は `{ newId: deps.newId, now: deps.now }`。読み込みの `ctx` も同じ。
- 修復を承認して始めるときは、変更ありの状態にする（直した結果をファイルに書くため）。
- 新しく作るとき（上書きできる保存先）は、空の文書をすぐ書いてから始める（選んだファイルを0バイトのまま残さない）。
- 閉じるときは、自動保存の待ちを書き切ってから、まだ保存されていない変更があれば確認する。

### 4.4 表の行（`src/app/rows.ts`）

サガシモノの表に並べる行を、まとめ方に応じて平らな配列にする（仮想スクロールのため）。

```ts
export type Row =
  | { kind: 'group'; key: string; label: string; depth: number; count: number }
  | { kind: 'item'; key: string; item: Item; depth: number };
export function buildRows(doc: ArekokoDocument, items: Item[], grouping: Grouping): Row[];
```

- `none`：モノの行だけ（depth 0）。
- `category`：カテゴリの木。見出しの行（カテゴリ名、depth は木の深さ）の下に、そのカテゴリに直接属するモノ（depth は見出し＋1）。最後に「未分類」。モノのないカテゴリ（子孫にもない）は出さない。`count` は子孫を含む件数。
- `place`：置き場の木（いちばん外のクウカン → エリア → 収納（モノの名前）→ その中のエリア …）。モノのない枝は出さない。未設定は最後。
- `tag`：タグごとの見出し（名前の順）と、そのタグが付いたモノ。複数のタグが付いたモノは複数の場所に出る（設計 8.4）。最後に「タグなし」。
- `key` は行ごとに一意（同じモノが複数のまとまりに出ても、見出しのキーを前に付けて区別する）。

---

## 5. 画面（段階4。`src/ui/`）

パソコンが主。スマホでは、探す・見る・置き場を変える、といったリストの操作だけ（設計 5.2）。マウスを重ねたときだけ出る表示に頼らない。指で触っても成り立つ大きさ（押せる部分は高さ 40px 以上）にする。

### 5.0 書き方の約束

- **Svelte 5 のルーン**で書く：`let { a, b } = $props()`、`$state`、`$derived`、`$effect`。イベントは `onclick={...}` の属性（`on:click` は使わない）。`export let` は使わない。
- ストアは `src/ui/context.ts` の `getApp()` で受け取る（App.svelte が `setApp` する）。状態は `$app` で読む（`const app = getApp();` の後 `$app.doc`）。
- 文書を変えるのは `app.apply((doc, ctx) => 操作(doc, …, ctx))` だけ。画面から文書を直接書き換えない。
- 色と余白は `src/ui/theme.css` の CSS 変数だけを使う（明るい／暗いの両方。`prefers-color-scheme`）。
- 文言は日本語。用語は設計 4章のとおり（クウカン、モノ、置き場、未設定、サガシモノ など）。
- 幅 768px 未満をスマホの配置とする。
- 外部の UI ライブラリは使わない。

### 5.1 部品

| ファイル | 内容 |
|---|---|
| `ui/App.svelte` | 画面の切り替え、上部、ダイアログ、トースト。`beforeunload`・`visibilitychange`・`pagehide` の登録、Ctrl+S（保存）・Ctrl+Z（元に戻す）・Ctrl+Shift+Z / Ctrl+Y（やり直す）。入力欄にフォーカスがあるときの Ctrl+Z は横取りしない |
| `ui/context.ts` | `setApp(store)` / `getApp()` |
| `ui/theme.css` | CSS 変数と基本のスタイル（ボタン、入力、ダイアログ、チップ） |
| `ui/components/Header.svelte` | ファイル名、保存の状態、保存（書き出し）ボタン、元に戻す・やり直す、画面の切り替え（サガシモノ・クウカン・管理・設定）、閉じる |
| `ui/components/Toast.svelte` | トースト |
| `ui/dialogs/RepairDialog.svelte`・`RefusedDialog.svelte`・`ConflictDialog.svelte`・`ConfirmDialog.svelte` | ダイアログ（`$app.dialog` の種類ごと） |
| `ui/screens/StartScreen.svelte` | 最初の画面 |
| `ui/screens/SearchScreen.svelte` | サガシモノ（`SearchBar`・`ItemTable`・`BulkBar`・`ItemDetail` を並べる） |
| `ui/components/SearchBar.svelte` | 文字の入力、候補（`suggest` のタグ・カテゴリ）、条件のチップ（カテゴリ・タグ（すべて／どれか）・置き場・未設定だけ・収納だけ）、解除 |
| `ui/components/ItemTable.svelte` | 仮想スクロールの表（行の高さ一定、`buildRows`）。まとめ方の切り替え、複数選択のチェック、行を押すと詳細 |
| `ui/components/BulkBar.svelte` | 選択中の件数と、まとめての操作（置き場の変更・カテゴリの変更・タグの付け外し・削除） |
| `ui/components/ItemDetail.svelte` | モノの詳細（設計 7.4、8.6）。修復メモ（消せる）、「＋項目を追加」（概要・数量）、収納として設定する／収納設定を削除する、削除 |
| `ui/components/PlacePicker.svelte` | 置き場を選ぶ（木で表示。`placeCandidates` にないものは出さない） |
| `ui/components/CategoryPicker.svelte` | カテゴリを選ぶ（木。「未分類」。候補の最後に「新しいカテゴリ『〇〇』を作る」） |
| `ui/components/TagPicker.svelte` | タグを選ぶ（複数。候補の最後に「新しいタグ『〇〇』を作る」） |
| `ui/screens/ManageScreen.svelte` | 管理画面（タグ・カテゴリ） |
| `ui/screens/KuukanScreen.svelte` | クウカン（仮の入口。D5） |
| `ui/screens/SettingsScreen.svelte` | 設定 |

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

### 5.2 サガシモノの表

- 列：名前（数量があれば名前の横に「×8」）、置き場の経路、カテゴリ（空なら「未分類」）、タグ。スマホでは名前と経路を2行に重ねる。
- 行の高さは一定にして、見えている行だけを描く（仮想スクロール）。まとめ方が木のときは、`buildRows` の見出しの行とモノの行を平らに並べて仮想スクロールする。
- 修復メモがあるモノには印を出す（中身は詳細で見る）。
- ハイライト中のモノは行の背景を変え、印も付ける（色だけに頼らない）。
- 「＋モノを追加」：名前を入れて追加。置き場は検索の条件の置き場（なければ未設定）。追加したモノの詳細を開く。

### 5.2.1 部品の props（部品どうしの約束）

```ts
// App.svelte
{ store: AppStore }
// ItemDetail.svelte — モノの詳細
{ id: Id; onClose: () => void }
// PlacePicker.svelte — 置き場を選ぶダイアログ。itemIds が空なら、すべての置き場が候補（検索の条件用）
{ title: string; itemIds: Id[]; current?: Id | null; onSelect: (place: Id) => void; onClose: () => void }
// CategoryPicker.svelte — カテゴリを選ぶダイアログ。allowNone なら「未分類」を候補に出す。exclude のカテゴリとその子孫は出さない
{ title: string; current?: Id | null; allowNone: boolean; allowCreate: boolean; exclude?: Id;
  onSelect: (category: Id | null) => void; onClose: () => void }
// TagPicker.svelte — タグを1つ選ぶダイアログ。candidates を渡したら、その中だけ。exclude は出さない
{ title: string; candidates?: Id[]; exclude?: Id[]; allowCreate: boolean; onSelect: (tag: Id) => void; onClose: () => void }
```

- ピッカーは `theme.css` の `.dialog-overlay` と `.dialog` で作るダイアログ。上部に絞り込みの入力欄を置く。
- 「新しい〇〇『△△』を作る」は、入力した文字が空でなく、`allowCreate` のときだけ候補の最後に出し、選ばれたら `app.apply(createTag / createCategory)` で作って、その ID で `onSelect` を呼ぶ（明示的に選んだときだけ作る。設計 8.5）。

### 5.2.2 その他の決めごと

- モノの詳細には、作成日時（UUID v7 から読む。`timestampOfV7`）と更新日時（`updatedAt`）を小さく出す。
- 1件のモノの削除は、収納のモノでも確認しない（設計 8.4。中身は統一規則で移り、ハイライトされる。元に戻すで補う）。
- クレジットの作者とライセンスは `src/app/credits.ts` に置く（未確定の項目は「未設定」と出す）。使っているライブラリ（実行時に読み込まれるもの）：Svelte（MIT）、Ajv（MIT）とその依存。

### 5.3 確認のルール

- 確認するのは、まとめて削除するとき（件数を見せる）、タグを消すとき（付いている件数を見せる）、収納設定を削除するとき・クウカンを消すとき（影響：どこから、どのモノが何件、どこへ移るか。`plan〜` 関数で求め、`formatPlacePath` で示す。モノの名前も見せ、数が多いときの見せ方は画面で決める。TRS 付録B I-13）。1件だけのモノの削除は確認しない（設計 8.4。元に戻すで補う）。
