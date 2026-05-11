/**
 * AutoSyncService — PR1 unit tests.
 *
 * Approach:
 *   - DB is real (`:memory:` SQLite) so `RepoRepository.persistAutoSyncOutcome`
 *     and the four v0.11 columns get exercised end-to-end.
 *   - Git is fully mocked via `AutoSyncGitImpl` so each test names the
 *     working-tree state directly (clean / ahead / behind) without
 *     spinning up a fixture repo per branch.
 *   - Locks / events / logger are real to catch regressions in their
 *     contracts (e.g. an event payload shape mismatch will throw at
 *     emit-time because `AstackEventSchema` is a discriminated union;
 *     here we don't re-validate, but the consumer subscribes via
 *     `EventBus` which preserves shape).
 *
 * Maps to spec §6.4 / §A1: AutoSync does NOT delegate to RepoService /
 * SyncService, so no harness wiring is needed.
 */

import { EventType, RepoKind, type AutoSyncStatus } from "@astack/shared";
import { describe, expect, it, vi } from "vitest";

import { openDatabase } from "../src/db/connection.js";
import { RepoRepository } from "../src/db/repos.js";
import { EventBus, type EmittedEvent } from "../src/events.js";
import { AstackError, ErrorCode } from "@astack/shared";
import { LockManager, repoAutoSyncLockKey } from "../src/lock.js";
import { nullLogger } from "../src/logger.js";
import {
  AutoSyncService,
  type AutoSyncGitImpl
} from "../src/services/auto-sync.js";

// ---------- shared fixture ----------

interface SetupOpts {
  enabled?: boolean;
  intervalMs?: number;
  jitterMs?: number;
  /** Mock git surface; if omitted a no-op happy-path mock is used. */
  git?: Partial<AutoSyncGitImpl>;
  /** Override now() — useful for stable timestamps in assertions. */
  now?: () => number;
}

function setup(opts: SetupOpts = {}): {
  service: AutoSyncService;
  db: ReturnType<typeof openDatabase>;
  repos: RepoRepository;
  events: EventBus;
  emitted: EmittedEvent[];
  locks: LockManager;
  insertRepo(name: string, kind?: RepoKind): number;
} {
  const db = openDatabase({ path: ":memory:" });
  const repos = new RepoRepository(db);
  const events = new EventBus();
  const emitted: EmittedEvent[] = [];
  events.subscribe((e) => emitted.push(e));
  const locks = new LockManager({ timeoutMs: 100 });

  const happyGit: AutoSyncGitImpl = {
    fetch: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
      clean: true,
      ahead: 0,
      behind: 0,
      branch: "main",
      tracking: "origin/main"
    })),
    pullFfOnly: vi.fn(async () => undefined),
    commitAll: vi.fn(async () => "fake-sha"),
    push: vi.fn(async () => undefined),
    getLocalIdentity: vi.fn(async () => ({
      name: "Test",
      email: "test@example.com"
    }))
  };
  const git: AutoSyncGitImpl = { ...happyGit, ...(opts.git ?? {}) };

  const service = new AutoSyncService({
    db,
    config: {
      enabled: opts.enabled ?? true,
      intervalMs: opts.intervalMs ?? 60_000,
      jitterMs: opts.jitterMs ?? 0,
      source: "default"
    },
    events,
    locks,
    logger: nullLogger(),
    coldStartMs: 0,
    jitter: () => 0,
    gitImpl: git,
    now: opts.now
  });

  let nextId = 1;
  const insertRepo = (name: string, kind: RepoKind = RepoKind.Custom): number => {
    const row = repos.insert({
      name,
      git_url: `https://example.com/${name}.git`,
      kind,
      local_path: `/fake/${name}`
    });
    nextId = row.id + 1;
    return row.id;
  };
  void nextId; // silence unused-var lint

  return { service, db, repos, events, emitted, locks, insertRepo };
}

// ---------- T1 / T1.5: lifecycle ----------

describe("AutoSyncService lifecycle", () => {
  it("T1: start() then stop() resolves without running a cycle when no repos exist", async () => {
    const { service, emitted } = setup();
    service.start();
    await service.stop();
    // No repos → no cycle was forced; only ambient logger noise.
    expect(emitted.filter((e) => e.event.type === EventType.RepoAutoSyncCycleCompleted)).toHaveLength(0);
  });

  it("T1.5: start() is a no-op when config.enabled === false", async () => {
    const { service } = setup({ enabled: false });
    service.start();
    // Stop is still safe to call.
    await service.stop();
  });

  it("start() then start() is idempotent (second call is a no-op)", async () => {
    const { service } = setup();
    service.start();
    service.start(); // must not throw / spawn a second loop
    await service.stop();
  });

  it("stop() before start() resolves without error", async () => {
    const { service } = setup();
    await service.stop();
  });

  it("runCycle() with zero repos still emits cycle_completed with totals=0", async () => {
    const { service, emitted } = setup();
    await service.runCycle();
    const cycleEvents = emitted.filter(
      (e) => e.event.type === EventType.RepoAutoSyncCycleCompleted
    );
    expect(cycleEvents).toHaveLength(1);
    const payload = cycleEvents[0]!.event.payload as {
      repos_total: number;
      ok: number;
      noop: number;
      skipped: number;
      needs_attention: number;
    };
    expect(payload.repos_total).toBe(0);
    expect(payload.ok).toBe(0);
    expect(payload.noop).toBe(0);
    expect(payload.skipped).toBe(0);
    expect(payload.needs_attention).toBe(0);
  });
});

// ---------- T2–T9: decision tree (custom) ----------

describe("AutoSyncService.syncOne (custom repo)", () => {
  it("T2: clean + ahead=0 + behind=0 → noop", async () => {
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 0,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        })
      }
    });
    const id = fx.insertRepo("noop-repo");
    await fx.service.runCycle();

    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("noop");
    expect(repo.last_auto_sync_reason).toBeNull();
    // No attention event for noop.
    expect(
      fx.emitted.filter((e) => e.event.type === EventType.RepoAutoSyncAttention)
    ).toHaveLength(0);
  });

  it("T3: clean + ahead=0 + behind>0 → pull --ff-only → ok", async () => {
    const pullFfOnly = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 0,
          behind: 3,
          branch: "main",
          tracking: "origin/main"
        }),
        pullFfOnly
      }
    });
    const id = fx.insertRepo("pull-repo");
    await fx.service.runCycle();

    expect(pullFfOnly).toHaveBeenCalledOnce();
    expect(fx.repos.findById(id)!.last_auto_sync_status).toBe<AutoSyncStatus>(
      "ok"
    );
  });

  it("T3.5: pull rejected with non-fast-forward → needs_attention(pull_not_fast_forward)", async () => {
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 0,
          behind: 5,
          branch: "main",
          tracking: "origin/main"
        }),
        pullFfOnly: async () => {
          throw new AstackError(
            ErrorCode.REPO_GIT_FAILED,
            "pull failed",
            { git_stderr: "fatal: Not possible to fast-forward, aborting." }
          );
        }
      }
    });
    const id = fx.insertRepo("ff-fail-repo");
    await fx.service.runCycle();

    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("pull_not_fast_forward");

    const attention = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncAttention
    );
    expect(attention).toBeDefined();
    const payload = attention!.event.payload as { reason: string };
    expect(payload.reason).toBe("pull_not_fast_forward");
  });

  it("T4: clean + ahead>0 + behind=0 → push → ok", async () => {
    const push = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 2,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        }),
        push
      }
    });
    const id = fx.insertRepo("push-repo");
    await fx.service.runCycle();

    expect(push).toHaveBeenCalledOnce();
    expect(fx.repos.findById(id)!.last_auto_sync_status).toBe<AutoSyncStatus>(
      "ok"
    );
  });

  it("T5: clean + ahead>0 + behind>0 → divergent_branches (no auto-merge)", async () => {
    const push = vi.fn(async () => undefined);
    const pullFfOnly = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 2,
          behind: 3,
          branch: "main",
          tracking: "origin/main"
        }),
        push,
        pullFfOnly
      }
    });
    const id = fx.insertRepo("diverge-repo");
    await fx.service.runCycle();

    // CRITICAL: never tried to push or pull — divergent state parks immediately.
    expect(push).not.toHaveBeenCalled();
    expect(pullFfOnly).not.toHaveBeenCalled();

    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("divergent_branches");

    const attention = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncAttention
    );
    expect(attention).toBeDefined();
    const payload = attention!.event.payload as { reason: string };
    expect(payload.reason).toBe("divergent_branches");
  });

  it("T6: dirty + behind=0 → commitAll → push → ok", async () => {
    const commitAll = vi.fn(async () => "abc1234");
    const push = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: false,
          ahead: 0,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        }),
        commitAll,
        push
      }
    });
    const id = fx.insertRepo("dirty-clean-repo");
    await fx.service.runCycle();

    expect(commitAll).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("ok");
    // detail field carries the short commit sha.
    expect(repo.last_auto_sync_detail).toContain("abc1234");
  });

  it("T7: dirty + behind>0 → dirty_and_behind (no commit, no push)", async () => {
    const commitAll = vi.fn(async () => "fake");
    const push = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: false,
          ahead: 0,
          behind: 4,
          branch: "main",
          tracking: "origin/main"
        }),
        commitAll,
        push
      }
    });
    const id = fx.insertRepo("dirty-behind-repo");
    await fx.service.runCycle();

    expect(commitAll).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("dirty_and_behind");
  });

  it("T8: dirty + behind=0 + no local identity → commit_failed(no_local_git_identity)", async () => {
    const commitAll = vi.fn(async () => "fake");
    const fx = setup({
      git: {
        status: async () => ({
          clean: false,
          ahead: 0,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        }),
        getLocalIdentity: async () => ({ name: null, email: null }),
        commitAll
      }
    });
    const id = fx.insertRepo("no-id-repo");
    await fx.service.runCycle();

    // CRITICAL: never attempted to commit without a local identity (risk #2).
    expect(commitAll).not.toHaveBeenCalled();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("commit_failed");
    expect(repo.last_auto_sync_detail).toBe("no_local_git_identity");

    const attention = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncAttention
    );
    const payload = attention!.event.payload as {
      reason: string;
      detail?: string;
    };
    expect(payload.reason).toBe("commit_failed");
    expect(payload.detail).toBe("no_local_git_identity");
  });

  it("T9a: push rejected (non-fast-forward) after clean+ahead → push_rejected", async () => {
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 1,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        }),
        push: async () => {
          throw new AstackError(
            ErrorCode.REPO_GIT_FAILED,
            "push failed",
            {
              git_stderr:
                "error: failed to push some refs\nhint: Updates were rejected because the remote contains work...\nfatal: non-fast-forward"
            }
          );
        }
      }
    });
    const id = fx.insertRepo("push-rej-repo");
    await fx.service.runCycle();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("push_rejected");
  });

  it("T9b: push rejected (protected branch) → push_rejected/protected_branch detail", async () => {
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 1,
          behind: 0,
          branch: "main",
          tracking: "origin/main"
        }),
        push: async () => {
          throw new AstackError(
            ErrorCode.REPO_GIT_FAILED,
            "push failed",
            {
              git_stderr:
                "remote: error: GH006: Protected branch update failed for refs/heads/main."
            }
          );
        }
      }
    });
    const id = fx.insertRepo("protected-repo");
    await fx.service.runCycle();
    expect(fx.repos.findById(id)!.last_auto_sync_reason).toBe("push_rejected");
    const attention = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncAttention
    );
    const payload = attention!.event.payload as { detail?: string };
    expect(payload.detail).toBe("protected_branch");
  });

  it("T9c: fetch fails (auth) → fetch_failed/authentication", async () => {
    const fx = setup({
      git: {
        fetch: async () => {
          throw new AstackError(
            ErrorCode.REPO_GIT_FAILED,
            "fetch failed",
            {
              git_stderr:
                "fatal: Authentication failed for 'https://example.com/x.git/'"
            }
          );
        }
      }
    });
    const id = fx.insertRepo("auth-fail-repo");
    await fx.service.runCycle();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("needs_attention");
    expect(repo.last_auto_sync_reason).toBe("fetch_failed");
    const attention = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncAttention
    );
    const payload = attention!.event.payload as { detail?: string };
    expect(payload.detail).toBe("authentication");
  });
});

// ---------- T10–T12: open-source + lock + aggregate ----------

describe("AutoSyncService.syncOne (open-source repo)", () => {
  it("T10: open-source + dirty → dirty_working_tree (no pull)", async () => {
    const pullFfOnly = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: false,
          ahead: 0,
          behind: 2,
          branch: "main",
          tracking: "origin/main"
        }),
        pullFfOnly
      }
    });
    const id = fx.insertRepo("os-dirty-repo", RepoKind.OpenSource);
    await fx.service.runCycle();

    expect(pullFfOnly).not.toHaveBeenCalled();
    expect(fx.repos.findById(id)!.last_auto_sync_reason).toBe(
      "dirty_working_tree"
    );
  });

  it("open-source + clean + behind=0 → noop", async () => {
    const fx = setup();
    const id = fx.insertRepo("os-clean-repo", RepoKind.OpenSource);
    await fx.service.runCycle();
    expect(fx.repos.findById(id)!.last_auto_sync_status).toBe<AutoSyncStatus>(
      "noop"
    );
  });

  it("open-source + clean + behind>0 → pull → ok", async () => {
    const pullFfOnly = vi.fn(async () => undefined);
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 0,
          behind: 7,
          branch: "main",
          tracking: "origin/main"
        }),
        pullFfOnly
      }
    });
    const id = fx.insertRepo("os-update-repo", RepoKind.OpenSource);
    await fx.service.runCycle();
    expect(pullFfOnly).toHaveBeenCalledOnce();
    expect(fx.repos.findById(id)!.last_auto_sync_status).toBe<AutoSyncStatus>(
      "ok"
    );
  });
});

describe("AutoSyncService cross-repo behaviors", () => {
  it("T11: per-repo lock — when held externally, repo is skipped(other_op_in_progress)", async () => {
    const fx = setup();
    const id = fx.insertRepo("locked-repo");

    // Simulate manual Refresh holding the auto-sync lock.
    const release = fx.locks.tryAcquire(repoAutoSyncLockKey(id));
    expect(release).not.toBeNull();
    try {
      await fx.service.runCycle();
      const repo = fx.repos.findById(id)!;
      expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("skipped");
      expect(repo.last_auto_sync_reason).toBe("other_op_in_progress");
    } finally {
      release!();
    }
  });

  it("T12: cycle_completed event aggregates per-repo outcomes", async () => {
    const fx = setup({
      git: {
        // First repo: noop. Second: needs_attention. Third: ok.
        status: vi
          .fn()
          // first call (repo 1)
          .mockResolvedValueOnce({
            clean: true,
            ahead: 0,
            behind: 0,
            branch: "main",
            tracking: "origin/main"
          })
          // second call (repo 2)
          .mockResolvedValueOnce({
            clean: true,
            ahead: 1,
            behind: 1,
            branch: "main",
            tracking: "origin/main"
          })
          // third call (repo 3)
          .mockResolvedValueOnce({
            clean: true,
            ahead: 0,
            behind: 1,
            branch: "main",
            tracking: "origin/main"
          })
      }
    });
    fx.insertRepo("agg-1");
    fx.insertRepo("agg-2");
    fx.insertRepo("agg-3");

    await fx.service.runCycle();

    const cycleEvent = fx.emitted.find(
      (e) => e.event.type === EventType.RepoAutoSyncCycleCompleted
    );
    expect(cycleEvent).toBeDefined();
    const payload = cycleEvent!.event.payload as {
      repos_total: number;
      ok: number;
      noop: number;
      skipped: number;
      needs_attention: number;
    };
    expect(payload.repos_total).toBe(3);
    expect(payload.ok).toBe(1);
    expect(payload.noop).toBe(1);
    expect(payload.needs_attention).toBe(1);
    expect(payload.skipped).toBe(0);
  });

  it("repo with no tracking branch is skipped(no_tracking_branch)", async () => {
    const fx = setup({
      git: {
        status: async () => ({
          clean: true,
          ahead: 0,
          behind: 0,
          branch: "main",
          tracking: null
        })
      }
    });
    const id = fx.insertRepo("no-tracking-repo");
    await fx.service.runCycle();
    const repo = fx.repos.findById(id)!;
    expect(repo.last_auto_sync_status).toBe<AutoSyncStatus>("skipped");
    expect(repo.last_auto_sync_reason).toBe("no_tracking_branch");
  });

  it("repo with null local_path is skipped(no_local_path)", async () => {
    const db = openDatabase({ path: ":memory:" });
    const repos = new RepoRepository(db);
    const events = new EventBus();
    const locks = new LockManager({ timeoutMs: 100 });
    const service = new AutoSyncService({
      db,
      config: {
        enabled: true,
        intervalMs: 60_000,
        jitterMs: 0,
        source: "default"
      },
      events,
      locks,
      logger: nullLogger(),
      coldStartMs: 0,
      jitter: () => 0
    });

    const row = repos.insert({
      name: "no-local-path-repo",
      git_url: "https://example.com/x.git",
      kind: RepoKind.Custom,
      local_path: null
    });
    await service.runCycle();
    const updated = repos.findById(row.id)!;
    expect(updated.last_auto_sync_status).toBe<AutoSyncStatus>("skipped");
    expect(updated.last_auto_sync_reason).toBe("no_local_path");
  });
});
