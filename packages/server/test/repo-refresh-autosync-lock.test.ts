/**
 * RepoService.refresh — v0.11 §A3 auto-sync lock short-circuit.
 *
 * When `AutoSyncService` holds the per-repo auto-sync lock
 * (`repoAutoSyncLockKey(id)`), a manual refresh must NOT queue behind
 * it; instead it returns `skipped_reason: "auto_sync_in_progress"`
 * with the existing skill list intact, no git operations performed.
 *
 * This guards a UX regression: a user clicking "Refresh" while an
 * AutoSync cycle is mid-pull would otherwise stall the spinner for
 * the full duration of the cycle (which can run many seconds on a
 * slow `git push`).
 */

import path from "node:path";

import { RepoKind } from "@astack/shared";
import { describe, expect, it, vi } from "vitest";
import tmp from "tmp-promise";

import type { ServerConfig } from "../src/config.js";
import { openDatabase } from "../src/db/connection.js";
import { EventBus, type EmittedEvent } from "../src/events.js";
import { LockManager, repoAutoSyncLockKey } from "../src/lock.js";
import { nullLogger } from "../src/logger.js";
import { RepoService, type GitImpl } from "../src/services/repo.js";

import { createBareRepo } from "./helpers/git-fixture.js";

describe("RepoService.refresh × AutoSync lock", () => {
  it("returns skipped_reason='auto_sync_in_progress' when the auto-sync lock is held", async () => {
    const dataDir = await tmp.dir({ unsafeCleanup: true });
    const bare = await createBareRepo();
    await bare.addCommitPush(
      "skills/x/SKILL.md",
      "# x\n",
      "seed"
    );

    try {
      const db = openDatabase({ path: ":memory:" });
      const events = new EventBus();
      const emitted: EmittedEvent[] = [];
      events.subscribe((e) => emitted.push(e));
      const locks = new LockManager({ timeoutMs: 1000 });

      const config: ServerConfig = {
        host: "127.0.0.1",
        port: 7432,
        dataDir: dataDir.path,
        dbPath: ":memory:",
        reposDir: path.join(dataDir.path, "repos"),
        pidFile: path.join(dataDir.path, "daemon.pid"),
        logFile: path.join(dataDir.path, "daemon.log"),
        lockFile: path.join(dataDir.path, "daemon.lock"),
        configFile: path.join(dataDir.path, "config.json"),
        upstreamCacheTtlMs: 5 * 60 * 1000,
        repoLockTimeoutMs: 1000
      };

      // Spy on git.pull to assert it is NEVER called on the skip path.
      const pullSpy = vi.fn(async () => undefined);
      const gitImpl: GitImpl = {
        clone: async (url, target) => {
          // Use simple-git equivalent via local clone.
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          await promisify(execFile)("git", ["clone", url, target]);
        },
        pull: pullSpy,
        getHead: async (localPath) => {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const { stdout } = await promisify(execFile)(
            "git",
            ["rev-parse", "HEAD"],
            { cwd: localPath }
          );
          return {
            head: stdout.trim(),
            head_time: new Date().toISOString()
          };
        },
        remoteHead: async () => "0".repeat(40),
        isClean: async () => true
      };

      const repoService = new RepoService({
        db,
        config,
        events,
        locks,
        logger: nullLogger(),
        gitImpl
      });

      const { repo } = await repoService.register({
        git_url: bare.url,
        name: "lock-test",
        kind: RepoKind.Custom
      });

      // Simulate AutoSync holding the auto-sync lock during refresh.
      const release = locks.tryAcquire(repoAutoSyncLockKey(repo.id));
      expect(release).not.toBeNull();
      try {
        const result = await repoService.refresh(repo.id);
        expect(result.skipped_reason).toBe("auto_sync_in_progress");
        expect(result.changed).toBe(false);
        // CRITICAL: pull MUST NOT be called when we short-circuit.
        expect(pullSpy).not.toHaveBeenCalled();
      } finally {
        release!();
      }
    } finally {
      await Promise.all([dataDir.cleanup(), bare.dir.cleanup()]);
    }
  });

  it("proceeds normally when the auto-sync lock is free", async () => {
    const dataDir = await tmp.dir({ unsafeCleanup: true });
    const bare = await createBareRepo();
    await bare.addCommitPush("skills/y/SKILL.md", "# y\n", "seed");

    try {
      const db = openDatabase({ path: ":memory:" });
      const events = new EventBus();
      const locks = new LockManager({ timeoutMs: 1000 });

      const config: ServerConfig = {
        host: "127.0.0.1",
        port: 7432,
        dataDir: dataDir.path,
        dbPath: ":memory:",
        reposDir: path.join(dataDir.path, "repos"),
        pidFile: path.join(dataDir.path, "daemon.pid"),
        logFile: path.join(dataDir.path, "daemon.log"),
        lockFile: path.join(dataDir.path, "daemon.lock"),
        configFile: path.join(dataDir.path, "config.json"),
        upstreamCacheTtlMs: 5 * 60 * 1000,
        repoLockTimeoutMs: 1000
      };

      const pullSpy = vi.fn(async () => undefined);
      const gitImpl: GitImpl = {
        clone: async (url, target) => {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          await promisify(execFile)("git", ["clone", url, target]);
        },
        pull: pullSpy,
        getHead: async (localPath) => {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const { stdout } = await promisify(execFile)(
            "git",
            ["rev-parse", "HEAD"],
            { cwd: localPath }
          );
          return {
            head: stdout.trim(),
            head_time: new Date().toISOString()
          };
        },
        remoteHead: async () => "0".repeat(40),
        isClean: async () => true
      };

      const repoService = new RepoService({
        db,
        config,
        events,
        locks,
        logger: nullLogger(),
        gitImpl
      });

      const { repo } = await repoService.register({
        git_url: bare.url,
        name: "happy-path",
        kind: RepoKind.Custom
      });

      const result = await repoService.refresh(repo.id);
      expect(result.skipped_reason).toBeUndefined();
      // Pull was attempted because the lock was free.
      expect(pullSpy).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([dataDir.cleanup(), bare.dir.cleanup()]);
    }
  });
});
