export type KulalaGraphQLBodyContent = {
  query: string;
  variables?: Record<string, unknown>;
  variablesSourceText?: string;
};

export function parseGraphQLVariablesJson(content: string): Record<string, unknown> | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  try {
    const jsonStr = trimmed
      .replace(/\\\{/g, "{")
      .replace(/\\\}/g, "}")
      .replace(/,(\s*[}\]])/g, "$1");
    const parsed = JSON.parse(jsonStr) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function parseGraphQLContent(content: string): KulalaGraphQLBodyContent {
  const parts = content
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const query = (parts[0] ?? "").replace(/\\\{/g, "{").replace(/\\\}/g, "}");
  let variables: Record<string, unknown> | undefined;

  if (parts.length > 1) {
    const variablesPart = parts[1]!;
    variables = parseGraphQLVariablesJson(variablesPart);
    if (variables === undefined) {
      return { query, variablesSourceText: variablesPart };
    }
  }

  return {
    query,
    ...(variables !== undefined ? { variables } : {}),
  };
}

export function formatGraphQLBody(query: string, variablesText: string): string {
  const q = query.trim();
  const v = variablesText.trim();
  if (!v) return q;
  return `${q}\n\n${v}`;
}

export function graphQLBodyToVariablesText(
  variables?: Record<string, unknown>,
  variablesSourceText?: string,
): string {
  if (variablesSourceText) return variablesSourceText;
  if (variables && Object.keys(variables).length > 0) {
    return JSON.stringify(variables, null, 2);
  }
  return "";
}
