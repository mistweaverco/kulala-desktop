import type { LspHover } from "./script-lsp";

export function toMonacoHoverContents(
  hover: LspHover,
): Array<{ value: string; isTrusted?: boolean; supportHtml?: boolean }> {
  const contents = hover.contents;
  if (typeof contents === "string") {
    return [{ value: contents, isTrusted: true }];
  }
  return [
    {
      value: contents.value,
      isTrusted: true,
      supportHtml: contents.kind === "markdown",
    },
  ];
}
