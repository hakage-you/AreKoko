const CM_CANDIDATES = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const RATIO_CANDIDATES = [10, 20, 50, 100, 200, 500, 1000, 2000];

/**
 * 画面のピクセル比率や実際の長さに応じて、吸着の目盛り幅を比率の単位（0〜10000）で選ぶ。
 * 実際の長さがあるときは cm の刻みをそのまま比率に直す（整数に丸めない。丸めると 20cm 刻みが
 * 19.98cm 刻みになり、動かすたびに実際の長さに端数がたまる）。整数にするのは snap の結果だけ。
 */
export function chooseSnapStep(input: {
  pxPerUnitX: number;
  realW?: number;
  minPx?: number;
}): number {
  const minPx = input.minPx ?? 12;

  if (input.realW !== undefined && input.realW > 0) {
    for (const cm of CM_CANDIDATES) {
      const px = ((cm * 10000) / input.realW) * input.pxPerUnitX;
      if (px >= minPx) {
        return (cm * 10000) / input.realW;
      }
    }
    const maxCm = CM_CANDIDATES[CM_CANDIDATES.length - 1]!;
    return (maxCm * 10000) / input.realW;
  }

  for (const step of RATIO_CANDIDATES) {
    const px = step * input.pxPerUnitX;
    if (px >= minPx) {
      return step;
    }
  }
  return RATIO_CANDIDATES[RATIO_CANDIDATES.length - 1]!;
}

/**
 * 値を指定した目盛り単位に丸める。結果は座標として使えるよう整数にする。
 */
export function snap(value: number, step: number): number {
  if (step <= 0) {
    return Math.round(value);
  }
  return Math.round(Math.round(value / step) * step);
}
