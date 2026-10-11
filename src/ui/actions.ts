// 部品で共通に使う Svelte のアクション。

/** 出てきた入力欄にすぐ打てるよう、フォーカスを入れる。enabled が false なら何もしない。 */
export function autofocus(node: HTMLElement, enabled = true): void {
  if (enabled) node.focus();
}

/**
 * 「ここで操作します」と知らせる。key が変わるたび（最初に出たときも）、短く光らせ、見える位置までスクロールする。
 * 光り方は theme.css の .attention-flash（動きを減らす設定では色だけ）。
 */
export function attention(node: HTMLElement, key: unknown) {
  let last = key;
  function flash(): void {
    restartFlash(node);
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const onEnd = () => node.classList.remove('attention-flash');
  node.addEventListener('animationend', onEnd);
  flash();
  return {
    update(next: unknown) {
      if (next !== last) {
        last = next;
        flash();
      }
    },
    destroy() {
      node.removeEventListener('animationend', onEnd);
    },
  };
}

/**
 * 押せるようになったことを知らせる。enabled が false から true に変わったとき、短く光らせる（最初から true なら光らせない）。
 * 光り方は attention と同じ（theme.css の .attention-flash）。クウカン編集の「元に戻す」に使う（TRS 付録B I-18）。
 */
export function flashWhenEnabled(node: HTMLElement, enabled: boolean) {
  let last = enabled;
  const onEnd = () => node.classList.remove('attention-flash');
  node.addEventListener('animationend', onEnd);
  return {
    update(next: boolean) {
      if (next && !last) restartFlash(node);
      last = next;
    },
    destroy() {
      node.removeEventListener('animationend', onEnd);
    },
  };
}

function restartFlash(node: HTMLElement): void {
  node.classList.remove('attention-flash');
  void node.offsetWidth; // 付け直してアニメーションをもう一度動かす
  node.classList.add('attention-flash');
}
