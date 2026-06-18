import { app } from "electron";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

const userDataPath = path.join(app.getPath("userData"), "..", "kulala");
const dbPath = path.join(userDataPath, "kulala.db");

if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

export type DBCollectionRow = {
  name: string;
  parent_name: string | null;
  expanded: 0 | 1;
  created_at: string;
  updated_at: string;
  has_attached_folders?: 0 | 1;
};

export type DBCollectionFolderRow = {
  collection_name: string;
  folder_path: string;
  created_at: string;
  updated_at: string;
};

export type CollectionIndexItem = {
  name: string;
  parentName: string | null;
  expanded: boolean;
  hasAttachedFolders: boolean;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row: T | undefined) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

const database = {
  init: (): void => {
    db.serialize(() => {
      // Not backwards compatible: drop the old schema.
      db.run("DROP TABLE IF EXISTS files;");

      db.run(`
        CREATE TABLE IF NOT EXISTS collections (
          name TEXT PRIMARY KEY,
          parent_name TEXT NULL,
          expanded INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS collection_folders (
          collection_name TEXT NOT NULL,
          folder_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(collection_name, folder_path)
        );
      `);
    });
  },
  getCollectionTreeIndex: async (): Promise<CollectionIndexItem[]> => {
    const rows = await all<DBCollectionRow>(
      `SELECT c.name, c.parent_name, c.expanded, c.created_at, c.updated_at,
        EXISTS(SELECT 1 FROM collection_folders cf WHERE cf.collection_name = c.name) AS has_attached_folders
       FROM collections c ORDER BY c.name ASC`,
    );
    return rows.map((r) => ({
      name: r.name,
      parentName: r.parent_name,
      expanded: r.expanded === 1,
      hasAttachedFolders: r.has_attached_folders === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  collectionExists: async (name: string): Promise<boolean> => {
    const row = await get<{ one: 1 }>("SELECT 1 as one FROM collections WHERE name = ? LIMIT 1", [
      name,
    ]);
    return row != null;
  },

  ensureCollection: async (name: string, parentName: string | null = null): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Collection name cannot be empty");

    const existing = await get<{ name: string; parent_name: string | null }>(
      "SELECT name, parent_name FROM collections WHERE name = ? LIMIT 1",
      [trimmed],
    );
    if (existing) return;

    const ts = nowIso();
    await run(
      `INSERT INTO collections (name, parent_name, expanded, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      [trimmed, parentName, ts, ts],
    );
  },

  createSubcollection: async (parentName: string, name: string): Promise<void> => {
    await database.ensureCollection(parentName, null);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Collection name cannot be empty");
    if (trimmed === parentName) throw new Error("Collection cannot be its own parent");

    const ts = nowIso();
    await run(
      `INSERT INTO collections (name, parent_name, expanded, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      [trimmed, parentName, ts, ts],
    );
  },

  setCollectionExpanded: async (name: string, expanded: boolean): Promise<void> => {
    await run("UPDATE collections SET expanded = ?, updated_at = ? WHERE name = ?", [
      expanded ? 1 : 0,
      nowIso(),
      name,
    ]);
  },

  listFoldersForCollection: async (collectionName: string): Promise<string[]> => {
    const rows = await all<DBCollectionFolderRow>(
      "SELECT collection_name, folder_path, created_at, updated_at FROM collection_folders WHERE collection_name = ? ORDER BY folder_path ASC",
      [collectionName],
    );
    return rows.map((r) => r.folder_path);
  },

  attachFolders: async (
    collectionName: string,
    folderPaths: string[],
  ): Promise<{ attached: string[]; skipped: string[] }> => {
    const name = collectionName.trim();
    if (!name) throw new Error("Collection name cannot be empty");
    await database.ensureCollection(name, null);

    const existing = new Set(
      (await database.listFoldersForCollection(name)).map((fp) => path.resolve(fp)),
    );
    const attached: string[] = [];
    const skipped: string[] = [];
    const ts = nowIso();
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO collection_folders (collection_name, folder_path, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    );

    for (const fp of folderPaths) {
      const normalized = path.resolve(fp);
      if (existing.has(normalized)) {
        skipped.push(normalized);
        continue;
      }
      stmt.run(name, normalized, ts, ts);
      existing.add(normalized);
      attached.push(normalized);
    }

    await new Promise<void>((resolve, reject) => {
      stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (attached.length > 0) {
      await run("UPDATE collections SET updated_at = ? WHERE name = ?", [ts, name]);
    }

    return { attached, skipped };
  },

  detachFolder: async (collectionName: string, folderPath: string): Promise<void> => {
    await run("DELETE FROM collection_folders WHERE collection_name = ? AND folder_path = ?", [
      collectionName,
      folderPath,
    ]);
    await run("UPDATE collections SET updated_at = ? WHERE name = ?", [nowIso(), collectionName]);
  },

  renameCollection: async (oldName: string, newName: string): Promise<void> => {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Collection name cannot be empty");
    if (trimmed === oldName) return;

    const exists = await database.collectionExists(trimmed);
    if (exists) throw new Error("A collection with that name already exists");

    await run("BEGIN");
    try {
      const ts = nowIso();
      await run(
        `INSERT INTO collections (name, parent_name, expanded, created_at, updated_at)
         SELECT ?, parent_name, expanded, created_at, ?
         FROM collections
         WHERE name = ?`,
        [trimmed, ts, oldName],
      );

      await run("UPDATE collections SET parent_name = ? WHERE parent_name = ?", [trimmed, oldName]);
      await run("UPDATE collection_folders SET collection_name = ? WHERE collection_name = ?", [
        trimmed,
        oldName,
      ]);
      await run("DELETE FROM collections WHERE name = ?", [oldName]);

      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }
  },

  removeCollectionSubtree: async (rootName: string): Promise<string[]> => {
    const allCollections = await all<{ name: string; parent_name: string | null }>(
      "SELECT name, parent_name FROM collections",
      [],
    );
    const childrenByParent = new Map<string, string[]>();
    for (const row of allCollections) {
      if (!row.parent_name) continue;
      const arr = childrenByParent.get(row.parent_name) ?? [];
      arr.push(row.name);
      childrenByParent.set(row.parent_name, arr);
    }

    const toDelete: string[] = [];
    const stack = [rootName];
    while (stack.length) {
      const cur = stack.pop()!;
      toDelete.push(cur);
      const kids = childrenByParent.get(cur) ?? [];
      for (const k of kids) stack.push(k);
    }

    const removedFolders = await all<{ folder_path: string }>(
      `SELECT folder_path FROM collection_folders WHERE collection_name IN (${toDelete
        .map(() => "?")
        .join(",")})`,
      toDelete,
    );

    await run("BEGIN");
    try {
      await run(
        `DELETE FROM collection_folders WHERE collection_name IN (${toDelete
          .map(() => "?")
          .join(",")})`,
        toDelete,
      );
      await run(
        `DELETE FROM collections WHERE name IN (${toDelete.map(() => "?").join(",")})`,
        toDelete,
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    return removedFolders.map((r) => r.folder_path);
  },
};

database.init();

export { database };
