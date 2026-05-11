/**
 * AutoSyncService — daemon-side periodic pull / push with conflict-safe parking.
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  start()  ─► sleep(60s cold-start) ─► loop:                    │
 *   │                runCycle() ─► sleep(intervalMs ± jitter)        │
 *   │                                                                │
 *   │  runCycle()  ─► RepoRepository.listAll()                       │
 *   │                  └─► for each repo (serial, try/catch):        │
 *   │                         tryAcquire(repoAutoSyncLockKey(id))    │
 *   │                         syncOne(repo) → persistOutcome → emit  │
 *   │                  └─► emit RepoAutoSyncCycleCompleted (aggr.)   │
 *   │                                                                │
 *   │  syncOne(repo) — four-quadrant decision tree (spec §4.3):      │
 *   │    custom + clean+0+0   → noop                                 │
 *   │    custom + clean+0+>0  → pull --ff-only        → ok           │
 *   │    custom + clean+>0+0  → push                  → ok           │
 *   │    custom + clean+>0+>0 → divergent_branches    → attention    │
 *   │    custom + dirty+0     → commitAll → push      → ok           │
 *   │    custom + dirty+>0    → dirty_and_behind      → attention    │
 *   │    open-source + clean  → pull --ff-only        → ok / noop    │
 *   │    open-source + dirty  → dirty_working_tree    → attention    │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Architecture (spec §A1): does NOT delegate to RepoService.refresh
 * or SyncService.syncProject. Both of those have orthogonal concerns
 * (scan + skill upsert, project-scoped batching) that would muddy the
 * decision tree. AutoSync calls the v0.11 git primitives in `git.ts`
 * directly and writes back via `RepoRepository.persistAutoSyncOutcome`.
 *
 * Concurrency model:
 *   - `start()` / `stop()` are idempotent: `start()` is a no-op when
 *     already running, `stop()` is a no-op when already stopped.
 *   - One AbortController guards the sleep loop. `stop()` aborts it,
 *     awaits the in-flight `runCycle` (if any), then resolves.
 *   - Per-repo serialization uses `repoAutoSyncLockKey(id)` via
 *     `LockManager.tryAcquire`. A held lock means manual Refresh is
 *     in progress (or a previous AutoSync attempt is still syncing
 *     the same repo from a stuck cycle), and we surface
 *     `skipped + reason="other_op_in_progress"` rather than racing.
 *
 * Safety (spec §6.1 / Git Safety Protocol):
 *   - Never `--force`, `--no-verify`, rebase, or `stash pop`.
 *   - On any conflict signal we park at `needs_attention` and require
 *     the user to resolve manually.
 */

import { randomUUID } from "node:crypto";

import {
  AstackError,
  EventType,
  RepoKind,
  type AutoSyncStatus,
  type SkillRepo
} from "@astack/shared";

import type { AutoSyncConfig } from "../config.js";
import { RepoRepository } from "../db/repos.js";
import type { Db } from "../db/connection.js";
import type { EventBus } from "../events.js";
import {
  classifyGitError,
  gitCommitAll,
  gitFetch,
  gitGetLocalIdentity,
  gitPullFfOnly,
  gitPush,
  gitStatusWithAhead,
  truncateStderr,
  type AutoSyncErrorClass
} from "../git.js";
import { LockManager, repoAutoSyncLockKey } from "../lock.js";
import type { Logger } from "../logger.js";

/** v0.11 §4.5.2 canonical attention-reason set. */
export type AutoSyncAttentionReason =
  | "dirty_working_tree"
  | "pull_not_fast_forward"
  | "push_rejected"
  | "divergent_branches"
  | "dirty_and_behind"
  | "fetch_failed"
  | "commit_failed";

/** Internal aggregate the cycle accumulates into for the SSE event. */
interface CycleAggregate {
  ok: number;
  noop: number;
  skipped: number;
  needs_attention: number;
}

/** Result of one `syncOne` invocation; consumed by `persistOutcome` + emit. */
interface SyncOneOutcome {
  status: AutoSyncStatus;
  /** Mirrors the persisted column. NULL only when status === ok / noop. */
  reason: string | null;
  /** Mirrors the persisted column. Free-form (truncated git stderr / hint). */
  detail: string | null;
  /**
   * When status === "needs_attention", these populate the SSE
   * RepoAutoSyncAttention event. NULL otherwise.
   */
  attention: {
    reason: AutoSyncAttentionReason;
    detail: string | undefined;
  } | null;
}

export interface AutoSyncServiceDeps {
  db: Db;
  config: AutoSyncConfig;
  events: EventBus;
  locks: LockManager;
  logger: Logger;
  /** Clock override for tests. */
  now?: () => number;
  /**
   * Optional jitter override for tests — receives the configured
   * `jitterMs` and returns a value in `[-jitterMs, jitterMs]`. Default
   * uses Math.random; tests inject a deterministic value.
   */
  jitter?: (jitterMs: number) => number;
  /**
   * Optional cold-start delay override (ms). Spec §4.4 calls for 60s.
   * Tests pass 0 to skip the wait.
   */
  coldStartMs?: number;
  /** Test seam for the per-primitive git surface (mirrors `RepoService.GitImpl`). */
  gitImpl?: AutoSyncGitImpl;
}

/** Minimal git surface AutoSyncService consumes (test-override point). */
export interface AutoSyncGitImpl {
  fetch: typeof gitFetch;
  status: typeof gitStatusWithAhead;
  pullFfOnly: typeof gitPullFfOnly;
  commitAll: typeof gitCommitAll;
  push: typeof gitPush;
  getLocalIdentity: typeof gitGetLocalIdentity;
}

export const defaultAutoSyncGitImpl: AutoSyncGitImpl = {
  fetch: gitFetch,
  status: gitStatusWithAhead,
  pullFfOnly: gitPullFfOnly,
  commitAll: gitCommitAll,
  push: gitPush,
  getLocalIdentity: gitGetLocalIdentity
};

export class AutoSyncService {
  private readonly repos: RepoRepository;
  private readonly git: AutoSyncGitImpl;
  private readonly now: () => number;
  private readonly jitter: (jitterMs: number) => number;
  private readonly coldStartMs: number;

  /** AbortController for the sleep loop; null when stopped. */
  private abort: AbortController | null = null;
  /** Resolves when the running cycle (if any) finishes. */
  private cyclePromise: Promise<void> | null = null;

  constructor(private readonly deps: AutoSyncServiceDeps) {
    this.repos = new RepoRepository(deps.db);
    this.git = deps.gitImpl ?? defaultAutoSyncGitImpl;
    this.now = deps.now ?? Date.now;
    this.jitter =
      deps.jitter ??
      ((j) => (j === 0 ? 0 : Math.floor((Math.random() * 2 - 1) * j)));
    this.coldStartMs = deps.coldStartMs ?? 60 * 1000;
  }

  // ---------- lifecycle ----------

  /**
   * Start the periodic loop. No-op if already started or `enabled === false`.
   *
   * Spec §4.4: cold start waits 60s before the first cycle so the
   * daemon doesn't smash the network during boot (when SeedService /
   * ProjectBootstrap may already be cloning). The first sleep is
   * `coldStartMs`; subsequent sleeps are `intervalMs ± jitterMs`.
   */
  start(): void {
    if (this.abort) {
      // Idempotent — start() called twice (e.g. test setup race) just no-ops.
      return;
    }
    if (!this.deps.config.enabled) {
      this.deps.logger.info("auto_sync.disabled", {
        source: this.deps.config.source
      });
      return;
    }

    this.deps.logger.info("auto_sync.started", {
      interval_ms: this.deps.config.intervalMs,
      jitter_ms: this.deps.config.jitterMs,
      cold_start_ms: this.coldStartMs,
      source: this.deps.config.source
    });

    const controller = new AbortController();
    this.abort = controller;

    // Run the loop detached. Errors inside `runCycle` are already
    // caught per-repo; an uncaught throw here is a programming bug
    // (e.g. listAll() blew up because the DB connection died) and
    // should kill the loop, not silently continue.
    void this.loop(controller.signal).catch((err) => {
      this.deps.logger.error("auto_sync.loop_crashed", {
        detail: err instanceof Error ? err.message : String(err)
      });
      // Mark stopped so a subsequent start() can resurrect.
      this.abort = null;
    });
  }

  /**
   * Stop the loop. Awaits any in-flight `runCycle` so callers (like
   * the daemon's SIGTERM handler) can safely close the DB / event bus
   * after `await stop()`.
   */
  async stop(): Promise<void> {
    const controller = this.abort;
    if (!controller) return;
    this.abort = null;
    controller.abort();
    if (this.cyclePromise) {
      // The in-flight cycle still has the per-repo lock; let it
      // unwind cleanly so emit / persistOutcome write the final row.
      try {
        await this.cyclePromise;
      } catch {
        // Errors are already logged inside runCycle.
      }
    }
    this.deps.logger.info("auto_sync.stopped");
  }

  // ---------- public for tests + manual trigger ----------

  /**
   * Run one cycle synchronously (returns when every repo's syncOne has
   * resolved + the aggregate event is emitted). Tests use this to
   * skip the sleep loop.
   *
   * `opts.signal` is honoured between repos (we don't yank a
   * mid-flight git op — that would leave the working tree in an
   * undefined state). The intent is "let this cycle finish, then
   * stop"; for hard cancellation, kill the daemon.
   */
  async runCycle(opts: { signal?: AbortSignal } = {}): Promise<void> {
    const cycleId = randomUUID();
    const startedAt = this.now();
    const repos = this.repos.listAll();
    const aggregate: CycleAggregate = {
      ok: 0,
      noop: 0,
      skipped: 0,
      needs_attention: 0
    };

    this.deps.logger.info("auto_sync.cycle.start", {
      cycle_id: cycleId,
      repos_total: repos.length
    });

    for (const repo of repos) {
      if (opts.signal?.aborted) {
        // Stop dispatching new repos but keep the aggregate honest:
        // we don't synthesize "skipped" rows for repos we never tried.
        // The cycle-completed event will report a smaller `repos_total`
        // sum than `repos.length` — that's the intended signal that
        // shutdown interrupted the cycle.
        this.deps.logger.info("auto_sync.cycle.aborted", {
          cycle_id: cycleId,
          processed: aggregate.ok + aggregate.noop + aggregate.skipped + aggregate.needs_attention
        });
        break;
      }

      try {
        await this.runOneRepo(repo, cycleId, aggregate);
      } catch (err) {
        // Defence-in-depth: runOneRepo should already swallow per-repo
        // errors. Anything reaching here is a bug in our own logic
        // (e.g. persist write threw). Log + count as skipped so the
        // aggregate stays consistent.
        this.deps.logger.error("auto_sync.repo.unhandled_error", {
          cycle_id: cycleId,
          repo_id: repo.id,
          repo_name: repo.name,
          detail: err instanceof Error ? err.message : String(err)
        });
        aggregate.skipped += 1;
      }
    }

    const duration = this.now() - startedAt;
    this.deps.logger.info("auto_sync.cycle.completed", {
      cycle_id: cycleId,
      duration_ms: duration,
      repos_total: repos.length,
      ok: aggregate.ok,
      noop: aggregate.noop,
      skipped: aggregate.skipped,
      needs_attention: aggregate.needs_attention
    });

    this.deps.events.emit({
      type: EventType.RepoAutoSyncCycleCompleted,
      payload: {
        cycle_id: cycleId,
        started_at: startedAt,
        duration_ms: duration,
        repos_total: repos.length,
        ok: aggregate.ok,
        noop: aggregate.noop,
        skipped: aggregate.skipped,
        needs_attention: aggregate.needs_attention
      }
    });
  }

  // ---------- internal: loop driver ----------

  private async loop(signal: AbortSignal): Promise<void> {
    // Cold start before first cycle.
    if (!(await this.sleep(this.coldStartMs, signal))) return;

    while (!signal.aborted) {
      // Track the in-flight cycle so stop() can await it.
      const cycle = this.runCycle({ signal });
      this.cyclePromise = cycle.then(
        () => undefined,
        () => undefined
      );
      try {
        await cycle;
      } catch (err) {
        this.deps.logger.error("auto_sync.cycle.crashed", {
          detail: err instanceof Error ? err.message : String(err)
        });
      } finally {
        this.cyclePromise = null;
      }
      if (signal.aborted) return;

      const nominal = this.deps.config.intervalMs;
      const offset = this.jitter(this.deps.config.jitterMs);
      // Floor at 1ms so a misconfigured jitter > interval can't push
      // the wait into negative territory; timers reject that anyway.
      const wait = Math.max(1, nominal + offset);
      if (!(await this.sleep(wait, signal))) return;
    }
  }

  /**
   * Cancellable sleep. Resolves `true` after the timeout, `false` if
   * the signal aborted while waiting. Never rejects.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    if (ms <= 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve(false);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve(true);
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  // ---------- internal: per-repo orchestration ----------

  private async runOneRepo(
    repo: SkillRepo,
    cycleId: string,
    aggregate: CycleAggregate
  ): Promise<void> {
    // Per-repo lock (non-blocking): if it's held, manual Refresh has
    // priority — we bow out and report `skipped`.
    const release = this.deps.locks.tryAcquire(repoAutoSyncLockKey(repo.id));
    if (!release) {
      this.deps.logger.info("auto_sync.repo.skipped_locked", {
        cycle_id: cycleId,
        repo_id: repo.id,
        repo_name: repo.name
      });
      const outcome: SyncOneOutcome = {
        status: "skipped",
        reason: "other_op_in_progress",
        detail: null,
        attention: null
      };
      this.persistOutcome(repo.id, outcome);
      this.tally(aggregate, outcome.status);
      return;
    }

    try {
      const outcome = await this.syncOne(repo);

      this.deps.logger.info("auto_sync.repo.outcome", {
        cycle_id: cycleId,
        repo_id: repo.id,
        repo_name: repo.name,
        repo_kind: repo.kind,
        status: outcome.status,
        reason: outcome.reason ?? undefined
      });

      this.persistOutcome(repo.id, outcome);
      this.tally(aggregate, outcome.status);

      if (outcome.attention) {
        this.deps.events.emit({
          type: EventType.RepoAutoSyncAttention,
          payload: {
            repo_id: repo.id,
            repo_name: repo.name,
            repo_kind:
              repo.kind === RepoKind.OpenSource ? "open-source" : "custom",
            reason: outcome.attention.reason,
            ...(outcome.attention.detail !== undefined
              ? { detail: outcome.attention.detail }
              : {}),
            occurred_at: this.now()
          }
        });
      }
    } catch (err) {
      // syncOne is contractually try/catch-internal, but a deeper bug
      // (e.g. SkillRepo lacks local_path → primitive throws unwrapped)
      // could land here. Persist as skipped to keep the table coherent.
      const detail = err instanceof Error ? err.message : String(err);
      this.deps.logger.error("auto_sync.repo.exception", {
        cycle_id: cycleId,
        repo_id: repo.id,
        repo_name: repo.name,
        detail
      });
      const outcome: SyncOneOutcome = {
        status: "skipped",
        reason: "internal_error",
        detail: truncateStderr(detail),
        attention: null
      };
      this.persistOutcome(repo.id, outcome);
      this.tally(aggregate, outcome.status);
    } finally {
      release();
    }
  }

  // ---------- internal: decision tree ----------

  /**
   * Map one repo's working-tree + remote state to a SyncOneOutcome.
   * Pure "decide what to do + do it"; no DB writes, no SSE emission.
   */
  private async syncOne(repo: SkillRepo): Promise<SyncOneOutcome> {
    if (!repo.local_path) {
      return {
        status: "skipped",
        reason: "no_local_path",
        detail: null,
        attention: null
      };
    }

    // 1) Fetch — if this fails the entire cycle for this repo aborts.
    try {
      await this.git.fetch(repo.local_path);
    } catch (err) {
      const cls = classifyGitError(err, "fetch");
      return this.attentionOutcome(cls, "fetch_failed");
    }

    // 2) Read status (clean / ahead / behind).
    let status: Awaited<ReturnType<typeof gitStatusWithAhead>>;
    try {
      status = await this.git.status(repo.local_path);
    } catch (err) {
      const cls = classifyGitError(err, "fetch");
      return this.attentionOutcome(cls, "fetch_failed");
    }

    // Repos with no upstream tracking branch can neither push nor
    // be pulled meaningfully; treat as skipped (not an error to
    // surface in the badge — it's a setup state).
    if (status.tracking === null) {
      return {
        status: "skipped",
        reason: "no_tracking_branch",
        detail: null,
        attention: null
      };
    }

    if (repo.kind === RepoKind.OpenSource) {
      return this.syncOpenSource(repo, status);
    }
    return this.syncCustom(repo, status);
  }

  /**
   * Open-source mirror — pull-only.
   *
   * - dirty       → needs_attention("dirty_working_tree")
   * - clean+0     → noop
   * - clean+>0    → pull --ff-only → ok / pull_not_fast_forward
   */
  private async syncOpenSource(
    repo: SkillRepo,
    status: Awaited<ReturnType<typeof gitStatusWithAhead>>
  ): Promise<SyncOneOutcome> {
    if (!status.clean) {
      // Spec §4.3: open-source dirty parks on `dirty_working_tree`.
      // The user is expected to either commit, stash, or run a
      // forced manual refresh (which has its own reset --hard path).
      return {
        status: "needs_attention",
        reason: "dirty_working_tree",
        detail: null,
        attention: {
          reason: "dirty_working_tree",
          detail: undefined
        }
      };
    }
    if (status.behind === 0) {
      return {
        status: "noop",
        reason: null,
        detail: null,
        attention: null
      };
    }
    try {
      await this.git.pullFfOnly(repo.local_path!);
      return {
        status: "ok",
        reason: null,
        detail: null,
        attention: null
      };
    } catch (err) {
      const cls = classifyGitError(err, "pull");
      // pull_not_fast_forward should not reach here for open-source
      // (we only pull when ahead === 0 by spec); but if simple-git
      // rejects for an upstream-history-rewrite reason, surface the
      // same attention reason.
      const reason: AutoSyncAttentionReason =
        cls.reason === "pull_not_fast_forward"
          ? "pull_not_fast_forward"
          : "fetch_failed";
      return this.attentionOutcome(cls, reason);
    }
  }

  /**
   * Custom (read-write) repo — full quadrant tree per spec §4.3.
   *
   *   clean + 0  + 0   → noop
   *   clean + 0  + >0  → pull --ff-only
   *   clean + >0 + 0   → push
   *   clean + >0 + >0  → divergent_branches (attention)
   *   dirty + behind=0 → commitAll → push
   *   dirty + behind>0 → dirty_and_behind (attention)
   */
  private async syncCustom(
    repo: SkillRepo,
    status: Awaited<ReturnType<typeof gitStatusWithAhead>>
  ): Promise<SyncOneOutcome> {
    const localPath = repo.local_path!;

    if (status.clean) {
      if (status.ahead === 0 && status.behind === 0) {
        return { status: "noop", reason: null, detail: null, attention: null };
      }
      if (status.ahead === 0 && status.behind > 0) {
        try {
          await this.git.pullFfOnly(localPath);
          return { status: "ok", reason: null, detail: null, attention: null };
        } catch (err) {
          const cls = classifyGitError(err, "pull");
          const reason: AutoSyncAttentionReason =
            cls.reason === "pull_not_fast_forward"
              ? "pull_not_fast_forward"
              : "fetch_failed";
          return this.attentionOutcome(cls, reason);
        }
      }
      if (status.ahead > 0 && status.behind === 0) {
        try {
          await this.git.push(localPath);
          return { status: "ok", reason: null, detail: null, attention: null };
        } catch (err) {
          const cls = classifyGitError(err, "push");
          return this.attentionOutcome(cls, "push_rejected");
        }
      }
      // ahead > 0 AND behind > 0 — true divergence; never auto-rebase.
      return {
        status: "needs_attention",
        reason: "divergent_branches",
        detail: `local ahead ${status.ahead}, behind ${status.behind}`,
        attention: {
          reason: "divergent_branches",
          detail: `ahead ${status.ahead}, behind ${status.behind}`
        }
      };
    }

    // dirty path
    if (status.behind > 0) {
      // Spec §4.3: dirty + behind = "fix it manually". Auto-merging
      // local edits with upstream would risk silent overwrites.
      return {
        status: "needs_attention",
        reason: "dirty_and_behind",
        detail: `behind ${status.behind} with uncommitted changes`,
        attention: {
          reason: "dirty_and_behind",
          detail: `behind ${status.behind}`
        }
      };
    }

    // dirty + behind=0 — commit + push.
    const identity = await this.git.getLocalIdentity(localPath);
    if (!identity.name || !identity.email) {
      // Spec §4.2 / risk #2: never silently fall back to --global config.
      return {
        status: "needs_attention",
        reason: "commit_failed",
        detail: "no_local_git_identity",
        attention: {
          reason: "commit_failed",
          detail: "no_local_git_identity"
        }
      };
    }
    let commitSha: string;
    try {
      commitSha = await this.git.commitAll(
        localPath,
        "astack: auto-sync local changes",
        { name: identity.name, email: identity.email }
      );
    } catch (err) {
      const cls = classifyGitError(err, "commit");
      return this.attentionOutcome(cls, "commit_failed");
    }
    try {
      await this.git.push(localPath);
      return {
        status: "ok",
        reason: null,
        detail: `committed ${commitSha.slice(0, 7)}`,
        attention: null
      };
    } catch (err) {
      const cls = classifyGitError(err, "push");
      // Commit landed locally; push failed. The badge reason is
      // push_rejected; on next cycle we'll fall through the
      // clean+ahead branch and retry the push.
      return this.attentionOutcome(cls, "push_rejected");
    }
  }

  // ---------- internal: writers + helpers ----------

  private persistOutcome(repoId: number, outcome: SyncOneOutcome): void {
    try {
      this.repos.persistAutoSyncOutcome(repoId, {
        status: outcome.status,
        reason: outcome.reason,
        detail: outcome.detail,
        at_ms: this.now()
      });
    } catch (err) {
      // Persisting the outcome row is the *only* state we keep about
      // an attempt; if the write fails, log + drop. We can't usefully
      // retry inside the cycle without risking an infinite loop on a
      // permanent DB issue.
      this.deps.logger.error("auto_sync.persist_failed", {
        repo_id: repoId,
        status: outcome.status,
        detail:
          err instanceof AstackError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err)
      });
    }
  }

  private tally(aggregate: CycleAggregate, status: AutoSyncStatus): void {
    aggregate[status] += 1;
  }

  /**
   * Bundle a `classifyGitError` result + chosen attention reason into
   * a SyncOneOutcome. Keeps the decision-tree branches readable.
   */
  private attentionOutcome(
    cls: AutoSyncErrorClass,
    reason: AutoSyncAttentionReason
  ): SyncOneOutcome {
    return {
      status: "needs_attention",
      reason,
      detail: cls.stderr,
      attention: {
        reason,
        detail: cls.detail ?? cls.stderr
      }
    };
  }
}
