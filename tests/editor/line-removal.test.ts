// 線を選んだときに出す「消すと何になるか」の文（設計 7.2、TRS 付録B I-18）。
// 線が1本なら両側が合わさって親に戻り、等分した兄弟の間の線なら両側はなくなって中身のない新しいエリアができる。

import { describe, it, expect } from 'vitest';
import { describePartitionLine, describeLineRemoval } from '../../src/editor/view';
import type { Partition } from '../../src/core/types';

function doc(opts: { owner?: string; partitions: Partition[]; areas: { id: string; name: string }[] }) {
  return {
    membership: {
      kuukans: [{ id: 'k', name: opts.owner ? undefined : '物置', owner: opts.owner ?? null, areaLabel: '段' }],
      areas: opts.areas.map((a) => ({ ...a, kuukan: 'k', parent: null, order: 0 })),
      items: opts.owner ? [{ id: opts.owner, name: '本棚', place: 'room', category: null, tags: [] }] : [],
    },
    drawing: { partitions: opts.partitions },
  };
}

describe('describeLineRemoval', () => {
  it('線が1本だけなら、両側が合わさって親に戻る', () => {
    const d = doc({
      partitions: [{ area: 'k', axis: 'x', at: [5000], seed: [5000, 5000], children: ['a', 'b'] }],
      areas: [{ id: 'a', name: '床1' }, { id: 'b', name: '床2' }],
    });
    const info = describePartitionLine(d, 'k', 0)!;
    expect(info.newEmptyArea).toBe(false);
    expect(describeLineRemoval(info)).toBe('この線を消すと、「床1」と「床2」が合わさって「物置」に戻ります。');
  });

  it('等分した兄弟の間の線なら、両側はなくなり、合わさった範囲は中身のない新しいエリアになる（親には戻らない）', () => {
    const d = doc({
      partitions: [{ area: 'k', axis: 'y', at: [3333, 6667], children: ['a', 'b', 'c'] }],
      areas: [{ id: 'a', name: '段1' }, { id: 'b', name: '段2' }, { id: 'c', name: '段3' }],
    });
    const info = describePartitionLine(d, 'k', 0)!;
    expect(info.newEmptyArea).toBe(true);
    const text = describeLineRemoval(info);
    expect(text).toContain('「段1」と「段2」はなくなり');
    expect(text).toContain('中身のない新しいエリア');
    expect(text).not.toContain('物置');
  });

  it('両側の中のエリアも一緒になくなることを、名前で出す', () => {
    const d = doc({
      partitions: [
        { area: 'k', axis: 'y', at: [3333, 6667], children: ['a', 'b', 'c'] },
        { area: 'b', axis: 'x', at: [5000], seed: [5000, 5000], children: ['b1', 'b2'] },
      ],
      areas: [
        { id: 'a', name: '段1' }, { id: 'b', name: '段2' }, { id: 'c', name: '段3' },
        { id: 'b1', name: '段2-1' }, { id: 'b2', name: '段2-2' },
      ],
    });
    const info = describePartitionLine(d, 'k', 0)!;
    expect(info.innerAreaNames).toEqual(['段2-1', '段2-2']);
    expect(describeLineRemoval(info)).toContain('中のエリア（段2-1、段2-2）もなくなります。');
  });

  it('収納のクウカンを分ける線なら、親の名前は持ち主のモノの名前（呼び名ではない。詳細 D3）', () => {
    const d = doc({
      owner: 'shelf',
      partitions: [{ area: 'k', axis: 'y', at: [5000], seed: [5000, 5000], children: ['a', 'b'] }],
      areas: [{ id: 'a', name: '段1' }, { id: 'b', name: '段2' }],
    });
    const info = describePartitionLine(d, 'k', 0)!;
    expect(info.parentName).toBe('本棚');
    expect(describeLineRemoval(info)).toContain('「本棚」に戻ります');
  });
});
