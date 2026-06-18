import type {
  KulalaBlock,
  KulalaDocument,
  KulalaOperator,
  KulalaScriptBlock,
  RequestFormModel,
  ScriptFormEntry,
} from "../env.d";
import {
  formatGraphQLBody,
  graphQLBodyToVariablesText,
  parseGraphQLContent,
} from "./graphql-content";

/** Strip Svelte proxies / non-cloneable values before Electron IPC. */
export function toPlainDocument(doc: KulalaDocument): KulalaDocument {
  return JSON.parse(JSON.stringify(doc)) as KulalaDocument;
}

export function toPlainForm(form: RequestFormModel): RequestFormModel {
  return JSON.parse(JSON.stringify(form)) as RequestFormModel;
}

export function nativeBlocks(doc: KulalaDocument): KulalaBlock[] {
  const count = doc.nativeBlockCount ?? doc.blocks.length;
  return doc.blocks.slice(0, count).filter((b) => !b.runExpander);
}

function isGraphQLBody(raw: unknown): raw is {
  query: string;
  variables?: Record<string, unknown>;
  variablesSourceText?: string;
} {
  return (
    raw != null &&
    typeof raw === "object" &&
    "query" in raw &&
    typeof (raw as { query: unknown }).query === "string"
  );
}

function inferBodyKind(
  method: string,
  rawBody: unknown,
  headers: Array<{ name: string; value: string }>,
): RequestFormModel["bodyKind"] {
  if (method === "GRAPHQL" || isGraphQLBody(rawBody)) return "graphql";
  const ct = headers.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  if (
    ct.includes("application/json") ||
    (rawBody && typeof rawBody === "object" && !isGraphQLBody(rawBody))
  ) {
    return "json";
  }
  return "raw";
}

function scriptToFormEntry(script: Record<string, unknown>): ScriptFormEntry {
  return {
    source: script.source === "file" ? "file" : "inline",
    lang: script.lang === "ts" || script.lang === "lua" ? script.lang : "js",
    langExplicit: script.langExplicit === true,
    content: typeof script.content === "string" ? script.content : "",
    filepath: typeof script.filepath === "string" ? script.filepath : undefined,
  };
}

function formScriptsToBlockScripts(
  entries: ScriptFormEntry[],
  type: "preRequest" | "postRequest",
): KulalaScriptBlock[] {
  return entries.map((entry, index) => ({
    ...entry,
    type,
    lineNumber: index,
  }));
}

const JQ_OPERATOR_NAME = "kulala-jq";

function findJqOperator(operators: KulalaOperator[] | undefined): KulalaOperator | undefined {
  return operators?.find((op) => op.name === JQ_OPERATOR_NAME);
}

export function readJqFilterFromBlock(block: KulalaBlock): string | undefined {
  const args = findJqOperator(block.operators)?.args ?? findJqOperator(block.preamble)?.args;
  const trimmed = args?.trim();
  return trimmed || undefined;
}

function upsertJqOperators(
  operators: KulalaOperator[] | undefined,
  jqFilter: string | undefined,
): KulalaOperator[] {
  const existing = findJqOperator(operators);
  const withoutJq = (operators ?? []).filter((op) => op.name !== JQ_OPERATOR_NAME);
  const trimmed = jqFilter?.trim();
  if (!trimmed) return withoutJq;

  withoutJq.push({
    name: JQ_OPERATOR_NAME,
    args: trimmed,
    lineNumber: existing?.lineNumber,
    commentStyle: existing?.commentStyle ?? "#",
  });
  return withoutJq;
}

export function applyJqFilterToBlock(block: KulalaBlock, jqFilter?: string): KulalaBlock {
  const operators = upsertJqOperators(block.operators, jqFilter);
  const preamble = upsertJqOperators(block.preamble, jqFilter);
  return {
    ...block,
    operators: operators.length > 0 ? operators : undefined,
    preamble: preamble.length > 0 ? preamble : undefined,
  };
}

export function blockToFormModel(block: KulalaBlock, blockIndex: number): RequestFormModel {
  const headers = (block.request.headerSection ?? [])
    .filter(
      (entry): entry is { type: "header"; name: string; value?: string } => entry.type === "header",
    )
    .map((h) => ({ name: h.name, value: h.value ?? "" }));

  const method = block.request?.method ?? "GET";
  const rawBody = block.request?.body;
  const sourceBodyText = block.request?.sourceBodyText;
  const bodyKind = inferBodyKind(method, rawBody, headers);

  let body = "";
  let graphqlQuery = "";
  let graphqlVariables = "";

  if (bodyKind === "graphql") {
    if (sourceBodyText) {
      const parsed = parseGraphQLContent(sourceBodyText);
      graphqlQuery = parsed.query;
      graphqlVariables = graphQLBodyToVariablesText(parsed.variables, parsed.variablesSourceText);
    } else if (isGraphQLBody(rawBody)) {
      graphqlQuery = rawBody.query;
      graphqlVariables = graphQLBodyToVariablesText(rawBody.variables, rawBody.variablesSourceText);
    } else if (typeof rawBody === "string") {
      const parsed = parseGraphQLContent(rawBody);
      graphqlQuery = parsed.query;
      graphqlVariables = graphQLBodyToVariablesText(parsed.variables, parsed.variablesSourceText);
    }
    body = formatGraphQLBody(graphqlQuery, graphqlVariables);
  } else if (typeof rawBody === "string") {
    body = rawBody;
  } else if (rawBody && typeof rawBody === "object") {
    body = JSON.stringify(rawBody, null, 2);
  } else if (sourceBodyText) {
    body = sourceBodyText;
  }

  const preRequestScripts = (block.scripts?.preRequest ?? []).map((s) =>
    scriptToFormEntry(s as Record<string, unknown>),
  );
  const postRequestScripts = (block.scripts?.postRequest ?? []).map((s) =>
    scriptToFormEntry(s as Record<string, unknown>),
  );

  return {
    blockIndex,
    blockName: block.name || `Request ${blockIndex + 1}`,
    method,
    url: block.request?.url ?? "",
    httpVersion: block.request.httpVersion,
    headers,
    preRequestScripts,
    postRequestScripts,
    body,
    bodyKind,
    graphqlQuery,
    graphqlVariables,
    contentStartLine: block.contentStartLine ?? 1,
    jqFilter: readJqFilterFromBlock(block),
  };
}

export function docToFormModels(doc: KulalaDocument): RequestFormModel[] {
  return nativeBlocks(doc).map((block, idx) => blockToFormModel(block, idx));
}

function buildRequestBody(form: RequestFormModel): string | Record<string, unknown> | undefined {
  if (form.bodyKind === "graphql") {
    const query = form.graphqlQuery ?? "";
    const variablesText = form.graphqlVariables ?? "";
    if (!query && !variablesText) return undefined;
    const parsed = parseGraphQLContent(formatGraphQLBody(query, variablesText));
    if (parsed.variablesSourceText) {
      return {
        query: parsed.query,
        variablesSourceText: parsed.variablesSourceText,
      };
    }
    return {
      query: parsed.query,
      ...(parsed.variables !== undefined ? { variables: parsed.variables } : {}),
    };
  }
  return form.body || undefined;
}

export function fingerprintFormModels(formModels: RequestFormModel[]): string {
  return JSON.stringify(formModels.map(toPlainForm));
}

export function syncFormIntoModels(
  formModels: RequestFormModel[],
  form: RequestFormModel,
): RequestFormModel[] {
  return formModels.map((entry) =>
    entry.blockIndex === form.blockIndex ? toPlainForm(form) : entry,
  );
}

export function applyAllFormModelsToDocument(
  doc: KulalaDocument,
  formModels: RequestFormModel[],
): KulalaDocument {
  return formModels.reduce(
    (acc, form) => applyFormModelToDocument(acc, form),
    toPlainDocument(doc),
  );
}

export function isSessionDirty(formModels: RequestFormModel[], savedFingerprint: string): boolean {
  return fingerprintFormModels(formModels) !== savedFingerprint;
}

export function applyFormModelToDocument(
  doc: KulalaDocument,
  form: RequestFormModel,
): KulalaDocument {
  const blocks = [...doc.blocks];
  const native = nativeBlocks(doc);
  const target = native[form.blockIndex];
  if (!target) return doc;

  const docIndex = doc.blocks.indexOf(target);
  if (docIndex < 0) return doc;

  const commentEntries = (target.request.headerSection ?? []).filter((e) => e.type === "comment");
  const headerSection = [
    ...form.headers.map((h) => ({
      type: "header" as const,
      name: h.name,
      value: h.value,
    })),
    ...commentEntries,
  ];

  const body = buildRequestBody(form);
  let sourceBodyText: string | undefined;
  if (form.bodyKind === "graphql") {
    sourceBodyText = formatGraphQLBody(form.graphqlQuery ?? "", form.graphqlVariables ?? "");
  } else if (typeof body === "string") {
    sourceBodyText = body;
  }

  const urlChanged = form.url !== (target.request?.url ?? "");
  const request: KulalaBlock["request"] & {
    requestLineParts?: unknown;
    httpVersionInline?: boolean;
  } = {
    ...target.request,
    method: form.method,
    url: form.url,
    httpVersion: form.httpVersion,
    headerSection,
    body,
    sourceBodyText,
  };
  if (urlChanged) {
    delete request.requestLineParts;
    delete request.httpVersionInline;
  }

  const updatedBlock = applyJqFilterToBlock(
    {
      ...target,
      name: form.blockName,
      scripts: {
        preRequest: formScriptsToBlockScripts(form.preRequestScripts, "preRequest"),
        postRequest: formScriptsToBlockScripts(form.postRequestScripts, "postRequest"),
      },
      request,
    },
    form.jqFilter,
  );

  blocks[docIndex] = updatedBlock;
  return { ...doc, blocks };
}

export function reorderNativeRequestBlocks(
  doc: KulalaDocument,
  fromIndex: number,
  toIndex: number,
): KulalaDocument {
  const native = nativeBlocks(doc);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= native.length ||
    toIndex >= native.length ||
    fromIndex === toIndex
  ) {
    return doc;
  }

  const moving = native[fromIndex];
  const target = native[toIndex];
  const blocks = [...doc.blocks];
  const fromDocIdx = blocks.indexOf(moving);
  let toDocIdx = blocks.indexOf(target);
  if (fromDocIdx < 0 || toDocIdx < 0) return doc;

  blocks.splice(fromDocIdx, 1);
  if (fromDocIdx < toDocIdx) toDocIdx--;
  blocks.splice(toDocIdx, 0, moving);
  return { ...doc, blocks };
}

export function insertEmptyRequestBlock(
  doc: KulalaDocument,
  afterBlockIndex: number,
): KulalaDocument {
  const native = nativeBlocks(doc);
  const after = native[afterBlockIndex];
  const blocks = [...doc.blocks];

  const insertAt = after && blocks.includes(after) ? blocks.indexOf(after) + 1 : blocks.length;

  const nextIndex = native.length;
  const newBlock: KulalaBlock = {
    name: `Request ${nextIndex + 1}`,
    request: {
      method: "GET",
      url: "https://echo.kulala.app/get",
      headerSection: [],
    },
  };

  blocks.splice(insertAt, 0, newBlock);
  return {
    ...doc,
    blocks,
    ...(doc.nativeBlockCount != null ? { nativeBlockCount: doc.nativeBlockCount + 1 } : {}),
  };
}

export function removeNativeRequestBlock(doc: KulalaDocument, blockIndex: number): KulalaDocument {
  const native = nativeBlocks(doc);
  if (blockIndex < 0 || blockIndex >= native.length) return doc;

  const target = native[blockIndex];
  const blocks = [...doc.blocks];
  const docIndex = blocks.indexOf(target);
  if (docIndex < 0) return doc;

  blocks.splice(docIndex, 1);
  return {
    ...doc,
    blocks,
    ...(doc.nativeBlockCount != null ? { nativeBlockCount: doc.nativeBlockCount - 1 } : {}),
  };
}

export async function loadDocument(filepath: string): Promise<{
  doc?: KulalaDocument;
  content?: string;
  err?: string;
}> {
  const content = await window.KulalaApi.getFileContent(filepath);
  const { doc, err } = await window.KulalaApi.parseDocument(content, filepath);
  if (err || !doc) {
    return { err: err ?? "Failed to parse document" };
  }
  return { doc: toPlainDocument(doc), content };
}

export async function saveSessionToFile(
  doc: KulalaDocument,
  formModels: RequestFormModel[],
  filepath: string,
): Promise<{
  doc?: KulalaDocument;
  content?: string;
  formModels?: RequestFormModel[];
  savedFingerprint?: string;
  err?: string;
}> {
  const patched = applyAllFormModelsToDocument(doc, formModels);
  const serialized = await window.KulalaApi.serializeDocument(toPlainDocument(patched), filepath, {
    preserveBodyText: true,
  });
  if (serialized.err || serialized.content == null) {
    return { err: serialized.err ?? "Failed to serialize document" };
  }

  const formatted = await window.KulalaApi.formatHttp(serialized.content, filepath);
  if (formatted.err || formatted.content == null) {
    return { err: formatted.err ?? "Failed to format document" };
  }

  const wrote = await window.KulalaApi.writeFileContent(filepath, formatted.content);
  if (!wrote.ok) {
    return { err: wrote.err ?? "Failed to save file" };
  }

  const loaded = await loadDocument(filepath);
  if (loaded.err || !loaded.doc) {
    return { err: loaded.err ?? "Failed to reload file" };
  }
  const models = docToFormModels(loaded.doc);
  return {
    doc: loaded.doc,
    content: loaded.content,
    formModels: models,
    savedFingerprint: fingerprintFormModels(models),
  };
}

export async function saveFormToFile(
  doc: KulalaDocument,
  form: RequestFormModel,
  filepath: string,
): Promise<{ doc?: KulalaDocument; content?: string; err?: string }> {
  const patched = applyFormModelToDocument(toPlainDocument(doc), toPlainForm(form));
  const serialized = await window.KulalaApi.serializeDocument(toPlainDocument(patched), filepath, {
    preserveBodyText: true,
  });
  if (serialized.err || serialized.content == null) {
    return { err: serialized.err ?? "Failed to serialize document" };
  }

  const formatted = await window.KulalaApi.formatHttp(serialized.content, filepath);
  if (formatted.err || formatted.content == null) {
    return { err: formatted.err ?? "Failed to format document" };
  }

  const wrote = await window.KulalaApi.writeFileContent(filepath, formatted.content);
  if (!wrote.ok) {
    return { err: wrote.err ?? "Failed to save file" };
  }

  return loadDocument(filepath);
}

export function buildRunContext(
  content: string,
  filepath: string,
  env: string,
): import("../env.d").RunDocumentContext {
  const path = filepath.replace(/\\/g, "/");
  const lastSlash = path.lastIndexOf("/");
  const cwd = lastSlash >= 0 ? path.slice(0, lastSlash) : undefined;
  return { content, filepath, cwd, env };
}

export async function serializeFormDocument(
  doc: KulalaDocument,
  form: RequestFormModel,
  filepath?: string,
): Promise<string | undefined> {
  const patched = applyFormModelToDocument(toPlainDocument(doc), toPlainForm(form));
  const { content } = await window.KulalaApi.serializeDocument(toPlainDocument(patched), filepath, {
    preserveBodyText: true,
  });
  return content;
}
