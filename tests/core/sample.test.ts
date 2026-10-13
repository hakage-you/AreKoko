import { describe, it, expect } from 'vitest';
import { sampleDocument } from '../../src/core/sample';
import { validateDocument } from '../../src/core/validate';
import { leafAreasOfKuukan, formatPlacePath } from '../../src/core/places';
import { searchItems } from '../../src/search/search';
import { quickSearch } from '../../src/view/model';

describe('sampleDocument', () => {
  it('見本データは不変条件を満たす', () => {
    const doc = sampleDocument();
    expect(validateDocument(doc)).toEqual([]);
  });

  it('Room A に実用的なエリア（デスク周り・リラックススペース・フリースペース）が存在する', () => {
    const doc = sampleDocument();
    const roomA = doc.membership.kuukans.find(k => k.name === 'Room A');
    expect(roomA).toBeDefined();

    const leaves = leafAreasOfKuukan(doc, roomA!.id);
    const names = leaves.map(a => a.name);
    expect(names).toContain('デスク周り');
    expect(names).toContain('リラックススペース');
    expect(names).toContain('フリースペース');
    expect(leaves).toHaveLength(3);
  });

  it('棚A1 の収納に実用的な段（上段・中段・下段）が存在する', () => {
    const doc = sampleDocument();
    const shelf = doc.membership.items.find(i => i.name === '棚A1');
    expect(shelf).toBeDefined();

    const shelfKuukan = doc.membership.kuukans.find(k => k.owner === shelf!.id);
    expect(shelfKuukan).toBeDefined();

    const leaves = leafAreasOfKuukan(doc, shelfKuukan!.id);
    const names = leaves.map(a => a.name);
    expect(names).toEqual(['上段', '中段', '下段']);
  });

  it('Room A の各エリアにモノが適切に割り当てられ、図面描画が設定されている', () => {
    const doc = sampleDocument();
    const roomA = doc.membership.kuukans.find(k => k.name === 'Room A')!;
    const leaves = leafAreasOfKuukan(doc, roomA.id);

    const deskArea = leaves.find(a => a.name === 'デスク周り')!;
    const relaxArea = leaves.find(a => a.name === 'リラックススペース')!;
    const freeArea = leaves.find(a => a.name === 'フリースペース')!;

    const deskItems = doc.membership.items.filter(i => i.place === deskArea.id);
    const relaxItems = doc.membership.items.filter(i => i.place === relaxArea.id);
    const freeItems = doc.membership.items.filter(i => i.place === freeArea.id);

    expect(deskItems.map(i => i.name)).toContain('棚A1');
    expect(deskItems.map(i => i.name)).toContain('ワークデスク');
    expect(deskItems.map(i => i.name)).toContain('ノートPC');
    expect(deskItems.map(i => i.name)).toContain('デスクチェア');

    expect(relaxItems.map(i => i.name)).toContain('ソファ');
    expect(relaxItems.map(i => i.name)).toContain('フロアライト');
    expect(relaxItems.map(i => i.name)).toContain('ブランケット');

    expect(freeItems.map(i => i.name)).toContain('掃除機');
    expect(freeItems.map(i => i.name)).toContain('延長コード');

    // 描画が設定されていることを確認
    const drawings = new Set(doc.drawing.items.map(d => d.item));
    const shelf = deskItems.find(i => i.name === '棚A1')!;
    const desk = deskItems.find(i => i.name === 'ワークデスク')!;
    const sofa = relaxItems.find(i => i.name === 'ソファ')!;
    expect(drawings.has(shelf.id)).toBe(true);
    expect(drawings.has(desk.id)).toBe(true);
    expect(drawings.has(sofa.id)).toBe(true);
  });

  it('棚A1 の各段にモノが配置されている', () => {
    const doc = sampleDocument();
    const shelf = doc.membership.items.find(i => i.name === '棚A1')!;
    const shelfKuukan = doc.membership.kuukans.find(k => k.owner === shelf.id)!;
    const leaves = leafAreasOfKuukan(doc, shelfKuukan.id);

    const dan1 = leaves.find(a => a.name === '上段')!;
    const dan2 = leaves.find(a => a.name === '中段')!;
    const dan3 = leaves.find(a => a.name === '下段')!;

    const dan1Items = doc.membership.items.filter(i => i.place === dan1.id);
    const dan2Items = doc.membership.items.filter(i => i.place === dan2.id);
    const dan3Items = doc.membership.items.filter(i => i.place === dan3.id);

    expect(dan1Items.map(i => i.name)).toContain('BOX1');
    expect(dan1Items.map(i => i.name)).toContain('書類ファイル箱');

    expect(dan2Items.map(i => i.name)).toContain('懐中電灯');
    expect(dan2Items.map(i => i.name)).toContain('文具トレイ');

    expect(dan3Items.map(i => i.name)).toContain('工具箱');
    expect(dan3Items.map(i => i.name)).toContain('予備タオル');
  });

  it('デスクの上にデジタル時計（収納）があり、中に充電式乾電池（概要: エネループ）が配置されている', () => {
    const doc = sampleDocument();
    const clock = doc.membership.items.find(i => i.name === 'デジタル時計');
    expect(clock).toBeDefined();

    // デジタル時計に描画があること
    const drawing = doc.drawing.items.find(d => d.item === clock!.id);
    expect(drawing).toBeDefined();
    expect(drawing!.shape.type).toBe('point');

    // デジタル時計が収納として設定されていること
    const clockKuukan = doc.membership.kuukans.find(k => k.owner === clock!.id);
    expect(clockKuukan).toBeDefined();

    // デジタル時計の中に充電式乾電池があり、概要欄にエネループが書かれていること
    const battery = doc.membership.items.find(i => i.place === clockKuukan!.id);
    expect(battery).toBeDefined();
    expect(battery!.name).toBe('充電式乾電池');
    expect(battery!.summary).toBe('エネループ');
    expect(battery!.qty).toBe(2);
  });

  it('見本データで「エネループ」を検索すると充電式乾電池がヒットし、場所がデジタル時計の中とわかる', () => {
    const doc = sampleDocument();
    const results = searchItems(doc, { text: 'エネループ' });
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('充電式乾電池');
    expect(results[0]!.summary).toBe('エネループ');

    // 置き場経路に「Room A」「デスク周り」「デジタル時計」が含まれること
    const pathText = formatPlacePath(doc, results[0]!.place);
    expect(pathText).toContain('Room A');
    expect(pathText).toContain('デスク周り');
    expect(pathText).toContain('デジタル時計');
  });

  it('Room A で「エネループ」を簡易検索すると、デジタル時計の中に1件あることが判定される', () => {
    const doc = sampleDocument();
    const roomA = doc.membership.kuukans.find(k => k.name === 'Room A')!;
    const clock = doc.membership.items.find(i => i.name === 'デジタル時計')!;

    const quick = quickSearch(doc, roomA.id, 'エネループ');
    // デジタル時計が収納として1件ヒットすること
    expect(quick.insideStorage.get(clock.id)).toBe(1);
    // デスク周りエリアにカウントされること
    expect(quick.perPlace.get(clock.place)).toBe(1);
  });
});


