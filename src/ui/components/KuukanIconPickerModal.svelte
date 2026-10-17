<script lang="ts">
  import { untrack } from 'svelte';
  import { autofocus } from '../actions';
  import type { Kuukan, KuukanIcon, ArekokoDocument, BuiltinIconId } from '../../core/types';
  import { PRESET_COLORS, getContrastTextColor, getKuukanInitial } from '../color';
  import { BUILTIN_ICON_ITEMS } from '../icons';
  import KuukanThumb from './KuukanThumb.svelte';

  interface Props {
    doc: ArekokoDocument;
    kuukan: Kuukan;
    displayName: string;
    isStorage?: boolean;
    onSave: (icon: KuukanIcon | null) => void;
    onClose: () => void;
  }

  let { doc, kuukan, displayName, isStorage = false, onSave, onClose }: Props = $props();

  const initialChar = $derived(getKuukanInitial(displayName));

  let iconType = $state<'char' | 'svg'>(untrack(() => (kuukan.icon?.svg ? 'svg' : 'char')));
  let selectedSvg = $state<BuiltinIconId>(untrack(() => kuukan.icon?.svg ?? 'home'));
  let charInput = $state(untrack(() => kuukan.icon?.char ?? ''));
  let bgColor = $state<string | null>(untrack(() => kuukan.icon?.bg ?? null));
  let textColorMode = $state<'auto' | 'custom'>(untrack(() => (kuukan.icon?.color ? 'custom' : 'auto')));
  let textColor = $state<string | null>(untrack(() => kuukan.icon?.color ?? null));
  let customBgInput = $state('#0284c7');
  let customTextInput = $state('#ffffff');

  $effect(() => {
    if (bgColor) customBgInput = bgColor;
  });
  $effect(() => {
    if (textColor) customTextInput = textColor;
  });

  function handleCharInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    const chars = Array.from(val);
    if (chars.length > 1) {
      charInput = chars[chars.length - 1] ?? '';
    } else {
      charInput = val;
    }
  }

  const hasDrawing = $derived.by(() => {
    if (!doc || !kuukan.id) return false;
    return doc.drawing.kuukans.some((k) => k.kuukan === kuukan.id && k.outline?.length > 0);
  });

  const isCustomized = $derived.by(() => {
    if (iconType === 'svg') return true;
    return Boolean(charInput.trim() || bgColor || (textColorMode === 'custom' && textColor));
  });

  const effectiveBg = $derived(bgColor ?? undefined);
  const effectiveTextColor = $derived.by(() => {
    if (textColorMode === 'auto') {
      return bgColor ? getContrastTextColor(bgColor) : undefined;
    }
    return textColor ?? undefined;
  });

  const previewIcon = $derived.by<KuukanIcon | null>(() => {
    if (iconType === 'svg') {
      return {
        svg: selectedSvg,
        bg: effectiveBg,
        color: effectiveTextColor,
      };
    }
    const c = charInput.trim() ? Array.from(charInput.trim())[0] : undefined;
    if (!c && !effectiveBg && !effectiveTextColor) {
      return null;
    }
    return {
      char: c,
      bg: effectiveBg,
      color: effectiveTextColor,
    };
  });

  function handleSave() {
    const finalBg = bgColor || undefined;
    const finalColor = textColorMode === 'custom' && textColor ? textColor : undefined;

    if (iconType === 'svg') {
      onSave({
        svg: selectedSvg,
        bg: finalBg,
        color: finalColor,
      });
    } else {
      const trimmedChar = charInput.trim();
      const finalChar = trimmedChar ? Array.from(trimmedChar)[0] : undefined;
      if (!finalChar && !finalBg && !finalColor) {
        onSave(null);
      } else {
        onSave({
          char: finalChar,
          bg: finalBg,
          color: finalColor,
        });
      }
    }
    onClose();
  }

  function handleReset() {
    if (kuukan.icon) {
      onSave(null);
      onClose();
    } else {
      iconType = 'char';
      selectedSvg = 'home';
      charInput = '';
      bgColor = null;
      textColorMode = 'auto';
      textColor = null;
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') onClose();
  }}
/>

<div
  class="dialog-overlay"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="icon-picker-title"
    tabindex="-1"
  >
    <div class="dialog-header" id="icon-picker-title">
      アイコンの設定
    </div>

    <div class="dialog-body">
      <!-- リアルタイムプレビュー -->
      <div class="preview-section">
        <div class="preview-card">
          <KuukanThumb
            {doc}
            kuukanId={kuukan.id}
            {isStorage}
            customIcon={previewIcon ?? undefined}
            customName={displayName}
            forceCharIcon={Boolean(!hasDrawing || previewIcon)}
            size={56}
          />
          <div class="preview-info">
            <div class="preview-title">{displayName}</div>
            <div class="preview-label muted small">
              {#if hasDrawing && !previewIcon}
                図面プレビュー（既定）
              {:else if iconType === 'svg'}
                アイコンプレビュー（SVG）
              {:else}
                アイコンプレビュー（文字）
              {/if}
            </div>
          </div>
        </div>
      </div>

      {#if hasDrawing}
        <div class="drawing-info-box">
          <span class="info-badge">かたちあり</span>
          <p class="small muted">
            アイコンを設定すると、図面の代わりにカスタムアイコンが表示されます。<br />
            「図面の表示に戻す」でいつでも図面に戻せます（図面データはそのまま保持されます）。
          </p>
        </div>
      {/if}

      <!-- アイコン種類切り替えタブ -->
      <div class="icon-type-tabs">
        <button
          type="button"
          class="type-tab-btn"
          class:active={iconType === 'char'}
          onclick={() => (iconType = 'char')}
        >
          文字（1文字）
        </button>
        <button
          type="button"
          class="type-tab-btn"
          class:active={iconType === 'svg'}
          onclick={() => (iconType = 'svg')}
        >
          組み込みアイコン
        </button>
      </div>

      <!-- 文字の設定 -->
      {#if iconType === 'char'}
        <div class="form-section">
          <label for="char-input" class="section-label">表示する文字（1文字）</label>
          <div class="char-input-row">
            <input
              id="char-input"
              use:autofocus
              type="text"
              value={charInput}
              oninput={handleCharInput}
              onkeydown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              placeholder={initialChar}
              class="char-input"
              maxlength="4"
            />
            {#if charInput}
              <button
                type="button"
                class="small ghost"
                onclick={() => (charInput = '')}
              >
                先頭文字「{initialChar}」に戻す
              </button>
            {/if}
          </div>
          <p class="muted small hint">
            未入力の場合は、クウカン名の頭文字（{initialChar}）が自動的に使われます。
          </p>
        </div>
      {:else}
        <!-- 組み込みアイコンの選択 -->
        <div class="form-section">
          <div class="section-label">組み込みアイコンの選択</div>
          <div class="builtin-icons-grid">
            {#each BUILTIN_ICON_ITEMS as item (item.id)}
              <button
                type="button"
                class="icon-grid-btn"
                class:is-active={selectedSvg === item.id}
                onclick={() => (selectedSvg = item.id)}
                title={item.label}
                aria-label={item.label}
              >
                <svg
                  viewBox="0 0 24 24"
                  class="grid-svg"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d={item.path} />
                </svg>
                <span class="grid-icon-label">{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 背景色の設定 -->
      <div class="form-section">
        <div class="section-label">背景色</div>
        <div class="color-palette">
          <button
            type="button"
            class="color-dot none-dot"
            class:is-active={!bgColor}
            title="色なし（既定）"
            onclick={() => (bgColor = null)}
            aria-label="色なし（既定）"
          >
            <span class="diagonal-line"></span>
          </button>

          {#each PRESET_COLORS as preset (preset.id)}
            <button
              type="button"
              class="color-dot"
              class:is-active={bgColor === preset.hex}
              style="background-color: {preset.hex};"
              title={preset.name}
              onclick={() => (bgColor = preset.hex)}
              aria-label={preset.name}
            ></button>
          {/each}
        </div>

        <div class="custom-color-row">
          <label class="custom-color-label">
            <input
              type="color"
              value={customBgInput}
              onchange={(e) => {
                const val = (e.target as HTMLInputElement).value;
                customBgInput = val;
                bgColor = val;
              }}
              class="custom-color-input"
            />
            <span class="custom-color-text">自由な色を選ぶ…</span>
          </label>
          {#if bgColor}
            <span class="selected-color-code muted small">{bgColor}</span>
          {/if}
        </div>
      </div>

      <!-- アイコン/文字色の設定 -->
      <div class="form-section">
        <div class="section-label">{iconType === 'svg' ? 'アイコン色' : '文字色'}</div>
        <div class="text-color-options">
          <button
            type="button"
            class="small ghost text-option-btn"
            class:active={textColorMode === 'auto'}
            onclick={() => {
              textColorMode = 'auto';
              textColor = null;
            }}
          >
            自動（見やすい色）
          </button>
          <button
            type="button"
            class="small ghost text-option-btn"
            class:active={textColorMode === 'custom' && textColor === '#ffffff'}
            onclick={() => {
              textColorMode = 'custom';
              textColor = '#ffffff';
            }}
          >
            <span class="swatch-inline" style="background: #ffffff; border: 1px solid rgba(255, 255, 255, 0.4);"></span>
            白
          </button>
          <button
            type="button"
            class="small ghost text-option-btn"
            class:active={textColorMode === 'custom' && textColor === '#0f172a'}
            onclick={() => {
              textColorMode = 'custom';
              textColor = '#0f172a';
            }}
          >
            <span class="swatch-inline" style="background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.3);"></span>
            黒
          </button>
        </div>

        {#if textColorMode === 'custom'}
          <div class="custom-color-row">
            <label class="custom-color-label">
              <input
                type="color"
                value={customTextInput}
                onchange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  customTextInput = val;
                  textColor = val;
                }}
                class="custom-color-input"
              />
              <span class="custom-color-text">
                {iconType === 'svg' ? '別のアイコン色を指定…' : '別の文字色を指定…'}
              </span>
            </label>
            {#if textColor}
              <span class="selected-color-code muted small">{textColor}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="dialog-footer">
      <button
        type="button"
        class="ghost danger"
        onclick={handleReset}
        disabled={!kuukan.icon && !isCustomized}
      >
        {hasDrawing ? '図面の表示に戻す' : '初期設定に戻す'}
      </button>
      <div class="footer-actions">
        <button type="button" onclick={onClose}>キャンセル</button>
        <button type="button" class="primary" onclick={handleSave}>保存</button>
      </div>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    box-sizing: border-box;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fadeInModal 0.15s ease-out;
  }

  @keyframes fadeInModal {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .dialog-header {
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-base);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .dialog-body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
  }

  .preview-section {
    display: flex;
    justify-content: center;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .preview-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .preview-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preview-title {
    font-weight: 600;
    font-size: var(--font-size-base);
  }

  .drawing-info-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
  }

  .info-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--radius-small);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--font-size-tiny);
    font-weight: 600;
    white-space: nowrap;
    margin-top: 1px;
  }

  .drawing-info-box p {
    margin: 0;
    line-height: var(--line-height);
  }

  .icon-type-tabs {
    display: flex;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    padding: 2px;
    gap: 2px;
  }

  .type-tab-btn {
    flex: 1;
    border: none;
    background: transparent;
    border-radius: var(--radius-small);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .type-tab-btn:hover {
    color: var(--text);
  }

  .type-tab-btn.active {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-label {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text);
  }

  .char-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .char-input {
    width: 60px;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    padding: var(--space-1);
    box-sizing: border-box;
  }

  .hint {
    margin: 0;
  }

  .builtin-icons-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }

  .icon-grid-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-2) var(--space-1);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    cursor: pointer;
    color: var(--text);
    transition: all var(--duration-fast);
    min-height: 56px;
  }

  .icon-grid-btn:hover {
    border-color: var(--accent);
    background: var(--surface);
  }

  .icon-grid-btn.is-active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .grid-svg {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .grid-icon-label {
    font-size: var(--font-size-tiny);
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .color-palette {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 6px;
    align-items: center;
  }

  .color-dot {
    width: 28px;
    height: 28px;
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
    box-shadow: 0 0 0 2px var(--surface);
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
  }

  .custom-color-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--font-size-small);
    color: var(--text-muted);
  }

  .custom-color-label:hover {
    color: var(--text);
  }

  .custom-color-input {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--radius-small);
    cursor: pointer;
    background: transparent;
  }

  .custom-color-input::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .custom-color-input::-webkit-color-swatch {
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
  }

  .text-color-options {
    display: flex;
    gap: var(--space-2);
  }

  .text-option-btn {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .text-option-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
  }

  .swatch-inline {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .dialog-footer {
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
  }

  .footer-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
