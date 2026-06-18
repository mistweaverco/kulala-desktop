import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { KulalaCoreBridge } from "./bridge";
import type {
  KulalaRequestResult,
  KulalaResponseWrapper,
  KulalaRunLimit,
  PromptRequest,
  ResponseEntry,
  RunDocumentContext,
} from "./types";

const MAX_PROMPT_DEPTH = 7;

export type RunCallbacks = {
  onResponse: (entry: ResponseEntry) => void;
  onResponses?: (entries: ResponseEntry[]) => void;
  onError: (message: string) => void;
  onRunningChange: (running: boolean) => void;
  onWebSocketEvent: (entryId: string, event: unknown) => void;
};

function isPrompt(item: KulalaRequestResult | undefined): boolean {
  if (!item) return false;
  if (item.prompt === true) return true;
  return Boolean(item.promptId && item.promptType);
}

function findFirstPrompt(data: KulalaRequestResult[]): KulalaRequestResult | undefined {
  return data.find((item) => isPrompt(item));
}

function completedBeforePrompt(data: KulalaRequestResult[]): KulalaRequestResult[] {
  const promptIndex = data.findIndex((item) => isPrompt(item));
  if (promptIndex <= 0) {
    return [];
  }
  return data.slice(0, promptIndex);
}

function promptBlockName(item: KulalaRequestResult): string | undefined {
  const name = item.blockName?.trim();
  return name || undefined;
}

function inferTextBodyKind(mediaType?: string): ResponseEntry["bodyKind"] {
  const mt = mediaType?.toLowerCase() ?? "";
  if (mt.includes("json")) return "json";
  if (mt.includes("html")) return "html";
  if (mt.includes("xml")) return "xml";
  return "text";
}

function headerRows(
  headers: Record<string, string> | undefined,
): Array<{ name: string; value: string }> {
  if (!headers) return [];
  return Object.entries(headers)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatRequestBody(body: string | undefined): { bodyKind: "text" | "json"; body: string } {
  if (!body) return { bodyKind: "text", body: "" };
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const text = JSON.stringify(JSON.parse(body), null, 2);
      return { bodyKind: "json", body: text };
    } catch {
      // not JSON
    }
  }
  return { bodyKind: "text", body };
}

function verboseBodyFromDisplay(display: {
  text: string;
  kind: ResponseEntry["bodyKind"];
  binaryNote?: string;
}): {
  bodyKind: "text" | "json";
  body: string;
} {
  if (display.kind === "json") return { bodyKind: "json", body: display.text };
  if (display.kind === "image")
    return { bodyKind: "text", body: "(image response - see Body tab)" };
  if (display.kind === "binary")
    return { bodyKind: "text", body: display.binaryNote ?? "(binary body omitted)" };
  return { bodyKind: "text", body: display.text };
}

function bodyToDisplay(body: KulalaRequestResult["body"]): {
  text: string;
  kind: ResponseEntry["bodyKind"];
  html?: string;
  imageSrc?: string;
  binaryNote?: string;
} {
  if (!body) {
    return { text: "", kind: "text" };
  }
  if (body.type === "json") {
    const text = body.formatted ?? JSON.stringify(body.content, null, 2);
    return { text, kind: "json" };
  }
  if (body.type === "binary") {
    const note = `${body.byteLength} bytes (${body.mediaType ?? "application/octet-stream"})`;
    if (body.mediaType?.startsWith("image/")) {
      return {
        text: note,
        kind: "image",
        imageSrc: `data:${body.mediaType};base64,${body.content}`,
      };
    }
    return { text: note, kind: "binary", binaryNote: note };
  }
  const kind = inferTextBodyKind(body.mediaType);
  return { text: body.content, kind };
}

function resultToEntry(item: KulalaRequestResult): ResponseEntry {
  const display = bodyToDisplay(item.filteredBody ?? item.body);
  const verboseDisplay = bodyToDisplay(item.body);
  return {
    id: randomUUID(),
    blockName: item.blockName,
    success: item.success,
    status: item.status,
    error: item.error,
    url: item.url ?? item.request?.url,
    headers: item.headers,
    timings: item.timings,
    scriptConsole: item.scriptConsole,
    verbose: {
      requestHeadersRows: headerRows(item.request?.headers),
      requestBody: formatRequestBody(item.request?.body),
      responseHeadersRows: headerRows(item.headers),
      responseBody: verboseBodyFromDisplay(verboseDisplay),
    },
    body: display.text,
    bodyKind: display.kind,
    bodyHtml: display.html,
    bodyImageSrc: display.imageSrc,
    binaryNote: display.binaryNote,
    rawBody: item.rawBody,
    contentType:
      item.body?.type === "json"
        ? "application/json"
        : item.body?.type === "text"
          ? item.body.mediaType
          : undefined,
    jqFilter: item.jqFilter,
    protocol: item.protocol,
    wsConnected: item.protocol === "websocket" ? false : undefined,
    wsClosed: item.protocol === "websocket" ? false : undefined,
  };
}

export class RequestRunner {
  private running = false;
  private pendingPrompts = new Map<
    string,
    (value: Array<{ id: string; value: string }> | undefined) => void
  >();
  private wsHandle: import("./bridge").WebSocketSessionHandle | undefined;
  private wsEntryId: string | undefined;
  private lastCtx: RunDocumentContext | undefined;

  constructor(
    private readonly bridge: KulalaCoreBridge,
    private getMainWindow: () => BrowserWindow | undefined,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  resolvePrompt(promptId: string, inputs: Array<{ id: string; value: string }> | undefined): void {
    const resolve = this.pendingPrompts.get(promptId);
    if (resolve) {
      this.pendingPrompts.delete(promptId);
      resolve(inputs);
    }
  }

  private async collectPromptInputs(
    prompt: KulalaRequestResult,
  ): Promise<Array<{ id: string; value: string }> | undefined> {
    const specs = prompt.inputs ?? [];
    if (!specs.length || !prompt.promptId) {
      return undefined;
    }

    const win = this.getMainWindow();
    if (!win) return undefined;

    const request: PromptRequest = {
      id: prompt.promptId,
      message: prompt.message,
      inputs: specs,
    };

    return new Promise((resolve) => {
      this.pendingPrompts.set(prompt.promptId!, resolve);
      win.webContents.send("kulala:prompt", request);
    });
  }

  async runBlock(
    ctx: RunDocumentContext,
    blockName: string,
    callbacks: RunCallbacks,
  ): Promise<void> {
    return this.run(ctx, [{ filter: "name", name: blockName }], callbacks);
  }

  async runAll(ctx: RunDocumentContext, callbacks: RunCallbacks): Promise<void> {
    return this.run(ctx, undefined, callbacks);
  }

  async runAtLine(
    ctx: RunDocumentContext,
    line: number,
    column: number,
    callbacks: RunCallbacks,
  ): Promise<void> {
    return this.run(ctx, [{ filter: "cursorPosition", line, column }], callbacks);
  }

  private async run(
    ctx: RunDocumentContext,
    limit: KulalaRunLimit[] | undefined,
    callbacks: RunCallbacks,
  ): Promise<void> {
    if (this.running) {
      callbacks.onError("A Kulala request is already running.");
      return;
    }
    this.running = true;
    this.lastCtx = ctx;
    callbacks.onRunningChange(true);

    try {
      await this.runWithRetry(ctx, ctx.env, limit, 0, callbacks);
    } finally {
      this.running = false;
      callbacks.onRunningChange(false);
    }
  }

  private async runWithRetry(
    ctx: RunDocumentContext,
    env: string,
    limit: KulalaRunLimit[] | undefined,
    depth: number,
    callbacks: RunCallbacks,
  ): Promise<void> {
    if (depth > MAX_PROMPT_DEPTH) {
      callbacks.onError("Kulala: exceeded prompt / retry limit.");
      return;
    }

    const { wrapper, err } = await this.bridge.run(ctx.content, {
      filepath: ctx.filepath,
      env,
      limit,
      cwd: ctx.cwd,
    });

    if (err) {
      callbacks.onError(err);
      return;
    }

    await this.handleWrapper(wrapper, ctx, env, limit, depth, callbacks);
  }

  private async handleWrapper(
    wrapper: KulalaResponseWrapper | undefined,
    ctx: RunDocumentContext,
    env: string,
    limit: KulalaRunLimit[] | undefined,
    depth: number,
    callbacks: RunCallbacks,
  ): Promise<void> {
    if (wrapper?.type === "error") {
      callbacks.onError(wrapper.data?.[0]?.error ?? "kulala-core error");
      return;
    }

    const data = wrapper?.data ?? [];
    if (data.length === 0) {
      callbacks.onError("Kulala: no result from kulala-core.");
      return;
    }

    const promptItem = findFirstPrompt(data);
    if (promptItem) {
      const completedBefore = completedBeforePrompt(data);
      await this.deliverResultItems(completedBefore, ctx, callbacks);

      const inputs = await this.collectPromptInputs(promptItem);
      if (!inputs || !promptItem.promptId) {
        callbacks.onError("Prompt cancelled or incomplete.");
        return;
      }

      const cont = await this.bridge.continue(promptItem.promptId, inputs, ctx.cwd);
      if (cont.err) {
        callbacks.onError(cont.err);
        return;
      }

      const contFirst = cont.wrapper?.data?.[0];
      if (!contFirst?.success) {
        callbacks.onError(contFirst?.error ?? "continue did not succeed");
        return;
      }

      const blockName = promptBlockName(promptItem);
      const retryLimit: KulalaRunLimit[] | undefined =
        completedBefore.length > 0 && blockName ? [{ filter: "name", name: blockName }] : limit;

      return this.runWithRetry(ctx, env, retryLimit, depth + 1, callbacks);
    }

    await this.deliverResultItems(data, ctx, callbacks);
  }

  private emitResponses(entries: ResponseEntry[], callbacks: RunCallbacks): void {
    if (entries.length === 0) return;
    if (callbacks.onResponses) {
      callbacks.onResponses(entries);
      return;
    }
    for (const entry of entries) {
      callbacks.onResponse(entry);
    }
  }

  private async deliverResultItems(
    items: KulalaRequestResult[],
    ctx: RunDocumentContext,
    callbacks: RunCallbacks,
  ): Promise<void> {
    const pending: ResponseEntry[] = [];

    for (const item of items) {
      if (item.skipped && item.success) {
        continue;
      }
      if (item.protocol === "websocket") {
        this.emitResponses(pending, callbacks);
        pending.length = 0;
        await this.startWebSocket(item, ctx, callbacks);
        continue;
      }
      pending.push(resultToEntry(item));
    }

    this.emitResponses(pending, callbacks);
  }

  private async startWebSocket(
    item: KulalaRequestResult,
    ctx: RunDocumentContext,
    callbacks: RunCallbacks,
  ): Promise<void> {
    this.closeWebSocket();

    const entry = resultToEntry(item);
    callbacks.onResponse(entry);
    this.wsEntryId = entry.id;

    const url = item.url ?? item.request?.url ?? "";
    const headers = item.request?.headers;
    const body = item.request?.body ?? item.initialMessage;

    this.wsHandle = await this.bridge.websocketStart(
      { url, body, headers },
      {
        onEvent: (ev) => {
          if (this.wsEntryId) {
            callbacks.onWebSocketEvent(this.wsEntryId, ev);
          }
        },
      },
      ctx.cwd,
    );
  }

  closeWebSocket(): void {
    if (this.wsHandle) {
      this.wsHandle.close();
      this.wsHandle.kill();
      this.wsHandle = undefined;
    }
    this.wsEntryId = undefined;
  }

  sendWebSocketMessage(message: string): boolean {
    if (!this.wsHandle) return false;
    this.wsHandle.send(message);
    return true;
  }

  cancel(): void {
    this.closeWebSocket();
    this.bridge.cancelActive();
    for (const [, resolve] of this.pendingPrompts) {
      resolve(undefined);
    }
    this.pendingPrompts.clear();
  }

  async applyJqFilter(
    rawBody: string,
    filter: string,
    contentType?: string,
  ): Promise<{ entry?: Partial<ResponseEntry>; err?: string }> {
    const trimmed = filter.trim();
    const { result, err } = await this.bridge.applyJqFilter(
      rawBody,
      trimmed || ".",
      contentType ?? "application/json",
      this.lastCtx?.cwd,
    );
    if (!result?.filteredBody) {
      return { err: err ?? "jq filter failed" };
    }
    const display = bodyToDisplay(result.filteredBody);
    return {
      entry: {
        body: display.text,
        bodyKind: display.kind,
        bodyHtml: display.html,
        bodyImageSrc: display.imageSrc,
        binaryNote: display.binaryNote,
        jqFilter: trimmed || undefined,
      },
    };
  }
}
