import { describe, expect, it } from 'vitest';
import { NIL_ID } from '../../src/core/constants';
import { validateDocument, validateKuukanDrawing } from '../../src/core/validate';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';

describe('validateDocument', () => {
  it('正しい文書では違反が空である', () => {
    const doc = createSampleDocument();
    const violations = validateDocument(doc);
    expect(violations).toEqual([]);
  });

  it('ID重複を検出する (duplicateId)', () => {
    const doc = createSampleDocument();
    doc.membership.tags.push({ id: FIXTURE_IDS.battery, name: 'タグ重複ID' });
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'duplicateId')).toBe(true);
  });

  it('UUID v7 でないIDを検出する (invalidId)', () => {
    const doc = createSampleDocument();
    doc.membership.items[0]!.id = 'new:temp-id-123';
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'invalidId')).toBe(true);
  });

  it('未設定クウカンが存在しないことを検出する (missingUnset)', () => {
    const doc = createSampleDocument();
    doc.membership.kuukans = doc.membership.kuukans.filter(k => k.id !== NIL_ID);
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'missingUnset')).toBe(true);
  });

  it('未設定クウカンに持ち主が設定されていることを検出する (unsetHasOwner)', () => {
    const doc = createSampleDocument();
    const unset = doc.membership.kuukans.find(k => k.id === NIL_ID)!;
    unset.owner = FIXTURE_IDS.battery;
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'unsetHasOwner')).toBe(true);
  });

  it('モノの置き場の参照先がないことを検出する (placeMissing)', () => {
    const doc = createSampleDocument();
    doc.membership.items[0]!.place = makeDeterministicId(999);
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'placeMissing')).toBe(true);
  });

  it('モノのカテゴリの参照先がないことを検出する (categoryMissing)', () => {
    const doc = createSampleDocument();
    doc.membership.items[2]!.category = makeDeterministicId(999);
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'categoryMissing')).toBe(true);
  });

  it('モノのタグの重複を検出する (tagDuplicate)', () => {
    const doc = createSampleDocument();
    doc.membership.items[2]!.tags = [FIXTURE_IDS.tagEmergency, FIXTURE_IDS.tagEmergency];
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'tagDuplicate')).toBe(true);
  });

  it('カテゴリの輪を検出する (cycleCategory)', () => {
    const doc = createSampleDocument();
    const catA = makeDeterministicId(301);
    const catB = makeDeterministicId(302);
    doc.membership.categories.push(
      { id: catA, name: 'カテゴリA', parent: catB },
      { id: catB, name: 'カテゴリB', parent: catA },
    );
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'cycleCategory')).toBe(true);
  });

  it('エリアの親が別のクウカンに属していることを検出する (areaParentDifferentKuukan)', () => {
    const doc = createSampleDocument();
    const roomB = makeDeterministicId(401);
    const areaB = makeDeterministicId(402);
    doc.membership.kuukans.push({
      id: roomB,
      name: 'Room B',
      owner: null,
      areaLabel: 'エリア',
    });
    doc.membership.areas.push({
      id: areaB,
      kuukan: roomB,
      parent: null,
      name: 'エリアB',
      order: 0,
    });
    doc.membership.areas[0]!.parent = areaB;

    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'areaParentDifferentKuukan')).toBe(true);
  });

  it('エリアの輪を検出する (cycleArea)', () => {
    const doc = createSampleDocument();
    doc.membership.areas[0]!.parent = FIXTURE_IDS.dan2;
    doc.membership.areas[1]!.parent = FIXTURE_IDS.dan1;
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'cycleArea')).toBe(true);
  });

  it('クウカンの持ち主の参照先がないことを検出する (ownerMissing)', () => {
    const doc = createSampleDocument();
    const shelfKuukan = doc.membership.kuukans.find(k => k.id === FIXTURE_IDS.shelfKuukan)!;
    shelfKuukan.owner = makeDeterministicId(999);
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'ownerMissing')).toBe(true);
  });

  it('1つのモノが2つのクウカンを持つことを検出する (ownerShared)', () => {
    const doc = createSampleDocument();
    const extraKuukan = makeDeterministicId(501);
    doc.membership.kuukans.push({
      id: extraKuukan,
      owner: FIXTURE_IDS.shelf,
      areaLabel: '段',
    });
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'ownerShared')).toBe(true);
  });

  it('収納の入れ子の輪を検出する (cycleNesting)', () => {
    const doc = createSampleDocument();
    doc.membership.items[0]!.place = FIXTURE_IDS.box1Kuukan;
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'cycleNesting')).toBe(true);
  });

  it('名前のないどこにも置かれていないクウカンを検出する (kuukanMissingName)', () => {
    const doc = createSampleDocument();
    const roomA = doc.membership.kuukans.find(k => k.id === FIXTURE_IDS.roomA)!;
    delete roomA.name;
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'kuukanMissingName')).toBe(true);
  });

  it('描画が未設定クウカンを指していることを検出する (unsetHasDrawing)', () => {
    const doc = createSampleDocument();
    doc.drawing.kuukans.push({
      kuukan: NIL_ID,
      outline: [
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ],
      aspect: 1,
    });
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'unsetHasDrawing')).toBe(true);
  });

  it('モノの描画のクウカンに描画がないことを検出する (itemDrawingKuukanNoDrawing)', () => {
    const doc = createSampleDocument();
    doc.drawing.items.push({
      item: FIXTURE_IDS.battery,
      shape: { type: 'point', at: [100, 100] },
      rotation: 0,
    });
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'itemDrawingKuukanNoDrawing')).toBe(true);
  });

  it('回転が 8 であることを検出する (invalidRotation)', () => {
    const doc = createSampleDocument();
    doc.drawing.kuukans.push({
      kuukan: FIXTURE_IDS.roomA,
      outline: [
        [0, 0],
        [10000, 0],
        [10000, 10000],
        [0, 10000],
      ],
      aspect: 1,
    });
    doc.drawing.markers.push({
      id: makeDeterministicId(601),
      kuukan: FIXTURE_IDS.roomA,
      name: '柱',
      shape: { type: 'rect', x: 100, y: 100, w: 200, h: 200 },
      rotation: 8 as unknown as 0,
      notAPlace: true,
    });
    const violations = validateDocument(doc);
    expect(violations.some(v => v.code === 'invalidRotation')).toBe(true);
  });
});

describe('validateKuukanDrawing', () => {
  it('描画のないクウカンでは ok: false を返す', () => {
    const doc = createSampleDocument();
    const res = validateKuukanDrawing(doc, FIXTURE_IDS.roomA);
    expect(res.ok).toBe(false);
  });
});
