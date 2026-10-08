import type { Notice } from '../types';
import type { RepairCode } from './index';

export const NOTICE_TEXTS: Partial<Record<RepairCode, string>> = {
  reservedId: '読み込み時の修復で、予約されたIDが使われていたため、新しいIDに付け替えました',
  duplicateId: '読み込み時の修復で、IDが重複していたため、新しいIDを振りました',
  placeMissing: '読み込み時の修復で、置き場の参照先が見つからなかったため未設定へ移しました',
  categoryMissing: '読み込み時の修復で、カテゴリの参照先が見つからなかったため未分類にしました',
  tagMissing: '読み込み時の修復で、タグの参照先が見つからなかったため、そのタグを外しました',
  tagDuplicate: '読み込み時の修復で、同じタグが重複していたため1つにまとめました',
  categoryParentMissing: '読み込み時の修復で、親カテゴリの参照先が見つからなかったため、いちばん上へ移しました',
  ownerMissing: '読み込み時の修復で、持ち主のモノが見つからなかったため、どこにも置かれていないクウカンにしました',
  ownerShared: '読み込み時の修復で、1つのモノが複数のクウカンを持っていたため、持ち主を外しました',
  areaKuukanMissing: '読み込み時の修復で、置き場のエリアが属するクウカンが見つからなかったため未設定へ移しました',
  areaParentMissing: '読み込み時の修復で、親のエリアの参照先が見つからなかったため、クウカンの直下へ移しました',
  unsetHasAreas: '読み込み時の修復で、未設定のクウカンはエリアを持てないため、未設定へ移しました',
  kuukanDrawingInvalid: '読み込み時の修復で、描画に問題があったため、このクウカンの描画を外しました',
  partitionMismatch: '読み込み時の修復で、仕切りの記録がエリアと合わなかったため、このクウカンの描画を外しました',
  itemDrawingInvalid: '読み込み時の修復で、描画に問題があったため外しました',
};

export function getMarkerInvalidNoticeText(name: string): string {
  return `読み込み時の修復で、マーカー「${name}」の描画に問題があったため外しました`;
}

export class NoticeManager {
  private addedCodes = new WeakMap<object, Set<RepairCode>>();

  constructor(private now: string) {}

  addNotice(target: { notices?: Notice[] }, code: RepairCode, customText?: string): void {
    let codes = this.addedCodes.get(target);
    if (!codes) {
      codes = new Set<RepairCode>();
      this.addedCodes.set(target, codes);
    }
    if (codes.has(code)) {
      return;
    }
    codes.add(code);
    const text = customText ?? NOTICE_TEXTS[code];
    if (!text) {
      return;
    }
    const notice: Notice = {
      at: this.now,
      text,
    };
    target.notices = [...(target.notices ?? []), notice];
  }
}
