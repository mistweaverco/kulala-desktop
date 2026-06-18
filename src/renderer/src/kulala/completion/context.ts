import type { KulalaDocument, RequestFormModel } from "../../env.d";
import { serializeFormDocument, toPlainDocument, toPlainForm } from "../document-model";

export type CompletionField =
  | { type: "url"; column: number }
  | { type: "block-name"; column: number }
  | { type: "header-name"; index: number; column: number }
  | { type: "header-value"; index: number; column: number }
  | { type: "body"; lineOffset: number; column: number }
  | { type: "graphql-query"; lineOffset: number; column: number }
  | { type: "graphql-variables"; lineOffset: number; column: number };

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|GRAPHQL|GRPC|WEBSOCKET)\b/i;

export type BlockLayout = {
  blockNameLine1: number;
  requestLine1: number;
  bodyStartLine1: number;
  graphqlVariablesStartLine1: number;
};

function blockMarkerLine(blockName: string): string {
  return `### ${blockName}`.trimEnd();
}

/** Locate key lines for the active block inside serialized HTTP content. */
export function resolveBlockLayout(
  content: string,
  blockName: string,
  form: RequestFormModel,
): BlockLayout | null {
  const lines = content.split("\n");
  const marker = blockMarkerLine(blockName);

  let blockNameLine1 = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? "").trimEnd() === marker) {
      blockNameLine1 = i + 1;
      break;
    }
  }
  if (blockNameLine1 < 0) return null;

  let requestLine1 = -1;
  let bodyStartLine1 = -1;

  for (let i = blockNameLine1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("###")) break;

    if (requestLine1 < 0 && METHOD_RE.test(line.trimStart())) {
      requestLine1 = i + 1;
      continue;
    }

    if (requestLine1 > 0 && line.trim() === "" && bodyStartLine1 < 0) {
      bodyStartLine1 = i + 2;
      break;
    }
  }

  if (requestLine1 < 0) return null;
  if (bodyStartLine1 < 0) bodyStartLine1 = requestLine1 + 1;

  const queryLineCount = Math.max(1, (form.graphqlQuery ?? "").split("\n").length);
  let graphqlVariablesStartLine1 = bodyStartLine1 + queryLineCount;
  const afterQueryIdx = graphqlVariablesStartLine1 - 1;
  if ((lines[afterQueryIdx] ?? "").trim() === "") {
    graphqlVariablesStartLine1++;
  }

  return {
    blockNameLine1,
    requestLine1,
    bodyStartLine1,
    graphqlVariablesStartLine1,
  };
}

function requestMethodLength(content: string, layout: BlockLayout): number {
  const line = content.split("\n")[layout.requestLine1 - 1] ?? "";
  const match = line.trimStart().match(METHOD_RE);
  return match ? match[0].length : 0;
}

function headerLineNumber(content: string, layout: BlockLayout, headerIndex: number): number {
  const lines = content.split("\n");
  let count = -1;
  for (let i = layout.requestLine1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("###")) break;
    if (line.trim() === "") break;
    if (line.includes(":") && !line.trimStart().startsWith("#")) {
      count++;
      if (count === headerIndex) return i + 1;
    }
  }
  return layout.requestLine1 + 1 + headerIndex;
}

export function resolveCompletionPosition(
  content: string,
  form: RequestFormModel,
  field: CompletionField,
): { line: number; column: number } {
  const layout = resolveBlockLayout(content, form.blockName, form);
  if (!layout) {
    return { line: form.contentStartLine ?? 1, column: 1 };
  }

  const methodLen = requestMethodLength(content, layout);

  switch (field.type) {
    case "url":
      return {
        line: layout.requestLine1,
        // field.column is 0-based selectionStart within the URL input
        column: methodLen + 2 + field.column,
      };
    case "block-name":
      return {
        line: layout.blockNameLine1,
        column: 5 + field.column,
      };
    case "header-name":
      return {
        line: headerLineNumber(content, layout, field.index),
        column: field.column + 1,
      };
    case "header-value": {
      const line1 = headerLineNumber(content, layout, field.index);
      const headerLine = content.split("\n")[line1 - 1] ?? "";
      const colon = headerLine.indexOf(":");
      const valueStart = colon >= 0 ? colon + 1 : headerLine.length;
      return {
        line: line1,
        column: valueStart + 1 + field.column,
      };
    }
    case "body":
      return {
        line: layout.bodyStartLine1 + field.lineOffset,
        column: field.column + 1,
      };
    case "graphql-query":
      return {
        line: layout.bodyStartLine1 + field.lineOffset,
        column: field.column + 1,
      };
    case "graphql-variables":
      return {
        line: layout.graphqlVariablesStartLine1 + field.lineOffset,
        column: field.column + 1,
      };
  }
}

export type CompletionContextOpts = {
  doc: KulalaDocument;
  form: RequestFormModel;
  filepath?: string;
  env: string;
  field: CompletionField;
};

let serializeCache: { key: string; content: string } | undefined;

export async function fetchCompletions(
  opts: CompletionContextOpts,
  serializedContent?: string,
): Promise<LspCompletionItem[]> {
  const content =
    serializedContent ?? (await getSerializedContent(opts.doc, opts.form, opts.filepath));
  if (!content) return [];

  const pos = resolveCompletionPosition(content, opts.form, opts.field);

  return window.KulalaApi.lspCompletion(content, pos.line, pos.column, {
    filepath: opts.filepath,
    env: opts.env,
    filetype: "http",
  });
}

export type LspCompletionItem = Awaited<ReturnType<typeof window.KulalaApi.lspCompletion>>[number];

export async function getSerializedContent(
  doc: KulalaDocument,
  form: RequestFormModel,
  filepath?: string,
): Promise<string | undefined> {
  const key = JSON.stringify({ doc, form, filepath });
  if (serializeCache?.key === key) return serializeCache.content;
  const content = await serializeFormDocument(toPlainDocument(doc), toPlainForm(form), filepath);
  if (content) serializeCache = { key, content };
  return content;
}
