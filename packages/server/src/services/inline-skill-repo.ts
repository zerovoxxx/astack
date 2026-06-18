/**
 * InlineSkillRepoService — register & dynamically (re-)parse the
 * project's bundled `astack-marketplace/` marketplace on every daemon startup.
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  bootstrap()                                                    │
 *   │     1. Locate <astack-marketplace>/ via paths.astackMarketplaceRoot() │
 *   │        — silently skip when missing (npm dist not yet vendored) │
 *   │     2. Ensure a skill_repo row exists with the synthetic        │
 *   │        git_url `inline:astack-marketplace` (idempotent insert / │
 *   │        self-heal local_path / scan_config when drifted)         │
 *   │     3. Re-scan the marketplace every call (no git fetch), then  │
 *   │        upsert + prune namespaced plugin skills in one tx.       │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Why a synthetic git_url?
 *   - skill_repos.git_url is the unique key used everywhere (subscriptions,
 *     dashboard list, sync state). A real URL would be misleading because
 *     no clone ever happens (the dir lives in the project tree); using
 *     `inline:<name>` makes the intent explicit and impossible to confuse
 *     with a real github URL.
 *
 * Why still thread the system-skill blacklist?
 *   - The marketplace scanner namespaces plugin skills as
 *     `<plugin>/<skill>`, so `astack-workflow/harness-init` no longer
 *     collides with the plain system skill id `harness-init`. Passing the
 *     blacklist keeps the contract consistent with other scanners while
 *     allowing marketplace-native namespaced skills to remain visible.
 *
 * Why re-scan on every startup?
 *   - The inline marketplace lives in the source tree (not in
 *     ~/.astack/repos/), so users may edit its skills directly between
 *     daemon restarts. Re-scanning is cheap (<10 files) and removes a
 *     class of "I edited a SKILL.md but the dashboard still shows the
 *     old description" footguns.
 *
 * v0.12+.
 */

import {
  EventType,
  INLINE_SKILL_REPO_URL,
  RepoKind,
  ScanRootKind,
  type ScanConfig,
  type Skill,
  type SkillRepo
} from "@astack/shared";

import type { Db } from "../db/connection.js";
import { RepoRepository } from "../db/repos.js";
import { SkillRepository } from "../db/skills.js";
import type { EventBus } from "../events.js";
import type { Logger } from "../logger.js";
import { scanRepo } from "../scanner/index.js";
import { astackMarketplaceRoot } from "../system-skills/paths.js";

/**
 * Synthetic git_url for the inline repo. Re-exported from `@astack/shared`
 * (`INLINE_SKILL_REPO_URL`) under the old name to avoid churning callers
 * that imported it from this module before the v0.12 shared move.
 */
export const INLINE_SKILL_REPO_GIT_URL = INLINE_SKILL_REPO_URL;

/** Display name shown in dashboards. */
export const INLINE_SKILL_REPO_NAME = "astack-marketplace";

/**
 * Scan layout for the inline marketplace. It follows the shared
 * Claude/Codex marketplace shape: plugins/<plugin>/{skills,commands,agents}.
 */
const INLINE_SCAN_CONFIG: ScanConfig = {
  roots: [{ path: "plugins", kind: ScanRootKind.PluginMarketplace }]
};

export interface InlineSkillRepoServiceDeps {
  db: Db;
  events: EventBus;
  logger: Logger;
  /**
   * Lazy provider for the system-skill blacklist. Wired the same way
   * as `RepoService.deps.systemSkillIds` — a function so construction
   * order doesn't matter and tests can supply an empty set when they
   * don't construct SystemSkillService.
   */
  systemSkillIds: () => ReadonlySet<string>;
}

export interface InlineSkillRepoBootstrapResult {
  /** Absolute path to astack-marketplace/, or null when not found. */
  rootPath: string | null;
  /** The persisted skill_repo row (null when bootstrap skipped). */
  repo: SkillRepo | null;
  /** Skills upserted on this run (post-blacklist). */
  skills: Skill[];
  /** Non-fatal warnings from the scanner. */
  warnings: string[];
  /** True when this run inserted the skill_repos row (cold start). */
  inserted: boolean;
}

export class InlineSkillRepoService {
  private readonly repos: RepoRepository;
  private readonly skills: SkillRepository;

  constructor(private readonly deps: InlineSkillRepoServiceDeps) {
    this.repos = new RepoRepository(deps.db);
    this.skills = new SkillRepository(deps.db);
  }

  /**
   * Idempotent bootstrap. Safe to call on every daemon startup.
   *
   * Errors are caught and logged — the daemon must come up even if the
   * inline repo is corrupt or missing.
   */
  bootstrap(): InlineSkillRepoBootstrapResult {
    const empty: InlineSkillRepoBootstrapResult = {
      rootPath: null,
      repo: null,
      skills: [],
      warnings: [],
      inserted: false
    };

    let root: string | null;
    try {
      root = astackMarketplaceRoot();
    } catch (err) {
      this.deps.logger.warn("inline_skill_repo.locate_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      return empty;
    }
    if (!root) {
      // Not a fatal error — astack may have been installed without the
      // inline marketplace vendored. The harness-init system-skill code path
      // will throw the harder INTERNAL when it tries to load registry.
      this.deps.logger.info("inline_skill_repo.skipped_missing_root");
      return empty;
    }

    try {
      return this.bootstrapInner(root);
    } catch (err) {
      this.deps.logger.error("inline_skill_repo.bootstrap_failed", {
        root,
        error: err instanceof Error ? err.message : String(err)
      });
      return { ...empty, rootPath: root };
    }
  }

  private bootstrapInner(root: string): InlineSkillRepoBootstrapResult {
    const { repo, inserted } = this.ensureRow(root);

    const blacklist = this.deps.systemSkillIds();
    const scanStart = Date.now();
    const { skills: scanned, warnings } = scanRepo(
      root,
      INLINE_SCAN_CONFIG,
      { systemSkillIds: blacklist }
    );
    const scanMs = Date.now() - scanStart;
    for (const w of warnings) {
      // info-level (not warn) so non-fatal marketplace authoring issues do
      // not make daemon startup look failed.
      this.deps.logger.info("inline_skill_repo.scan_warning", {
        repo_id: repo.id,
        detail: w
      });
    }

    const upsertStart = Date.now();
    const upserted: Skill[] = [];
    this.deps.db.exec("BEGIN IMMEDIATE");
    try {
      for (const s of scanned) {
        upserted.push(
          this.skills.upsert({
            repo_id: repo.id,
            type: s.type,
            name: s.name,
            path: s.relPath,
            description: s.description,
            // Inline repo has no git operation on the daemon path — leave
            // version/updated_at null. A future enhancement could read
            // `git rev-parse HEAD` against `<root>/.git/` but for v0.12
            // we deliberately avoid running git in the startup hot path.
            version: null,
            updated_at: null
          })
        );
      }
      this.skills.deleteMissing(
        repo.id,
        scanned.map((s) => ({ type: s.type, name: s.name }))
      );
      this.deps.db.exec("COMMIT");
    } catch (err) {
      try {
        this.deps.db.exec("ROLLBACK");
      } catch {
        /* already rolled back / connection dead */
      }
      throw err;
    }
    const upsertMs = Date.now() - upsertStart;

    this.deps.logger.info("inline_skill_repo.ready", {
      repo_id: repo.id,
      root,
      inserted,
      skill_count: upserted.length,
      warnings: warnings.length,
      blacklist_size: blacklist.size,
      scan_ms: scanMs,
      upsert_ms: upsertMs
    });

    if (inserted) {
      // Mirror RepoService.register's event emission so SSE-driven
      // dashboards refresh their repo list automatically on cold start.
      this.deps.events.emit({
        type: EventType.RepoRegistered,
        payload: { repo }
      });
    }

    return {
      rootPath: root,
      repo,
      skills: upserted,
      warnings,
      inserted
    };
  }

  /** Ensure a skill_repos row exists for the inline repo. Idempotent. */
  private ensureRow(root: string): { repo: SkillRepo; inserted: boolean } {
    const existing = this.repos.findByGitUrl(INLINE_SKILL_REPO_GIT_URL);
    if (existing) {
      // Self-heal: if the user moved their workspace, local_path becomes
      // stale. Patch it back in place without touching anything else.
      if (existing.local_path !== root) {
        this.deps.logger.info("inline_skill_repo.local_path_drift_fixed", {
          repo_id: existing.id,
          previous: existing.local_path,
          current: root
        });
        // RepoRepository has no dedicated update for local_path; we
        // re-INSERT-OR-REPLACE indirectly by deleting + reinserting.
        // Simpler: a one-line UPDATE statement here keeps the operation
        // contained without a new repository method.
        this.deps.db
          .prepare<[string, number]>(
            `UPDATE skill_repos SET local_path = ? WHERE id = ?`
          )
          .run(root, existing.id);
        // Re-read to capture the updated row.
        const refreshed = this.repos.findById(existing.id);
        return { repo: refreshed ?? existing, inserted: false };
      }
      return { repo: existing, inserted: false };
    }

    const fallbackName = INLINE_SKILL_REPO_NAME;
    const repo = this.repos.insert({
      name: this.deriveUniqueName(fallbackName),
      git_url: INLINE_SKILL_REPO_GIT_URL,
      kind: RepoKind.OpenSource,
      local_path: root,
      scan_config: INLINE_SCAN_CONFIG
    });
    return { repo, inserted: true };
  }

  /**
   * Pick a non-colliding name. The strong preference is `astack-marketplace`
   * (matches `INLINE_SKILL_REPO_NAME`); if a user has manually registered
   * a repo with that exact name we fall back to `astack-marketplace-inline`
   * rather than failing bootstrap. This is best-effort defensive code —
   * the synthetic git_url makes a real-repo collision very unlikely.
   */
  private deriveUniqueName(preferred: string): string {
    if (!this.repos.findByName(preferred)) {
      return preferred;
    }
    for (let i = 2; i < 20; i++) {
      const candidate = `${preferred}-inline-${i}`;
      if (!this.repos.findByName(candidate)) {
        return candidate;
      }
    }
    // Astronomically unlikely; fall through to a timestamp suffix.
    return `${preferred}-inline-${Date.now()}`;
  }
}
