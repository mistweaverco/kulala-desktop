import type { ResponseEntry } from "../env.d";

export type ResponseBodyLanguage = "json" | "html" | "xml" | "javascript" | "plaintext";

export function inferResponseBodyLanguage(entry: ResponseEntry): ResponseBodyLanguage {
  if (entry.bodyKind === "json") return "json";
  if (entry.bodyKind === "html") return "html";
  if (entry.bodyKind === "xml") return "xml";

  const ct = entry.contentType?.toLowerCase() ?? "";
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "javascript";

  return "plaintext";
}
