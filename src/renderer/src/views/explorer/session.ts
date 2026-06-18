import type { KulalaDocument, RequestFormModel, ResponseEntry } from "../../env.d";

export type FormTab = "headers" | "body" | "pre-request" | "post-request";

export type ResponseViewTab = "body" | "headers" | "timings" | "console" | "tests" | "verbose";

export type TabResponseState = {
  entries: ResponseEntry[];
  activeId?: string;
  viewTab?: ResponseViewTab;
};

export const emptyTabResponseState = (): TabResponseState => ({
  entries: [],
  activeId: undefined,
  viewTab: "body",
});

export type FileSession = {
  filepath: string;
  fileName: string;
  document: KulalaDocument;
  fileContent: string;
  formModels: RequestFormModel[];
  savedFingerprint: string;
  selectedEnv: string;
};

export type RequestTab = {
  id: string;
  filepath: string;
  blockIndex: number;
  formTab: FormTab;
  editorSyntax: "text" | "json" | "html";
};

export function requestTabId(filepath: string, blockIndex: number): string {
  return `${filepath}::${blockIndex}`;
}

export function parseRequestTabId(id: string): { filepath: string; blockIndex: number } | null {
  const sep = id.lastIndexOf("::");
  if (sep <= 0) return null;
  const filepath = id.slice(0, sep);
  const blockIndex = Number(id.slice(sep + 2));
  if (Number.isNaN(blockIndex)) return null;
  return { filepath, blockIndex };
}

export function tabLabel(session: FileSession | undefined, tab: RequestTab): string {
  const form = session?.formModels.find((f) => f.blockIndex === tab.blockIndex);
  return form?.blockName ?? `Request ${tab.blockIndex + 1}`;
}
