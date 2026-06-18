import type { LspCompletionItem } from "./context";
import { monaco } from "../../views/monaco";
import {
  completionInputDetail,
  completionSchemaDescription,
  isVariableCompletion,
} from "./presentation";

/** Top-level `detail` drives the type line in Monaco's Read More pane. */
function monacoItemDetail(item: LspCompletionItem): string | undefined {
  const raw = item.detail?.trim();
  if (raw && raw !== item.label) return raw;
  if (isVariableCompletion(item)) return completionInputDetail(item);
  return undefined;
}

/** Top-level `documentation` drives the Read More body text. */
function monacoItemDocumentation(item: LspCompletionItem): string | undefined {
  const schema = completionSchemaDescription(item);
  if (schema) return schema;
  if (isVariableCompletion(item)) return item.documentation?.value?.trim();
  return undefined;
}

const SCRIPT_PREFIX_RE = /[$\w.]+$/;
const TEMPLATE_PREFIX_RE = /[$\w.[\]*'"\s-]+$/;

export function completionReplaceRange(
  line: string,
  column: number,
): { startColumn: number; endColumn: number } {
  const endCharacter = Math.max(0, Math.min(column, line.length));
  const before = line.slice(0, endCharacter);
  const inTemplate = /\{\{[^}]*$/.test(before);
  const rawPrefix = before.match(inTemplate ? TEMPLATE_PREFIX_RE : SCRIPT_PREFIX_RE)?.[0] ?? "";
  const prefix = inTemplate ? rawPrefix.trimStart() : rawPrefix;
  if (!prefix) {
    return { startColumn: endCharacter, endColumn: endCharacter };
  }
  const startCharacter = endCharacter - rawPrefix.length;
  return { startColumn: startCharacter, endColumn: endCharacter };
}

const KIND_MAP: Record<number, monaco.languages.CompletionItemKind> = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  6: monaco.languages.CompletionItemKind.Variable,
  8: monaco.languages.CompletionItemKind.Field,
  10: monaco.languages.CompletionItemKind.Property,
  12: monaco.languages.CompletionItemKind.Value,
  15: monaco.languages.CompletionItemKind.Snippet,
  17: monaco.languages.CompletionItemKind.File,
};

export function toMonacoCompletionItems(
  items: LspCompletionItem[],
  lineText: string,
  column: number,
  lineNumber: number,
): monaco.languages.CompletionItem[] {
  const range = completionReplaceRange(lineText, column);
  const monacoRange = new monaco.Range(
    lineNumber,
    range.startColumn + 1,
    lineNumber,
    range.endColumn + 1,
  );

  return items.map((item) => {
    const insertText = item.insertText ?? item.textEdit?.newText ?? item.label;
    const detail = monacoItemDetail(item);
    const documentation = monacoItemDocumentation(item);
    return {
      label: item.label,
      kind:
        item.kind !== undefined
          ? (KIND_MAP[item.kind] ?? monaco.languages.CompletionItemKind.Text)
          : undefined,
      detail,
      documentation: documentation
        ? { value: documentation, isTrusted: true, supportHtml: false }
        : undefined,
      insertText,
      range: monacoRange,
      sortText: item.sortText,
    };
  });
}
