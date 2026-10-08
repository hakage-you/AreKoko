// 部品で共通に使う Svelte のアクション。

/** 出てきた入力欄にすぐ打てるよう、フォーカスを入れる。enabled が false なら何もしない。 */
export function autofocus(node: HTMLElement, enabled = true): void {
  if (enabled) node.focus();
}
