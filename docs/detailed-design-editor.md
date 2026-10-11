# アレココ 詳細設計（段階5：クウカン編集）

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-10-08 |
| もとにした設計 | `docs/design.md` 7.1・7.2・7.7・8.2、`docs/detailed-design.md`、`docs/detailed-design-ui.md` |
| 終わりの目安（設計 13章） | 部屋と棚を描いて確定し、複製して置き換えられる |

## 0. 追加で決めたこと（確認済み）

| # | 内容 |
|---|---|
| E1 | 外形は「長方形から始めて、辺をドラッグして動かす・辺に段差を足す」で描く。いつも正しい直角の多角形のまま |
| E2 | 下書きで仕切りがあっても外形は変えられる。ただし仕切りと矛盾する変更（仕切りをまたぐ段差など）は受け付けず、理由を出す |
| E3 | マーカーの形は、段階5では点と長方形だけ。直角多角形のマーカーは段階6でモノの描画と一緒に足す |

設計にない細部として、次も決めた（ユーザーの確認は取っていない。区切りの報告で示す）。

| # | 内容 |
|---|---|
| E4 | 棚・押し入れ・チェストのテンプレートは正面から見た図として描く（y は高さ）。実際の長さの2つめの欄は「奥行・高さ」と表示する |
| E5 | 収納のクウカンを複製して「元を残す」と、どこにも置かれていないクウカン（名前は「〇〇のコピー」）になる（1つのモノが持てるクウカンは1つなので） |
| E6 | 下書きには独自の「元に戻す・やり直す」を持つ（下書きは文書の外にあるため）。確定したクウカンの編集は、文書の履歴を使う |

---

## 1. 構成

```
src/
  editor/                 クウカン編集の中核（ブラウザにも Svelte にも依存しない）
    outline.ts            外形の編集（辺を動かす、段差を足す）と、外接長方形の付け直し（reframe）
    draft.ts              下書き（Draft）の作成と、外形の付け替え
    templates.ts          組み込みのテンプレート5つ
    confirm.ts            下書きの確定（新規・元を残す・置き換え）と、その影響
    snap.ts               吸着の目盛りの選び方
  core/ops/
    markers.ts            マーカーの操作
    kuukanDrawing.ts      クウカンの描画の伸び縮み、実際の長さ
  app/
    store.ts              AppStore に、クウカン編集の状態と操作を足す（4章）
  ui/
    screens/KuukanScreen.svelte     クウカンの一覧（仮の入口を置き換える）
    screens/EditorScreen.svelte     クウカン編集（図と道具と横の欄）
    editor/*.svelte                 図の部品
```

---

## 2. 下書き（`src/editor/draft.ts`）

### 2.1 形

下書きは、**未設定と下書きのクウカン1つだけを持つ、小さな文書**として持つ。こうすると、仕切り・エリア・マーカーの操作（`splitAt`、`splitEven`、`deleteLine`、`moveLine`、`renameArea`、マーカーの操作）と検査（`validateDocument`）を、そのまま下書きに使える。下書きにモノは入れない。

```ts
export type TemplateId = 'room6' | 'livingL' | 'shelf3' | 'oshiire' | 'chest4';
export type DraftOrigin =
  | { kind: 'new' }
  | { kind: 'template'; template: TemplateId }
  | { kind: 'duplicate'; source: Id }          // 元のクウカン
  | { kind: 'storage'; item: Id };             // 収納として設定するモノ
export interface Draft {
  origin: DraftOrigin;
  kuukan: Id;              // 下書きのクウカンのID。duplicate なら元のクウカンのID（置き換えで引き継ぐ）
  doc: ArekokoDocument;    // 未設定＋下書きのクウカン（とそのエリア・描画・仕切り・マーカー）
}
```

- 下書きのクウカンは、storage のとき `owner` に収納にするモノのIDを入れる（下書きの文書の中にそのモノはないので、下書きの文書は `validateDocument` を通らない）。そのため、下書きの検査は `validateDraft(draft)`（下書きの文書の `owner` を一時的に `null`・`name` を補ってから `validateDocument`）で行う。
- 下書きのIDは `ctx.newId()` で作る（文書全体で重ならない）。duplicate は元のIDをそのまま使う（エリア・マーカーも）。

### 2.2 作る

```ts
export function newDraft(input: { name: string; areaLabel?: string }, ctx: OpContext): Draft;
  // 外形は長方形 [0,0]-[10000,10000]、aspect 4/3、realSize なし。areaLabel の既定は「エリア」
export function templateDraft(template: TemplateId, ctx: OpContext): Draft;   // 3章
export function duplicateDraft(doc: ArekokoDocument, source: Id, ctx: OpContext): Draft;
  // 元のクウカンのエリア・描画・仕切り・マーカーを写す（IDはそのまま）。名前は元の表示名。
export function storageDraft(doc: ArekokoDocument, item: Id, ctx: OpContext): Draft;
  // owner = item、名前なし。外形の初期値は長方形。そのモノに長方形の描画があれば、その縦横比を使う（回転は戻す）。
  // 直角多角形の描画なら、その形を外形にする（外接長方形を 0〜10000 に写す。回転は戻す。設計 7.5、A-23、TRS 付録B I-09）。点の描画なら初期値の長方形。
  // 置き場のクウカンに描画があれば aspect = (w × そのクウカンの aspect) / h、なければ w / h（w・h は描画の外接長方形）。
  // モノの描画と、収納のクウカンの外形は食い違ってよい（片方を変えてももう片方は変わらない。A-23）。
export function validateDraft(draft: Draft): Violation[];
```

### 2.3 外形を付ける・外す・変える

```ts
export function setDraftOutline(draft: Draft, outline: Point[]): Draft | { error: string };
export function removeDraftOutline(draft: Draft): Draft | { error: string };   // エリア・マーカーがあれば error
export function addDraftOutline(draft: Draft): Draft;                           // 描画がないとき、長方形を付ける
```

- `setDraftOutline` の `outline` は、**今の座標系（今の外接長方形が 0〜10000）で表した新しい外形**。外接長方形が 0〜10000 からはみ出したり縮んだりしてよい。中で `reframeDraft`（2.4）をかけて、外接長方形をちょうど 0〜10000 に付け直す。
- 付け直した後に `validateDraft` が通らなければ（仕切りと矛盾する）、`{ error }` を返す（E2）。理由は日本語。

### 2.4 外接長方形の付け直し（`outline.ts` の `reframeDraft`）

外形の外接長方形が変わったとき、下書きのすべての座標を、新しい外接長方形が 0〜10000 になるように写す。

- 写し方：`x' = round((x − minX) × 10000 / (maxX − minX))`、y も同じ。
- 写すもの：外形の点、仕切りの `at` と `seed`、マーカーの形（点の `at`、長方形の4隅を写してから `x, y, w, h` に戻す。`w, h` は 1 以上）。
- `aspect' = aspect × ((maxX − minX) / (maxY − minY))`（外接長方形の縦横の比が変わった分）。
- `realSize`：`w` があれば `w × (maxX − minX) / 10000`、`d` があれば `d × (maxY − minY) / 10000`（物の大きさは変わらず、外形が広がった分だけ実際の長さが増える）。小数第1位に丸める。
- 丸めのため、写した結果が仕切りと矛盾することがある。そのときは呼び出し側（2.3）が error にする。

### 2.5 外形の編集（`outline.ts`）

```ts
export function moveEdge(points: Point[], edgeIndex: number, delta: number): Point[] | null;
export function addStep(points: Point[], edgeIndex: number, at: number, depth: number, side: 'start' | 'end'): Point[] | null;
export function edgeAt(points: Point[], p: Point, tolerance: number): number | null;   // 点に最も近い辺の番号
```

- 辺 i は `points[i] → points[(i+1) % n]`。点は正規化済み（`normalizePolygon`）を前提にする。
- `moveEdge`：横の辺は y を、縦の辺は x を `delta` だけ動かす（両端の点を動かし、隣の辺が伸び縮みする）。結果を `validateRectilinearPolygon` にかけ、通れば正規化した点、通らなければ null（辺の長さが0以下、自己交差など）。
- `addStep`：辺 i の上の、辺の向きの座標 `at` の位置で辺を2つに分け、`side`（'start' は辺の始点側、'end' は終点側）の部分を辺に垂直に `depth` だけ動かす。分ける位置は辺の両端の内側（端を含まない）。結果を検査し、通らなければ null。
  - 例：上の辺 (0,0)→(10000,0) を at=4000、side 'end'、depth 3000 → (0,0)(4000,0)(4000,3000)(10000,3000)… の凹み。
- 座標はすべて整数。`delta`・`at`・`depth` も整数（吸着した値）。

---

## 3. テンプレート（`src/editor/templates.ts`）

設計 8.2 の5つ。アプリの考え方を1つずつ見せる組み合わせ。

| ID | 名前 | 外形・大きさ | 呼び名 | 中身 |
|---|---|---|---|---|
| room6 | 6畳間 | 長方形、幅 360・奥行 270（cm） | 床 | ドアのマーカー（長方形、下の辺の右寄り：x 6500〜8500、y 9600〜10000、名前「ドア」） |
| livingL | L字のリビング | L字 `[0,0][10000,0][10000,5500][6000,5500][6000,10000][0,10000]`、幅 540・奥行 450 | エリア | 柱のマーカー（長方形、内側の角の近く：x 5400〜6000、y 4900〜5500、名前「柱」、置き場にしない） |
| shelf3 | 3段の棚 | 長方形、幅 90・奥行・高さ 180（正面図。E4） | 段 | 横に3等分（段1〜段3） |
| oshiire | 押し入れ | 長方形、幅 180・高さ 170（正面図） | 段 | 横の仕切りで上段・下段（名前「上段」「下段」）、上段を縦の仕切りで左右（名前「左」「右」） |
| chest4 | 4段のチェスト | 長方形、幅 80・高さ 100（正面図） | 引き出し | 横に4等分（引き出し1〜4） |

- テンプレートの下書きは `origin: { kind: 'template', template }`。名前の初期値はテンプレートの名前。
- 仕切りとエリアは、中核の操作（`attachOutline`、`splitEven`、`splitAt`、`renameArea`）で組み立てる（仕切りの記録を手で書かない）。

---

## 4. 確定（`src/editor/confirm.ts`）

```ts
export type ConfirmMode = 'create' | 'keep' | 'replace';
export function confirmModes(draft: Draft): ConfirmMode[];
  // new・template・storage → ['create']、duplicate → ['keep', 'replace']
export function planConfirm(doc: ArekokoDocument, draft: Draft, mode: ConfirmMode):
  { removedAreas: Id[]; relocations: Relocation[] };      // 影響があるのは replace だけ
export function confirmDraft(doc: ArekokoDocument, draft: Draft, mode: ConfirmMode, ctx: OpContext): OpResult;
  // created: [確定したクウカンのID]
```

- **create（new・template）**：下書きのクウカンを、どこにも置かれていないクウカンとして文書に足す（名前は下書きの名前）。エリア・描画・仕切り・マーカーも写す。
- **create（storage）**：`owner` をそのモノにして足す（名前は持たない。D3）。そのモノが既に収納なら `OpError('alreadyStorage')`。外形のない下書きなら描画なしの収納（設計 7.5「外形を描かずに確定すると、描画なしの収納になる」）。
- **keep（duplicate・元を残す）**：下書きのクウカン・エリア・マーカーのIDを、すべて新しく振り直して足す（仕切りの `area`・`children` も写し直す）。どこにも置かれていないクウカンとして足す（E5）。名前は「下書きの名前＋のコピー」（収納の複製はモノの名前＋のコピー）。確定した後に名前を変えられる。
- **replace（duplicate・置き換え）**：設計 8.2「元のクウカンとエリアのIDを引き継ぐ。下書きで消したエリアの中身は、統一規則で移る」。
  1. 元のクウカンのエリアのうち、下書きにないもの（`removedAreas`）を消す。その中身は、**元の木で**いちばん近い、残っている祖先のエリアへ（なければクウカンそのもの）移す（設計 7.8「複製で置き換えて、エリアがなくなった」）。`relocateItems` を使う。同じクウカンの中の移動なので、モノの描画は外さない。
  2. 下書きにあって元にないエリアを足す。両方にあるエリアは、名前・`order` を下書きのものにする（親は変わらない。仕切りの操作では親は変わらないため）。
  3. クウカンの描画（外形・aspect・realSize）、仕切り、マーカーを、下書きのものに入れ替える。
  4. 名前（どこにも置かれていないクウカンのときだけ）と呼び名を、下書きのものにする。
  5. モノの描画は残す（外形が変わってはみ出しても、利用者の責任。設計 7.7）。ただし下書きに外形がない（描画なしにした）ときは、そのクウカンのモノの描画を外す。
- どの場合も、結果の文書は `validateDocument` を通る。

---

## 5. マーカーと伸び縮み（中核の操作）

### 5.1 マーカー（`src/core/ops/markers.ts`）

```ts
export function addMarker(doc, kuukan: Id, input: { name: string; shape: Shape; rotation?: Rotation; notAPlace?: boolean }, ctx): OpResult;
export function updateMarker(doc, id: Id, patch: { name?: string; shape?: Shape; rotation?: Rotation; notAPlace?: boolean }): OpResult;
export function moveMarkers(doc, ids: Id[], dx: number, dy: number): OpResult;
export function deleteMarkers(doc, ids: Id[]): OpResult;
export function alignMarkers(doc, ids: Id[], mode: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'): OpResult;
```

- クウカンに描画がなければ `OpError('noDrawing')`。形は `isValidShape` を通ること（通らなければ `OpError('invalidInput')`）。回転は 0〜7 の整数。
- `moveMarkers`：点は `at`、長方形は `x, y` に足す（整数）。
- `alignMarkers`：選んだマーカーの外接長方形（点はその点）を、いちばん左（right なら右、…）にそろえる。centerX は外接長方形の中心の x の平均にそろえる（整数に丸める）。2つ未満なら何もしない。
- マーカーは外形からはみ出してもよい（描画のはみ出しは利用者の責任。設計 7.7）。

### 5.2 伸び縮みと実際の長さ（`src/core/ops/kuukanDrawing.ts`）

```ts
export function stretchKuukan(doc, kuukan: Id, input: { axis: 'x' | 'y'; factor: number }): OpResult;
export function setRealSize(doc, kuukan: Id, realSize: { w?: number; d?: number }): OpResult;
```

- 比率で持っている位置は書き換えない（設計 6.3）。
- `stretchKuukan`：x なら `aspect × factor`、y なら `aspect ÷ factor`。`realSize` があれば、x なら `w × factor`、y なら `d × factor`（小数第1位に丸める）。
- `setRealSize`：渡した値に置き換える（`undefined` の項目は消す。正の数でなければ `OpError('invalidInput')`）。両方そろったら `aspect = w / d`。片方だけなら aspect は変えない（もう片方は画面で計算して表示する。設計 6.3）。
- 描画のないクウカンには `OpError('noDrawing')`。

---

## 6. 吸着の目盛り（`src/editor/snap.ts`）

```ts
export function chooseSnapStep(input: { pxPerUnitX: number; realW?: number; minPx?: number }): number;  // 比率の単位で返す
export function snap(value: number, step: number): number;
```

- 実際の幅（cm）が分かるときは、きりのよい cm（1, 2, 5, 10, 20, 50, 100, 200, 500）のうち、画面で `minPx`（既定 12px）以上の間隔になる最小のものを、比率の単位に直して使う（`step = cm × 10000 / realW`。整数に丸め、1 以上）。
- 分からないときは、比率の目盛り（10, 20, 50, 100, 200, 500, 1000, 2000）から同じ規則で選ぶ。
- 縦も横の目盛りと同じ規則で別に選ぶ（縦は実際の奥行・高さ）。

---

## 7. 画面の状態（`src/app/store.ts` に足す）

```ts
export type Screen = 'start' | 'search' | 'kuukans' | 'editor' | 'manage' | 'settings';

export type EditorTarget =
  | { kind: 'draft'; draft: Draft; canUndo: boolean; canRedo: boolean }
  | { kind: 'kuukan'; kuukan: Id };

export interface AppState {
  // …（今のもの）
  editor: EditorTarget | null;     // screen が 'editor' のときだけ
}

// AppStore に足す操作
openDraft(origin: DraftOrigin, input?: { name?: string }): void;   // 下書きを作って 'editor' へ。履歴を消す
openKuukanEditor(kuukan: Id): void;                                // 確定したクウカンの編集へ。履歴を消す
draftApply(op: (doc: ArekokoDocument, ctx: OpContext) => OpResult): OpResult | null;   // 下書きの文書に操作（OpError は toast）
draftSetOutline(outline: Point[]): boolean;                        // E2：矛盾すれば toast で理由を出して false
draftReplace(next: Draft | { error: string }): boolean;            // 外形を付ける・外すなど、draft.ts の関数の結果で差し替える（error は toast）
leaveEditor(): void;                                               // 開いた元の画面へ戻る（下書きなら捨てるか確認）
draftUndo(): void; draftRedo(): void;                              // 下書きの履歴（50回）
planDraftConfirm(mode: ConfirmMode): { removedAreas: Id[]; relocations: Relocation[] } | null;
confirmDraft(mode: ConfirmMode): void;                             // 文書に確定 → 確定したクウカンの編集へ。確定は履歴に積まない（履歴を消す。A-03、TRS 付録B I-06）
cancelDraft(): void;                                               // 何も変えずに、開いた元の画面へ戻る
```

- 下書きの名前・呼び名の変更も `draftApply` で行う（下書きの文書の中の `renameKuukan`・`setAreaLabel`）。
- 確定したクウカンの編集では、文書を変える操作は今までどおり `apply`（文書の履歴）。表示するクウカンが変わったら履歴を消す（設計 10章）。
- `undo`・`redo`（Ctrl+Z など）は、下書きを開いているときは下書きの履歴に効く。
- 確定は、下書きの画面から確定したクウカンの画面へまたぐ操作なので、元に戻すでは取り消せない。確定した時点で文書の履歴を消す。確定する前に、元に戻せないことを注意として見せる（置き換えでは確認の中に。A-03、TRS 付録B I-06）。
- 下書きを開いたまま閉じよう（別の画面・最初の画面）とすると、confirm（「下書きを捨てますか？」）を出す。

---

## 8. 画面（`src/ui/`）

### 8.1 クウカンの一覧（`KuukanScreen.svelte`。仮の入口を置き換える）

- どこにも置かれていないクウカン（未設定を最初に）：名前、描画の有無、中のモノの件数、「編集」（`openKuukanEditor`。未設定にはない）、「モノを見る」（今の「開く」と同じ）、「複製」（`openDraft({ kind: 'duplicate', source })`）、名前の変更、削除（今と同じく影響を見せて確認）。
- 名前を入れて新しいクウカンの下書きを始める入口（`openDraft({ kind: 'new' }, { name })`）と、5つのテンプレートから選ぶ入口（`openDraft({ kind: 'template', template })`）。文言と見せ方は画面で決める（例：「作る」「形を選んで作る」、未設定のほかにクウカンがないときの「はじめに」の案内）（TRS 付録B I-04、2026-10-11 ユーザーが決定）。
- 中のモノの件数は、そのクウカン（クウカンそのものとエリア）に直接置かれたモノの数。収納は1件と数え、中身は数えない（A-21、TRS 付録B I-08、2026-10-11 ユーザーが決定）。
- 収納のクウカンは、一覧の下に「収納」としてまとめて出す（持ち主のモノの名前、置き場の経路、「編集」「複製」）。

### 8.1.1 部品どうしで共有する画面の状態（`src/ui/editor/editorUi.svelte.ts`）

図・道具・横の欄は、次の1つの状態を共有する（文書の外。保存しない）。Svelte 5 のルーン（`$state`）で作り、`getEditorUi()` / `createEditorUi()` で受け渡す（EditorScreen が作って context に入れる）。

```ts
export type EditorTool = 'select' | 'splitX' | 'splitY' | 'markerPoint' | 'markerRect' | 'outlineEdge' | 'outlineStep';
export interface EditorUi {
  tool: EditorTool;
  selectedArea: Id | null;                                 // 選んだ節（エリアのID か クウカンのID）
  selectedLine: { node: Id; lineIndex: number } | null;    // 選んだ仕切りの線
  selectedMarkers: Id[];                                   // 選んだマーカー
  view: { cx: number; cy: number; scale: number };         // 表示の中心（比率の座標）と拡大率（画面の px / 比率の単位）
  fitRequest: number;                                      // 増やすと図が「全体を表示」する
}
export function createEditorUi(): EditorUi;    // setContext もする
export function getEditorUi(): EditorUi;
```

- 道具を変えたら、選択は消す。図はクウカン（下書きなら下書きの文書のクウカン）を描き、横の欄は選択に応じて中身を変える。
- 図の座標の計算（比率の座標 ⇔ 表示の座標、表示範囲、当たり判定、吸着）は `src/editor/view.ts`（ブラウザに依存しない。テストする）に置く：

```ts
export function toDisplay(p: Point, aspect: number): [number, number];      // [x × aspect, y]
export function fromDisplay(d: [number, number], aspect: number): Point;     // 丸めない（吸着の前）
export function viewBoxOf(view: { cx: number; cy: number; scale: number }, aspect: number, widthPx: number, heightPx: number): { x: number; y: number; w: number; h: number };
export function fitView(aspect: number, widthPx: number, heightPx: number, marginPx: number): { cx: number; cy: number; scale: number };
export function hitLine(regions: Map<Id, Polygon>, partitions: Partition[], p: Point, tolerance: number): { node: Id; lineIndex: number } | null;
  // 仕切りの線分（境界で止める仕切りは boundedSegment、N等分は節の領域の外接長方形を横切る線）に、比率の単位で tolerance 以内の点
export function hitMarker(markers: Marker[], p: Point, tolerance: number): Id | null;   // 後ろ（後から足したもの）を優先
export function lineSegments(regions: Map<Id, Polygon>, partitions: Partition[]): { node: Id; lineIndex: number; from: Point; to: Point }[];
```

### 8.2 クウカン編集（`EditorScreen.svelte`）

- 上：題（「新しいクウカン（下書き）」「〇〇の編集」など）。下書きなら、確定するボタンと下書きを捨てるボタン。確定したクウカンの編集なら、開く前の画面に戻るボタン。文言は画面で決める（例：「確定する」「下書きを捨てる」「← 戻る」）（TRS 付録B I-01、2026-10-11 ユーザーが決定）。duplicate の下書きの確定は、「元を残す（複製）」「元と置き換える（作り直し）」を選ばせ、置き換えは `planDraftConfirm('replace')` の影響を見せて確認する（設計 8.2）。
- 真ん中：図（`editor/Canvas.svelte`）。右：横の欄（`editor/SidePanel.svelte`）。スマホでは図の下に欄を重ねる（段階5のクウカン編集はパソコンが主。設計 5.2）。
- 道具（`editor/Toolbar.svelte`）：選ぶ／左右に分ける／上下に分ける（レビュー1 R-B7）／マーカー（点・長方形）／外形（下書きのときだけ：辺を動かす・段差を足す）。並べ方・まとまり・文言は画面で決める（例：見出しのあるまとまりに絵と説明）（TRS 付録B I-02、2026-10-11 ユーザーが決定）。
- 拡大・縮小・全体を表示は、図のそばに置く（置き場所と文言は画面で決める。例：図の右下）（TRS 付録B I-03、2026-10-11 ユーザーが決定）。元に戻す・やり直すは題の横（レビュー1 R-B8）。

### 8.3 図（`editor/Canvas.svelte`）

- SVG。表示の座標は `x_表示 = x × aspect`、`y_表示 = y`（比率の座標を実際の縦横比で見せる）。`viewBox` で拡大・縮小とスクロール（ホイールで拡大縮小、ドラッグで移動、指ではピンチ）。
- 描くもの：吸着の目盛り（薄い線）、外形、エリア（`computeRegions` の領域を薄く塗り、名前を中央に。選んだエリアは濃く）、仕切りの線、マーカー（点は丸、長方形は四角。置き場にしないマーカーは斜線。回転は中心で 45°×n）。
- 操作：
  - 選ぶ：エリアを押すと選ぶ（横の欄に名前・呼び名）。仕切りの線を押すと選び、ドラッグで動かす（`dragRange` の範囲に制限し、吸着。離したら `moveLine`）。マーカーを押すと選ぶ（Shift で複数）、ドラッグで動かす（`moveMarkers`）。
  - 仕切り（縦／横）：図を押した点で `splitAt`（吸着した点）。線の上なら toast。
  - マーカー（点）：押した点に `addMarker`（名前「マーカー」）。マーカー（長方形）：ドラッグした範囲に `addMarker`。
  - 外形・辺を動かす：辺を押してドラッグ → 離したら `draftSetOutline(moveEdge(...))`。外形・段差を足す：辺の上の点を押して、垂直にドラッグ → `addStep`。ドラッグ中は、動かした形を半透明で見せる。
- 押せる部分（線・辺・マーカー）は、画面上で 12px 以上の幅で当たるようにする（指でも押せるように）。

### 8.4 横の欄（`editor/SidePanel.svelte`）

- 入力欄（名前・呼び名）は空を受け付けない。空にして入力を終えると元に戻る（TRS 付録B I-07、2026-10-11 ユーザーが決定）。
- クウカン：名前（どこにも置かれていないクウカンだけ）、エリアの呼び名、実際の長さ（幅・奥行・高さ。cm。片方だけなら、もう片方は縦横比から計算して薄く表示。設計 6.3）、伸び縮み（確定したクウカン：幅・奥行の比を変える）。
- エリアの一覧（木。名前を直接変えられる。「中身なし」の途中のエリアは小さく。設計 7.2）。
- 選んだもの：エリア（名前、N等分〔子のない長方形のとき、2〜10と上下・左右。文言は画面で決める。TRS 付録B I-11、2026-10-11 ユーザーが決定〕、このエリアの仕切りを消す〔そのエリアを分けている線が1本のときだけ。N等分で2本以上あるときは出さず、消す線を図で選んでもらう。TRS 付録B I-05、2026-10-11 ユーザーが決定〕）、仕切りの線（消す。確定したクウカンなら `planDeleteLine` の影響を見せて確認）、マーカー（名前、点／長方形、回転〔左右に45°〕、置き場にしない、消す）、複数のマーカー（整列：左・右・上・下・横の中央・縦の中央、まとめて消す）。
- 下書きで外形がないとき：「外形を描かない（描画なし）」の説明と「外形を付ける」。外形があってエリア・マーカーがないとき：「外形を外す（描画なしにする）」。
