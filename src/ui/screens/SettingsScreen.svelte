<script lang="ts">
  import { getApp } from '../context';
  import { CREDITS } from '../../app/credits';

  const app = getApp();

  // 説明ページの場所（アプリと同じ場所の ai.md。詳細設計 段階7 F3）
  const aiPageUrl = new URL('ai.md', document.baseURI).href;
  const llmsUrl = new URL('llms.txt', document.baseURI).href;
  const askText = `${llmsUrl} を読んで、アレココの文書の編集ルールを確認してください。そのうえで、添付する文書（JSON）に以下の持ち物を追加し、編集後のJSONファイルを返してください。

【追加したいモノのリスト例】
- 名前: ハサミ, 置き場: デスク周り, カテゴリ: 文具, タグ: 仕事
- 名前: 単3乾電池, 置き場: 引き出し1, カテゴリ: 消耗品, 数量: 4
- 名前: 予備のメガネ, 置き場: 未設定`;

  async function copyAsk(): Promise<void> {
    try {
      await navigator.clipboard.writeText(askText);
      app.showToast('info', 'AIへの頼み方をコピーしました');
    } catch {
      app.showToast('error', 'コピーできませんでした。下の文を選んでコピーしてください');
    }
  }
</script>

<div class="settings-screen">
  <div class="settings-container">
    <h1 class="settings-title">設定</h1>

    <section class="settings-section">
      <h2 class="section-title">外観</h2>

      <div class="setting-item">
        <span class="setting-field-label">テーマ</span>
        <div class="theme-switcher" role="group" aria-label="テーマの切り替え">
          <button
            type="button"
            class="theme-btn"
            class:active={$app.theme === 'system'}
            onclick={() => app.setTheme('system')}
          >
            システム連動
          </button>
          <button
            type="button"
            class="theme-btn"
            class:active={$app.theme === 'light'}
            onclick={() => app.setTheme('light')}
          >
            ライト
          </button>
          <button
            type="button"
            class="theme-btn"
            class:active={$app.theme === 'dark'}
            onclick={() => app.setTheme('dark')}
          >
            ダーク
          </button>
        </div>
        <p class="setting-description">
          画面の配色（ライト・ダークモード）を切り替えます。この設定はこのブラウザに保存されます。
        </p>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">保存</h2>

      <div class="setting-item">
        <label class="autosave-label">
          <input
            type="checkbox"
            checked={$app.autosave}
            onchange={(e) => app.setAutosave(e.currentTarget.checked)}
          />
          <span class="checkbox-text">自動保存</span>
        </label>
        <p class="setting-description">
          変更してから約1秒後に、開いているファイルへ自動で書き込みます。この設定はこのブラウザに保存されます。
        </p>
      </div>

      <div class="setting-item">
        <button
          type="button"
          onclick={() => void app.saveAs()}
        >
          別の名前で保存
        </button>
      </div>
    </section>

    <section class="settings-section">
      <h2 class="section-title">AIに持ち物を登録させたい方向けのガイド</h2>
      <details class="ai-guide-details">
        <summary class="ai-guide-summary">手順と指示文のテンプレートを見る</summary>
        <div class="ai-guide-content">
          <p class="ai-lead">
            ChatGPTなどの外部AIサービスをご自身でお使いの方で、持ち物データをまとめて追加したい場合の手順です。<br />
            <span class="muted small">※ 本アプリ自体が外部AIと通信したり、データを学習に利用したりすることはありません。</span>
          </p>

          <div class="ai-steps">
            <div class="ai-step">
              <span class="step-num">STEP 1</span>
              <div class="step-body">
                <strong>ファイルの複製（バックアップ）を取る</strong>
                <p class="step-desc">
                  編集前の安全のため、上の「別の名前で保存」などを使って、現在のファイルのバックアップを手元に残しておいてください。
                </p>
              </div>
            </div>

            <div class="ai-step">
              <span class="step-num">STEP 2</span>
              <div class="step-body">
                <strong>手元のAIに指示文とファイル（JSON）を渡す</strong>
                <p class="step-desc">
                  下のボタンで指示文をコピーし、追加したいモノを書き添えて、保存したファイル（JSON）と一緒にAIへ渡します。
                </p>
              </div>
            </div>

            <div class="ai-step">
              <span class="step-num">STEP 3</span>
              <div class="step-body">
                <strong>AIが編集したファイルを本アプリで開く</strong>
                <p class="step-desc">
                  AIから返ってきたJSONファイルを、アレココの「ファイルを開く」で読み込みます。AIが追加した内容は、読み込み時に一覧で確認できます。
                </p>
              </div>
            </div>
          </div>

          <div class="ai-template-box">
            <div class="ai-template-header">
              <span class="template-label">AIへの指示文（プロンプト）</span>
              <button type="button" class="primary small" onclick={copyAsk}>指示文をコピー</button>
            </div>
            <pre class="ai-ask">{askText}</pre>
          </div>

          <div class="ai-more-info">
            <a class="ai-spec-link" href={aiPageUrl} target="_blank" rel="noopener">
              詳しい仕様書（ai.md）を開く ↗
            </a>
          </div>
        </div>
      </details>
    </section>

    <section class="settings-section">
      <h2 class="section-title">クレジット</h2>
      <dl class="credits-grid">
        <div class="credit-row">
          <dt>アプリ名</dt>
          <dd>{CREDITS.appName}</dd>
        </div>
        <div class="credit-row">
          <dt>作者</dt>
          <dd>{CREDITS.author ?? '未設定'}</dd>
        </div>
        <div class="credit-row">
          <dt>ライセンス</dt>
          <dd>{CREDITS.license ?? '未設定'}</dd>
        </div>
      </dl>

      <h3 class="libraries-heading">使っているライブラリ</h3>
      <ul class="libraries-list">
        {#each CREDITS.libraries as lib}
          <li class="library-item">
            <span class="lib-name">{lib.name}</span>
            <span class="lib-license muted">({lib.license})</span>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>

<style>
  .settings-screen {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5) var(--space-4);
  }

  .settings-container {
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .settings-title {
    margin: 0;
    font-size: var(--font-size-large);
    font-weight: 700;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-bottom: var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .settings-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size);
    font-weight: 600;
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .setting-field-label {
    display: block;
    font-size: var(--font-size);
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  .theme-switcher {
    display: inline-flex;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px;
    gap: 3px;
    margin-bottom: var(--space-2);
  }

  .theme-btn {
    border: none;
    background: transparent;
    border-radius: var(--radius-small);
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    min-height: 32px;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .theme-btn:hover:not(.active) {
    color: var(--text);
  }

  .theme-btn.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    font-weight: 600;
  }

  .autosave-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch);
    cursor: pointer;
    font-weight: 500;
    color: var(--text);
  }

  .autosave-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .setting-description {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-muted);
    line-height: var(--line-height);
  }

  .credits-grid {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .credit-row {
    display: flex;
    gap: var(--space-4);
    font-size: var(--font-size-small);
  }

  .credit-row dt {
    width: 80px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .credit-row dd {
    margin: 0;
    font-weight: 500;
  }

  .libraries-heading {
    margin: var(--space-3) 0 0;
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-muted);
  }

  .libraries-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .library-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-small);
  }

  .lib-name {
    font-weight: 500;
  }

  /* AIガイドのアコーディオン */
  .ai-guide-details {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
  }

  .ai-guide-summary {
    padding: var(--space-3) var(--space-4);
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    background: var(--surface-2);
    transition: background var(--duration-fast);
  }

  .ai-guide-summary:hover {
    background: var(--surface-hover, var(--border));
  }

  .ai-guide-content {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    border-top: 1px solid var(--border);
  }

  .ai-lead {
    margin: 0;
    line-height: var(--line-height);
    font-size: var(--font-size);
  }

  .ai-steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--surface-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-small);
  }

  .ai-step {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .step-num {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--radius-small);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    flex-shrink: 0;
    line-height: 1.2;
    margin-top: 2px;
  }

  .step-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--font-size-small);
  }

  .step-desc {
    margin: 0;
    color: var(--text-muted);
  }

  .ai-template-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ai-template-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .template-label {
    font-weight: 600;
    font-size: var(--font-size-small);
  }

  .ai-ask {
    margin: 0;
    padding: var(--space-3);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    user-select: all;
    font-family: inherit;
  }

  .ai-more-info {
    font-size: var(--font-size-small);
  }

  .ai-spec-link {
    color: var(--accent);
    text-decoration: underline;
  }
</style>
