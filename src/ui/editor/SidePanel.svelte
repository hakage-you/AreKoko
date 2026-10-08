<script lang="ts">
  import { getApp } from '../context';
  import { getEditorUi } from './editorUi.svelte';
  import { editorDoc, editorKuukan, applyToEditor } from './target';
  import { addDraftOutline, removeDraftOutline } from '../../editor/draft';
  import { renameKuukan, setAreaLabel } from '../../core/ops/kuukans';
  import { stretchKuukan, setRealSize } from '../../core/ops/kuukanDrawing';
  import {
    renameArea,
    splitEven,
    deleteLine,
    planDeleteLine,
  } from '../../core/ops/areas';
  import {
    updateMarker,
    deleteMarkers,
    alignMarkers,
  } from '../../core/ops/markers';
  import { buildAreaTree } from '../../core/indexes';
  import { displayName, formatPlacePath } from '../../core/places';
  import { computeRegions } from '../../geometry/regions';
  import { isRectangle, boundingRect } from '../../geometry/polygon';
  import type { Id, Axis, Rotation } from '../../core/types';

  const app = getApp();
  const ui = getEditorUi();

  const doc = $derived(editorDoc($app));
  const kuukanId = $derived(editorKuukan($app));
  const isDraft = $derived($app.editor?.kind === 'draft');
  const draft = $derived($app.editor?.kind === 'draft' ? $app.editor.draft : null);

  const targetKuukan = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return doc.membership.kuukans.find((k) => k.id === kuukanId) ?? null;
  });

  const targetKuukanDrawing = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return doc.drawing.kuukans.find((k) => k.kuukan === kuukanId) ?? null;
  });

  const hasDrawing = $derived(
    Boolean(targetKuukanDrawing && targetKuukanDrawing.outline.length > 0),
  );

  const canRemoveOutline = $derived.by(() => {
    if (!isDraft || !draft || !hasDrawing) return false;
    const hasAreas = draft.doc.membership.areas.some(
      (a) => a.kuukan === draft.kuukan,
    );
    const hasMarkers = draft.doc.drawing.markers.some(
      (m) => m.kuukan === draft.kuukan,
    );
    return !hasAreas && !hasMarkers;
  });

  // 実寸（幅・奥行/高さ）の入力値
  let realWInput = $state('');
  let realDInput = $state('');
  $effect(() => {
    const rs = targetKuukanDrawing?.realSize;
    realWInput = rs?.w !== undefined ? String(rs.w) : '';
    realDInput = rs?.d !== undefined ? String(rs.d) : '';
  });

  const approxSizes = $derived.by(() => {
    const kd = targetKuukanDrawing;
    if (!kd || !kd.aspect) return null;
    const rs = kd.realSize;
    const hasW = rs?.w !== undefined && rs.w > 0;
    const hasD = rs?.d !== undefined && rs.d > 0;
    if (hasW && !hasD) {
      const approxD = Math.round((rs.w! / kd.aspect) * 10) / 10;
      return { approxD };
    }
    if (!hasW && hasD) {
      const approxW = Math.round((rs.d! * kd.aspect) * 10) / 10;
      return { approxW };
    }
    return null;
  });

  // クウカン名・呼び名の入力値
  let kuukanNameInput = $state('');
  let areaLabelInput = $state('');
  $effect(() => {
    if (targetKuukan?.name !== undefined) kuukanNameInput = targetKuukan.name ?? '';
    if (targetKuukan?.areaLabel !== undefined) areaLabelInput = targetKuukan.areaLabel;
  });

  function commitKuukanName() {
    if (!targetKuukan || targetKuukan.owner !== null || !kuukanId) return;
    const trimmed = kuukanNameInput.trim();
    if (!trimmed || trimmed === targetKuukan.name) return;
    applyToEditor(app, $app, (d) => renameKuukan(d, kuukanId, trimmed));
  }

  function commitAreaLabel() {
    if (!targetKuukan || !kuukanId) return;
    const trimmed = areaLabelInput.trim();
    if (!trimmed || trimmed === targetKuukan.areaLabel) return;
    applyToEditor(app, $app, (d) => setAreaLabel(d, kuukanId, trimmed));
  }

  function commitRealSize() {
    if (!kuukanId || !targetKuukanDrawing) return;
    const wVal = realWInput.trim() !== '' ? Number(realWInput) : undefined;
    const dVal = realDInput.trim() !== '' ? Number(realDInput) : undefined;
    if (wVal !== undefined && (isNaN(wVal) || wVal <= 0)) return;
    if (dVal !== undefined && (isNaN(dVal) || dVal <= 0)) return;
    applyToEditor(app, $app, (d) => setRealSize(d, kuukanId, { w: wVal, d: dVal }));
  }

  function handleStretch(axis: 'x' | 'y', factor: number) {
    if (!kuukanId || $app.editor?.kind !== 'kuukan') return;
    applyToEditor(app, $app, (d) => stretchKuukan(d, kuukanId, { axis, factor }));
  }

  function handleAddOutline() {
    if (!draft) return;
    app.draftReplace(addDraftOutline(draft));
  }

  function handleRemoveOutline() {
    if (!draft) return;
    app.draftReplace(removeDraftOutline(draft));
  }

  // エリアツリー
  interface TreeItem {
    id: Id;
    name: string;
    depth: number;
    hasChildren: boolean;
    isEmptyIntermediate: boolean;
  }

  const areaTree = $derived.by(() => {
    if (!doc || !kuukanId) return null;
    return buildAreaTree(doc, kuukanId);
  });

  const treeItems = $derived.by<TreeItem[]>(() => {
    if (!doc || !kuukanId || !areaTree) return [];
    const result: TreeItem[] = [];
    const visited = new Set<Id>();

    function walk(nodeId: Id, depth: number) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const children = areaTree?.children.get(nodeId) ?? [];
      const hasChildren = children.length > 0;
      const isRoot = nodeId === kuukanId;
      const name = isRoot
        ? (targetKuukan?.name ?? 'クウカン')
        : displayName(doc!, nodeId);

      const hasDirectItems = doc!.membership.items.some(
        (i) => i.place === nodeId,
      );
      const isEmptyIntermediate = hasChildren && !hasDirectItems;

      result.push({
        id: nodeId,
        name,
        depth,
        hasChildren,
        isEmptyIntermediate,
      });

      for (const childId of children) {
        walk(childId, depth + 1);
      }
    }

    walk(kuukanId, 0);
    return result;
  });

  let editingTreeAreaId = $state<Id | null>(null);
  let editingTreeAreaName = $state('');

  function startRenameArea(id: Id, currentName: string) {
    editingTreeAreaId = id;
    editingTreeAreaName = currentName;
  }

  function commitRenameTreeArea(id: Id) {
    if (editingTreeAreaId !== id) return;
    const trimmed = editingTreeAreaName.trim();
    if (trimmed) {
      applyToEditor(app, $app, (d) => renameArea(d, id, trimmed));
    }
    editingTreeAreaId = null;
  }

  function selectAreaNode(id: Id) {
    ui.selectedArea = id;
    ui.selectedLine = null;
    ui.selectedMarkers = [];
  }

  // 選んだエリア
  const selectedAreaObj = $derived.by(() => {
    if (!doc || !ui.selectedArea) return null;
    return doc.membership.areas.find((a) => a.id === ui.selectedArea) ?? null;
  });

  let selectedAreaNameInput = $state('');
  $effect(() => {
    if (selectedAreaObj) selectedAreaNameInput = selectedAreaObj.name;
  });

  function commitSelectedAreaName() {
    if (!ui.selectedArea || !selectedAreaObj) return;
    const trimmed = selectedAreaNameInput.trim();
    if (!trimmed || trimmed === selectedAreaObj.name) return;
    applyToEditor(app, $app, (d) => renameArea(d, ui.selectedArea!, trimmed));
  }

  const canSplitEven = $derived.by(() => {
    if (!doc || !kuukanId || !ui.selectedArea || !areaTree) return false;
    const kids = areaTree.children.get(ui.selectedArea);
    if (kids && kids.length > 0) return false;

    const kd = targetKuukanDrawing;
    if (!kd || kd.outline.length === 0) return false;

    const nodeIds = new Set<Id>([kuukanId, ...[...areaTree.children.values()].flat()]);
    const partitions = doc.drawing.partitions.filter((p) => nodeIds.has(p.area));
    const regionsRes = computeRegions(kd.outline, areaTree, partitions);
    if (!regionsRes.ok) return false;

    const poly = regionsRes.regions.get(ui.selectedArea);
    return poly ? isRectangle(poly) : false;
  });

  let splitEvenN = $state(2);

  function handleSplitEven(axis: Axis) {
    if (!ui.selectedArea) return;
    applyToEditor(app, $app, (d, ctx) =>
      splitEven(d, ui.selectedArea!, axis, splitEvenN, ctx),
    );
  }

  const selectedAreaPartition = $derived.by(() => {
    if (!doc || !ui.selectedArea) return null;
    return doc.drawing.partitions.find((p) => p.area === ui.selectedArea) ?? null;
  });

  function handleDeleteAreaPartition() {
    if (!doc || !ui.selectedArea || !selectedAreaPartition) return;
    const nodeId = ui.selectedArea;
    const lineIndex = 0;

    if ($app.editor?.kind === 'kuukan') {
      const plan = planDeleteLine(doc, nodeId, lineIndex);
      const details = plan.relocations.map((r) => {
        const fromPath = formatPlacePath(doc!, r.from);
        const toPath = formatPlacePath(doc!, r.to);
        return `${fromPath} から ${r.items.length}件 → ${toPath}`;
      });
      app.confirm({
        title: '仕切りの削除',
        message: 'このエリアを分けている仕切りを削除します。',
        details,
        confirmLabel: '削除する',
        danger: true,
        onConfirm: () => {
          applyToEditor(app, $app, (d, ctx) =>
            deleteLine(d, nodeId, lineIndex, ctx),
          );
        },
      });
    } else {
      applyToEditor(app, $app, (d, ctx) =>
        deleteLine(d, nodeId, lineIndex, ctx),
      );
    }
  }

  // 選んだ線
  function handleDeleteSelectedLine() {
    if (!doc || !ui.selectedLine) return;
    const { node, lineIndex } = ui.selectedLine;

    if ($app.editor?.kind === 'kuukan') {
      const plan = planDeleteLine(doc, node, lineIndex);
      const details = plan.relocations.map((r) => {
        const fromPath = formatPlacePath(doc!, r.from);
        const toPath = formatPlacePath(doc!, r.to);
        return `${fromPath} から ${r.items.length}件 → ${toPath}`;
      });
      app.confirm({
        title: '仕切りの線の削除',
        message: '選択した仕切りの線を削除します。',
        details,
        confirmLabel: '削除する',
        danger: true,
        onConfirm: () => {
          applyToEditor(app, $app, (d, ctx) =>
            deleteLine(d, node, lineIndex, ctx),
          );
          ui.selectedLine = null;
        },
      });
    } else {
      applyToEditor(app, $app, (d, ctx) =>
        deleteLine(d, node, lineIndex, ctx),
      );
      ui.selectedLine = null;
    }
  }

  // 選んだマーカー
  const selectedSingleMarker = $derived.by(() => {
    if (!doc || ui.selectedMarkers.length !== 1) return null;
    const id = ui.selectedMarkers[0];
    return doc.drawing.markers.find((m) => m.id === id) ?? null;
  });

  let markerNameInput = $state('');
  $effect(() => {
    if (selectedSingleMarker) markerNameInput = selectedSingleMarker.name;
  });

  function commitMarkerName() {
    if (!selectedSingleMarker) return;
    const trimmed = markerNameInput.trim();
    if (!trimmed || trimmed === selectedSingleMarker.name) return;
    applyToEditor(app, $app, (d) =>
      updateMarker(d, selectedSingleMarker.id, { name: trimmed }),
    );
  }

  function handleConvertMarkerShape() {
    if (!selectedSingleMarker) return;
    const marker = selectedSingleMarker;
    if (marker.shape.type === 'point') {
      const [px, py] = marker.shape.at;
      const w = 1000;
      const h = 1000;
      const x = Math.max(0, px - 500);
      const y = Math.max(0, py - 500);
      applyToEditor(app, $app, (d) =>
        updateMarker(d, marker.id, { shape: { type: 'rect', x, y, w, h } }),
      );
    } else if (marker.shape.type === 'rect') {
      const cx = Math.round(marker.shape.x + marker.shape.w / 2);
      const cy = Math.round(marker.shape.y + marker.shape.h / 2);
      applyToEditor(app, $app, (d) =>
        updateMarker(d, marker.id, { shape: { type: 'point', at: [cx, cy] } }),
      );
    } else if (marker.shape.type === 'poly') {
      const b = boundingRect(marker.shape.points);
      const cx = Math.round((b.x0 + b.x1) / 2);
      const cy = Math.round((b.y0 + b.y1) / 2);
      applyToEditor(app, $app, (d) =>
        updateMarker(d, marker.id, { shape: { type: 'point', at: [cx, cy] } }),
      );
    }
  }

  function handleRotateMarker(delta: -1 | 1) {
    if (!selectedSingleMarker) return;
    const currentRot = selectedSingleMarker.rotation;
    const nextRot = ((currentRot + (delta === -1 ? 7 : 1)) % 8) as Rotation;
    applyToEditor(app, $app, (d) =>
      updateMarker(d, selectedSingleMarker.id, { rotation: nextRot }),
    );
  }

  function handleToggleNotAPlace() {
    if (!selectedSingleMarker) return;
    applyToEditor(app, $app, (d) =>
      updateMarker(d, selectedSingleMarker.id, {
        notAPlace: !selectedSingleMarker.notAPlace,
      }),
    );
  }

  function handleDeleteSingleMarker() {
    if (!selectedSingleMarker) return;
    const mId = selectedSingleMarker.id;
    applyToEditor(app, $app, (d) => deleteMarkers(d, [mId]));
    ui.selectedMarkers = [];
  }

  function handleAlignMarkers(
    mode: 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY',
  ) {
    if (ui.selectedMarkers.length < 2) return;
    applyToEditor(app, $app, (d) => alignMarkers(d, ui.selectedMarkers, mode));
  }

  function handleDeleteMultipleMarkers() {
    if (ui.selectedMarkers.length === 0) return;
    const ids = [...ui.selectedMarkers];
    applyToEditor(app, $app, (d) => deleteMarkers(d, ids));
    ui.selectedMarkers = [];
  }
</script>

<div class="side-panel-content">
  <!-- 選択したものの詳細 -->
  {#if ui.selectedMarkers.length > 1}
    <section class="panel-section active-selection">
      <div class="section-title">選んだマーカー（{ui.selectedMarkers.length}個）</div>
      <div class="field-block">
        <div class="group-label">整列</div>
        <div class="btn-grid">
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('left')}
          >
            左
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('centerX')}
          >
            横中央
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('right')}
          >
            右
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('top')}
          >
            上
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('centerY')}
          >
            縦中央
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleAlignMarkers('bottom')}
          >
            下
          </button>
        </div>
      </div>
      <div class="action-row">
        <button
          type="button"
          class="small danger ghost"
          onclick={handleDeleteMultipleMarkers}
        >
          まとめて消す
        </button>
      </div>
    </section>
  {:else if selectedSingleMarker}
    <section class="panel-section active-selection">
      <div class="section-title">選んだマーカー</div>
      <div class="field-block">
        <label for="marker-name-input">名前</label>
        <input
          id="marker-name-input"
          type="text"
          bind:value={markerNameInput}
          onblur={commitMarkerName}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitMarkerName();
          }}
        />
      </div>

      <div class="field-block">
        <div class="group-label">
          形: {selectedSingleMarker.shape.type === 'point'
            ? '点'
            : selectedSingleMarker.shape.type === 'rect'
              ? '長方形'
              : '多角形'}
        </div>
        <button
          type="button"
          class="small"
          onclick={handleConvertMarkerShape}
        >
          {selectedSingleMarker.shape.type === 'point' ? '長方形にする' : '点にする'}
        </button>
      </div>

      {#if selectedSingleMarker.shape.type === 'rect' || selectedSingleMarker.shape.type === 'poly'}
        <div class="field-block">
          <div class="group-label">形の編集</div>
          <div class="btn-group">
            <button
              type="button"
              class="small ghost"
              class:active={ui.tool === 'markerEdge'}
              onclick={() => {
                ui.tool = 'markerEdge';
              }}
            >
              辺を動かす
            </button>
            <button
              type="button"
              class="small ghost"
              class:active={ui.tool === 'markerStep'}
              onclick={() => {
                ui.tool = 'markerStep';
              }}
            >
              段差を足す
            </button>
            <button
              type="button"
              class="small ghost"
              class:active={ui.tool === 'select'}
              onclick={() => {
                ui.tool = 'select';
              }}
            >
              選ぶに戻る
            </button>
          </div>
        </div>
      {/if}

      <div class="field-block">
        <div class="group-label">回転</div>
        <div class="btn-group">
          <button
            type="button"
            class="small ghost"
            onclick={() => handleRotateMarker(-1)}
          >
            左へ 45°
          </button>
          <button
            type="button"
            class="small ghost"
            onclick={() => handleRotateMarker(1)}
          >
            右へ 45°
          </button>
        </div>
      </div>

      <div class="field-block checkbox-row">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={selectedSingleMarker.notAPlace}
            onchange={handleToggleNotAPlace}
          />
          置き場にしない
        </label>
      </div>

      <div class="action-row">
        <button
          type="button"
          class="small danger ghost"
          onclick={handleDeleteSingleMarker}
        >
          消す
        </button>
      </div>
    </section>
  {:else if ui.selectedLine}
    <section class="panel-section active-selection">
      <div class="section-title">選んだ仕切りの線</div>
      <p class="muted small desc-text">仕切りの線が選択されています。</p>
      <div class="action-row">
        <button
          type="button"
          class="small danger ghost"
          onclick={handleDeleteSelectedLine}
        >
          この線を消す
        </button>
      </div>
    </section>
  {:else if selectedAreaObj}
    <section class="panel-section active-selection">
      <div class="section-title">選んだエリア</div>
      <div class="field-block">
        <label for="selected-area-name-input">名前</label>
        <input
          id="selected-area-name-input"
          type="text"
          bind:value={selectedAreaNameInput}
          onblur={commitSelectedAreaName}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitSelectedAreaName();
          }}
        />
      </div>

      {#if canSplitEven}
        <div class="field-block">
          <label for="split-even-n">同じ大きさに分ける</label>
          <div class="split-controls">
            <select id="split-even-n" bind:value={splitEvenN} class="split-select">
              <option value={2}>2等分</option>
              <option value={3}>3等分</option>
              <option value={4}>4等分</option>
              <option value={5}>5等分</option>
              <option value={6}>6等分</option>
              <option value={7}>7等分</option>
              <option value={8}>8等分</option>
              <option value={9}>9等分</option>
              <option value={10}>10等分</option>
            </select>
            <div class="btn-group">
              <button
                type="button"
                class="small"
                onclick={() => handleSplitEven('y')}
                title="横の線で、上から下へ同じ高さに分けます"
              >
                上下に分ける
              </button>
              <button
                type="button"
                class="small"
                onclick={() => handleSplitEven('x')}
                title="縦の線で、左から右へ同じ幅に分けます"
              >
                左右に分ける
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if selectedAreaPartition && selectedAreaPartition.at.length === 1}
        <div class="action-row">
          <button
            type="button"
            class="small danger ghost"
            onclick={handleDeleteAreaPartition}
          >
            このエリアを分けている仕切りを消す
          </button>
        </div>
      {:else if selectedAreaPartition}
        <!-- N等分は線が複数あり、どの線を消すかを決めてもらう必要がある（黙って1本目を消さない） -->
        <p class="muted small">このエリアは{selectedAreaPartition.at.length}本の線で分けられています。消したい線を図で押して選んでください。</p>
      {/if}
    </section>
  {/if}

  <!-- クウカン -->
  <section class="panel-section">
    <div class="section-title">クウカン</div>
    {#if targetKuukan}
      {#if targetKuukan.owner === null}
        <div class="field-block">
          <label for="kuukan-name-input">名前</label>
          <input
            id="kuukan-name-input"
            type="text"
            bind:value={kuukanNameInput}
            onblur={commitKuukanName}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitKuukanName();
            }}
          />
        </div>
      {:else}
        <div class="field-block">
          <div class="group-label">名前</div>
          <div class="readonly-text">{displayName(doc ?? $app.doc!, kuukanId ?? '')}</div>
        </div>
      {/if}

      <div class="field-block">
        <label for="area-label-input">エリアの呼び名</label>
        <input
          id="area-label-input"
          type="text"
          bind:value={areaLabelInput}
          onblur={commitAreaLabel}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitAreaLabel();
          }}
        />
      </div>

      {#if hasDrawing}
        <div class="field-block">
          <div class="group-label">実際の長さ（cm）</div>
          <div class="size-inputs">
            <div class="size-field">
              <span class="sub-label">幅</span>
              <input
                type="number"
                min="1"
                step="0.1"
                placeholder="cm"
                bind:value={realWInput}
                onblur={commitRealSize}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRealSize();
                }}
              />
              {#if approxSizes?.approxW}
                <span class="approx-text muted small">約 {approxSizes.approxW} cm</span>
              {/if}
            </div>
            <div class="size-field">
              <span class="sub-label">奥行・高さ</span>
              <input
                type="number"
                min="1"
                step="0.1"
                placeholder="cm"
                bind:value={realDInput}
                onblur={commitRealSize}
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRealSize();
                }}
              />
              {#if approxSizes?.approxD}
                <span class="approx-text muted small">約 {approxSizes.approxD} cm</span>
              {/if}
            </div>
          </div>
        </div>

        {#if $app.editor?.kind === 'kuukan'}
          <div class="field-block">
            <div class="group-label">縦横の比率を変える</div>
            <div class="stretch-controls">
              <div class="stretch-row">
                <span class="sub-label">幅</span>
                <div class="btn-group">
                  <button
                    type="button"
                    class="small ghost"
                    onclick={() => handleStretch('x', 1.1)}
                  >
                    広げる
                  </button>
                  <button
                    type="button"
                    class="small ghost"
                    onclick={() => handleStretch('x', 1 / 1.1)}
                  >
                    狭める
                  </button>
                </div>
              </div>
              <div class="stretch-row">
                <span class="sub-label">奥行・高さ</span>
                <div class="btn-group">
                  <button
                    type="button"
                    class="small ghost"
                    onclick={() => handleStretch('y', 1.1)}
                  >
                    広げる
                  </button>
                  <button
                    type="button"
                    class="small ghost"
                    onclick={() => handleStretch('y', 1 / 1.1)}
                  >
                    狭める
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      {/if}

      {#if isDraft}
        <div class="field-block outline-actions">
          {#if !hasDrawing}
            <p class="muted small desc-text">
              外形を描かずに確定すると、描画なしのクウカンになります。
            </p>
            <button
              type="button"
              class="small"
              onclick={handleAddOutline}
            >
              外形を付ける
            </button>
          {:else if canRemoveOutline}
            <button
              type="button"
              class="small ghost"
              onclick={handleRemoveOutline}
            >
              外形を外す（描画なしにする）
            </button>
          {/if}
        </div>
      {/if}
    {/if}
  </section>

  <!-- エリアの一覧（木） -->
  <section class="panel-section">
    <div class="section-title">エリアの一覧</div>
    <div class="area-tree-list">
      {#each treeItems as item (item.id)}
        <div
          class="tree-node"
          class:selected={ui.selectedArea === item.id}
          style:padding-left="{item.depth * 16 + 8}px"
          onclick={() => selectAreaNode(item.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter') selectAreaNode(item.id);
          }}
        >
          {#if editingTreeAreaId === item.id}
            <input
              type="text"
              class="inline-name-input"
              bind:value={editingTreeAreaName}
              onblur={() => commitRenameTreeArea(item.id)}
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitRenameTreeArea(item.id);
                if (e.key === 'Escape') editingTreeAreaId = null;
              }}
            />
          {:else}
            <span class="node-name">{item.name}</span>
            {#if item.isEmptyIntermediate}
              <span class="chip small muted">中身なし</span>
            {/if}
            {#if item.id !== kuukanId}
              <button
                type="button"
                class="small ghost rename-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  startRenameArea(item.id, item.name);
                }}
                title="名前の変更"
              >
                ✏️
              </button>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  /* 入力欄に結び付かない、まとまりの見出し（label と同じ見た目） */
  .group-label {
    color: var(--text-muted);
    font-size: var(--font-size-small);
    margin-bottom: var(--space-1);
  }

  .side-panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .panel-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .panel-section.active-selection {
    background: var(--surface-2);
    padding: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .section-title {
    font-weight: 600;
    font-size: var(--font-size);
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .readonly-text {
    padding: var(--space-1) 0;
    font-weight: 500;
  }

  .desc-text {
    margin: 0;
    line-height: var(--line-height);
  }

  .sub-label {
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .size-inputs {
    display: flex;
    gap: var(--space-2);
  }

  .size-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .approx-text {
    font-size: var(--font-size-small);
  }

  .stretch-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .stretch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .btn-group {
    display: flex;
    gap: var(--space-1);
  }

  .btn-group button.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  .btn-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-1);
  }

  .btn-grid button {
    padding: 0 var(--space-1);
  }

  .split-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .split-select {
    min-height: 32px;
  }

  .action-row {
    display: flex;
    justify-content: flex-start;
    margin-top: var(--space-1);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    min-height: var(--touch);
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    margin: 0;
    color: var(--text);
  }

  .checkbox-label input {
    width: auto;
    min-height: auto;
  }

  .outline-actions {
    margin-top: var(--space-2);
  }

  .area-tree-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 34px;
    padding-right: var(--space-2);
    border-radius: var(--radius-small);
    cursor: pointer;
  }

  .tree-node:hover {
    background: var(--surface-2);
  }

  .tree-node.selected {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-btn {
    opacity: 0.6;
    padding: 0 var(--space-1);
    min-height: 24px;
  }

  .rename-btn:hover {
    opacity: 1;
  }

  .inline-name-input {
    min-height: 28px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-small);
  }
</style>
