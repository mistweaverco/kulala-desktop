import type { ScriptFormEntry } from "../../env.d";

export type KulalaScriptFiletype = "javascript" | "typescript" | "lua";

export type ScriptLspContext = {
  content: string;
  filepath?: string;
  env: string;
  filetype: KulalaScriptFiletype;
};

export type ScriptEditorLspConfig = {
  getContext: () => Omit<ScriptLspContext, "content"> | undefined;
};

export function scriptFormLangToFiletype(lang: ScriptFormEntry["lang"]): KulalaScriptFiletype {
  switch (lang) {
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "lua":
      return "lua";
  }
}

/** Synthetic path for inline scripts so kulala-core can resolve collection context. */
export function scriptFilepathForLsp(
  httpFilepath: string | undefined,
  script: ScriptFormEntry,
): string | undefined {
  if (script.source === "file" && script.filepath?.trim()) {
    return script.filepath.trim();
  }
  if (!httpFilepath) return undefined;
  const ext = script.lang === "js" ? "js" : script.lang === "ts" ? "ts" : "lua";
  return httpFilepath.replace(/\.(http|rest)$/i, `.inline.http.${ext}`);
}

export async function fetchScriptCompletions(
  ctx: ScriptLspContext,
  line: number,
  column: number,
): Promise<LspCompletionItem[]> {
  return window.KulalaApi.lspCompletion(ctx.content, line, column, {
    filepath: ctx.filepath,
    env: ctx.env,
    filetype: ctx.filetype,
  });
}

export async function fetchScriptHover(
  ctx: ScriptLspContext,
  line: number,
  column: number,
): Promise<LspHover | undefined> {
  return window.KulalaApi.lspHover(ctx.content, line, column, {
    filepath: ctx.filepath,
    env: ctx.env,
    filetype: ctx.filetype,
  });
}

export type LspCompletionItem = Awaited<ReturnType<typeof window.KulalaApi.lspCompletion>>[number];

export type LspHover = NonNullable<Awaited<ReturnType<typeof window.KulalaApi.lspHover>>>;
