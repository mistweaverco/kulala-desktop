import { dialog } from "electron";
import fs from "fs";
import path from "path";

export type FileInfo = {
  name: string;
  fullPath: string;
  content: string;
};

export type FolderPickResult = {
  folderPaths: string[];
};

export type WalkHttpFile = {
  filepath: string;
  relpath: string;
};

export const pickFolders = async (): Promise<FolderPickResult> => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "multiSelections", "showHiddenFiles"],
  });
  if (result.canceled) return { folderPaths: [] };
  return { folderPaths: result.filePaths };
};

export const pickScriptFile = async (): Promise<string | undefined> => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "showHiddenFiles"],
    filters: [
      { name: "Script", extensions: ["js", "ts"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return undefined;
  return result.filePaths[0];
};

const HTTP_EXTENSIONS = [".http", ".rest"];

export function buildRenamedFilePath(oldPath: string, newName: string): string {
  const trimmed = newName.trim();
  if (!trimmed) return "";

  const dir = path.dirname(oldPath);
  const oldExt = path.extname(oldPath).toLowerCase();
  const hasKnownExt = HTTP_EXTENSIONS.includes(oldExt);
  const newExt = path.extname(trimmed).toLowerCase();
  const base =
    newExt && HTTP_EXTENSIONS.includes(newExt)
      ? trimmed
      : hasKnownExt
        ? `${trimmed}${oldExt}`
        : trimmed;

  return path.join(dir, base);
}

async function walkDir(root: string, relBase: string, out: WalkHttpFile[]): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(root, entry.name);
    const rel = path.join(relBase, entry.name);
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(abs);
    } catch {
      continue;
    }

    if (st.isSymbolicLink()) continue;

    if (st.isDirectory()) {
      await walkDir(abs, rel, out);
      continue;
    }

    if (st.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!HTTP_EXTENSIONS.includes(ext)) continue;
      out.push({ filepath: abs, relpath: rel });
    }
  }
}

export async function listHttpFilesRecursive(folderPath: string): Promise<WalkHttpFile[]> {
  const out: WalkHttpFile[] = [];
  const absRoot = path.resolve(folderPath);
  await walkDir(absRoot, "", out);
  out.sort((a, b) => a.relpath.localeCompare(b.relpath));
  return out;
}
