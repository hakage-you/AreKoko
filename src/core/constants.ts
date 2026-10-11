// 定数。設計 6章、詳細設計 2章。

export const APP = 'arekoko';
/** このアプリが読み書きする形式のバージョン。 */
export const SCHEMA_VERSION = 1;

/** 未設定のクウカンのID（予約）。 */
export const NIL_ID = '00000000-0000-0000-0000-000000000000';

/** 比率の座標の目盛りの最大（外形の外接長方形は 0〜COORD_MAX）。 */
export const COORD_MAX = 10000;

export const DEFAULT_AREA_LABEL = 'エリア';
/** 未設定のクウカンの表示名。 */
export const UNSET_NAME = '未設定';
/** 名前を持たないクウカンが、どこにも置かれていないクウカンになったときの名前（D3）。 */
export const NAMELESS_NAME = '名前なし';

/** 元に戻すの上限（設計 10章）。 */
export const MAX_HISTORY = 50;

/**
 * カテゴリ・タグの色として受け付ける形（#rrggbb）。ファイルの値は画面のスタイルに入るので、
 * この形でないもの（url(...) など、外へ読みに行く値）は使わず既定の色で出す（原則7、設計 7.6）。
 */
export function isLabelColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}
