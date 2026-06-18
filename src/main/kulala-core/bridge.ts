import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { effectiveDataDir, timeoutMs } from "./config";
import { ensureCoreInstalled } from "./installer";
import type {
  KulalaDocument,
  KulalaEnvironmentCatalog,
  KulalaHttpSerdeSerializeOptions,
  KulalaJqFilterResult,
  KulalaResponseWrapper,
  KulalaRunLimit,
  KulalaSerializeResult,
  KulalaLspFiletype,
  LspCompletionItem,
  LspCompletionList,
  LspHover,
} from "./types";

export type WebSocketConnectOptions = {
  url: string;
  body?: string;
  headers?: Record<string, string>;
};

export type WebSocketEvent =
  | { type: "ready" }
  | { type: "message"; data: string }
  | { type: "error"; error: string }
  | { type: "closed"; code?: number };

export type WebSocketSessionHandle = {
  send(data: string): void;
  close(): void;
  kill(): void;
  readonly pid: number | undefined;
};

export type LspRequestOpts = {
  filepath?: string;
  cwd?: string;
  env?: string;
  filetype?: KulalaLspFiletype;
};

type CorePayload = Record<string, unknown>;

type InvokeResult = { stdout: string; stderr: string; code: number };

const ENVIRONMENT_CACHE_MS = 30_000;
const KILL_GRACE_MS = 2_000;

export class KulalaCoreBridge {
  private invokeChildren = new Set<ChildProcessWithoutNullStreams>();
  private wsChild: ChildProcessWithoutNullStreams | undefined;
  private inFlight = new Map<string, Promise<InvokeResult>>();
  private environmentCatalogCache = new Map<
    string,
    { at: number; catalog: KulalaEnvironmentCatalog }
  >();

  async executable(): Promise<string> {
    return ensureCoreInstalled();
  }

  cancelActive(): boolean {
    return this.killAllInvokeChildren();
  }

  killAll(): void {
    this.killAllInvokeChildren();
    if (this.wsChild) {
      this.terminateProcess(this.wsChild);
      this.wsChild = undefined;
    }
  }

  private killAllInvokeChildren(): boolean {
    if (this.invokeChildren.size === 0) {
      return false;
    }
    for (const child of [...this.invokeChildren]) {
      this.terminateProcess(child);
    }
    return true;
  }

  private terminateProcess(child: ChildProcessWithoutNullStreams): void {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (child.exitCode != null || child.killed) return;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, KILL_GRACE_MS).unref();
  }

  private env(): NodeJS.ProcessEnv {
    return { ...process.env, KULALA_CORE_DATA_DIR: effectiveDataDir() };
  }

  private invokeKey(payload: CorePayload, cwd?: string): string {
    return `${cwd ?? ""}\0${JSON.stringify(payload)}`;
  }

  private invoke(payload: CorePayload, cwd?: string): Promise<InvokeResult> {
    const key = this.invokeKey(payload, cwd);
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = this.spawnInvoke(payload, cwd).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private writeStdinLine(child: ChildProcessWithoutNullStreams, line: string): void {
    if (child.stdin.destroyed || !child.stdin.writable) return;
    try {
      child.stdin.write(line);
      child.stdin.end();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPIPE") {
        throw err;
      }
    }
  }

  private spawnInvoke(payload: CorePayload, cwd?: string): Promise<InvokeResult> {
    return new Promise((resolve, reject) => {
      this.executable()
        .then((exe) => {
          const timeout = timeoutMs();
          const child = spawn(exe, [], {
            cwd: cwd && cwd.length > 0 ? cwd : undefined,
            env: this.env(),
            stdio: ["pipe", "pipe", "pipe"],
          });
          this.invokeChildren.add(child);

          let stdout = "";
          let stderr = "";
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (c) => {
            stdout += c;
          });
          child.stderr.on("data", (c) => {
            stderr += c;
          });
          child.stdin.on("error", () => {
            /* Child exited before stdin was fully written (e.g. broken kulala-core). */
          });

          const timer =
            timeout > 0
              ? setTimeout(() => {
                  this.terminateProcess(child);
                }, timeout)
              : undefined;
          timer?.unref();

          child.on("error", (err) => {
            if (timer) clearTimeout(timer);
            this.invokeChildren.delete(child);
            reject(err);
          });

          child.on("close", (code) => {
            if (timer) clearTimeout(timer);
            this.invokeChildren.delete(child);
            resolve({ stdout, stderr, code: code ?? 1 });
          });

          this.writeStdinLine(child, `${JSON.stringify(payload)}\n`);
        })
        .catch(reject);
    });
  }

  static tryDecodeWrapper(stdout: string): KulalaResponseWrapper | undefined {
    const raw = stdout.trim();
    if (!raw) return undefined;
    try {
      const w = JSON.parse(raw) as KulalaResponseWrapper;
      if (w && typeof w === "object" && w.type) return w;
    } catch {
      /* ignore */
    }
    return undefined;
  }

  private runResultFromJob(job: { stdout: string; stderr: string; code: number }): {
    wrapper?: KulalaResponseWrapper;
    err?: string;
  } {
    const wrapper = KulalaCoreBridge.tryDecodeWrapper(job.stdout);
    const isPrompt =
      wrapper?.type === "responses" &&
      (wrapper.data ?? []).some(
        (item) => item.prompt === true || Boolean(item.promptId && item.promptType),
      );

    if (job.code !== 0 && !isPrompt) {
      const err = job.stderr.trim() || `kulala-core failed (exit ${job.code})`;
      return { err };
    }
    if (!wrapper) {
      return { err: "invalid kulala-core output" };
    }
    return { wrapper };
  }

  async parse(
    content: string,
    filepath?: string,
    cwd?: string,
  ): Promise<{ doc?: KulalaDocument; err?: string }> {
    const payload: CorePayload = { action: "parse", content };
    if (filepath) payload.filepath = filepath;
    const job = await this.invoke(payload, cwd);
    try {
      const raw = (job.stdout || job.stderr).trim();
      const doc = JSON.parse(raw) as KulalaDocument;
      if (doc?.blocks) return { doc };
    } catch {
      /* fall through */
    }
    if (job.code !== 0) {
      return { err: job.stderr.trim() || "kulala-core parse failed" };
    }
    return { err: "invalid kulala-core parse output" };
  }

  async serialize(
    doc: KulalaDocument,
    filepath?: string,
    options: KulalaHttpSerdeSerializeOptions = {},
    cwd?: string,
  ): Promise<{ content?: string; err?: string }> {
    const payload: CorePayload = {
      action: "serialize",
      doc,
      includeExpandedBlocks: options.includeExpandedBlocks,
      preserveBodyText: options.preserveBodyText,
    };
    if (filepath) payload.filepath = filepath;
    const job = await this.invoke(payload, cwd);
    try {
      const result = JSON.parse(job.stdout.trim()) as KulalaSerializeResult;
      if (result.success && result.content != null) {
        return { content: result.content };
      }
      return { err: result.error ?? "kulala-core serialize failed" };
    } catch {
      return { err: job.stderr.trim() || "invalid kulala-core serialize output" };
    }
  }

  async run(
    content: string,
    opts: { filepath?: string; env: string; limit?: KulalaRunLimit[]; cwd?: string },
  ): Promise<{ wrapper?: KulalaResponseWrapper; err?: string }> {
    const payload: CorePayload = {
      action: "run",
      content,
      env: opts.env,
    };
    if (opts.filepath) payload.filepath = opts.filepath;
    if (opts.limit?.length) payload.limit = opts.limit;
    const job = await this.invoke(payload, opts.cwd);
    return this.runResultFromJob(job);
  }

  async continue(
    promptId: string,
    inputs: Array<{ id: string; value: string }>,
    cwd?: string,
  ): Promise<{ wrapper?: KulalaResponseWrapper; err?: string }> {
    const job = await this.invoke({ action: "continue", promptId, inputs }, cwd);
    return this.runResultFromJob(job);
  }

  async listEnvironments(
    cwd: string,
  ): Promise<{ catalog?: KulalaEnvironmentCatalog; err?: string }> {
    const cached = this.environmentCatalogCache.get(cwd);
    if (cached && Date.now() - cached.at < ENVIRONMENT_CACHE_MS) {
      return { catalog: cached.catalog };
    }

    const job = await this.invoke({ action: "environments", cwd }, cwd);
    const raw = job.stdout.trim();
    if (!raw) {
      return { err: job.stderr.trim() || "kulala-core environments failed" };
    }
    try {
      const catalog = JSON.parse(raw) as KulalaEnvironmentCatalog;
      if (catalog?.environments && typeof catalog.environments === "object") {
        this.environmentCatalogCache.set(cwd, { at: Date.now(), catalog });
        return { catalog };
      }
    } catch {
      /* ignore */
    }
    return { err: "invalid kulala-core environments output" };
  }

  async lspCompletion(
    content: string,
    line: number,
    column: number,
    opts: LspRequestOpts = {},
  ): Promise<LspCompletionItem[]> {
    const job = await this.invoke(
      {
        action: "lsp_completion",
        content,
        filepath: opts.filepath,
        line,
        column,
        env: opts.env ?? "default",
        filetype: opts.filetype ?? "http",
      },
      opts.cwd,
    );
    try {
      const parsed = JSON.parse(job.stdout.trim()) as LspCompletionList | LspCompletionItem[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return parsed.items ?? [];
    } catch {
      return [];
    }
  }

  async lspHover(
    content: string,
    line: number,
    column: number,
    opts: LspRequestOpts = {},
  ): Promise<LspHover | undefined> {
    const job = await this.invoke(
      {
        action: "lsp_hover",
        content,
        filepath: opts.filepath,
        line,
        column,
        env: opts.env ?? "default",
        filetype: opts.filetype ?? "http",
      },
      opts.cwd,
    );
    const raw = job.stdout.trim();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as LspHover;
    } catch {
      return undefined;
    }
  }

  async toCurl(
    content: string,
    filepath: string | undefined,
    line: number,
    column: number,
    cwd?: string,
  ): Promise<string | undefined> {
    const job = await this.invoke({ action: "to_curl", content, filepath, line, column }, cwd);
    const raw = job.stdout.trim();
    if (!raw) return undefined;
    try {
      const result = JSON.parse(raw) as { ok?: boolean; curl?: string };
      if (result.ok && typeof result.curl === "string") return result.curl;
    } catch {
      return raw;
    }
    return undefined;
  }

  async fromCurl(curl: string, cwd?: string): Promise<string | undefined> {
    const job = await this.invoke({ action: "from_curl", curl }, cwd);
    const raw = job.stdout.trim();
    if (!raw) return undefined;
    try {
      const result = JSON.parse(raw) as { ok?: boolean; lines?: string[] };
      if (result.ok && Array.isArray(result.lines)) return result.lines.join("\n");
    } catch {
      return raw;
    }
    return undefined;
  }

  async inspectRequest(
    content: string,
    filepath: string | undefined,
    line: number,
    column: number,
    env: string,
    cwd?: string,
  ): Promise<string | undefined> {
    const job = await this.invoke(
      { action: "inspect_request", content, filepath, line, column, env },
      cwd,
    );
    return job.stdout.trim() || undefined;
  }

  async clearGlobals(cwd?: string): Promise<void> {
    await this.invoke({ action: "clear_globals" }, cwd);
  }

  async applyJqFilter(
    rawBody: string,
    filter: string,
    contentType?: string,
    cwd?: string,
  ): Promise<{ result?: KulalaJqFilterResult; err?: string }> {
    const job = await this.invoke(
      {
        action: "apply_jq_filter",
        rawBody,
        filter,
        contentType: contentType ?? "application/json",
      },
      cwd,
    );
    const raw = job.stdout.trim();
    if (!raw) {
      return { err: job.stderr.trim() || "kulala-core apply_jq_filter failed" };
    }
    try {
      const result = JSON.parse(raw) as KulalaJqFilterResult;
      if (result.success && result.filteredBody) {
        return { result };
      }
      return { err: result.error ?? "jq filter failed" };
    } catch {
      return { err: "invalid kulala-core apply_jq_filter output" };
    }
  }

  async websocketStart(
    connect: WebSocketConnectOptions,
    handlers: {
      onEvent: (event: WebSocketEvent) => void;
      onExit?: (code: number | null) => void;
    },
    cwd?: string,
  ): Promise<WebSocketSessionHandle | undefined> {
    const exe = await this.executable();
    const tmp = path.join(
      os.tmpdir(),
      `kulala-ws-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    fs.writeFileSync(tmp, JSON.stringify(connect), "utf8");

    const child = spawn(exe, ["--websocket", "-i", tmp], {
      cwd: cwd && cwd.length > 0 ? cwd : undefined,
      env: this.env(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.wsChild = child;

    let stdoutBuf = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const flushLines = (chunk: string) => {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as {
            type?: string;
            data?: string;
            error?: string;
            code?: number;
          };
          if (msg.type === "ready") handlers.onEvent({ type: "ready" });
          else if (msg.type === "message" && msg.data != null) {
            handlers.onEvent({ type: "message", data: msg.data });
          } else if (msg.type === "error") {
            handlers.onEvent({ type: "error", error: msg.error ?? "WebSocket error" });
          } else if (msg.type === "closed") {
            handlers.onEvent({ type: "closed", code: msg.code });
          }
        } catch {
          /* ignore malformed lines */
        }
      }
    };

    child.stdout.on("data", flushLines);
    child.stderr.on("data", (c: string) => {
      const text = c.trim();
      if (text) handlers.onEvent({ type: "error", error: text });
    });
    child.stdin.on("error", () => {
      /* Ignore EPIPE when the child exits early. */
    });

    child.on("close", (code) => {
      if (this.wsChild === child) {
        this.wsChild = undefined;
      }
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      handlers.onExit?.(code);
    });

    return {
      pid: child.pid,
      send(data: string) {
        if (child.stdin.destroyed || !child.stdin.writable) return;
        try {
          child.stdin.write(`${JSON.stringify({ op: "send", data })}\n`);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== "EPIPE") throw err;
        }
      },
      close() {
        if (child.stdin.destroyed || !child.stdin.writable) return;
        try {
          child.stdin.write(`${JSON.stringify({ op: "close" })}\n`);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== "EPIPE") throw err;
        }
      },
      kill() {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode != null || child.killed) return;
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, KILL_GRACE_MS).unref();
      },
    };
  }
}
