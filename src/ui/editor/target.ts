import type { AppState, AppStore } from '../../app/store';
import type { ArekokoDocument, Id } from '../../core/types';
import type { OpContext, OpResult } from '../../core/ops/common';

/**
 * 現在のクウカン編集対象の文書を返す。
 * 下書きなら下書きの文書、確定したクウカンなら文書全体。
 */
export function editorDoc(state: AppState): ArekokoDocument | null {
  if (!state.editor) return null;
  if (state.editor.kind === 'draft') {
    return state.editor.draft.doc;
  }
  return state.doc;
}

/**
 * 現在のクウカン編集対象のクウカンIDを返す。
 * 下書きなら下書きのクウカンID、確定したクウカンならそのID。
 */
export function editorKuukan(state: AppState): Id | null {
  if (!state.editor) return null;
  if (state.editor.kind === 'draft') {
    return state.editor.draft.kuukan;
  }
  return state.editor.kuukan;
}

/**
 * クウカン編集対象の文書に操作を適用する（判断はストアの editorApply）。
 */
export function applyToEditor(
  app: AppStore,
  _state: AppState,
  op: (doc: ArekokoDocument, ctx: OpContext) => OpResult,
): OpResult | null {
  return app.editorApply(op);
}
