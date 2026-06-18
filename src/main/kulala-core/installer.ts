import * as fs from "node:fs";
import * as path from "node:path";
import settings from "electron-settings";
import { DEFAULT_CORE_VERSION } from "./constants";
import {
  binInstallDir,
  corePath,
  coreVersion,
  defaultEnv,
  downloadUrlTemplate,
  timeoutMs,
} from "./config";
import { bundledBinaryPath, installedBinaryName, releaseAssetName } from "./platform";

function versionFile(): string {
  return path.join(binInstallDir(), "version.txt");
}

export function getInstalledVersion(): string | undefined {
  try {
    return fs.readFileSync(versionFile(), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
}

export async function ensureCoreInstalled(): Promise<string> {
  const configured = corePath();
  if (configured) {
    if (!fs.existsSync(configured)) {
      throw new Error(`kulala.corePath does not exist: ${configured}`);
    }
    return configured;
  }

  const bundled = bundledBinaryPath();
  if (bundled && fs.existsSync(bundled)) {
    return bundled;
  }

  const version = coreVersion();
  const binPath = path.join(binInstallDir(), installedBinaryName());
  const installed = getInstalledVersion();

  if (fs.existsSync(binPath) && installed === version) {
    return binPath;
  }

  await fs.promises.mkdir(binInstallDir(), { recursive: true });

  const asset = releaseAssetName();
  const tag = `v${version}`;
  const url = downloadUrlTemplate().replace("%s", tag).replace("%s", asset);
  const tmp = `${binPath}.download`;

  await downloadFile(url, tmp);
  await fs.promises.rename(tmp, binPath);
  if (process.platform !== "win32") {
    await fs.promises.chmod(binPath, 0o755);
  }
  await fs.promises.writeFile(versionFile(), version, "utf8");

  return binPath;
}

export async function getKulalaSettings(): Promise<Record<string, unknown>> {
  return {
    corePath: corePath() ?? "",
    coreVersion: coreVersion(),
    dataDir: (settings.getSync("kulala.dataDir") as string | undefined) ?? "",
    timeout: timeoutMs(),
    defaultEnv: defaultEnv(),

    // UI state (renderer-persisted via this same IPC surface).
    uiRequestTabs: (settings.getSync("kulala.ui.requestTabs") as unknown) ?? undefined,
    uiExplorerExpanded: (settings.getSync("kulala.ui.explorerExpanded") as unknown) ?? undefined,
  };
}

export async function setKulalaSettings(values: Record<string, unknown>): Promise<void> {
  if ("corePath" in values) await settings.set("kulala.corePath", String(values.corePath ?? ""));
  if ("coreVersion" in values)
    await settings.set("kulala.coreVersion", String(values.coreVersion ?? DEFAULT_CORE_VERSION));
  if ("dataDir" in values) await settings.set("kulala.dataDir", String(values.dataDir ?? ""));
  if ("timeout" in values) await settings.set("kulala.timeout", Number(values.timeout ?? 60000));
  if ("defaultEnv" in values)
    await settings.set("kulala.defaultEnv", String(values.defaultEnv ?? "default"));

  // UI state keys are intentionally opaque blobs.
  if ("uiRequestTabs" in values)
    await settings.set("kulala.ui.requestTabs", values.uiRequestTabs as never);
  if ("uiExplorerExpanded" in values)
    await settings.set("kulala.ui.explorerExpanded", values.uiExplorerExpanded as never);
}
