// 文書（ファイル形式）の型。設計 6.4 / 7章、詳細設計 2章。
//
// 文書は不変として扱う。操作は入力を書き換えず、新しいオブジェクトを返す。
// アプリが知らない項目は実行時にそのまま運ばれる（スプレッドで写す）ため、
// 型には書かない。

/** UUID v7、または予約の Nil UUID（未設定のクウカンだけが使う）。 */
export type Id = string;

/** 比率の座標（整数の目盛り。外形の外接長方形が 0〜10000）。[x, y]。x は右、y は下へ増える。 */
export type Point = [number, number];

/** 修復メモ。読み込み時の修復だけが付ける（設計 6.7）。 */
export interface Notice {
  /** ISO 8601 の日時。 */
  at: string;
  /** 日付を含まない本文。表示では at の日付を前に付ける。 */
  text: string;
}

// ---- 所属の層 ----

export interface Kuukan {
  id: Id;
  /** どこにも置かれていないクウカンだけが持つ。収納のクウカンは持ち主のモノの名前で表示する。 */
  name?: string;
  /** 収納ならそのモノのID。どこにも置かれていないクウカンは null。 */
  owner: Id | null;
  /** エリアの呼び名。初期値は「エリア」。 */
  areaLabel: string;
  notices?: Notice[];
}

export interface Area {
  id: Id;
  kuukan: Id;
  /** null ならクウカンそのものの直下。 */
  parent: Id | null;
  name: string;
  /** 兄弟の中の並び。描画がないときのリストの順に使う。 */
  order: number;
  notices?: Notice[];
}

export interface Item {
  id: Id;
  name: string;
  /** クウカンのID（クウカンそのもの）か、エリアのID。 */
  place: Id;
  category: Id | null;
  tags: Id[];
  summary?: string;
  qty?: number;
  /** ISO 8601 の日時。アプリが所属の層の項目を変えるたびに書く。 */
  updatedAt?: string;
  notices?: Notice[];
}

export interface Category {
  id: Id;
  name: string;
  parent: Id | null;
  /** ラベルの色（HEXカラーコード #rrggbb 等）。未指定なら既定色。 */
  color?: string;
  notices?: Notice[];
}

export interface Tag {
  id: Id;
  name: string;
  /** ラベルの色（HEXカラーコード #rrggbb 等）。未指定なら既定色。 */
  color?: string;
  notices?: Notice[];
}

export interface Membership {
  kuukans: Kuukan[];
  areas: Area[];
  items: Item[];
  categories: Category[];
  tags: Tag[];
}

// ---- 描画の層 ----

export type Shape =
  | { type: 'point'; at: Point }
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'poly'; points: Point[] };

/** 回転。45度の何倍か（0〜7）。 */
export type Rotation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RealSize {
  /** 幅（cm）。 */
  w?: number;
  /** 奥行（cm）。 */
  d?: number;
}

export interface KuukanDrawing {
  kuukan: Id;
  /** 直角だけの多角形。外接長方形はちょうど [0,10000]×[0,10000]。 */
  outline: Point[];
  /** 実際の 幅 / 奥行。 */
  aspect: number;
  realSize?: RealSize;
}

export type Axis = 'x' | 'y';

export interface Partition {
  /** 分けたエリアのID。クウカンそのものを分けたときはクウカンのID。 */
  area: Id;
  /** 'x'：x = at の縦の線（子は x の小さい順）。'y'：y = at の横の線（子は y の小さい順）。 */
  axis: Axis;
  /** 線の位置。狭義の昇順。長さ1なら境界で止める仕切り、2以上ならN等分（長方形だけ）。 */
  at: number[];
  /** at が長さ1のときだけ持つ。線分を決める点で、seed[軸] === at[0]。 */
  seed?: Point;
  /** 長さは at.length + 1。 */
  children: Id[];
}

export interface Marker {
  id: Id;
  kuukan: Id;
  name: string;
  shape: Shape;
  rotation: Rotation;
  notAPlace: boolean;
}

export interface ItemDrawing {
  item: Id;
  shape: Shape;
  rotation: Rotation;
}

export interface Drawing {
  kuukans: KuukanDrawing[];
  partitions: Partition[];
  markers: Marker[];
  items: ItemDrawing[];
}

export interface ArekokoDocument {
  app: 'arekoko';
  schemaVersion: number;
  membership: Membership;
  drawing: Drawing;
}

/** 所属の層の要素の種類。IDを引いて分かる種類（設計 6.2）。 */
export type EntityKind = 'kuukan' | 'area' | 'item' | 'category' | 'tag' | 'marker';
