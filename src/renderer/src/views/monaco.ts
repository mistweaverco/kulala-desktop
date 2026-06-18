import * as monaco from "monaco-editor";
import { createExpandedSuggestStorageService } from "../kulala/completion/monaco-editor-options";
import themeData from "./monaco-theme.json";

const themeDataCast = themeData as monaco.editor.IStandaloneThemeData;
const MONACO_DEBUG = import.meta.env.DEV && import.meta.env.VITE_MONACO_DEBUG === "1";
const MONACO_SELFTEST = import.meta.env.DEV && import.meta.env.VITE_MONACO_SELFTEST === "1";

// Eager language contributions so tokenizers/providers are registered deterministically.
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import "monaco-editor/esm/vs/language/html/monaco.contribution.js";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution.js";
import "monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution.js";

// Workers:
// - Monaco core workers work fine as module workers via `?worker&url`.
// - Avoid monaco-graphql workers entirely; they can fail in Electron+Vite and force Monaco into
//   main-thread worker fallback (which delays tokenization/highlighting).
import editorWorkerUrl from "monaco-editor/esm/vs/editor/editor.worker?worker&url";
import htmlWorkerUrl from "monaco-editor/esm/vs/language/html/html.worker?worker&url";
import jsonWorkerUrl from "monaco-editor/esm/vs/language/json/json.worker?worker&url";
import tsWorkerUrl from "monaco-editor/esm/vs/language/typescript/ts.worker?worker&url";

monaco.languages.register({ id: "graphql" });
monaco.languages.register({ id: "xml" });

monaco.editor.defineTheme("custom-theme", themeDataCast);
monaco.editor.setTheme("custom-theme");

// Monaco language services can do expensive validation/marker computation that isn't useful
// for our use-cases (especially read-only response viewers) and can delay tokenization.
try {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
} catch {
  // ignore
}
try {
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
} catch {
  // ignore
}

function workerUrlForLabel(label: string): URL {
  switch (label) {
    case "json":
      return new URL(jsonWorkerUrl, import.meta.url);
    case "html":
    case "xml":
      return new URL(htmlWorkerUrl, import.meta.url);
    case "typescript":
    case "javascript":
      return new URL(tsWorkerUrl, import.meta.url);
    default:
      return new URL(editorWorkerUrl, import.meta.url);
  }
}

type MonacoWorkerDescriptor = {
  moduleId?: string;
  label?: string;
};

function workerUrlForRequest(
  firstArg: string | MonacoWorkerDescriptor,
  secondArg: string,
): { url: URL; resolvedLabel: string; moduleId?: string } {
  // Monaco can call:
  // - getWorker(workerId, label) for built-in language workers
  // - getWorker(descriptor, workerId) for editor.createWebWorker(...) calls
  if (typeof firstArg === "string") {
    const resolvedLabel = secondArg;
    return { url: workerUrlForLabel(resolvedLabel), resolvedLabel };
  }

  const moduleId = firstArg?.moduleId;
  const descriptorLabel = firstArg?.label;
  // Default: prefer descriptor label if present, else fall back to worker id.
  const resolvedLabel = descriptorLabel ?? secondArg;
  return { url: workerUrlForLabel(resolvedLabel), resolvedLabel, moduleId };
}

self.MonacoEnvironment = {
  // Some Monaco codepaths prefer `getWorkerUrl` (and will behave badly if it
  // returns undefined), so provide both.
  getWorkerUrl: function (firstArg: string | MonacoWorkerDescriptor, secondArg: string): string {
    const { url, resolvedLabel, moduleId } = workerUrlForRequest(firstArg, secondArg);
    if (MONACO_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug("[monaco] worker_url", {
        label: resolvedLabel,
        workerId: typeof firstArg === "string" ? firstArg : secondArg,
        moduleId,
        url: url.toString(),
      });
    }
    return url.toString();
  },
  getWorker: function (firstArg: string | MonacoWorkerDescriptor, secondArg: string): Worker {
    const startedAt = MONACO_DEBUG ? performance.now() : 0;
    try {
      const { url, resolvedLabel, moduleId } = workerUrlForRequest(firstArg, secondArg);

      const worker = new Worker(url, { type: "module" });
      worker.onerror = (evt) => {
        // eslint-disable-next-line no-console
        console.error("[monaco] worker_runtime_error", {
          label: resolvedLabel,
          workerId: typeof firstArg === "string" ? firstArg : secondArg,
          moduleId,
          url: url.toString(),
          evt,
        });
      };
      if (MONACO_DEBUG) {
        // eslint-disable-next-line no-console
        console.debug("[monaco] worker", {
          label: resolvedLabel,
          workerId: typeof firstArg === "string" ? firstArg : secondArg,
          moduleId,
          ms: Math.round(performance.now() - startedAt),
          url: url.toString(),
        });
      }
      return worker;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[monaco] worker_failed", { err, firstArg, secondArg });
      // Last resort: return the editor worker if the specific worker failed.
      return new Worker(new URL(editorWorkerUrl, import.meta.url), { type: "module" });
    }
  },
};

/** Standalone Monaco only applies IStorageService overrides on the first editor. */
let suggestStorageBootstrapped = false;
let languageWarmupBootstrapped = false;

function ensureExpandedSuggestStorage(): void {
  if (suggestStorageBootstrapped) return;
  const root = document.body ?? document.documentElement;
  if (!root) return;
  suggestStorageBootstrapped = true;

  const mount = document.createElement("div");
  mount.style.cssText =
    "position:fixed;left:-10000px;width:1px;height:1px;opacity:0;pointer-events:none";
  root.appendChild(mount);
  try {
    const editor = monaco.editor.create(
      mount,
      { value: "", language: "plaintext" },
      createExpandedSuggestStorageService(),
    );
    editor.dispose();
  } finally {
    mount.remove();
  }
}

function ensureLanguageWarmup(): void {
  if (languageWarmupBootstrapped) return;
  languageWarmupBootstrapped = true;
  // Force language contributions + workers to spin up early.
  const models = [
    monaco.editor.createModel("{}", "json"),
    monaco.editor.createModel("<div></div>", "html"),
    monaco.editor.createModel("<root />", "xml"),
    monaco.editor.createModel("console.log('x')", "javascript"),
    monaco.editor.createModel("const x: number = 1", "typescript"),
    monaco.editor.createModel("local x = 1", "lua"),
    monaco.editor.createModel("query Q { __typename }", "graphql"),
  ];
  for (const m of models) m.dispose();
}

function scheduleMonacoSelfTest(): void {
  if (!MONACO_SELFTEST) return;
  queueMicrotask(() => {
    const langs = ["json", "html", "xml", "javascript", "typescript", "lua", "graphql"] as const;
    const createdAt = performance.now();
    // eslint-disable-next-line no-console
    console.debug("[monaco] selftest_start", { langs });

    // Keep models alive briefly; disposing immediately after first token/deco change can race
    // with Monaco's internal async tokenization reset and throw "Model is disposed!".
    const models: monaco.editor.ITextModel[] = [];

    for (const lang of langs) {
      const model = monaco.editor.createModel("x", lang);
      models.push(model);
      const startedAt = performance.now();
      let done = false;
      const anyModel = model as unknown as {
        onDidChangeTokens?: (listener: () => void) => monaco.IDisposable;
      };
      const subscribe =
        anyModel.onDidChangeTokens?.bind(anyModel) ?? model.onDidChangeDecorations.bind(model);
      const disp = subscribe(() => {
        if (done) return;
        done = true;
        disp.dispose();
        const ms = Math.round(performance.now() - startedAt);
        // eslint-disable-next-line no-console
        console.debug("[monaco] selftest_tokens", { lang, ms });
      });
      window.setTimeout(() => {
        if (done) return;
        done = true;
        disp.dispose();
        // eslint-disable-next-line no-console
        console.warn("[monaco] selftest_timeout", {
          lang,
          waitedMs: Math.round(performance.now() - startedAt),
        });
      }, 1500);
    }

    // Dispose all selftest models after a grace period.
    window.setTimeout(() => {
      for (const m of models) m.dispose();
    }, 2500);

    if (MONACO_DEBUG) {
      window.setTimeout(() => {
        // eslint-disable-next-line no-console
        console.debug("[monaco] selftest_done", {
          totalMs: Math.round(performance.now() - createdAt),
        });
      }, 1600);
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        ensureExpandedSuggestStorage();
        ensureLanguageWarmup();
        scheduleMonacoSelfTest();
      },
      { once: true },
    );
  } else {
    ensureExpandedSuggestStorage();
    ensureLanguageWarmup();
    scheduleMonacoSelfTest();
  }
}

export { monaco };
