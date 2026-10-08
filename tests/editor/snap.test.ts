import { describe, it, expect } from 'vitest';
import { chooseSnapStep, snap } from '../../src/editor/snap';

describe('snap', () => {
  it('snap で値が指定した目盛り幅に丸められる', () => {
    expect(snap(1234, 100)).toBe(1200);
    expect(snap(1250, 100)).toBe(1300);
    expect(snap(1234, 50)).toBe(1250);
    expect(snap(1234, 0)).toBe(1234);
  });

  it('刻みが整数でなくても結果は整数で、刻みの倍数に最も近い', () => {
    const step = (20 * 10000) / 540; // 20cm（幅540cm）
    expect(snap(1700, step)).toBe(1852); // 100cm
    expect(Number.isInteger(snap(1234.5, step))).toBe(true);
  });

  describe('chooseSnapStep', () => {
    it('実際の幅があるとき拡大率に応じて目盛りが選ばれる', () => {
      // realW = 360cm。10000比率で360cm。
      // 画面全体で 3600px 表示される場合、1比率あたり 0.36px。
      // 1cm あたりの比率は 10000/360 = 27.77... 比率 = 10px。
      // 2cm だと 20px >= 12px となり、cm=2 が選ばれる。
      const stepLarge = chooseSnapStep({ pxPerUnitX: 0.36, realW: 360, minPx: 12 });
      expect(stepLarge).toBe((2 * 10000) / 360);

      // 縮小表示（1比率あたり 0.01px）のとき、大きな cm が選ばれる
      const stepSmall = chooseSnapStep({ pxPerUnitX: 0.01, realW: 360, minPx: 12 });
      expect(stepSmall).toBeGreaterThan(stepLarge);
    });

    it('実際の幅がないとき拡大率に応じて比率目盛りが選ばれる', () => {
      // 拡大時（1比率あたり 1px）なら 20px >= 12px なので 20
      const stepZoomed = chooseSnapStep({ pxPerUnitX: 1, minPx: 12 });
      expect(stepZoomed).toBe(20);

      // 縮小時（1比率あたり 0.05px）なら 500 * 0.05 = 25px >= 12px なので 500
      const stepOverview = chooseSnapStep({ pxPerUnitX: 0.05, minPx: 12 });
      expect(stepOverview).toBe(500);
    });
  });
});
