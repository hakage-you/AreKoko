// 見本の文書データ。スタート画面での「見本でお試し」や開発・テスト用。

import type { ArekokoDocument, Id } from './types';
import { newId } from './ids';
import { createEmptyDocument } from './document';
import type { OpContext, OpResult } from './ops/common';
import { createKuukan } from './ops/kuukans';
import { addItem } from './ops/items';
import { makeStorage } from './ops/storage';
import { attachOutline, splitEven } from './ops/areas';
import { createTag } from './ops/tags';
import { createCategory } from './ops/categories';
import { setItemDrawing } from './ops/itemDrawings';
import { addMarker } from './ops/markers';

/**
 * 最初のスケッチ（Room A → 棚A1 → BOX1）に近い見本の文書。
 */
export function sampleDocument(): ArekokoDocument {
  const ctx: OpContext = { newId, now: () => new Date().toISOString() };
  let doc = createEmptyDocument();
  const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
    const r = f(doc);
    doc = r.doc;
    return r.created;
  };
  const [roomA] = run(d => createKuukan(d, { name: 'Room A', areaLabel: '床' }, ctx));
  run(d => attachOutline(d, roomA!, {
    outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
    aspect: 360 / 270,
    realSize: { w: 360, d: 270 },
  }, ctx));
  run(d => addMarker(d, roomA!, {
    name: 'ドア',
    shape: { type: 'rect', x: 7000, y: 9600, w: 2000, h: 400 },
  }, ctx));
  run(d => addMarker(d, roomA!, {
    name: '窓',
    shape: { type: 'rect', x: 3000, y: 0, w: 4000, h: 400 },
  }, ctx));

  const [storeroom] = run(d => createKuukan(d, { name: '物置' }, ctx));
  run(d => createKuukan(d, { name: '貸出中' }, ctx));
  const [tagEmergency] = run(d => createTag(d, { name: '防災' }, ctx));
  const [tagConsumable] = run(d => createTag(d, { name: '消耗品' }, ctx));
  const [catAppliance] = run(d => createCategory(d, { name: '家電' }, ctx));
  const [catBattery] = run(d => createCategory(d, { name: '電池', parent: catAppliance }, ctx));
  const [catTool] = run(d => createCategory(d, { name: '工具' }, ctx));

  const [shelf] = run(d => addItem(d, { name: '棚A1', place: roomA! }, ctx));
  run(d => setItemDrawing(d, shelf!, {
    shape: { type: 'rect', x: 800, y: 800, w: 2800, h: 1200 },
  }, ctx));
  const [shelfKuukan] = run(d => makeStorage(d, shelf!, { areaLabel: '段' }, ctx));
  run(d => attachOutline(d, shelfKuukan!, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 0.6 }, ctx));
  const [dan1, dan2] = run(d => splitEven(d, shelfKuukan!, 'y', 3, ctx));
  const [box] = run(d => addItem(d, { name: 'BOX1', place: dan1! }, ctx));
  run(d => setItemDrawing(d, box!, {
    shape: { type: 'rect', x: 2000, y: 800, w: 6000, h: 1800 },
  }, ctx));
  const [boxKuukan] = run(d => makeStorage(d, box!, {}, ctx));

  run(d => addItem(d, { name: '単3電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!, tagEmergency!], qty: 8 }, ctx));
  run(d => addItem(d, { name: '単4電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!], qty: 4 }, ctx));
  run(d => addItem(d, { name: '懐中電灯', place: dan2!, category: catAppliance!, tags: [tagEmergency!], summary: 'LED。電池は単3を2本' }, ctx));
  run(d => addItem(d, { name: 'ドライバーセット', place: storeroom!, category: catTool! }, ctx));
  run(d => addItem(d, { name: '延長コード', place: roomA!, category: catAppliance! }, ctx));
  run(d => addItem(d, { name: 'どこかにある鍵' }, ctx));
  for (let i = 1; i <= 60; i++) {
    run(d => addItem(d, { name: `ストック品 ${i}`, place: storeroom!, tags: i % 3 === 0 ? [tagConsumable!] : [] }, ctx));
  }
  return doc;
}
