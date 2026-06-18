/// <reference path="./kulala-fmt-api.d.ts" />

import { app, clipboard, ipcMain, type BrowserWindow } from "electron";
import { buildRenamedFilePath, listHttpFilesRecursive, pickFolders, pickScriptFile } from "./file";
import { database } from "./database";
import fs from "fs";
import path from "path";
import {
  fileCwd,
  getBridge,
  getRunner,
  getSelectedEnv,
  initKulalaCore,
  listEnvironments,
  parseDocument,
  saveDocument,
  serializeDocument,
  setSelectedEnv,
  shutdownKulalaCore,
} from "./kulala-core";
import { postProcessFormattedHttp } from "./kulala-http-format";
import { getKulalaSettings, setKulalaSettings } from "./kulala-core/installer";
import type {
  KulalaDocument,
  KulalaHttpSerdeSerializeOptions,
  ResponseEntry,
  RunDocumentContext,
} from "./kulala-core/types";

let mainWindowRef: BrowserWindow | undefined;

export function setMainWindow(win: BrowserWindow): void {
  mainWindowRef = win;
}

type CollectionFileTreeEntry = {
  rootFolderPath: string;
  filepath: string;
  relpath: string;
};

type CollectionFileTree = {
  attachedFolders: string[];
  files: CollectionFileTreeEntry[];
};

export const ipcMainHandlersInit = (): void => {
  initKulalaCore(() => mainWindowRef);

  app.on("before-quit", () => {
    shutdownKulalaCore();
  });

  function resolveUserFilepath(fp: string, baseFilepath?: string): string {
    const raw = String(fp ?? "").trim();
    if (!raw) {
      throw new Error("File path cannot be empty");
    }
    if (raw.includes("\0")) {
      throw new Error("Invalid file path");
    }
    if (path.isAbsolute(raw)) return raw;
    const base = String(baseFilepath ?? "").trim();
    if (!base) return raw;
    return path.resolve(path.dirname(base), raw);
  }

  ipcMain.handle(
    "pickFolders",
    async (
      _,
      collectionName: string,
    ): Promise<{ attached: string[]; skipped: string[] }> => {
      const { folderPaths } = await pickFolders();
      if (folderPaths.length === 0) return { attached: [], skipped: [] };
      return await database.attachFolders(collectionName, folderPaths);
    },
  );

  ipcMain.handle(
    "getFileContent",
    async (_, fp: string, baseFilepath?: string): Promise<string> => {
      const resolved = resolveUserFilepath(fp, baseFilepath);
      return fs.readFileSync(resolved, "utf-8");
    },
  );

  ipcMain.handle(
    "writeFileContent",
    async (
      _,
      fp: string,
      content: string,
      baseFilepath?: string,
    ): Promise<{ ok: boolean; err?: string }> => {
      try {
        const resolved = resolveUserFilepath(fp, baseFilepath);
        await fs.promises.writeFile(resolved, content, "utf8");
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, err: msg };
      }
    },
  );

  ipcMain.handle(
    "deleteFile",
    async (_, fp: string, baseFilepath?: string): Promise<{ ok: boolean; err?: string }> => {
      try {
        const resolved = resolveUserFilepath(fp, baseFilepath);
        await fs.promises.unlink(resolved);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, err: msg };
      }
    },
  );

  ipcMain.handle(
    "deletePath",
    async (_, targetPath: string): Promise<{ ok: boolean; err?: string }> => {
      try {
        const st = await fs.promises.lstat(targetPath);
        if (st.isDirectory()) {
          // Node's rm handles recursion and symlink edge-cases better than manual walk.
          await fs.promises.rm(targetPath, { recursive: true, force: false });
        } else {
          await fs.promises.unlink(targetPath);
        }
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, err: msg };
      }
    },
  );

  ipcMain.handle(
    "createHttpFile",
    async (
      _,
      dirPath: string,
      fileName: string,
      content: string,
    ): Promise<{ ok: boolean; filepath?: string; err?: string }> => {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) return { ok: false, err: "File name cannot be empty" };
      const finalName =
        trimmed.endsWith(".http") || trimmed.endsWith(".rest") ? trimmed : `${trimmed}.http`;
      const fp = path.join(dirPath, finalName);
      try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        await fs.promises.writeFile(fp, content, { encoding: "utf8", flag: "wx" });
        return { ok: true, filepath: fp };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, err: msg };
      }
    },
  );

  ipcMain.handle("getCollectionTreeIndex", async () => {
    return await database.getCollectionTreeIndex();
  });

  ipcMain.handle(
    "getCollectionFileTree",
    async (_, collectionName: string): Promise<CollectionFileTree> => {
      const attachedFolders = await database.listFoldersForCollection(collectionName);
      const files: CollectionFileTreeEntry[] = [];
      for (const rootFolderPath of attachedFolders) {
        const walked = await listHttpFilesRecursive(rootFolderPath);
        for (const entry of walked) {
          files.push({ rootFolderPath, filepath: entry.filepath, relpath: entry.relpath });
        }
      }
      return { attachedFolders, files };
    },
  );

  ipcMain.handle(
    "setCollectionExpanded",
    async (_, name: string, expanded: boolean): Promise<void> => {
      await database.setCollectionExpanded(name, expanded);
    },
  );

  ipcMain.handle(
    "createCollection",
    async (_, name: string): Promise<{ ok: boolean; err?: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, err: "Collection name cannot be empty" };
      if (await database.collectionExists(trimmed)) {
        return { ok: false, err: "A collection with that name already exists" };
      }
      try {
        await database.ensureCollection(trimmed, null);
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  ipcMain.handle(
    "createSubcollection",
    async (_, parentName: string, name: string): Promise<{ ok: boolean; err?: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, err: "Collection name cannot be empty" };
      if (await database.collectionExists(trimmed)) {
        return { ok: false, err: "A collection with that name already exists" };
      }
      try {
        await database.createSubcollection(parentName, trimmed);
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  ipcMain.handle(
    "detachFolder",
    async (_, collectionName: string, folderPath: string): Promise<void> => {
      await database.detachFolder(collectionName, folderPath);
    },
  );

  ipcMain.handle(
    "removeCollection",
    async (_, cn: string): Promise<{ removedFilepaths: string[] }> => {
      const removedFolderPaths = await database.removeCollectionSubtree(cn);
      const removedFilepaths: string[] = [];
      for (const folderPath of removedFolderPaths) {
        const walked = await listHttpFilesRecursive(folderPath);
        for (const entry of walked) removedFilepaths.push(entry.filepath);
      }
      return { removedFilepaths };
    },
  );

  ipcMain.handle(
    "renameCollection",
    async (_, oldName: string, newName: string): Promise<{ ok: boolean; err?: string }> => {
      const trimmed = newName.trim();
      if (!trimmed) return { ok: false, err: "Collection name cannot be empty" };
      if (trimmed === oldName) return { ok: true };
      try {
        await database.renameCollection(oldName, trimmed);
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  ipcMain.handle(
    "renameFile",
    async (
      _,
      filepath: string,
      newName: string,
    ): Promise<{ ok: boolean; newPath?: string; err?: string }> => {
      const newPath = buildRenamedFilePath(filepath, newName);
      if (!newPath) return { ok: false, err: "File name cannot be empty" };
      if (newPath === filepath) return { ok: true, newPath };

      if (fs.existsSync(newPath)) {
        return { ok: false, err: "A file with that name already exists" };
      }

      try {
        await fs.promises.rename(filepath, newPath);
      } catch (err) {
        return {
          ok: false,
          err: err instanceof Error ? err.message : "Failed to rename file on disk",
        };
      }
      return { ok: true, newPath };
    },
  );

  ipcMain.handle("pickScriptFile", async (): Promise<string | undefined> => pickScriptFile());

  ipcMain.handle("getAppVersion", (): string => {
    return app.getVersion();
  });

  ipcMain.handle("kulala:parseDocument", async (_, content: string, filepath?: string) =>
    parseDocument(content, filepath),
  );

  ipcMain.handle(
    "kulala:serializeDocument",
    async (_, doc: KulalaDocument, filepath?: string, options?: KulalaHttpSerdeSerializeOptions) =>
      serializeDocument(doc, filepath, options),
  );

  ipcMain.handle(
    "kulala:formatHttp",
    async (_, content: string, filepath?: string): Promise<{ content?: string; err?: string }> => {
      try {
        const exe = await getBridge().executable();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import("@mistweaverco/kulala-fmt/api");
        const formatted = await (mod.formatHttpText as (c: string, o: unknown) => Promise<string>)(
          content,
          {
            filepath,
            kulalaCoreExecutablePath: exe,
          },
        );
        return { content: postProcessFormattedHttp(formatted) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { err: msg };
      }
    },
  );

  ipcMain.handle(
    "kulala:saveDocument",
    async (_, doc: KulalaDocument, filepath: string, options?: KulalaHttpSerdeSerializeOptions) =>
      saveDocument(doc, filepath, options),
  );

  ipcMain.handle("kulala:listEnvironments", async (_, filepath?: string) =>
    listEnvironments(filepath),
  );

  ipcMain.handle("kulala:getSelectedEnv", async (_, filepath?: string) => getSelectedEnv(filepath));

  ipcMain.handle("kulala:setSelectedEnv", async (_, env: string, filepath?: string) => {
    await setSelectedEnv(env, filepath);
  });

  ipcMain.handle("kulala:cancelRequest", (): void => {
    getRunner().cancel();
    mainWindowRef?.webContents.send("kulala:running", false);
  });

  ipcMain.handle(
    "kulala:submitPrompt",
    async (_, promptId: string, inputs: Array<{ id: string; value: string }> | null) => {
      getRunner().resolvePrompt(promptId, inputs ?? undefined);
    },
  );

  ipcMain.handle(
    "kulala:runRequest",
    async (
      _,
      ctx: RunDocumentContext,
      blockName?: string,
      line?: number,
      column?: number,
    ): Promise<{ ok: boolean; err?: string }> => {
      const runner = getRunner();
      let settled = false;

      return new Promise((resolve) => {
        const finish = (result: { ok: boolean; err?: string }): void => {
          if (settled) return;
          settled = true;
          mainWindowRef?.webContents.send("kulala:running", false);
          resolve(result);
        };

        const callbacks = {
          onResponse: (entry: ResponseEntry) => {
            mainWindowRef?.webContents.send("kulala:response", entry);
          },
          onResponses: (entries: ResponseEntry[]) => {
            mainWindowRef?.webContents.send("kulala:responses", entries);
          },
          onError: (message: string) => {
            mainWindowRef?.webContents.send("kulala:error", message);
            finish({ ok: false, err: message });
          },
          onRunningChange: (running: boolean) => {
            mainWindowRef?.webContents.send("kulala:running", running);
          },
          onWebSocketEvent: (entryId: string, event: unknown) => {
            mainWindowRef?.webContents.send("kulala:websocketEvent", { entryId, event });
          },
        };

        const runPromise = blockName
          ? runner.runBlock(ctx, blockName, callbacks)
          : line != null && column != null
            ? runner.runAtLine(ctx, line, column, callbacks)
            : runner.runAll(ctx, callbacks);

        void runPromise
          .then(() => finish({ ok: true }))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            mainWindowRef?.webContents.send("kulala:error", message);
            finish({ ok: false, err: message });
          });
      });
    },
  );

  ipcMain.handle(
    "kulala:runAllRequests",
    async (_, ctx: RunDocumentContext): Promise<{ ok: boolean; err?: string }> => {
      const runner = getRunner();
      let settled = false;

      return new Promise((resolve) => {
        const finish = (result: { ok: boolean; err?: string }): void => {
          if (settled) return;
          settled = true;
          mainWindowRef?.webContents.send("kulala:running", false);
          resolve(result);
        };

        void runner
          .runAll(ctx, {
            onResponse: (entry) => mainWindowRef?.webContents.send("kulala:response", entry),
            onResponses: (entries) => mainWindowRef?.webContents.send("kulala:responses", entries),
            onError: (message) => {
              mainWindowRef?.webContents.send("kulala:error", message);
              finish({ ok: false, err: message });
            },
            onRunningChange: (running) =>
              mainWindowRef?.webContents.send("kulala:running", running),
            onWebSocketEvent: (entryId, event) =>
              mainWindowRef?.webContents.send("kulala:websocketEvent", { entryId, event }),
          })
          .then(() => finish({ ok: true }))
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            mainWindowRef?.webContents.send("kulala:error", message);
            finish({ ok: false, err: message });
          });
      });
    },
  );

  ipcMain.handle(
    "kulala:toCurl",
    async (_, content: string, filepath: string | undefined, line: number, column: number) => {
      const cwd = fileCwd(filepath);
      return getBridge().toCurl(content, filepath, line, column, cwd);
    },
  );

  ipcMain.handle("kulala:fromCurl", async (_, curl: string, filepath?: string) => {
    return getBridge().fromCurl(curl, fileCwd(filepath));
  });

  ipcMain.handle(
    "kulala:inspectRequest",
    async (
      _,
      content: string,
      filepath: string | undefined,
      line: number,
      column: number,
      env: string,
    ) => getBridge().inspectRequest(content, filepath, line, column, env, fileCwd(filepath)),
  );

  ipcMain.handle("kulala:clearGlobals", async (_, filepath?: string) => {
    await getBridge().clearGlobals(fileCwd(filepath));
  });

  ipcMain.handle(
    "kulala:applyJqFilter",
    async (_, rawBody: string, filter: string, contentType?: string) =>
      getRunner().applyJqFilter(rawBody, filter, contentType),
  );

  ipcMain.handle("kulala:copyToClipboard", async (_, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("kulala:readClipboard", async () => clipboard.readText());

  ipcMain.handle("kulala:sendWebSocketMessage", async (_, message: string) =>
    getRunner().sendWebSocketMessage(message),
  );

  ipcMain.handle("kulala:closeWebSocket", async () => {
    getRunner().closeWebSocket();
  });

  ipcMain.handle("kulala:getSettings", async () => getKulalaSettings());

  ipcMain.handle("kulala:setSettings", async (_, values: Record<string, unknown>) => {
    await setKulalaSettings(values);
  });

  ipcMain.handle(
    "kulala:lspCompletion",
    async (
      _,
      content: string,
      line: number,
      column: number,
      opts?: { filepath?: string; env?: string; filetype?: string },
    ) => {
      const cwd = fileCwd(opts?.filepath);
      return getBridge().lspCompletion(content, line, column, {
        filepath: opts?.filepath,
        cwd,
        env: opts?.env,
        filetype: (opts?.filetype as import("./kulala-core/types").KulalaLspFiletype) ?? "http",
      });
    },
  );

  ipcMain.handle(
    "kulala:lspHover",
    async (
      _,
      content: string,
      line: number,
      column: number,
      opts?: { filepath?: string; env?: string; filetype?: string },
    ) => {
      const cwd = fileCwd(opts?.filepath);
      return getBridge().lspHover(content, line, column, {
        filepath: opts?.filepath,
        cwd,
        env: opts?.env,
        filetype: (opts?.filetype as import("./kulala-core/types").KulalaLspFiletype) ?? "http",
      });
    },
  );
};
