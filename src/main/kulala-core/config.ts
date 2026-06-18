import * as path from "node:path";
import { app } from "electron";
import settings from "electron-settings";
import { DEFAULT_CORE_VERSION, DEFAULT_DOWNLOAD_URL } from "./constants";

const PREFIX = "kulala.";

export function binInstallDir(): string {
  let defaultPath = path.join(path.dirname(app.getPath("exe")), "resources", "kulala-core");
  if (!app.isPackaged) {
    defaultPath = path.join(app.getAppPath(), "dist", "linux-unpacked",  "resources", "kulala-core");
  }
  return defaultPath;
}

export function corePath(): string | undefined {
  let defaultPath = path.join(binInstallDir(), "kulala-core");
  const p = (settings.getSync(`${PREFIX}corePath`) as string | undefined)?.trim();
  return p || defaultPath || process.env.KULALA_CORE_PATH?.trim() || undefined;
}

export function coreVersion(): string {
  return (settings.getSync(`${PREFIX}coreVersion`) as string | undefined) ?? DEFAULT_CORE_VERSION;
}

export function timeoutMs(): number {
  return (settings.getSync(`${PREFIX}timeout`) as number | undefined) ?? 60000;
}

export function defaultEnv(): string {
  return (settings.getSync(`${PREFIX}defaultEnv`) as string | undefined) ?? "default";
}

export function downloadUrlTemplate(): string {
  return (settings.getSync(`${PREFIX}downloadUrl`) as string | undefined) ?? DEFAULT_DOWNLOAD_URL;
}

/** Matches kulala-core `getKulalaCoreDataDir`. */
export function effectiveDataDir(): string {
  const override = (settings.getSync(`${PREFIX}dataDir`) as string | undefined)?.trim();
  if (override) {
    return override;
  }
  const fromEnv = process.env.KULALA_CORE_DATA_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const kulalaDir = path.join(path.dirname(app.getPath("userData")), "kulala");
  return path.join(kulalaDir, "kulala-core-data");
}

export function getSelectedEnv(filepath?: string): string {
  const key = filepath ? `${PREFIX}selectedEnv:${filepath}` : `${PREFIX}selectedEnv:global`;
  return (settings.getSync(key) as string | undefined) ?? defaultEnv();
}

export async function setSelectedEnv(env: string, filepath?: string): Promise<void> {
  const key = filepath ? `${PREFIX}selectedEnv:${filepath}` : `${PREFIX}selectedEnv:global`;
  await settings.set(key, env);
}

