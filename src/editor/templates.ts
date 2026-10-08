import type { Point, RealSize } from '../core/types';
import { COORD_MAX } from '../core/constants';
import { createEmptyDocument } from '../core/document';
import type { OpContext } from '../core/ops/common';
import { addMarker } from '../core/ops/markers';
import { attachOutline, renameArea, splitAt, splitEven } from '../core/ops/areas';
import { createKuukan } from '../core/ops/kuukans';
import type { Draft, TemplateId } from './draft';

export const TEMPLATE_LIST: { id: TemplateId; name: string; description: string }[] = [
  {
    id: 'room6',
    name: '6畳間',
    description: '長方形の部屋とドアのマーカー。エリアの呼び名は「床」',
  },
  {
    id: 'livingL',
    name: 'L字のリビング',
    description: 'L字の外形と、柱のマーカー',
  },
  {
    id: 'shelf3',
    name: '3段の棚',
    description: '横に3等分した棚の正面図。エリアの呼び名は「段」',
  },
  {
    id: 'oshiire',
    name: '押し入れ',
    description: '上段・下段に分け、上段を左右に分けた押し入れの正面図',
  },
  {
    id: 'chest4',
    name: '4段のチェスト',
    description: '横に4等分したチェストの正面図。エリアの呼び名は「引き出し」',
  },
];

/**
 * 組み込みテンプレートの Draft を中核操作を用いて組み立てる。
 */
export function buildTemplate(template: TemplateId, ctx: OpContext): Draft {
  const baseDoc = createEmptyDocument();

  switch (template) {
    case 'room6': {
      const kuukanRes = createKuukan(baseDoc, { name: '6畳間', areaLabel: '床' }, ctx);
      const kuukanId = kuukanRes.created[0]!;
      const outline: Point[] = [
        [0, 0],
        [COORD_MAX, 0],
        [COORD_MAX, COORD_MAX],
        [0, COORD_MAX],
      ];
      const aspect = 360 / 270;
      const realSize: RealSize = { w: 360, d: 270 };
      const attachRes = attachOutline(kuukanRes.doc, kuukanId, { outline, aspect, realSize }, ctx);

      const finalDoc = addMarker(attachRes.doc, kuukanId, { name: 'ドア', shape: { type: 'rect', x: 6500, y: 9600, w: 2000, h: 400 } }, ctx).doc;

      return {
        origin: { kind: 'template', template: 'room6' },
        kuukan: kuukanId,
        doc: finalDoc,
      };
    }

    case 'livingL': {
      const kuukanRes = createKuukan(baseDoc, { name: 'L字のリビング', areaLabel: 'エリア' }, ctx);
      const kuukanId = kuukanRes.created[0]!;
      const outline: Point[] = [
        [0, 0],
        [10000, 0],
        [10000, 5500],
        [6000, 5500],
        [6000, 10000],
        [0, 10000],
      ];
      const aspect = 540 / 450;
      const realSize: RealSize = { w: 540, d: 450 };
      const attachRes = attachOutline(kuukanRes.doc, kuukanId, { outline, aspect, realSize }, ctx);

      const finalDoc = addMarker(attachRes.doc, kuukanId, { name: '柱', shape: { type: 'rect', x: 5400, y: 4900, w: 600, h: 600 } }, ctx).doc;

      return {
        origin: { kind: 'template', template: 'livingL' },
        kuukan: kuukanId,
        doc: finalDoc,
      };
    }

    case 'shelf3': {
      const kuukanRes = createKuukan(baseDoc, { name: '3段の棚', areaLabel: '段' }, ctx);
      const kuukanId = kuukanRes.created[0]!;
      const outline: Point[] = [
        [0, 0],
        [COORD_MAX, 0],
        [COORD_MAX, COORD_MAX],
        [0, COORD_MAX],
      ];
      const aspect = 90 / 180;
      const realSize: RealSize = { w: 90, d: 180 };
      const attachRes = attachOutline(kuukanRes.doc, kuukanId, { outline, aspect, realSize }, ctx);
      const splitRes = splitEven(attachRes.doc, kuukanId, 'y', 3, ctx);

      return {
        origin: { kind: 'template', template: 'shelf3' },
        kuukan: kuukanId,
        doc: splitRes.doc,
      };
    }

    case 'oshiire': {
      const kuukanRes = createKuukan(baseDoc, { name: '押し入れ', areaLabel: '段' }, ctx);
      const kuukanId = kuukanRes.created[0]!;
      const outline: Point[] = [
        [0, 0],
        [COORD_MAX, 0],
        [COORD_MAX, COORD_MAX],
        [0, COORD_MAX],
      ];
      const aspect = 180 / 170;
      const realSize: RealSize = { w: 180, d: 170 };
      const attachRes = attachOutline(kuukanRes.doc, kuukanId, { outline, aspect, realSize }, ctx);

      const split1 = splitAt(attachRes.doc, kuukanId, 'y', [5000, 5000], ctx);
      const upperId = split1.created[0]!;
      const lowerId = split1.created[1]!;

      let doc = renameArea(split1.doc, upperId, '上段').doc;
      doc = renameArea(doc, lowerId, '下段').doc;

      // splitAt はクウカンのIDと点を取り、点を含む葉（ここでは上段）を分ける
      const split2 = splitAt(doc, kuukanId, 'x', [5000, 2500], ctx);
      const leftId = split2.created[0]!;
      const rightId = split2.created[1]!;

      doc = renameArea(split2.doc, leftId, '左').doc;
      doc = renameArea(doc, rightId, '右').doc;

      return {
        origin: { kind: 'template', template: 'oshiire' },
        kuukan: kuukanId,
        doc,
      };
    }

    case 'chest4': {
      const kuukanRes = createKuukan(baseDoc, { name: '4段のチェスト', areaLabel: '引き出し' }, ctx);
      const kuukanId = kuukanRes.created[0]!;
      const outline: Point[] = [
        [0, 0],
        [COORD_MAX, 0],
        [COORD_MAX, COORD_MAX],
        [0, COORD_MAX],
      ];
      const aspect = 80 / 100;
      const realSize: RealSize = { w: 80, d: 100 };
      const attachRes = attachOutline(kuukanRes.doc, kuukanId, { outline, aspect, realSize }, ctx);
      const splitRes = splitEven(attachRes.doc, kuukanId, 'y', 4, ctx);

      return {
        origin: { kind: 'template', template: 'chest4' },
        kuukan: kuukanId,
        doc: splitRes.doc,
      };
    }
  }
}
