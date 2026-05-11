/**
 * v0.11 §4.4.2 — DB schema dual path for auto-sync columns.
 *
 * Two ways a daemon ends up with the four auto-sync columns:
 *   A) Fresh install: `SCHEMA_DDL` declares the columns inline so a
 *      `CREATE TABLE IF NOT EXISTS skill_repos (...)` brings them in.
 *   B) Upgrade from v0.10 or earlier: `CREATE TABLE IF NOT EXISTS` is
 *      a no-op on the existing pre-v0.11 table, so `applyAutoSyncColumnsV0_11`
 *      runs its idempotent `ALTER TABLE ... ADD COLUMN` sequence.
 *
 * Both paths must produce a database where INSERT/UPDATE on the new
 * columns succeeds. The migration also has to be idempotent — calling
 * `openDatabase` on the same file twice in a row must not throw.
 */

import path from "node:path";

import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import tmp from "tmp-promise";

import { openDatabase } from "../src/db/connection.js";

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
}

function tableInfo(db: DatabaseSync | ReturnType<typeof openDatabase>, table: string): ColumnInfo[] {
  // pragma_table_info is the portable way; node:sqlite supports it.
  const rows = db
    .prepare<[], ColumnInfo>(`SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)`)
    .all(table);
  return rows;
}

describe("db schema (v0.11 auto-sync columns)", () => {
  it("path A — fresh openDatabase declares all 4 auto-sync columns", () => {
    const db = openDatabase({ path: ":memory:" });
    try {
      const cols = tableInfo(db, "skill_repos").map((c) => c.name);
      expect(cols).toEqual(
        expect.arrayContaining([
          "last_auto_sync_at",
          "last_auto_sync_status",
          "last_auto_sync_reason",
          "last_auto_sync_detail"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("path A — auto-sync columns can be inserted / updated end-to-end", () => {
    const db = openDatabase({ path: ":memory:" });
    try {
      // Insert via the public API so the test exercises the column ordering.
      const inserted = db
        .prepare<[string, string, string, string, number], { id: number }>(
          `INSERT INTO skill_repos (name, git_url, kind, status, last_auto_sync_at)
           VALUES (?, ?, ?, ?, ?)
           RETURNING id`
        )
        .get("autosync-row", "https://example.com/x.git", "custom", "ready", 1700000000000);
      expect(inserted).toBeDefined();
      const id = inserted!.id;

      // Update each new column with a typical value.
      db.prepare<[string, number]>(
        `UPDATE skill_repos SET last_auto_sync_status = ? WHERE id = ?`
      ).run("ok", id);
      db.prepare<[string, number]>(
        `UPDATE skill_repos SET last_auto_sync_reason = ? WHERE id = ?`
      ).run("noop", id);
      db.prepare<[string, number]>(
        `UPDATE skill_repos SET last_auto_sync_detail = ? WHERE id = ?`
      ).run("first cycle", id);

      const row = db
        .prepare<[number], {
          last_auto_sync_at: number | null;
          last_auto_sync_status: string | null;
          last_auto_sync_reason: string | null;
          last_auto_sync_detail: string | null;
        }>(
          `SELECT last_auto_sync_at, last_auto_sync_status, last_auto_sync_reason, last_auto_sync_detail
           FROM skill_repos WHERE id = ?`
        )
        .get(id);
      expect(row).toEqual({
        last_auto_sync_at: 1700000000000,
        last_auto_sync_status: "ok",
        last_auto_sync_reason: "noop",
        last_auto_sync_detail: "first cycle"
      });
    } finally {
      db.close();
    }
  });

  it("path A — CHECK constraint rejects an unknown auto-sync status value", () => {
    const db = openDatabase({ path: ":memory:" });
    try {
      const insert = (): void => {
        db.prepare<[string, string, string, string, string]>(
          `INSERT INTO skill_repos (name, git_url, kind, status, last_auto_sync_status)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          "bad-status",
          "https://example.com/y.git",
          "custom",
          "ready",
          "not_a_real_status"
        );
      };
      expect(insert).toThrow();
    } finally {
      db.close();
    }
  });

  it("path B — pre-v0.11 table is migrated by ALTER TABLE on openDatabase", async () => {
    const dataDir = await tmp.dir({ unsafeCleanup: true });
    const dbPath = path.join(dataDir.path, "legacy.sqlite3");

    try {
      // Hand-craft a v0.10-shaped skill_repos table (no auto-sync columns).
      // Mirrors the columns the rest of the schema cares about; we keep
      // it minimal to avoid hand-maintaining the full pre-v0.11 DDL.
      const legacy = new DatabaseSync(dbPath);
      legacy.exec(`
        CREATE TABLE skill_repos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          git_url TEXT UNIQUE NOT NULL,
          kind TEXT NOT NULL DEFAULT 'custom',
          status TEXT NOT NULL DEFAULT 'ready',
          scan_config TEXT,
          local_path TEXT,
          head_hash TEXT,
          last_synced TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      legacy
        .prepare<[string, string]>(
          `INSERT INTO skill_repos (name, git_url) VALUES (?, ?)`
        )
        .run("legacy-row", "https://example.com/legacy.git");
      // Confirm the legacy table really lacks the new columns.
      const legacyCols = legacy
        .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('skill_repos')`)
        .all()
        .map((r) => r.name);
      expect(legacyCols).not.toContain("last_auto_sync_at");
      legacy.close();

      // Re-open via the production path — this should ALTER TABLE the missing
      // columns into existence without throwing.
      const migrated = openDatabase({ path: dbPath });
      try {
        const cols = tableInfo(migrated, "skill_repos").map((c) => c.name);
        expect(cols).toEqual(
          expect.arrayContaining([
            "last_auto_sync_at",
            "last_auto_sync_status",
            "last_auto_sync_reason",
            "last_auto_sync_detail"
          ])
        );

        // The pre-existing row survived — auto-sync columns default to NULL.
        const row = migrated
          .prepare<[], {
            id: number;
            last_auto_sync_at: number | null;
            last_auto_sync_status: string | null;
          }>(
            `SELECT id, last_auto_sync_at, last_auto_sync_status
             FROM skill_repos
             WHERE name = 'legacy-row'`
          )
          .get();
        expect(row).toBeDefined();
        expect(row!.last_auto_sync_at).toBeNull();
        expect(row!.last_auto_sync_status).toBeNull();
      } finally {
        migrated.close();
      }

      // Idempotency check: re-open the now-migrated DB and assert no throw.
      const reopen = openDatabase({ path: dbPath });
      try {
        // After idempotent re-migration the schema is unchanged.
        const cols = tableInfo(reopen, "skill_repos").map((c) => c.name);
        expect(cols).toEqual(
          expect.arrayContaining([
            "last_auto_sync_at",
            "last_auto_sync_status",
            "last_auto_sync_reason",
            "last_auto_sync_detail"
          ])
        );
      } finally {
        reopen.close();
      }
    } finally {
      await dataDir.cleanup();
    }
  });
});
