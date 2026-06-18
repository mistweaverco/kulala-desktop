import * as fs from "node:fs";
import * as path from "node:path";

/** Release asset platform id (matches kulala-core / kulala.nvim). */
export function releasePlatform(): string {
  let osName: string;
  if (process.platform === "darwin") {
    osName = "darwin";
  } else if (process.platform === "win32") {
    osName = "windows";
  } else {
    osName = "linux";
  }

  let archName: string = process.arch;
  if (archName === "x64") {
    archName = "x86_64";
  } else if (archName === "arm64") {
    archName = osName === "darwin" ? "arm64" : "aarch64";
  }

  return `${osName}-${archName}`;
}

export function releaseAssetName(): string {
  const base = `kulala-core-${releasePlatform()}`;
  return process.platform === "win32" ? `${base}.exe` : base;
}

export function installedBinaryName(): string {
  return process.platform === "win32" ? "kulala-core.exe" : "kulala-core";
}

export function bundledBinaryPath(): string | undefined {
  const names = [installedBinaryName(), releaseAssetName()];
  for (const name of names) {
    const candidates = [
      path.join(process.resourcesPath, "kulala-core", name),
      path.join(process.resourcesPath, name),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  return undefined;
}
