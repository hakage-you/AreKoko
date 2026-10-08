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
    node.classList.remove('attention-flash');
    void node.offsetWidth; // 付け直してアニメーションをもう一度動かす
    node.classList.add('attention-flash');
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
