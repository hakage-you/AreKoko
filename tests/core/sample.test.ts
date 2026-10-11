import { describe, it, expect } from 'vitest';
import { sampleDocument } from '../../src/core/sample';
import { validateDocument } from '../../src/core/validate';
import { leafAreasOfKuukan } from '../../src/core/places';

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
});
