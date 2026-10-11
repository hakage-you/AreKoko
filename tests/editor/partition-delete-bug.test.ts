import { describe, it, expect } from 'vitest';
import type { Id, Partition, Point } from '../../src/core/types';
import type { Polygon } from '../../src/geometry/types';
import { computeRegions } from '../../src/geometry/regions';
import { buildAreaTree } from '../../src/core/indexes';
import { lineSegments, hitLine } from '../../src/editor/view';
import { planDeleteLine, deleteLine, splitEven } from '../../src/core/ops/areas';
import { createEmptyDocument } from '../../src/core/document';
import { createKuukan } from '../../src/core/ops/kuukans';
import { attachOutline } from '../../src/core/ops/areas';
import { newId } from '../../src/core/ids';
import type { OpContext } from '../../src/core/ops/common';

describe('課題1: 仕切り線削除とヒット判定のバグ再現テスト', () => {
  const ctx: OpContext = { newId, now: () => '2026-10-09T00:00:00.000Z' };

  /**
   * 動画の階層構造を構築するヘルパー:
   * 1. 部屋（Room A）を作成
   * 2. 部屋を2分割 -> 床1, 床2
   * 3. 床2を2分割 -> 床2-1, 床2-2
   * 4. 床2-2を2分割 -> 床2-2-1, 床2-2-2
   * 5. 床2-2-2を2分割 -> 床2-2-2-1, 床2-2-2-2
   * 
   * この時点で分けていないエリア（表示エリア）として：
   * 床2-2-1, 床2-2-2-1, 床2-2-2-2 の3エリアが並ぶ。
   */
  function setupNestedPartitionDoc() {
    let doc = createEmptyDocument();
    const run = (fn: (d: typeof doc) => any) => {
      const res = fn(doc);
      doc = res.doc;
      return res;
    };

    const roomRes = run(d => createKuukan(d, { name: '部屋', areaLabel: '床' }, ctx));
    const roomId = roomRes.created[0]!;

    run(d => attachOutline(d, roomId, {
      outline: [[0, 0], [10000, 0], [10000, 10000], [0, 10000]],
      aspect: 1,
    }, ctx));

    // 1. 部屋を横（y）に2分割 -> 床1, 床2
    const split1 = run(d => splitEven(d, roomId, 'y', 2, ctx));
    const floor2 = split1.created[1]!; // 床2

    // 2. 床2を縦（x）に2分割 -> 床2-1, 床2-2
    const split2 = run(d => splitEven(d, floor2, 'x', 2, ctx));
    const floor2_2 = split2.created[1]!; // 床2-2

    // 3. 床2-2を横（y）に2分割 -> 床2-2-1, 床2-2-2
    const split3 = run(d => splitEven(d, floor2_2, 'y', 2, ctx));
    const floor2_2_1 = split3.created[0]!; // 床2-2-1
    const floor2_2_2 = split3.created[1]!; // 床2-2-2

    // 4. 床2-2-2を縦（x）に2分割 -> 床2-2-2-1, 床2-2-2-2
    const split4 = run(d => splitEven(d, floor2_2_2, 'x', 2, ctx));
    const floor2_2_2_1 = split4.created[0]!; // 床2-2-2-1
    const floor2_2_2_2 = split4.created[1]!; // 床2-2-2-2

    return {
      doc,
      roomId,
      floor2,
      floor2_2,
      floor2_2_1,
      floor2_2_2,
      floor2_2_2_1,
      floor2_2_2_2,
    };
  }

  it('テスト1: 子の仕切り線を削除した場合、3エリア全滅せず、子の2エリアのみが統合されるべき', () => {
    const { doc, floor2_2, floor2_2_1, floor2_2_2, floor2_2_2_1, floor2_2_2_2 } = setupNestedPartitionDoc();

    // 削除前の分けていないエリアを確認: floor2_2_1, floor2_2_2_1, floor2_2_2_2 が存在する
    const areaIdsBefore = doc.membership.areas.map(a => a.id);
    expect(areaIdsBefore).toContain(floor2_2_1);
    expect(areaIdsBefore).toContain(floor2_2_2_1);
    expect(areaIdsBefore).toContain(floor2_2_2_2);

    // 【期待される動作】子の仕切り線（floor2_2_2 の lineIndex 0）を削除した場合:
    // 消えるのは floor2_2_2_1 と floor2_2_2_2 の2エリアのみであり、
    // 親の兄弟である floor2_2_1 は絶対に消えてはならない！
    const plan = planDeleteLine(doc, floor2_2_2, 0);
    expect(plan.removedAreas).toHaveLength(2);
    expect(plan.removedAreas).toContain(floor2_2_2_1);
    expect(plan.removedAreas).toContain(floor2_2_2_2);
    expect(plan.removedAreas).not.toContain(floor2_2_1);

    const delRes = deleteLine(doc, floor2_2_2, 0, ctx);
    const areaIdsAfter = delRes.doc.membership.areas.map(a => a.id);

    // floor2_2_1 が残っていること（3エリア全滅していないこと）
    expect(areaIdsAfter).toContain(floor2_2_1);
    // floor2_2_2_1 と floor2_2_2_2 は統合されて消えていること
    expect(areaIdsAfter).not.toContain(floor2_2_2_1);
    expect(areaIdsAfter).not.toContain(floor2_2_2_2);
  });

  it('テスト2 (バグ再現): T字交点や境界近接部で子の線をクリックした際、親の線（floor2_2）が誤選択されてはならず、確実に子の線（floor2_2_2）がヒットしなければならない', () => {
    const { doc, roomId, floor2_2, floor2_2_2 } = setupNestedPartitionDoc();

    const outline = doc.drawing.kuukans[0]!.outline;
    const tree = {
      root: roomId,
      children: new Map<Id, Id[]>(),
    };
    for (const p of doc.drawing.partitions) {
      tree.children.set(p.area, [...p.children]);
    }

    const regRes = computeRegions(outline, tree, doc.drawing.partitions);
    expect(regRes.ok).toBe(true);
    if (!regRes.ok) return;

    // 線分一覧を取得
    const segs = lineSegments(regRes.regions, doc.drawing.partitions);
    const childSeg = segs.find(s => s.node === floor2_2_2 && s.lineIndex === 0);
    const parentSeg = segs.find(s => s.node === floor2_2 && s.lineIndex === 0);

    expect(childSeg).toBeDefined();
    expect(parentSeg).toBeDefined();

    // 子の仕切り線（floor2_2_2）の上端は、親の仕切り線（floor2_2）とT字に接続している
    // T字接続点のすぐ近く（距離15単位）をクリックした場合:
    // 例: childSeg の始点からわずかに離れた位置
    const testPointNearTJunction: Point = [
      childSeg!.from[0],
      childSeg!.from[1] + 5, // T字交点からわずか5単位離れた子の線上の点
    ];

    // tolerance 30 で判定
    const hit = hitLine(regRes.regions, doc.drawing.partitions, testPointNearTJunction, 30, tree);

    // 【ここがバグの焦点】
    // 親の線（floor2_2）ではなく、クリックした子の線（floor2_2_2）が100%ヒットしなければならない！
    expect(hit).not.toBeNull();
    expect(hit).toEqual({ node: floor2_2_2, lineIndex: 0 });
  });

  it('テスト3 (近接並行・手前クリック): 親の線と子の線が近接する場合でも、より局所的なエリア内の線が優先されるべき', () => {
    // 根を2分割（x=5000）、右側（area-r: x 5000..10000）をさらに x=6000 で分割（area-r1, area-r2）
    // 2本の縦線 x=5000（親）と x=6000（子）が近接して平行に並ぶ
    const regions = new Map<Id, Polygon>([
      ['root', [[0, 0], [10000, 0], [10000, 10000], [0, 10000]]],
      ['area-r', [[5000, 0], [10000, 0], [10000, 10000], [5000, 10000]]],
    ]);
    const partitions: Partition[] = [
      { area: 'root', axis: 'x', at: [5000], children: ['area-l', 'area-r'] },
      { area: 'area-r', axis: 'x', at: [6000], children: ['area-r1', 'area-r2'] },
    ];
    const tree = {
      root: 'root',
      children: new Map<Id, Id[]>([
        ['root', ['area-l', 'area-r']],
        ['area-r', ['area-r1', 'area-r2']],
      ]),
    };

    // 2本の線の中間より少し親寄り（x=5480）をクリック（tolerance=600）
    // ユーザーは右側の局所的な区画（area-r内）を操作しているつもりだが、親の線（x=5000）までの距離は480、子の線（x=6000）までの距離は520
    // 現状のロジックでは距離差が DIST_EPSILON（20）より大きいため、無条件に親（x=5000）が選ばれてしまう！
    const clickPoint: Point = [5480, 5000];
    const hit = hitLine(regions, partitions, clickPoint, 600, tree);

    // 深い階層の局所線を優先して拾うべきか、または許容誤差内での優先ルール
    // （この仕様・改善を検証する）
    expect(hit?.node).toBe('area-r');
  });

  it('テスト4: 仕切り線から両隣のエリア名と親エリア名、統合影響を具体的に取得できること', async () => {
    const { doc, floor2_2_2, floor2_2_2_1, floor2_2_2_2 } = setupNestedPartitionDoc();

    // 線の説明を取得する関数（未実装のため view.ts からインポートする想定）
    const { describePartitionLine } = await import('../../src/editor/view');

    const info = (describePartitionLine as any)(doc, floor2_2_2, 0);

    // 期待する情報:
    // - 子エリア1の名前: 床2-2-2-1
    // - 子エリア2の名前: 床2-2-2-2
    // - 親の名前: 床2-2-2
    // - 説明テキスト: 「床2-2-2-1 と 床2-2-2-2 を分ける線」
    // - 統合後の名前: 「床2-2-2」
    expect(info).toBeDefined();
    expect(info.childNames).toEqual(['床2-2-2-1', '床2-2-2-2']);
    expect(info.parentName).toBe('床2-2-2');
    expect(info.summary).toBe('「床2-2-2-1」と「床2-2-2-2」を分ける線');
    // 線が1本だけなので、両側が合わさって親の「床2-2-2」に戻る（設計 7.2）
    expect(info.newEmptyArea).toBe(false);
  });
});
