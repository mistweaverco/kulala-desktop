import type { editor, IDisposable } from "monaco-editor";
import { InMemoryStorageService } from "monaco-editor/esm/vs/platform/storage/common/storage.js";

const EXPAND_SUGGESTION_DOCS_KEY = "expandSuggestionDocs";
const STORAGE_SCOPE_PROFILE = 0;
const STORAGE_TARGET_USER = 0;

type SuggestWidget = {
  onDidShow: { (listener: () => void): IDisposable };
  element: { domNode: HTMLElement };
  toggleDetails: (focused?: boolean) => void;
};

type SuggestController = {
  widget: { value: SuggestWidget };
};

/**
 * Monaco reads `expandSuggestionDocs` from IStorageService. Use the real
 * in-memory implementation (a minimal stub breaks the details pane).
 *
 * Standalone Monaco only honors service overrides on the first editor create.
 */
export function createExpandedSuggestStorageService(): editor.IEditorOverrideServices {
  const storageService = new InMemoryStorageService();
  storageService.store(
    EXPAND_SUGGESTION_DOCS_KEY,
    true,
    STORAGE_SCOPE_PROFILE,
    STORAGE_TARGET_USER,
  );
  return { storageService };
}

/**
 * Opens the floating "Read More" details pane when the suggest widget appears.
 * Safe to call on every completion-enabled editor.
 */
export function attachAutoExpandSuggestDetails(target: editor.IStandaloneCodeEditor): IDisposable {
  const controller = target.getContribution(
    "editor.contrib.suggestController",
  ) as unknown as SuggestController | null;
  if (!controller) {
    return { dispose: () => {} };
  }

  let showListener: IDisposable | undefined;

  const attach = (): void => {
    if (showListener) return;
    try {
      const widget = controller.widget.value;
      showListener = widget.onDidShow(() => {
        if (!widget.element.domNode.classList.contains("shows-details")) {
          widget.toggleDetails(false);
        }
      });
    } catch {
      // Suggest widget is created lazily; retry on next focus.
    }
  };

  attach();
  const focusListener = target.onDidFocusEditorText(() => attach());

  return {
    dispose: () => {
      showListener?.dispose();
      focusListener.dispose();
    },
  };
}

export function graphqlEditorOptions(): editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    suggest: {
      showIcons: true,
      showInlineDetails: true,
    },
  };
}

export function defaultEditorOptions(): editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    suggest: {
      showIcons: true,
      showInlineDetails: true,
    },
  };
}
