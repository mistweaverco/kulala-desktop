import { ipcRenderer } from "electron";
import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

type CollectionIndexItem = {
  name: string;
  parentName: string | null;
  expanded: boolean;
  hasAttachedFolders: boolean;
  createdAt: string;
  updatedAt: string;
};

type CollectionFileTreeEntry = {
  rootFolderPath: string;
  filepath: string;
  relpath: string;
};

type CollectionFileTree = {
  attachedFolders: string[];
  files: CollectionFileTreeEntry[];
};

const KulalaApi = {
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke("getAppVersion");
  },
  pickFolders: async (
    collectionName: string,
  ): Promise<{ attached: string[]; skipped: string[] }> => {
    return await ipcRenderer.invoke("pickFolders", collectionName);
  },
  getCollectionTreeIndex: async (): Promise<CollectionIndexItem[]> => {
    return await ipcRenderer.invoke("getCollectionTreeIndex");
  },
  getCollectionFileTree: async (collectionName: string): Promise<CollectionFileTree> => {
    return await ipcRenderer.invoke("getCollectionFileTree", collectionName);
  },
  setCollectionExpanded: async (name: string, expanded: boolean): Promise<void> => {
    await ipcRenderer.invoke("setCollectionExpanded", name, expanded);
  },
  createCollection: async (name: string): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("createCollection", name);
  },
  createSubcollection: async (
    parentName: string,
    name: string,
  ): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("createSubcollection", parentName, name);
  },
  detachFolder: async (collectionName: string, folderPath: string): Promise<void> => {
    await ipcRenderer.invoke("detachFolder", collectionName, folderPath);
  },
  getFileContent: async (fp: string, baseFilepath?: string): Promise<string> => {
    return await ipcRenderer.invoke("getFileContent", fp, baseFilepath);
  },
  writeFileContent: async (
    fp: string,
    content: string,
    baseFilepath?: string,
  ): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("writeFileContent", fp, content, baseFilepath);
  },
  deleteFile: async (fp: string, baseFilepath?: string): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("deleteFile", fp, baseFilepath);
  },
  deletePath: async (targetPath: string): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("deletePath", targetPath);
  },
  createHttpFile: async (
    dirPath: string,
    fileName: string,
    content: string,
  ): Promise<{ ok: boolean; filepath?: string; err?: string }> => {
    return await ipcRenderer.invoke("createHttpFile", dirPath, fileName, content);
  },
  removeCollection: async (cn: string): Promise<{ removedFilepaths: string[] }> => {
    return await ipcRenderer.invoke("removeCollection", cn);
  },
  renameCollection: async (
    oldName: string,
    newName: string,
  ): Promise<{ ok: boolean; err?: string }> => {
    return await ipcRenderer.invoke("renameCollection", oldName, newName);
  },
  renameFile: async (
    filepath: string,
    newName: string,
  ): Promise<{ ok: boolean; newPath?: string; err?: string }> => {
    return await ipcRenderer.invoke("renameFile", filepath, newName);
  },
  pickScriptFile: async (): Promise<string | undefined> => {
    return await ipcRenderer.invoke("pickScriptFile");
  },

  parseDocument: async (content: string, filepath?: string) =>
    ipcRenderer.invoke("kulala:parseDocument", content, filepath),
  serializeDocument: async (doc: unknown, filepath?: string, options?: unknown) =>
    ipcRenderer.invoke("kulala:serializeDocument", doc, filepath, options),
  formatHttp: async (content: string, filepath?: string) =>
    ipcRenderer.invoke("kulala:formatHttp", content, filepath),
  saveDocument: async (doc: unknown, filepath: string, options?: unknown) =>
    ipcRenderer.invoke("kulala:saveDocument", doc, filepath, options),
  listEnvironments: async (filepath?: string) =>
    ipcRenderer.invoke("kulala:listEnvironments", filepath),
  getSelectedEnv: async (filepath?: string) =>
    ipcRenderer.invoke("kulala:getSelectedEnv", filepath),
  setSelectedEnv: async (env: string, filepath?: string) =>
    ipcRenderer.invoke("kulala:setSelectedEnv", env, filepath),
  runRequest: async (ctx: unknown, blockName?: string, line?: number, column?: number) =>
    ipcRenderer.invoke("kulala:runRequest", ctx, blockName, line, column),
  runAllRequests: async (ctx: unknown) => ipcRenderer.invoke("kulala:runAllRequests", ctx),
  cancelRequest: async () => ipcRenderer.invoke("kulala:cancelRequest"),
  submitPrompt: async (promptId: string, inputs: Array<{ id: string; value: string }> | null) =>
    ipcRenderer.invoke("kulala:submitPrompt", promptId, inputs),
  toCurl: async (content: string, filepath: string | undefined, line: number, column: number) =>
    ipcRenderer.invoke("kulala:toCurl", content, filepath, line, column),
  fromCurl: async (curl: string, filepath?: string) =>
    ipcRenderer.invoke("kulala:fromCurl", curl, filepath),
  inspectRequest: async (
    content: string,
    filepath: string | undefined,
    line: number,
    column: number,
    env: string,
  ) => ipcRenderer.invoke("kulala:inspectRequest", content, filepath, line, column, env),
  clearGlobals: async (filepath?: string) => ipcRenderer.invoke("kulala:clearGlobals", filepath),
  applyJqFilter: async (rawBody: string, filter: string, contentType?: string) =>
    ipcRenderer.invoke("kulala:applyJqFilter", rawBody, filter, contentType),
  copyToClipboard: async (text: string) => ipcRenderer.invoke("kulala:copyToClipboard", text),
  readClipboard: async () => ipcRenderer.invoke("kulala:readClipboard"),
  sendWebSocketMessage: async (message: string) =>
    ipcRenderer.invoke("kulala:sendWebSocketMessage", message),
  closeWebSocket: async () => ipcRenderer.invoke("kulala:closeWebSocket"),
  getSettings: async () => ipcRenderer.invoke("kulala:getSettings"),
  setSettings: async (values: Record<string, unknown>) =>
    ipcRenderer.invoke("kulala:setSettings", values),
  lspCompletion: async (
    content: string,
    line: number,
    column: number,
    opts?: { filepath?: string; env?: string; filetype?: string },
  ) => ipcRenderer.invoke("kulala:lspCompletion", content, line, column, opts),
  lspHover: async (
    content: string,
    line: number,
    column: number,
    opts?: { filepath?: string; env?: string; filetype?: string },
  ) => ipcRenderer.invoke("kulala:lspHover", content, line, column, opts),

  onResponse: (callback: (entry: unknown) => void) => {
    const onSingle = (_: unknown, entry: unknown) => callback(entry);
    const onBatch = (_: unknown, entries: unknown) => callback(entries);
    ipcRenderer.on("kulala:response", onSingle);
    ipcRenderer.on("kulala:responses", onBatch);
    return () => {
      ipcRenderer.removeListener("kulala:response", onSingle);
      ipcRenderer.removeListener("kulala:responses", onBatch);
    };
  },
  onError: (callback: (message: string) => void) => {
    const listener = (_: unknown, message: string) => callback(message);
    ipcRenderer.on("kulala:error", listener);
    return () => ipcRenderer.removeListener("kulala:error", listener);
  },
  onRunning: (callback: (running: boolean) => void) => {
    const listener = (_: unknown, running: boolean) => callback(running);
    ipcRenderer.on("kulala:running", listener);
    return () => ipcRenderer.removeListener("kulala:running", listener);
  },
  onPrompt: (callback: (request: unknown) => void) => {
    const listener = (_: unknown, request: unknown) => callback(request);
    ipcRenderer.on("kulala:prompt", listener);
    return () => ipcRenderer.removeListener("kulala:prompt", listener);
  },
  onWebSocketEvent: (callback: (payload: { entryId: string; event: unknown }) => void) => {
    const listener = (_: unknown, payload: { entryId: string; event: unknown }) =>
      callback(payload);
    ipcRenderer.on("kulala:websocketEvent", listener);
    return () => ipcRenderer.removeListener("kulala:websocketEvent", listener);
  },
};

try {
  contextBridge.exposeInMainWorld("electron", electronAPI);
  contextBridge.exposeInMainWorld("KulalaApi", KulalaApi);
} catch (error) {
  console.error(error);
}
