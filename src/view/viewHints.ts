// クウカンビューの案内メッセージ・ヘルプ文言の算出。

import type { Id } from '../core/types';

export type DragPhase = 'idle' | 'drawing_rect' | 'moving_item' | 'resizing';

export interface ViewHintParams {
  isPlacing: boolean;
  attachTarget: Id | null;
  attachTool: 'point' | 'rect';
  selectedDrawing: Id | null;
  targetName: string;
  dragPhase: DragPhase;
}

export interface ViewHint {
  /** PCなど横幅が広い画面向けの目的説明 */
  what: string;
  /** PCなど横幅が広い画面向けの操作手順説明 */
  how: string;
  /** スマホ（iPhone SE2等）向けの簡潔な対象バッジテキスト */
  shortWhat: string;
  /** スマホ向けの操作動詞を優先した短縮手順（12〜16文字程度） */
  shortHow: string;
  /** 配置ツールバー内の補助テキスト（ボタン横の補足） */
  actionText: string;
}

/**
 * 現在のクウカンビュー・配置操作の状態に応じた案内メッセージを算出する。
 */
export function computeViewHint(params: ViewHintParams): ViewHint {
  const { isPlacing, attachTarget, attachTool, selectedDrawing, targetName, dragPhase } = params;

  // 1. 通常閲覧モード
  if (!isPlacing) {
    return {
      what: 'エリアを押すと、そのエリアのモノがリストに並びます',
      how: 'もう一度押すと元に戻ります。収納を押すと「開く」が出ます。間取り図にモノのマークを付けるには、上の「モノを配置」へ。',
      shortWhat: 'エリアで絞り込み',
      shortHow: '収納を押すと中身を開けます',
      actionText: '',
    };
  }

  // 2. モノ新規配置中（attachTarget あり）
  if (attachTarget !== null) {
    const displayName = targetName ? `「${targetName}」` : 'モノ';

    // 2-a. 四角ツールのドラッグ中
    if (dragPhase === 'drawing_rect') {
      return {
        what: '範囲を指定中',
        how: '希望の大きさになったらマウスを離すと配置されます。',
        shortWhat: '範囲を指定中',
        shortHow: '離すと配置されます',
        actionText: '離すと決定',
      };
    }

    // 2-b. 四角ツールの待機中
    if (attachTool === 'rect') {
      return {
        what: `${displayName}を四角で配置します`,
        how: '図の上をドラッグして大きさと位置を指定してください。',
        shortWhat: displayName,
        shortHow: '図面をドラッグして四角で配置',
        actionText: 'ドラッグして描画',
      };
    }

    // 2-c. 点ツールの待機中
    return {
      what: `${displayName}を点で配置します`,
      how: '置きたい場所をクリックしてください。',
      shortWhat: displayName,
      shortHow: '置きたい場所をタップして配置',
      actionText: 'クリック（タップ）で配置',
    };
  }

  // 3. 配置済みモノを選択・編集中（selectedDrawing あり）
  if (selectedDrawing !== null) {
    const displayName = targetName ? `「${targetName}」` : '選択中のモノ';

    // 3-a. 移動ドラッグ中
    if (dragPhase === 'moving_item') {
      return {
        what: `${displayName}を移動中`,
        how: '希望の位置でマウスを離すと移動が確定します。',
        shortWhat: '移動中',
        shortHow: '離すと位置を確定',
        actionText: '離すと移動完了',
      };
    }

    // 3-b. リサイズドラッグ中
    if (dragPhase === 'resizing') {
      return {
        what: `${displayName}の大きさを変更中`,
        how: '希望のサイズでマウスを離すと確定します。',
        shortWhat: 'リサイズ中',
        shortHow: '離すとサイズ確定',
        actionText: '離すとサイズ確定',
      };
    }

    // 3-c. 編集待機中
    return {
      what: `${displayName}の配置を編集中`,
      how: '中央ドラッグで移動、辺ドラッグで大きさを変更できます。',
      shortWhat: displayName,
      shortHow: '中央ドラッグで移動、辺でリサイズ',
      actionText: 'ドラッグで移動',
    };
  }

  // 4. 配置モード・モノ未選択
  return {
    what: 'モノの配置：間取りや棚の上にモノを配置・移動します',
    how: '右のリストで「配置する」を押すか、図の上のマークを押して選んでください。終わったら右上の「配置を終了」を押します。',
    shortWhat: 'モノの配置',
    shortHow: 'リストまたは図面のモノを選んでください',
    actionText: '',
  };
}
