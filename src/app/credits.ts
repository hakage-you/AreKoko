// 設定の画面に出すクレジット（設計 8.7）。null は「未設定」と出す。

export interface Credits {
  appName: string;
  author: string | null;
  license: string | null;
  libraries: { name: string; license: string }[];
}

export const CREDITS: Credits = {
  appName: 'アレココ（AreKoko）',
  author: '@hakage_you',
  license: 'MIT',
  // 実行時に読み込まれるもの
  libraries: [
    { name: 'Svelte', license: 'MIT' },
    { name: 'Ajv', license: 'MIT' },
    { name: 'fast-deep-equal', license: 'MIT' },
    { name: 'fast-uri', license: 'BSD-3-Clause' },
    { name: 'json-schema-traverse', license: 'MIT' },
    { name: 'require-from-string', license: 'MIT' },
  ],
};
