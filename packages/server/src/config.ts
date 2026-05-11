/**
 * Runtime configuration for @astack/server.
 *
 * Defaults follow design.md § Eng Review decision 4 (daemon layout):
 *   ~/.astack/daemon.pid
 *   ~/.astack/daemon.log
 *   ~/.astack/daemon.lock
 *   ~/.astack/astack.sqlite3  (SQLite database)
 *   ~/.astack/repos/<name>/   (upstream mirror clones)
 *   ~/.astack/config.json     (v0.11 — user-editable overrides for
 *                              auto-sync; env vars still win, see §A6)
 *
 * All paths can be overridden via env vars — primarily for tests
 * (tmp-promise creates isolated dirs).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ServerConfig {
  /** HTTP bind host. Always 127.0.0.1 (design constraint 4). */
  host: string;
  /** HTTP port. Default 7432. */
  port: number;
  /** Root data dir (default ~/.astack/). */
  dataDir: string;
  /** SQLite DB path. */
  dbPath: string;
  /** Upstream mirror clones root. */
  reposDir: string;
  /** PID file location (for daemon management). */
  pidFile: string;
  /** Log file location. */
  logFile: string;
  /** flock file to prevent concurrent daemon starts. */
  lockFile: string;
  /**
   * v0.11 — JSON file holding user-editable runtime overrides
   * (currently auto-sync). Env vars still take precedence (§A6).
   */
  configFile: string;
  /**
   * TTL for upstream HEAD-hash cache, in ms.
   * See design.md § Eng Review decision 11.
   */
  upstreamCacheTtlMs: number;
  /**
   * Max time to wait for a per-repo mutex before returning REPO_BUSY.
   * See design.md § Eng Review decision 5.
   */
  repoLockTimeoutMs: number;
}

/** Load config from env vars with sensible defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.ASTACK_DATA_DIR ?? path.join(os.homedir(), ".astack");
  const host = env.ASTACK_HOST ?? "127.0.0.1";
  const port = env.ASTACK_PORT ? parseInt(env.ASTACK_PORT, 10) : 7432;

  return {
    host,
    port,
    dataDir,
    dbPath: env.ASTACK_DB_PATH ?? path.join(dataDir, "astack.sqlite3"),
    reposDir: env.ASTACK_REPOS_DIR ?? path.join(dataDir, "repos"),
    pidFile: path.join(dataDir, "daemon.pid"),
    logFile: path.join(dataDir, "daemon.log"),
    lockFile: path.join(dataDir, "daemon.lock"),
    configFile: env.ASTACK_CONFIG_FILE ?? path.join(dataDir, "config.json"),
    upstreamCacheTtlMs: 5 * 60 * 1000,
    repoLockTimeoutMs: 30 * 1000
  };
}

// ---------- v0.11 auto-sync config ----------

/** Source of each effective auto-sync field; see §A6. */
export type AutoSyncConfigSource = "env" | "config_file" | "default";

/**
 * Effective AutoSync runtime configuration. Resolved at daemon start
 * from three layers, env winning over config.json winning over hard
 * defaults (spec v0.11 §4.6 / §A6).
 *
 * `source` is overall: if ANY field came from env it is `"env"`;
 * else if any came from config.json it is `"config_file"`; else
 * `"default"`. Per-field source tracking is not needed by current
 * Web UI (the "Controlled by ASTACK_AUTOSYNC_ENABLED" tooltip only
 * looks at the aggregate). If we need finer granularity later we can
 * promote `source` to a record without breaking call sites.
 */
export interface AutoSyncConfig {
  enabled: boolean;
  intervalMs: number;
  jitterMs: number;
  source: AutoSyncConfigSource;
}

/** Hard defaults if neither env nor config.json provide a value. */
export const AUTO_SYNC_DEFAULTS = {
  enabled: true,
  intervalMs: 60 * 60 * 1000, // 1 hour
  jitterMs: 5 * 60 * 1000 // ±5 minutes
} as const;

interface AutoSyncConfigFileShape {
  auto_sync?: {
    enabled?: unknown;
    interval_ms?: unknown;
    jitter_ms?: unknown;
  };
}

/**
 * Resolve effective AutoSync config. Spec v0.11 §A6: env > config.json
 * > default. Per-field precedence (a single env var only overrides
 * that one field; the others still consult config.json then default).
 *
 * Reading config.json is best-effort: missing file / invalid JSON /
 * wrong shape silently fall through to defaults. This is by design —
 * we never want a malformed config file to keep the daemon from
 * starting; the user sees the resulting state in the GET /api/auto-sync/config
 * response and can fix the file from there.
 *
 * The PR2 HTTP route writes the file via `writeAutoSyncConfigFile`.
 */
export function loadAutoSyncConfig(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env
): AutoSyncConfig {
  const file = readAutoSyncConfigFile(config.configFile);

  const envEnabled = parseEnabledFlag(env.ASTACK_AUTOSYNC_ENABLED);
  const envInterval = parsePositiveInt(env.ASTACK_AUTOSYNC_INTERVAL_MS);
  const envJitter = parsePositiveInt(env.ASTACK_AUTOSYNC_JITTER_MS, {
    allowZero: true
  });

  const fileEnabled =
    typeof file?.enabled === "boolean" ? file.enabled : null;
  const fileInterval = parsePositiveInt(file?.interval_ms);
  const fileJitter = parsePositiveInt(file?.jitter_ms, { allowZero: true });

  let usedEnv = false;
  let usedFile = false;

  const enabled =
    envEnabled !== null
      ? ((usedEnv = true), envEnabled)
      : fileEnabled !== null
        ? ((usedFile = true), fileEnabled)
        : AUTO_SYNC_DEFAULTS.enabled;

  const intervalMs =
    envInterval !== null
      ? ((usedEnv = true), envInterval)
      : fileInterval !== null
        ? ((usedFile = true), fileInterval)
        : AUTO_SYNC_DEFAULTS.intervalMs;

  const jitterMs =
    envJitter !== null
      ? ((usedEnv = true), envJitter)
      : fileJitter !== null
        ? ((usedFile = true), fileJitter)
        : AUTO_SYNC_DEFAULTS.jitterMs;

  const source: AutoSyncConfigSource = usedEnv
    ? "env"
    : usedFile
      ? "config_file"
      : "default";

  return { enabled, intervalMs, jitterMs, source };
}

/** True iff env layer provided ANY auto-sync field; PR2 routes use this. */
export function autoSyncEnvLocked(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    parseEnabledFlag(env.ASTACK_AUTOSYNC_ENABLED) !== null ||
    parsePositiveInt(env.ASTACK_AUTOSYNC_INTERVAL_MS) !== null ||
    parsePositiveInt(env.ASTACK_AUTOSYNC_JITTER_MS, { allowZero: true }) !== null
  );
}

function readAutoSyncConfigFile(
  configPath: string
): { enabled?: unknown; interval_ms?: unknown; jitter_ms?: unknown } | null {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as AutoSyncConfigFileShape;
    return parsed.auto_sync ?? null;
  } catch {
    return null;
  }
}

function parseEnabledFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return null;
}

/**
 * Parse a positive integer from either an env string or a JSON value.
 * Returns null on undefined / non-numeric / non-positive (or non-finite).
 *
 * Exported for tests and PR2 routes (validating UpdateAutoSyncConfigRequest).
 */
export function parsePositiveInt(
  raw: unknown,
  opts: { allowZero?: boolean } = {}
): number | null {
  if (raw === undefined || raw === null) return null;
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (opts.allowZero ? n < 0 : n <= 0) return null;
  return n;
}
