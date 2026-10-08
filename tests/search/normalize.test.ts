import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '../../src/search/normalize';

describe('normalizeForMatch', () => {
  it('全角英数と半角英数を小文字に揃える', () => {
    expect(normalizeForMatch('ＡＢＣ１２３')).toBe('abc123');
    expect(normalizeForMatch('ABC123')).toBe('abc123');
    expect(normalizeForMatch('ａｂｃ４５６')).toBe('abc456');
    expect(normalizeForMatch('abc456')).toBe('abc456');
  });

  it('半角カナ、カタカナ、ひらがなをひらがなに揃える', () => {
    expect(normalizeForMatch('ﾃﾞﾝﾁ')).toBe('でんち');
    expect(normalizeForMatch('デンチ')).toBe('でんち');
    expect(normalizeForMatch('でんち')).toBe('でんち');
  });

  it('拗音・促音・濁点・半濁点のカナ変換', () => {
    expect(normalizeForMatch('ｷｬｯｼｭ')).toBe('きゃっしゅ');
    expect(normalizeForMatch('キャッシュ')).toBe('きゃっしゅ');
    expect(normalizeForMatch('ﾊﾟｿｺﾝ')).toBe('ぱそこん');
    expect(normalizeForMatch('パソコン')).toBe('ぱそこん');
    expect(normalizeForMatch('ヴ')).toBe('ゔ');
    expect(normalizeForMatch('ｶﾞｷﾞｸﾞｹﾞｺﾞ')).toBe('がぎぐげご');
  });

  it('大文字と小文字を小文字に揃える', () => {
    expect(normalizeForMatch('Apple')).toBe('apple');
    expect(normalizeForMatch('APPLE')).toBe('apple');
    expect(normalizeForMatch('apple')).toBe('apple');
  });

  it('全角空白を半角空白に変換する', () => {
    expect(normalizeForMatch('単3　電池')).toBe('単3 電池');
    expect(normalizeForMatch('　')).toBe(' ');
    expect(normalizeForMatch('　　')).toBe('  ');
  });

  it('複合的な文字列の正規化', () => {
    expect(normalizeForMatch('Ｓｏｎｙ　乾電池（単３・４本ﾊﾟｯｸ）')).toBe('sony 乾電池(単3・4本ぱっく)');
  });

  it('漢字の読みは扱わない（ひらがなで漢字には当たらない）', () => {
    expect(normalizeForMatch('電池')).toBe('電池');
  });

  it('空文字列は空文字列のまま', () => {
    expect(normalizeForMatch('')).toBe('');
  });
});
