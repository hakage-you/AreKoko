<script lang="ts">
  import { getApp } from '../context';
  import { CREDITS } from '../../app/credits';

  const app = getApp();

  // 説明ページの場所（アプリと同じ場所の ai.md。詳細設計 段階7 F3）
  const aiPageUrl = new URL('ai.md', document.baseURI).href;
  const llmsUrl = new URL('llms.txt', document.baseURI).href;
  const askText = `${llmsUrl} を読んで、アレココの文書の編集のしかたを確かめてください。そのうえで、添付する文書（JSON）に次のモノを追加して、編集した文書を返してください：
（ここに追加したいモノを書く）`;

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
      <h2 class="section-title">AI向けの説明</h2>
      <p class="ai-lead">手元のAIに文書（JSON）を渡して、モノやカテゴリ・タグをまとめて追加してもらえます。<strong>頼む前に、ファイルの複製を取ってください。</strong>AIが足したものは、次に開くときに一覧で確かめてから読み込みます。</p>
      <div class="ai-actions">
        <a class="button-link" href={aiPageUrl} target="_blank" rel="noopener">説明ページを開く</a>
        <button type="button" class="primary" onclick={copyAsk}>AIへの頼み方をコピー</button>
      </div>
      <pre class="ai-ask">{askText}</pre>
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

  .ai-lead {
    margin: 0 0 var(--space-3);
    line-height: var(--line-height);
  }

  .ai-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .button-link {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-small);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
  }

  .button-link:hover {
    background: var(--surface-2);
  }

  .ai-ask {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    white-space: pre-wrap;
    word-break: break-all;
    font-size: var(--font-size-small);
    background: var(--surface-2);
    border-radius: var(--radius-small);
    user-select: all;
  }
</style>
