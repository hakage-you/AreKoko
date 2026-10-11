import { describe, it, expect } from 'vitest';
import { createSampleDocument, FIXTURE_IDS, makeDeterministicId } from '../helpers/fixtures';
import { groupPlaceTreeNodes, searchPlaceCandidates } from '../../src/ui/components/placeTree';
import { NIL_ID } from '../../src/core/constants';

describe('groupPlaceTreeNodes', () => {
  it('activeKuukanId が指定された時、表示中クウカンが一番上、未設定が二番目、その他が三番目にグループ化される', () => {
    const doc = createSampleDocument();
    const monookiId = makeDeterministicId(99);
    doc.membership.kuukans.push({
      id: monookiId,
      name: '物置',
      owner: null,
      areaLabel: 'エリア',
    });

    const candidateIds = new Set([
      NIL_ID,
      FIXTURE_IDS.roomA,
      monookiId,
      FIXTURE_IDS.shelfKuukan,
      FIXTURE_IDS.dan1,
      FIXTURE_IDS.dan2,
    ]);

    const sections = groupPlaceTreeNodes({
      doc,
      candidateIds,
      current: FIXTURE_IDS.roomA,
      activeKuukanId: FIXTURE_IDS.roomA,
    });

    expect(sections).toHaveLength(3);

    // 1. 表示中クウカンセクション（一番上）
    expect(sections[0]!.type).toBe('active');
    expect(sections[0]!.title).toBe('表示中のクウカン');
    expect(sections[0]!.badge).toBe('Room A');
    // 配下に Room A 自体と、その中の収納棚が含まれる
    const activeIds = sections[0]!.nodes.map((n) => n.id);
    expect(activeIds).toContain(FIXTURE_IDS.roomA);
    expect(activeIds).toContain(FIXTURE_IDS.shelfKuukan);

    // 2. 未設定セクション（二番目：ユーザー指示「未設定は二番目でいいよ」）
    expect(sections[1]!.type).toBe('unset');
    expect(sections[1]!.nodes).toHaveLength(1);
    expect(sections[1]!.nodes[0]!.id).toBe(NIL_ID);

    // 3. その他のクウカンセクション（三番目）
    expect(sections[2]!.type).toBe('other');
    expect(sections[2]!.title).toBe('その他のクウカン');
    const otherIds = sections[2]!.nodes.map((n) => n.id);
    expect(otherIds).toContain(monookiId);
    expect(otherIds).not.toContain(FIXTURE_IDS.roomA);
  });

  it('activeKuukanId がない場合は、未設定が先頭、その後に各クウカンが並ぶ', () => {
    const doc = createSampleDocument();
    const candidateIds = new Set([
      NIL_ID,
      FIXTURE_IDS.roomA,
    ]);

    const sections = groupPlaceTreeNodes({
      doc,
      candidateIds,
      current: null,
      activeKuukanId: null,
    });

    expect(sections[0]!.type).toBe('unset');
    expect(sections[1]!.type).toBe('other');
  });
});

describe('searchPlaceCandidates', () => {
  it('検索結果に isActiveKuukan フラグが付与される', () => {
    const doc = createSampleDocument();
    const monookiId = makeDeterministicId(99);
    doc.membership.kuukans.push({
      id: monookiId,
      name: '物置',
      owner: null,
      areaLabel: 'エリア',
    });

    const candidateIds = new Set([
      FIXTURE_IDS.roomA,
      monookiId,
      FIXTURE_IDS.shelfKuukan,
      FIXTURE_IDS.box1Kuukan,
    ]);

    // 「A」で検索（Room A と 棚A1 がヒットするはず）
    const results = searchPlaceCandidates(
      doc,
      candidateIds,
      'A',
      FIXTURE_IDS.roomA,
      FIXTURE_IDS.roomA,
    );

    expect(results.length).toBeGreaterThan(0);
    const roomAResult = results.find((r) => r.id === FIXTURE_IDS.roomA);
    expect(roomAResult?.isActiveKuukan).toBe(true);

    // 「BOX」で検索（入れ子の収納BOX1がヒットし、isActiveKuukan が true になるはず）
    const boxResults = searchPlaceCandidates(
      doc,
      candidateIds,
      'BOX',
      null,
      FIXTURE_IDS.roomA,
    );
    expect(boxResults.length).toBeGreaterThan(0);
    expect(boxResults[0]!.isActiveKuukan).toBe(true);

    // 物置はヒットしないか、ヒットしても false
    const monookiResult = results.find((r) => r.id === monookiId);
    if (monookiResult) {
      expect(monookiResult.isActiveKuukan).toBe(false);
    }
  });
});
