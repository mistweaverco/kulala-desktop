/// <reference types="svelte" />
/// <reference types="vite/client" />
import { ElectronAPI } from "@electron-toolkit/preload";

export type CollectionIndexItem = {
  name: string;
  parentName: string | null;
  expanded: boolean;
  hasAttachedFolders: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CollectionFileTreeEntry = {
  rootFolderPath: string;
  filepath: string;
  relpath: string;
};

export type CollectionFileTree = {
  attachedFolders: string[];
  files: CollectionFileTreeEntry[];
};

export type KulalaHeaderEntry = {
  name: string;
  value: string;
};

export type ScriptFormEntry = {
  source: "inline" | "file";
  lang: "js" | "ts" | "lua";
  langExplicit?: boolean;
  content: string;
  filepath?: string;
};

export type KulalaScriptBlock = ScriptFormEntry & {
  type: "preRequest" | "postRequest";
  lineNumber: number;
};

export type KulalaOperator = {
  name: string;
  args?: string;
  lineNumber?: number;
  commentStyle?: string;
};

export type RequestFormModel = {
  blockIndex: number;
  blockName: string;
  method: string;
  url: string;
  httpVersion?: string;
  headers: KulalaHeaderEntry[];
  preRequestScripts: ScriptFormEntry[];
  postRequestScripts: ScriptFormEntry[];
  body: string;
  bodyKind: "raw" | "json" | "graphql";
  graphqlQuery?: string;
  graphqlVariables?: string;
  contentStartLine: number;
  jqFilter?: string;
};

export type KulalaBlock = {
  name: string;
  request: {
    method: string;
    url: string;
    httpVersion?: string;
    headerSection: Array<
      { type: "header"; name: string; value?: string } | { type: "comment"; comment: unknown }
    >;
    body?: string | Record<string, unknown>;
    sourceBodyText?: string;
  };
  contentStartLine?: number;
  runExpander?: boolean;
  preamble?: KulalaOperator[];
  operators?: KulalaOperator[];
  scripts?: {
    preRequest: KulalaScriptBlock[];
    postRequest: KulalaScriptBlock[];
  };
};

export type KulalaDocument = {
  filepath?: string;
  fileHeaderVariables?: Record<string, string>;
  blocks: KulalaBlock[];
  nativeBlockCount?: number;
  hasErrors?: boolean;
  errors?: unknown[];
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
  scriptConsole?: Array<{
    level: string;
    message: string;
    kind?: string;
    testName?: string;
    status?: string;
  }>;
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

export type RunDocumentContext = {
  content: string;
  filepath?: string;
  cwd?: string;
  env: string;
};

declare global {
  interface Window {
    electron: ElectronAPI;
    KulalaApi: {
      getAppVersion: () => Promise<string>;
      pickFolders: (
        collectionName: string,
      ) => Promise<{ attached: string[]; skipped: string[] }>;
      getCollectionTreeIndex: () => Promise<CollectionIndexItem[]>;
      getCollectionFileTree: (collectionName: string) => Promise<CollectionFileTree>;
      setCollectionExpanded: (name: string, expanded: boolean) => Promise<void>;
      createCollection: (name: string) => Promise<{ ok: boolean; err?: string }>;
      createSubcollection: (
        parentName: string,
        name: string,
      ) => Promise<{ ok: boolean; err?: string }>;
      detachFolder: (collectionName: string, folderPath: string) => Promise<void>;
      getFileContent: (fp: string, baseFilepath?: string) => Promise<string>;
      writeFileContent: (
        fp: string,
        content: string,
        baseFilepath?: string,
      ) => Promise<{ ok: boolean; err?: string }>;
      deleteFile: (fp: string, baseFilepath?: string) => Promise<{ ok: boolean; err?: string }>;
      deletePath: (targetPath: string) => Promise<{ ok: boolean; err?: string }>;
      createHttpFile: (
        dirPath: string,
        fileName: string,
        content: string,
      ) => Promise<{ ok: boolean; filepath?: string; err?: string }>;
      removeCollection: (cn: string) => Promise<{ removedFilepaths: string[] }>;
      renameCollection: (
        oldName: string,
        newName: string,
      ) => Promise<{ ok: boolean; err?: string }>;
      renameFile: (
        filepath: string,
        newName: string,
      ) => Promise<{ ok: boolean; newPath?: string; err?: string }>;
      pickScriptFile: () => Promise<string | undefined>;
      parseDocument: (
        content: string,
        filepath?: string,
      ) => Promise<{ doc?: KulalaDocument; err?: string }>;
      serializeDocument: (
        doc: KulalaDocument,
        filepath?: string,
        options?: { preserveBodyText?: boolean },
      ) => Promise<{ content?: string; err?: string }>;
      formatHttp: (
        content: string,
        filepath?: string,
      ) => Promise<{ content?: string; err?: string }>;
      saveDocument: (
        doc: KulalaDocument,
        filepath: string,
        options?: { preserveBodyText?: boolean },
      ) => Promise<{ err?: string }>;
      listEnvironments: (
        filepath?: string,
      ) => Promise<{ catalog?: { environments: Record<string, unknown> }; err?: string }>;
      getSelectedEnv: (filepath?: string) => Promise<string>;
      setSelectedEnv: (env: string, filepath?: string) => Promise<void>;
      runRequest: (
        ctx: RunDocumentContext,
        blockName?: string,
        line?: number,
        column?: number,
      ) => Promise<{ ok: boolean; err?: string }>;
      runAllRequests: (ctx: RunDocumentContext) => Promise<{ ok: boolean; err?: string }>;
      cancelRequest: () => Promise<void>;
      submitPrompt: (
        promptId: string,
        inputs: Array<{ id: string; value: string }> | null,
      ) => Promise<void>;
      toCurl: (
        content: string,
        filepath: string | undefined,
        line: number,
        column: number,
      ) => Promise<string | undefined>;
      fromCurl: (curl: string, filepath?: string) => Promise<string | undefined>;
      inspectRequest: (
        content: string,
        filepath: string | undefined,
        line: number,
        column: number,
        env: string,
      ) => Promise<string | undefined>;
      clearGlobals: (filepath?: string) => Promise<void>;
      applyJqFilter: (
        rawBody: string,
        filter: string,
        contentType?: string,
      ) => Promise<{ entry?: Partial<ResponseEntry>; err?: string }>;
      copyToClipboard: (text: string) => Promise<void>;
      readClipboard: () => Promise<string>;
      sendWebSocketMessage: (message: string) => Promise<boolean>;
      closeWebSocket: () => Promise<void>;
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (values: Record<string, unknown>) => Promise<void>;
      lspCompletion: (
        content: string,
        line: number,
        column: number,
        opts?: { filepath?: string; env?: string; filetype?: string },
      ) => Promise<
        Array<{
          label: string;
          labelDetails?: { description?: string };
          kind?: number;
          detail?: string;
          documentation?: { kind: "plaintext" | "markdown"; value: string };
          insertText?: string;
          insertTextFormat?: number;
          sortText?: string;
          textEdit?: {
            range: {
              start: { line: number; character: number };
              end: { line: number; character: number };
            };
            newText: string;
          };
        }>
      >;
      lspHover: (
        content: string,
        line: number,
        column: number,
        opts?: { filepath?: string; env?: string; filetype?: string },
      ) => Promise<
        | {
            contents: string | { kind: string; value: string; language?: string };
          }
        | undefined
      >;
      onResponse: (callback: (entry: ResponseEntry | ResponseEntry[]) => void) => () => void;
      onError: (callback: (message: string) => void) => () => void;
      onRunning: (callback: (running: boolean) => void) => () => void;
      onPrompt: (callback: (request: PromptRequest) => void) => () => void;
      onWebSocketEvent: (
        callback: (payload: { entryId: string; event: unknown }) => void,
      ) => () => void;
    };
  }
}

export {};
