import { monaco } from "../../views/monaco";
import type { CompletionField, CompletionContextOpts } from "./context";
import { fetchCompletions, getSerializedContent, resolveCompletionPosition } from "./context";
import type { ScriptEditorLspConfig } from "./script-lsp";
import { fetchScriptCompletions, fetchScriptHover } from "./script-lsp";
import { toMonacoCompletionItems } from "./monaco-items";
import { toMonacoHoverContents } from "./monaco-hover";

export type EditorCompletionConfig = {
  getOpts: (field: CompletionField) => CompletionContextOpts | undefined;
  fieldForPosition?: (lineNumber: number, column: number) => CompletionField | undefined;
};

const LSP_LANGUAGES = [
  "json",
  "html",
  "graphql",
  "javascript",
  "typescript",
  "lua",
  "plaintext",
] as const;

type ModelLspEntry = {
  completionConfig?: EditorCompletionConfig;
  scriptLspConfig?: ScriptEditorLspConfig;
};

const modelLspRegistry = new Map<string, ModelLspEntry>();
let globalProvidersRegistered = false;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function modelKey(model: monaco.editor.ITextModel): string {
  return model.uri.toString();
}

function debouncedFetch(
  opts: CompletionContextOpts,
  field: CompletionField,
  serializedContent: string,
): Promise<import("./context").LspCompletionItem[]> {
  return new Promise((resolve) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      resolve(await fetchCompletions({ ...opts, field }, serializedContent));
    }, 150);
  });
}

function ensureGlobalProviders(): void {
  if (globalProvidersRegistered) return;
  globalProvidersRegistered = true;

  for (const language of LSP_LANGUAGES) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ["{", "$", ".", "@", "#", " ", "(", '"', "'"],
      provideCompletionItems: async (model, position) => {
        const entry = modelLspRegistry.get(modelKey(model));
        if (!entry) return { suggestions: [] };

        if (entry.scriptLspConfig) {
          const base = entry.scriptLspConfig.getContext();
          if (!base) return { suggestions: [] };

          const line = position.lineNumber;
          const column = position.column;
          const lineText = model.getLineContent(line);
          const ctx = { ...base, content: model.getValue() };

          try {
            const items = await fetchScriptCompletions(ctx, line, column);
            const suggestions = toMonacoCompletionItems(items, lineText, column, line);
            return { suggestions };
          } catch {
            return { suggestions: [] };
          }
        }

        const config = entry.completionConfig;
        if (!config) return { suggestions: [] };

        const field =
          config.fieldForPosition?.(position.lineNumber, position.column) ??
          ({
            type: "body",
            lineOffset: position.lineNumber - 1,
            column: position.column - 1,
          } as CompletionField);

        const opts = config.getOpts(field);
        if (!opts) return { suggestions: [] };

        const content = await getSerializedContent(opts.doc, opts.form, opts.filepath);
        if (!content) return { suggestions: [] };

        const pos = resolveCompletionPosition(content, opts.form, field);
        const lines = content.split("\n");
        const lineText = lines[pos.line - 1] ?? "";

        const items = await debouncedFetch(opts, field, content);
        const suggestions = toMonacoCompletionItems(
          items,
          lineText,
          pos.column,
          position.lineNumber,
        );

        return { suggestions };
      },
    });

    monaco.languages.registerHoverProvider(language, {
      provideHover: async (model, position) => {
        const entry = modelLspRegistry.get(modelKey(model));
        const scriptConfig = entry?.scriptLspConfig;
        if (!scriptConfig) return null;

        const base = scriptConfig.getContext();
        if (!base) return null;

        const ctx = { ...base, content: model.getValue() };
        const hover = await fetchScriptHover(ctx, position.lineNumber, position.column);
        if (!hover) return null;

        return {
          contents: toMonacoHoverContents(hover),
        };
      },
    });
  }
}

/** Register LSP context for a specific model. Global providers are registered once. */
export function bindModelLsp(
  model: monaco.editor.ITextModel,
  opts: {
    completionConfig?: EditorCompletionConfig;
    scriptLspConfig?: ScriptEditorLspConfig;
  },
): monaco.IDisposable {
  ensureGlobalProviders();
  const key = modelKey(model);

  const sync = (): void => {
    if (!opts.completionConfig && !opts.scriptLspConfig) {
      modelLspRegistry.delete(key);
      return;
    }
    modelLspRegistry.set(key, {
      completionConfig: opts.completionConfig,
      scriptLspConfig: opts.scriptLspConfig,
    });
  };

  sync();

  return {
    dispose: () => {
      modelLspRegistry.delete(key);
    },
  };
}

/** Update an existing model binding without registering new global providers. */
export function updateModelLsp(
  model: monaco.editor.ITextModel,
  opts: {
    completionConfig?: EditorCompletionConfig;
    scriptLspConfig?: ScriptEditorLspConfig;
  },
): void {
  const key = modelKey(model);
  if (!opts.completionConfig && !opts.scriptLspConfig) {
    modelLspRegistry.delete(key);
    return;
  }
  modelLspRegistry.set(key, {
    completionConfig: opts.completionConfig,
    scriptLspConfig: opts.scriptLspConfig,
  });
}

export function getModelLspRegistrySize(): number {
  return modelLspRegistry.size;
}

export function createBodyEditorCompletionConfig(
  getOpts: () => CompletionContextOpts | undefined,
): EditorCompletionConfig {
  return {
    getOpts: (field) => {
      const opts = getOpts();
      if (!opts) return undefined;
      return { ...opts, field };
    },
    fieldForPosition: (lineNumber, column) => ({
      type: "body",
      lineOffset: lineNumber - 1,
      column: column - 1,
    }),
  };
}

export function createGraphQLQueryCompletionConfig(
  getOpts: () => CompletionContextOpts | undefined,
): EditorCompletionConfig {
  return {
    getOpts: (field) => {
      const opts = getOpts();
      if (!opts) return undefined;
      return { ...opts, field };
    },
    fieldForPosition: (lineNumber, column) => ({
      type: "graphql-query",
      lineOffset: lineNumber - 1,
      column: column - 1,
    }),
  };
}

export function createGraphQLVariablesCompletionConfig(
  getOpts: () => CompletionContextOpts | undefined,
): EditorCompletionConfig {
  return {
    getOpts: (field) => {
      const opts = getOpts();
      if (!opts) return undefined;
      return { ...opts, field };
    },
    fieldForPosition: (lineNumber, column) => ({
      type: "graphql-variables",
      lineOffset: lineNumber - 1,
      column: column - 1,
    }),
  };
}

export function createScriptEditorLspConfig(
  getContext: () => Omit<import("./script-lsp").ScriptLspContext, "content"> | undefined,
): ScriptEditorLspConfig {
  return { getContext };
}
