/**
 * Repository table access.
 *
 * Thin layer over SQLite `skill_repos` table. Returns strongly-typed
 * rows matching the `SkillRepo` domain type.
 */

import {
  RepoStatus,
  type AutoSyncStatus,
  type RepoKind,
  type ScanConfig,
  type SkillRepo
} from "@astack/shared";

import type { Db } from "./connection.js";

/**
 * Columns selected to hydrate a `SkillRepo`.
 *
 * v0.11: 4 auto-sync columns appended in `last_synced` → `created_at`
 * order so the projection lines up with `SkillRepoSchema` field order
 * (purely cosmetic — SELECT order is irrelevant to row hydration).
 */
const SELECT_COLS =
  "id, name, git_url, kind, status, scan_config, local_path, head_hash, last_synced, " +
  "last_auto_sync_at, last_auto_sync_status, last_auto_sync_reason, last_auto_sync_detail, " +
  "created_at";

/**
 * Row as returned by SELECT: `scan_config` is a raw JSON string (or NULL)
 * because SQLite has no JSON column type. We deserialize on the way out.
 *
 * v0.11: `last_auto_sync_at` is INTEGER epoch-ms (see schema.ts comment);
 * `last_auto_sync_status` is the AutoSyncStatus enum or NULL. Both are
 * nullable on rows that predate v0.11 or haven't been touched yet.
 */
interface SkillRepoRow {
  id: number;
  name: string;
  git_url: string;
  kind: RepoKind;
  status: string;
  scan_config: string | null;
  local_path: string | null;
  head_hash: string | null;
  last_synced: string | null;
  last_auto_sync_at: number | null;
  last_auto_sync_status: string | null;
  last_auto_sync_reason: string | null;
  last_auto_sync_detail: string | null;
  created_at: string;
}

function hydrate(row: SkillRepoRow): SkillRepo {
  return {
    id: row.id,
    name: row.name,
    git_url: row.git_url,
    kind: row.kind,
    status: normalizeStatus(row.status),
    scan_config: row.scan_config ? (JSON.parse(row.scan_config) as ScanConfig) : null,
    local_path: row.local_path,
    head_hash: row.head_hash,
    last_synced: row.last_synced,
    last_auto_sync_at: row.last_auto_sync_at,
    last_auto_sync_status: normalizeAutoSyncStatus(row.last_auto_sync_status),
    last_auto_sync_reason: row.last_auto_sync_reason,
    last_auto_sync_detail: row.last_auto_sync_detail,
    created_at: row.created_at
  };
}

function normalizeAutoSyncStatus(raw: string | null): AutoSyncStatus | null {
  if (raw === null) return null;
  if (
    raw === "ok" ||
    raw === "noop" ||
    raw === "skipped" ||
    raw === "needs_attention"
  ) {
    return raw;
  }
  // Defence-in-depth: an unknown value (e.g. row written by a future
  // version) should not crash hydration. Drop to null and let the
  // next AutoSync cycle overwrite with a known value.
  return null;
}

function normalizeStatus(raw: string): SkillRepo["status"] {
  // The DB column has no CHECK constraint (zod owns enum validation);
  // fall back to Ready for any unexpected value.
  if (
    raw === RepoStatus.Ready ||
    raw === RepoStatus.Seeding ||
    raw === RepoStatus.Failed
  ) {
    return raw;
  }
  return RepoStatus.Ready;
}

export class RepoRepository {
  constructor(private readonly db: Db) {}

  insert(input: {
    name: string;
    git_url: string;
    kind: RepoKind;
    local_path: string | null;
    /** Null / undefined = use DEFAULT_SCAN_CONFIG at scan time. */
    scan_config?: ScanConfig | null;
    /** Defaults to 'ready'. SeedService passes 'seeding' while cloning. */
    status?: SkillRepo["status"];
  }): SkillRepo {
    const scanJson =
      input.scan_config == null ? null : JSON.stringify(input.scan_config);
    const status = input.status ?? RepoStatus.Ready;

    const row = this.db
      .prepare<
        [string, string, RepoKind, string, string | null, string | null],
        SkillRepoRow
      >(
        `INSERT INTO skill_repos (name, git_url, kind, status, scan_config, local_path)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING ${SELECT_COLS}`
      )
      .get(
        input.name,
        input.git_url,
        input.kind,
        status,
        scanJson,
        input.local_path
      );
    if (!row) {
      throw new Error("insert skill_repos returned no row");
    }
    return hydrate(row);
  }

  findById(id: number): SkillRepo | null {
    const row = this.db
      .prepare<[number], SkillRepoRow>(
        `SELECT ${SELECT_COLS} FROM skill_repos WHERE id = ?`
      )
      .get(id);
    return row ? hydrate(row) : null;
  }

  findByName(name: string): SkillRepo | null {
    const row = this.db
      .prepare<[string], SkillRepoRow>(
        `SELECT ${SELECT_COLS} FROM skill_repos WHERE name = ?`
      )
      .get(name);
    return row ? hydrate(row) : null;
  }

  findByGitUrl(url: string): SkillRepo | null {
    const row = this.db
      .prepare<[string], SkillRepoRow>(
        `SELECT ${SELECT_COLS} FROM skill_repos WHERE git_url = ?`
      )
      .get(url);
    return row ? hydrate(row) : null;
  }

  list(
    opts: { offset: number; limit: number } = { offset: 0, limit: 50 }
  ): { rows: SkillRepo[]; total: number } {
    const rows = this.db
      .prepare<[number, number], SkillRepoRow>(
        `SELECT ${SELECT_COLS} FROM skill_repos ORDER BY id LIMIT ? OFFSET ?`
      )
      .all(opts.limit, opts.offset);
    const total = (
      this.db
        .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM skill_repos")
        .get() ?? { c: 0 }
    ).c;
    return { rows: rows.map(hydrate), total };
  }

  /**
   * Enumerate every repo, ordered by id ascending.
   *
   * v0.11: AutoSyncService.runCycle iterates the full set serially
   * (~1h cadence, no pagination needed). Kept distinct from `list()` so
   * paged HTTP routes never accidentally drop the LIMIT/OFFSET and
   * page the entire table over the wire.
   */
  listAll(): SkillRepo[] {
    const rows = this.db
      .prepare<[], SkillRepoRow>(
        `SELECT ${SELECT_COLS} FROM skill_repos ORDER BY id`
      )
      .all();
    return rows.map(hydrate);
  }

  updateSyncState(
    id: number,
    fields: { head_hash: string | null; last_synced: string | null }
  ): void {
    this.db
      .prepare<[string | null, string | null, number]>(
        `UPDATE skill_repos SET head_hash = ?, last_synced = ? WHERE id = ?`
      )
      .run(fields.head_hash, fields.last_synced, id);
  }

  updateScanConfig(id: number, scanConfig: ScanConfig | null): void {
    const scanJson = scanConfig == null ? null : JSON.stringify(scanConfig);
    this.db
      .prepare<[string | null, number]>(
        `UPDATE skill_repos SET scan_config = ? WHERE id = ?`
      )
      .run(scanJson, id);
  }

  /** Used by SeedService to flip 'seeding' → 'ready' or 'failed'. */
  updateStatus(id: number, status: SkillRepo["status"]): void {
    this.db
      .prepare<[string, number]>(
        `UPDATE skill_repos SET status = ? WHERE id = ?`
      )
      .run(status, id);
  }

  /**
   * Persist the outcome of one AutoSync attempt.
   *
   * v0.11: writes all four auto-sync columns atomically. Called from
   * `AutoSyncService.persistOutcome` in every branch of the decision
   * tree (ok / noop / skipped / needs_attention) so the row never gets
   * a partial update.
   *
   * `at_ms` is the wall-clock epoch-ms when the attempt finished;
   * `reason` and `detail` are NULL only when status === 'ok' or
   * 'noop' (the spec lets writers omit them; UI renders blanks).
   */
  persistAutoSyncOutcome(
    id: number,
    fields: {
      status: AutoSyncStatus;
      reason: string | null;
      detail: string | null;
      at_ms: number;
    }
  ): void {
    this.db
      .prepare<
        [number, AutoSyncStatus, string | null, string | null, number]
      >(
        `UPDATE skill_repos
         SET last_auto_sync_at = ?,
             last_auto_sync_status = ?,
             last_auto_sync_reason = ?,
             last_auto_sync_detail = ?
         WHERE id = ?`
      )
      .run(
        fields.at_ms,
        fields.status,
        fields.reason,
        fields.detail,
        id
      );
  }

  /**
   * Clear an `needs_attention` flag on a repo (PR2 dismiss handler).
   *
   * §A5 binds this writer to PR1 because it touches the same four
   * v0.11 columns. The `last_auto_sync_at` timestamp is preserved so
   * the UI can still show "last attempt: …" history; only the status
   * downgrades to NULL and reason/detail clear.
   *
   * Returns the hydrated row after the update so the HTTP layer can
   * round-trip the new state without an extra SELECT. Throws if the
   * id does not exist (caller should 404 in that case).
   */
  clearAutoSyncAttention(id: number): SkillRepo {
    const row = this.db
      .prepare<[number], SkillRepoRow>(
        `UPDATE skill_repos
         SET last_auto_sync_status = NULL,
             last_auto_sync_reason = NULL,
             last_auto_sync_detail = NULL
         WHERE id = ?
         RETURNING ${SELECT_COLS}`
      )
      .get(id);
    if (!row) {
      throw new Error(`clearAutoSyncAttention: repo ${id} not found`);
    }
    return hydrate(row);
  }

  delete(id: number): boolean {
    const info = this.db
      .prepare<[number]>("DELETE FROM skill_repos WHERE id = ?")
      .run(id);
    return info.changes > 0;
  }
}
