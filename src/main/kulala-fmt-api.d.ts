declare module "@mistweaverco/kulala-fmt/api" {
  export type FormatHttpTextOptions = {
    filepath?: string;
    formatBody?: boolean;
    kulalaCoreExecutablePath?: string;
  };

  export function formatHttpText(content: string, options?: FormatHttpTextOptions): Promise<string>;
}
