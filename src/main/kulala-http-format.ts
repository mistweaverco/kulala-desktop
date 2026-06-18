/**
 * Remove implicit `lang=js` from inline Kulala script openings.
 * JavaScript is the default script language and should be written as `{%` only.
 */
export function stripImplicitScriptLangJs(content: string): string {
  return content.replace(/\{%\s*lang\s*=\s*js\b/gi, "{%");
}

export function postProcessFormattedHttp(content: string): string {
  return stripImplicitScriptLangJs(content);
}
