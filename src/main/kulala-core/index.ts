import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserWindow } from "electron";
import { KulalaCoreBridge } from "./bridge";
import { getSelectedEnv, setSelectedEnv } from "./config";
import { RequestRunner } from "./runner";
import type { KulalaDocument, KulalaHttpSerdeSerializeOptions } from "./types";

let bridge: KulalaCoreBridge | undefined;
let runner: RequestRunner | undefined;

export function initKulalaCore(getMainWindow: () => BrowserWindow | undefined): void {
  bridge = new KulalaCoreBridge();
  runner = new RequestRunner(bridge, getMainWindow);
}

export function getBridge(): KulalaCoreBridge {
  if (!bridge) {
    throw new Error("Kulala core not initialized");
  }
  return bridge;
}

export function getRunner(): RequestRunner {
  if (!runner) {
    throw new Error("Kulala runner not initialized");
  }
  return runner;
}

export function shutdownKulalaCore(): void {
  runner?.cancel();
  bridge?.killAll();
}

export function fileCwd(filepath?: string): string | undefined {
  if (!filepath) return undefined;
  return path.dirname(filepath);
}

export async function parseDocument(
  content: string,
  filepath?: string,
): Promise<{ doc?: KulalaDocument; err?: string }> {
  return getBridge().parse(content, filepath, fileCwd(filepath));
}

export async function serializeDocument(
  doc: KulalaDocument,
  filepath?: string,
  options?: KulalaHttpSerdeSerializeOptions,
): Promise<{ content?: string; err?: string }> {
  return getBridge().serialize(doc, filepath, options, fileCwd(filepath));
}

export async function saveDocument(
  doc: KulalaDocument,
  filepath: string,
  options?: KulalaHttpSerdeSerializeOptions,
): Promise<{ err?: string }> {
  const { content, err } = await serializeDocument(doc, filepath, options);
  if (err || content == null) {
    return { err: err ?? "serialize failed" };
  }
  await fs.promises.writeFile(filepath, content, "utf8");
  return {};
}

export async function listEnvironments(filepath?: string) {
  const cwd = fileCwd(filepath);
  if (!cwd) {
    return { err: "No working directory" };
  }
  return getBridge().listEnvironments(cwd);
}

export { getSelectedEnv, setSelectedEnv };
