<script lang="ts">
  import { PRESET_COLORS } from '../color';

  interface Props {
    color?: string | null;
    onSelect: (color: string | null) => void;
    onClose?: () => void;
  }

  let { color = null, onSelect, onClose }: Props = $props();

  let customColor = $state('#0284c7');
  $effect(() => {
    if (color) customColor = color;
  });

  function handleCustomColorChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    customColor = val;
    onSelect(val);
  }
</script>

{#if onClose}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="color-picker-backdrop" onclick={onClose}></div>
{/if}

<div class="color-picker-popover" role="dialog" aria-label="ラベル色を選択">
  <div class="color-presets">
    <button
      type="button"
      class="color-dot none-dot"
      class:is-active={!color}
      title="色なし（既定）"
      onclick={() => onSelect(null)}
      aria-label="色なし"
    >
      <span class="diagonal-line"></span>
    </button>

    {#each PRESET_COLORS as preset (preset.id)}
      <button
        type="button"
        class="color-dot"
        class:is-active={color === preset.hex}
        style="background-color: {preset.hex};"
        title={preset.name}
        onclick={() => onSelect(preset.hex)}
        aria-label={preset.name}
      ></button>
    {/each}
  </div>

  <div class="custom-color-row">
    <label class="custom-color-label">
      <input
        type="color"
        value={customColor}
        onchange={handleCustomColorChange}
        class="custom-color-input"
      />
      <span class="custom-color-text">自由な色を選ぶ…</span>
    </label>
    {#if onClose}
      <button type="button" class="small ghost close-btn" onclick={onClose}>
        閉じる
      </button>
    {/if}
  </div>
</div>

<style>
  .color-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
    background: transparent;
  }

  .color-picker-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg, 0 10px 20px rgba(0,0,0,0.2));
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 210px;
    animation: fadeIn 0.12s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .color-presets {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    justify-items: center;
  }

  .color-dot {
    width: 24px;
    height: 24px;
    min-height: 0;
    min-width: 0;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform var(--duration-fast), border-color var(--duration-fast);
  }

  .color-dot:hover {
    transform: scale(1.15);
  }

  .color-dot.is-active {
    border-color: var(--text);
    box-shadow: 0 0 0 1px var(--surface);
    transform: scale(1.1);
  }

  .none-dot {
    background: var(--surface-2);
    border: 1px solid var(--border);
    position: relative;
    overflow: hidden;
  }

  .diagonal-line {
    position: absolute;
    top: 50%;
    left: -20%;
    width: 140%;
    height: 2px;
    background: var(--danger, #ef4444);
    transform: rotate(45deg);
  }

  .custom-color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-1);
    border-top: 1px solid var(--border);
  }

  .custom-color-label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
  }

  .custom-color-label:hover {
    color: var(--text);
  }

  .custom-color-input {
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: transparent;
  }

  .custom-color-input::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .custom-color-input::-webkit-color-swatch {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .close-btn {
    padding: 2px 6px;
    font-size: 11px;
  }
</style>
