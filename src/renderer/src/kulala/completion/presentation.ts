import type { LspCompletionItem } from "./context";

const VARIABLE_KIND = 6;

export function isVariableCompletion(item: LspCompletionItem): boolean {
  return item.labelDetails?.description === "Var" || item.kind === VARIABLE_KIND;
}

export function truncateCompletionText(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

/** Resolved variable value or type hint for the primary secondary line in lists. */
export function completionInputDetail(item: LspCompletionItem, max = 80): string | undefined {
  const detail = item.detail?.trim();
  if (detail && detail !== item.label) {
    return truncateCompletionText(detail, max);
  }

  if (isVariableCompletion(item)) {
    const resolved = item.documentation?.value?.trim();
    if (resolved) return truncateCompletionText(resolved, max);
  }

  if (detail && detail !== item.label) return truncateCompletionText(detail, max);
  return item.labelDetails?.description?.trim() || undefined;
}

/** Longer docs: GraphQL schema text, script API docs, etc. - not variable values. */
export function completionSchemaDescription(item: LspCompletionItem): string | undefined {
  if (isVariableCompletion(item)) return undefined;
  const doc = item.documentation?.value?.trim();
  if (doc) return doc;
  return undefined;
}

/** @deprecated use completionInputDetail / completionSchemaDescription */
export function completionDescription(item: LspCompletionItem): string | undefined {
  return completionSchemaDescription(item) ?? item.labelDetails?.description?.trim();
}

/** @deprecated use completionInputDetail */
export function completionTypeDetail(item: LspCompletionItem): string | undefined {
  return item.detail?.trim() || undefined;
}

export function monacoCompletionLabel(
  item: LspCompletionItem,
): string | { label: string; detail?: string; description?: string } {
  const inputDetail = completionInputDetail(item, 60);
  const schemaDesc = completionSchemaDescription(item);

  if (!inputDetail && !schemaDesc) return item.label;

  return {
    label: item.label,
    detail: inputDetail,
    description: schemaDesc ? truncateCompletionText(schemaDesc, 100) : undefined,
  };
}

export type CompletionDisplay = {
  label: string;
  detail?: string;
  description?: string;
};

export function isUnfinishedTemplateAt(value: string, column: number): boolean {
  return /\{\{[^}]*$/.test(value.slice(0, column));
}

export function filterCompletionsForUrlField(
  items: LspCompletionItem[],
  value: string,
  column: number,
): LspCompletionItem[] {
  if (!isUnfinishedTemplateAt(value, column)) return [];
  return items.filter(isVariableCompletion);
}

export function completionDisplay(item: LspCompletionItem, max = 80): CompletionDisplay {
  const inputDetail = completionInputDetail(item, max);
  const schemaDesc = completionSchemaDescription(item);

  return {
    label: item.label,
    detail: inputDetail,
    description: schemaDesc ? truncateCompletionText(schemaDesc, max) : undefined,
  };
}
