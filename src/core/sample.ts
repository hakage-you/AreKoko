// 見本の文書データ。スタート画面での「見本でお試し」や開発・テスト用。

import type { ArekokoDocument, Id } from './types';
import { newId } from './ids';
import { createEmptyDocument } from './document';
import type { OpContext, OpResult } from './ops/common';
import { createKuukan } from './ops/kuukans';
import { addItem } from './ops/items';
import { makeStorage } from './ops/storage';
import { attachOutline, splitEven, renameArea } from './ops/areas';
import { createTag } from './ops/tags';
import { createCategory } from './ops/categories';
import { setItemDrawing } from './ops/itemDrawings';
import { addMarker } from './ops/markers';

/**
 * 実用的な生活空間と収納の見本文書。
 * Room A（部屋: デスク周り・リラックススペース・フリースペース）
 *   → 棚A1（収納: 上段・中段・下段）
 *     → BOX1（収納）
 */
export function sampleDocument(): ArekokoDocument {
  const ctx: OpContext = { newId, now: () => new Date().toISOString() };
  let doc = createEmptyDocument();
  const run = (f: (d: ArekokoDocument) => OpResult): Id[] => {
    const r = f(doc);
    doc = r.doc;
    return r.created;
  };

  // 1. 部屋（Room A）の作成と外形・マーカー
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

  // Room A をエリア分割（上下に分割後、上側を左右に分割）
  const [areaTop, areaBottom] = run(d => splitEven(d, roomA!, 'y', 2, ctx));
  const [areaDesk, areaRelax] = run(d => splitEven(d, areaTop!, 'x', 2, ctx));
  run(d => renameArea(d, areaDesk!, 'デスク周り'));
  run(d => renameArea(d, areaRelax!, 'リラックススペース'));
  run(d => renameArea(d, areaBottom!, 'フリースペース'));

  // 2. その他のクウカン
  const [storeroom] = run(d => createKuukan(d, { name: '物置' }, ctx));
  run(d => createKuukan(d, { name: '貸出中' }, ctx));

  // 3. タグとカテゴリ
  const [tagEmergency] = run(d => createTag(d, { name: '防災' }, ctx));
  const [tagConsumable] = run(d => createTag(d, { name: '消耗品' }, ctx));
  const [tagWork] = run(d => createTag(d, { name: '仕事' }, ctx));

  const [catFurniture] = run(d => createCategory(d, { name: '家具' }, ctx));
  const [catAppliance] = run(d => createCategory(d, { name: '家電' }, ctx));
  const [catBattery] = run(d => createCategory(d, { name: '電池', parent: catAppliance }, ctx));
  const [catStationery] = run(d => createCategory(d, { name: '文具' }, ctx));
  const [catTool] = run(d => createCategory(d, { name: '工具' }, ctx));

  // 4. Room A のモノ配置
  // デスク周り（左上）
  const [shelf] = run(d => addItem(d, { name: '棚A1', place: areaDesk!, category: catFurniture! }, ctx));
  run(d => setItemDrawing(d, shelf!, {
    shape: { type: 'rect', x: 800, y: 800, w: 2800, h: 1200 },
  }, ctx));

  const [desk] = run(d => addItem(d, { name: 'ワークデスク', place: areaDesk!, category: catFurniture!, tags: [tagWork!] }, ctx));
  run(d => setItemDrawing(d, desk!, {
    shape: { type: 'rect', x: 800, y: 2400, w: 3200, h: 1800 },
  }, ctx));

  const [pc] = run(d => addItem(d, { name: 'ノートPC', place: areaDesk!, category: catAppliance!, tags: [tagWork!], summary: '14インチ。仕事用' }, ctx));
  run(d => setItemDrawing(d, pc!, {
    shape: { type: 'rect', x: 1800, y: 2800, w: 1200, h: 900 },
  }, ctx));

  const [chair] = run(d => addItem(d, { name: 'デスクチェア', place: areaDesk!, category: catFurniture! }, ctx));
  run(d => setItemDrawing(d, chair!, {
    shape: { type: 'point', at: [2400, 4500] },
  }, ctx));

  // リラックススペース（右上）
  const [sofa] = run(d => addItem(d, { name: 'ソファ', place: areaRelax!, category: catFurniture! }, ctx));
  run(d => setItemDrawing(d, sofa!, {
    shape: { type: 'rect', x: 6000, y: 1200, w: 3200, h: 2000 },
  }, ctx));

  const [floorLight] = run(d => addItem(d, { name: 'フロアライト', place: areaRelax!, category: catAppliance! }, ctx));
  run(d => setItemDrawing(d, floorLight!, {
    shape: { type: 'point', at: [9200, 800] },
  }, ctx));

  run(d => addItem(d, { name: 'ブランケット', place: areaRelax!, summary: 'グレーのひざ掛け' }, ctx));

  // フリースペース（下）
  const [vacuum] = run(d => addItem(d, { name: '掃除機', place: areaBottom!, category: catAppliance! }, ctx));
  run(d => setItemDrawing(d, vacuum!, {
    shape: { type: 'point', at: [1500, 7500] },
  }, ctx));

  const [extensionCord] = run(d => addItem(d, { name: '延長コード', place: areaBottom!, category: catAppliance! }, ctx));
  run(d => setItemDrawing(d, extensionCord!, {
    shape: { type: 'rect', x: 2500, y: 8500, w: 1000, h: 600 },
  }, ctx));

  // 5. 棚A1 の収納化と段の分割
  const [shelfKuukan] = run(d => makeStorage(d, shelf!, { areaLabel: '段' }, ctx));
  run(d => attachOutline(d, shelfKuukan!, { outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]], aspect: 0.6 }, ctx));
  const [dan1, dan2, dan3] = run(d => splitEven(d, shelfKuukan!, 'y', 3, ctx));
  run(d => renameArea(d, dan1!, '上段'));
  run(d => renameArea(d, dan2!, '中段'));
  run(d => renameArea(d, dan3!, '下段'));

  // 上段
  const [box] = run(d => addItem(d, { name: 'BOX1', place: dan1! }, ctx));
  run(d => setItemDrawing(d, box!, {
    shape: { type: 'rect', x: 1200, y: 600, w: 4200, h: 2200 },
  }, ctx));

  const [fileBox] = run(d => addItem(d, { name: '書類ファイル箱', place: dan1!, category: catStationery!, tags: [tagWork!] }, ctx));
  run(d => setItemDrawing(d, fileBox!, {
    shape: { type: 'rect', x: 5800, y: 600, w: 3000, h: 2200 },
  }, ctx));

  // 中段
  const [flashlight] = run(d => addItem(d, { name: '懐中電灯', place: dan2!, category: catAppliance!, tags: [tagEmergency!], summary: 'LED。電池は単3を2本' }, ctx));
  run(d => setItemDrawing(d, flashlight!, {
    shape: { type: 'rect', x: 1500, y: 4000, w: 2600, h: 1400 },
  }, ctx));

  const [penTray] = run(d => addItem(d, { name: '文具トレイ', place: dan2!, category: catStationery! }, ctx));
  run(d => setItemDrawing(d, penTray!, {
    shape: { type: 'rect', x: 4600, y: 3800, w: 4200, h: 1800 },
  }, ctx));

  // 下段
  const [toolBox] = run(d => addItem(d, { name: '工具箱', place: dan3!, category: catTool! }, ctx));
  run(d => setItemDrawing(d, toolBox!, {
    shape: { type: 'rect', x: 1500, y: 7200, w: 3800, h: 2000 },
  }, ctx));

  const [stockTowel] = run(d => addItem(d, { name: '予備タオル', place: dan3!, tags: [tagConsumable!] }, ctx));
  run(d => setItemDrawing(d, stockTowel!, {
    shape: { type: 'rect', x: 5800, y: 7200, w: 3000, h: 2000 },
  }, ctx));

  // 6. BOX1（収納）の中身
  const [boxKuukan] = run(d => makeStorage(d, box!, {}, ctx));
  run(d => addItem(d, { name: '単3電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!, tagEmergency!], qty: 8 }, ctx));
  run(d => addItem(d, { name: '単4電池', place: boxKuukan!, category: catBattery!, tags: [tagConsumable!], qty: 4 }, ctx));

  // 7. 物置・その他
  run(d => addItem(d, { name: 'ドライバーセット', place: storeroom!, category: catTool! }, ctx));
  run(d => addItem(d, { name: 'どこかにある鍵' }, ctx));
  for (let i = 1; i <= 60; i++) {
    run(d => addItem(d, { name: `ストック品 ${i}`, place: storeroom!, tags: i % 3 === 0 ? [tagConsumable!] : [] }, ctx));
  }
  return doc;
}
