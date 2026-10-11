import { describe, it, expect } from 'vitest';
import { computeViewHint } from '../../src/view/viewHints';

describe('computeViewHint', () => {
  it('閲覧モード時（!isPlacing）はエリア絞り込みと収納の案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: false,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: null,
      targetName: '',
      dragPhase: 'idle',
    });

    expect(hint.what).toContain('エリア');
    expect(hint.how).toContain('収納');
    expect(hint.shortWhat).toBe('エリアで絞り込み');
    expect(hint.shortHow).toContain('収納');
  });

  it('配置モード・モノ未選択時は選択を促す案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: null,
      targetName: '',
      dragPhase: 'idle',
    });

    expect(hint.what).toContain('モノの配置');
    expect(hint.how).toContain('リスト');
    expect(hint.shortWhat).toBe('モノの配置');
    expect(hint.shortHow).toContain('選んでください');
  });

  it('点ツールでモノを新規配置する時、クリック/タップの案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: 'item-1',
      attachTool: 'point',
      selectedDrawing: null,
      targetName: '懐中電灯',
      dragPhase: 'idle',
    });

    expect(hint.what).toBe('「懐中電灯」を点で配置します');
    expect(hint.how).toBe('置きたい場所をクリックしてください。');
    expect(hint.shortWhat).toBe('「懐中電灯」');
    expect(hint.shortHow).toBe('置きたい場所をタップして配置');
    expect(hint.actionText).toBe('クリック（タップ）で配置');
  });

  it('四角ツールでモノを新規配置する時、ドラッグの案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: 'item-1',
      attachTool: 'rect',
      selectedDrawing: null,
      targetName: '防災リュック',
      dragPhase: 'idle',
    });

    expect(hint.what).toBe('「防災リュック」を四角で配置します');
    expect(hint.how).toBe('図の上をドラッグして大きさと位置を指定してください。');
    expect(hint.shortWhat).toBe('「防災リュック」');
    expect(hint.shortHow).toBe('図面をドラッグして四角で配置');
    expect(hint.actionText).toBe('ドラッグして描画');
  });

  it('四角ツールでドラッグ操作中の時は、マウスを離すと配置される案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: 'item-1',
      attachTool: 'rect',
      selectedDrawing: null,
      targetName: '防災リュック',
      dragPhase: 'drawing_rect',
    });

    expect(hint.what).toBe('範囲を指定中');
    expect(hint.how).toBe('希望の大きさになったらマウスを離すと配置されます。');
    expect(hint.shortWhat).toBe('範囲を指定中');
    expect(hint.shortHow).toBe('離すと配置されます');
    expect(hint.actionText).toBe('離すと決定');
  });

  it('図面上のモノを選択中の時、移動とリサイズの案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: 'item-2',
      targetName: 'MacBook',
      dragPhase: 'idle',
    });

    expect(hint.what).toBe('「MacBook」の配置を編集中');
    expect(hint.how).toBe('中央ドラッグで移動、辺ドラッグで大きさを変更できます。');
    expect(hint.shortWhat).toBe('「MacBook」');
    expect(hint.shortHow).toBe('中央ドラッグで移動、辺でリサイズ');
  });

  it('図面上のモノを移動ドラッグ中の時は、離すと移動確定の案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: 'item-2',
      targetName: 'MacBook',
      dragPhase: 'moving_item',
    });

    expect(hint.what).toBe('「MacBook」を移動中');
    expect(hint.how).toBe('希望の位置でマウスを離すと移動が確定します。');
    expect(hint.shortWhat).toBe('移動中');
    expect(hint.shortHow).toBe('離すと位置を確定');
  });

  it('図面上のモノをリサイズドラッグ中の時は、離すとサイズ確定の案内を返す', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: 'item-2',
      targetName: 'MacBook',
      dragPhase: 'resizing',
    });

    expect(hint.what).toBe('「MacBook」の大きさを変更中');
    expect(hint.how).toBe('希望のサイズでマウスを離すと確定します。');
    expect(hint.shortWhat).toBe('リサイズ中');
    expect(hint.shortHow).toBe('離すとサイズ確定');
  });

  it('選んだ描画に段差を足しているときは、辺を直角の向きへドラッグする案内を返す（V5）', () => {
    const hint = computeViewHint({
      isPlacing: true,
      attachTarget: null,
      attachTool: 'point',
      selectedDrawing: 'item-1',
      targetName: '本棚',
      dragPhase: 'idle',
      addingStep: true,
    });

    expect(hint.what).toContain('段差');
    expect(hint.what).toContain('本棚');
    expect(hint.how).toContain('直角');
  });
});
