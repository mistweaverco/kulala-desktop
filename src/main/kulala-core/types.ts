export type KulalaRunLimit =
  | { filter: "cursorPosition"; line: number; column: number }
  | { filter: "name"; name: string };

export type KulalaHttpSerdeSerializeOptions = {
  includeExpandedBlocks?: boolean;
  preserveBodyText?: boolean;
};

export type KulalaSerializeResult = {
  success: boolean;
  content?: string;
  error?: string;
};

export type KulalaResponseBody =
  | { type: "text"; content: string; mediaType?: string }
  | {
      type: "binary";
      content: string;
      encoding: "base64";
      byteLength: number;
      mediaType?: string;
    }
  | { type: "json"; content: Record<string, unknown>; formatted?: string };

export type KulalaScriptConsoleOrigin = {
  phase: string;
  source?: string;
  file?: string;
  httpDirectiveLine?: number;
  line?: number;
  column?: number;
};

export type KulalaScriptConsoleLine = {
  level: "log" | "error" | "warn" | "info" | "debug";
  message: string;
  origin?: KulalaScriptConsoleOrigin;
  kind?: "log" | "test" | "assert";
  testName?: string;
  status?: "pass" | "fail";
};

export type KulalaRequestResult = {
  success: boolean;
  blockName?: string;
  prompt?: boolean;
  promptId?: string;
  promptType?: string;
  message?: string;
  inputs?: Array<{
    id: string;
    label?: string;
    type?: string;
    required?: boolean;
  }>;
  status?: number;
  headers?: Record<string, string>;
  url?: string;
  error?: string;
  skipped?: boolean;
  httpCompleted?: boolean;
  protocol?: string;
  initialMessage?: string;
  body?: KulalaResponseBody;
  filteredBody?: KulalaResponseBody;
  rawBody?: string;
  jqFilter?: string;
  timings?: Record<string, number>;
  scriptConsole?: KulalaScriptConsoleLine[];
  redirectChain?: unknown[];
  verboseTrace?: string;
  request?: { method?: string; url?: string; headers?: Record<string, string>; body?: string };
};

export type KulalaResponseWrapper = {
  type: "responses" | "error";
  data: KulalaRequestResult[];
};

export type KulalaEnvironmentCatalog = {
  $kulalaShared?: Record<string, unknown>;
  environments: Record<string, Record<string, unknown>>;
};

export type KulalaHeaderSectionEntry =
  | { type: "header"; name: string; value?: string }
  | { type: "comment"; comment: unknown };

export type KulalaRequest = {
  method: string;
  url: string;
  httpVersion?: string;
  headerSection: KulalaHeaderSectionEntry[];
  body?: string | Record<string, unknown>;
  requestLineParts?: unknown[];
};

export type KulalaOperator = {
  name: string;
  args?: string;
  lineNumber?: number;
  commentStyle?: string;
};

export type KulalaBlock = {
  name: string;
  request: KulalaRequest;
  preamble?: KulalaOperator[];
  operators?: KulalaOperator[];
  scripts?: unknown;
  preambleVariables?: Record<string, string>;
  contentStartLine?: number;
  position?: { start: number; end: number };
  runExpander?: boolean;
  errors?: unknown[];
};

export type KulalaDocument = {
  filepath?: string;
  fileHeaderVariables?: Record<string, string>;
  fileHeaderOperators?: unknown[];
  vscodeRestclientCompat?: boolean;
  directives?: unknown[];
  blocks: KulalaBlock[];
  hasErrors?: boolean;
  errors?: unknown[];
  nativeBlockCount?: number;
};

export type KulalaJqFilterResult = {
  success: boolean;
  filteredBody?: KulalaResponseBody;
  error?: string;
};

export type RunDocumentContext = {
  content: string;
  filepath?: string;
  cwd?: string;
  env: string;
};

export type ResponseEntry = {
  id: string;
  blockName?: string;
  success: boolean;
  status?: number;
  error?: string;
  url?: string;
  headers?: Record<string, string>;
  timings?: Record<string, number>;
  scriptConsole?: KulalaScriptConsoleLine[];
  verbose?: {
    requestHeadersRows: Array<{ name: string; value: string }>;
    requestBody: { bodyKind: "text" | "json"; body: string };
    responseHeadersRows: Array<{ name: string; value: string }>;
    responseBody: { bodyKind: "text" | "json"; body: string };
  };
  body?: string;
  bodyKind?: "json" | "text" | "html" | "xml" | "image" | "binary";
  bodyHtml?: string;
  bodyImageSrc?: string;
  binaryNote?: string;
  rawBody?: string;
  contentType?: string;
  jqFilter?: string;
  wsConnected?: boolean;
  wsClosed?: boolean;
  protocol?: string;
};

export type PromptRequest = {
  id: string;
  message?: string;
  inputs: Array<{
    id: string;
    label?: string;
    type?: string;
    required?: boolean;
  }>;
};

export type LspRange = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type LspTextEdit = {
  range: LspRange;
  newText: string;
};

export type LspCompletionItem = {
  label: string;
  labelDetails?: { description?: string };
  kind?: number;
  detail?: string;
  documentation?: { kind: "plaintext" | "markdown"; value: string };
  insertText?: string;
  insertTextFormat?: number;
  sortText?: string;
  textEdit?: LspTextEdit;
};

export type LspCompletionList = {
  isIncomplete: boolean;
  items: LspCompletionItem[];
};

export type LspHover = {
  contents: string | { kind: string; value: string; language?: string };
};

export type KulalaLspFiletype = "http" | "rest" | "javascript" | "typescript" | "lua";
