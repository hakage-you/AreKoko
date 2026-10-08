<script lang="ts">
  import { getApp } from '../context';
  import { CREDITS } from '../../app/credits';

  const app = getApp();
</script>

<div class="settings-screen">
  <div class="settings-container">
    <h1 class="settings-title">設定</h1>

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
      <p class="muted">準備中</p>
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
</style>
