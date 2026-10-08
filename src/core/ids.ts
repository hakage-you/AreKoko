// UUID v7 の生成と判定。詳細設計 3章、付録A.1。

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const byteToHex: string[] = [];
for (let i = 0; i < 256; i++) {
  byteToHex.push(i.toString(16).padStart(2, '0'));
}

function formatUuid(bytes: Uint8Array): string {
  return (
    byteToHex[bytes[0]!]! +
    byteToHex[bytes[1]!]! +
    byteToHex[bytes[2]!]! +
    byteToHex[bytes[3]!]! +
    '-' +
    byteToHex[bytes[4]!]! +
    byteToHex[bytes[5]!]! +
    '-' +
    byteToHex[bytes[6]!]! +
    byteToHex[bytes[7]!]! +
    '-' +
    byteToHex[bytes[8]!]! +
    byteToHex[bytes[9]!]! +
    '-' +
    byteToHex[bytes[10]!]! +
    byteToHex[bytes[11]!]! +
    byteToHex[bytes[12]!]! +
    byteToHex[bytes[13]!]! +
    byteToHex[bytes[14]!]! +
    byteToHex[bytes[15]!]!
  );
}

/**
 * UUID v7（RFC 9562）の生成器を作成する。
 * 生成器ごとに前回の時刻とカウンタの状態を保持する。
 */
export function createIdGenerator(opts?: {
  now?: () => number;
  random?: (bytes: Uint8Array) => void;
}): () => string {
  const now = opts?.now ?? (() => Date.now());
  const random =
    opts?.random ??
    ((bytes: Uint8Array) => {
      globalThis.crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>);
    });

  let lastTimestamp = -1;
  let lastCounter = 0;
  const bytes = new Uint8Array(16);

  return function generateId(): string {
    random(bytes);
    const currentTimestamp = Math.floor(now());

    let counter: number;
    if (currentTimestamp > lastTimestamp) {
      lastTimestamp = currentTimestamp;
      // 新しいミリ秒では 12 ビットの乱数からカウンタを初期化する
      counter = ((bytes[6]! & 0x0f) << 8) | bytes[7]!;
    } else {
      // 同じミリ秒、または時計が戻ったときはカウンタを進めて直前より大きくする
      counter = lastCounter + 1;
      if (counter > 0x0fff) {
        // 12ビットあふれたら時刻を1ミリ秒進め、カウンタを0にリセット
        lastTimestamp = lastTimestamp + 1;
        counter = 0;
      }
    }
    lastCounter = counter;

    const ts = lastTimestamp;
    const tsHi = Math.floor(ts / 0x1_0000_0000);
    const tsLo = ts >>> 0;
    bytes[0] = (tsHi >>> 8) & 0xff;
    bytes[1] = tsHi & 0xff;
    bytes[2] = (tsLo >>> 24) & 0xff;
    bytes[3] = (tsLo >>> 16) & 0xff;
    bytes[4] = (tsLo >>> 8) & 0xff;
    bytes[5] = tsLo & 0xff;

    // version 7 (0b0111xxxx) + rand_a 上位4ビット
    bytes[6] = 0x70 | ((counter >>> 8) & 0x0f);
    // rand_a 下位8ビット
    bytes[7] = counter & 0xff;
    // variant (0b10xxxxxx)
    bytes[8] = 0x80 | (bytes[8]! & 0x3f);
    // bytes[9..15] は random で埋められた値のまま

    return formatUuid(bytes);
  };
}

const defaultGenerator = createIdGenerator();

/** 既定の生成器で UUID v7 を作る。 */
export function newId(): string {
  return defaultGenerator();
}

/** UUID v7 かどうかを判定する。大文字や Nil UUID は拒む。 */
export function isUuidV7(s: string): boolean {
  return UUID_V7_REGEX.test(s);
}

/** UUID v7 から作成日時（ミリ秒）を読み出す。v7 でなければ例外を投げる。 */
export function timestampOfV7(id: string): number {
  if (!isUuidV7(id)) {
    throw new Error(`UUID v7 の形式ではありません: ${id}`);
  }
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
