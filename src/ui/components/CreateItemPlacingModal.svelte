<script lang="ts">
  import type { Area, Id } from '../../core/types';

  interface Props {
    itemName: string;
    leafAreas: Area[];
    initialAreaId: Id | null;
    onConfirm: (result: { areaId: Id | null; placeNow: boolean }) => void;
    onCancel: () => void;
  }

  let {
    itemName,
    leafAreas,
    initialAreaId,
    onConfirm,
    onCancel,
  }: Props = $props();

  const hasMultipleAreas = $derived(leafAreas.length > 1);

  let selectedAreaId = $state<Id | null>(
    initialAreaId ?? (leafAreas.length > 0 ? leafAreas[0]!.id : null),
  );
  let placeNow = $state(true);

  function handleSubmit() {
    onConfirm({ areaId: selectedAreaId, placeNow });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="dialog-overlay"
  onclick={(e) => {
    if (e.target === e.currentTarget) onCancel();
  }}
  role="presentation"
>
  <div
    class="dialog item-create-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="dialog-header modal-header">
      <span id="modal-title">モノの追加</span>
      <button
        type="button"
        class="ghost small close-btn"
        onclick={onCancel}
        aria-label="閉じる"
      >
        ✕
      </button>
    </div>

    <div class="dialog-body modal-body">
      <div class="target-item-card">
        <span class="item-label muted small">追加するモノ</span>
        <div class="item-name-value">{itemName}</div>
      </div>

      {#if hasMultipleAreas}
        <div class="modal-section area-section">
          <div class="section-title">どこに置きますか？</div>
          <div class="area-options-grid">
            {#each leafAreas as a (a.id)}
              {@const isSelected = selectedAreaId === a.id}
              <button
                type="button"
                class="choice-card-btn"
                class:selected={isSelected}
                onclick={() => {
                  selectedAreaId = a.id;
                }}
              >
                <span class="custom-radio" class:checked={isSelected}>
                  <span class="radio-inner"></span>
                </span>
                <span class="choice-card-name">{a.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="modal-section placing-section">
        <div class="section-title">図面への配置</div>
        <div class="placing-options-grid">
          <button
            type="button"
            class="choice-card-btn"
            class:selected={placeNow}
            onclick={() => {
              placeNow = true;
            }}
          >
            <span class="custom-radio" class:checked={placeNow}>
              <span class="radio-inner"></span>
            </span>
            <span class="choice-card-name">続けて図面に配置する</span>
          </button>
          <button
            type="button"
            class="choice-card-btn"
            class:selected={!placeNow}
            onclick={() => {
              placeNow = false;
            }}
          >
            <span class="custom-radio" class:checked={!placeNow}>
              <span class="radio-inner"></span>
            </span>
            <span class="choice-card-name">あとで配置する</span>
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-footer modal-footer">
      <button type="button" class="ghost cancel-btn" onclick={onCancel}>
        取り消し
      </button>
      <button type="button" class="primary submit-btn" onclick={handleSubmit}>
        作成
      </button>
    </div>
  </div>
</div>

<style>
  .item-create-modal {
    width: min(440px, 92vw);
    animation: modalPop 0.18s ease-out;
  }

  @keyframes modalPop {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3);
  }

  .close-btn {
    font-size: var(--text-base);
    line-height: 1;
    padding: var(--space-1) var(--space-2);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-4);
    padding-bottom: var(--space-3);
  }

  .target-item-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2) var(--space-3);
  }

  .item-label {
    display: block;
    margin-bottom: var(--space-1);
  }

  .item-name-value {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--fg);
  }

  .modal-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--fg);
  }

  .area-options-grid,
  .placing-options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .choice-card-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .choice-card-btn:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .choice-card-btn.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }

  .custom-radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong, var(--border));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .custom-radio.checked {
    border-color: var(--accent);
  }

  .radio-inner {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    transition: all 0.15s ease;
  }

  .custom-radio.checked .radio-inner {
    background: var(--accent);
  }

  .choice-card-name {
    font-size: var(--text-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border);
  }

  .cancel-btn {
    color: var(--text-muted);
  }

  .submit-btn {
    min-width: 80px;
  }
</style>
