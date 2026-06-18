/**
 * Git wrapper thin layer.
 *
 * Wraps `simple-git` with Astack's error handling contract:
 * any git failure becomes an AstackError(REPO_GIT_FAILED) with
 * the underlying stderr in `details.git_stderr`.
 *
 * Keeps git specifics out of RepoService so the service can focus
 * on business logic (lock, scan, emit events) instead of argv plumbing.
 */

import fs from "node:fs";
import path from "node:path";

import { AstackError, ErrorCode } from "@astack/shared";
import { simpleGit, type SimpleGit } from "simple-git";

export interface GitCloneOptions {
  /** Use --depth 1 to avoid pulling full history. */
  shallow: boolean;
}

export interface GitRepoInfo {
  /** Current HEAD commit hash (full 40-char). */
  head: string;
  /** ISO time of HEAD commit. */
  head_time: string;
}

/**
 * Clone a remote git URL into `localPath`. Creates parent dir if needed.
 * Throws REPO_GIT_FAILED on any git error.
 */
export async function gitClone(
  gitUrl: string,
  localPath: string,
  opts: GitCloneOptions
): Promise<void> {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  const git = simpleGit();
  const args: string[] = [];
  if (opts.shallow) args.push("--depth", "1");

  try {
    await git.clone(gitUrl, localPath, args);
  } catch (err) {
    throw wrapGitError(err, "git clone failed", { git_url: gitUrl });
  }
}

/**
 * Fetch + fast-forward the current branch.
 *
 * Uses `git pull --ff-only` to avoid producing merge commits in the
 * upstream mirror (merges should happen at the remote).
 */
export async function gitPull(localPath: string): Promise<void> {
  try {
    const git = simpleGit(localPath);
    await git.pull(["--ff-only"]);
  } catch (err) {
    throw wrapGitError(err, "git pull failed", { local_path: localPath });
  }
}

/** Stage everything, commit, and push. Throws on any git failure. */
export async function gitCommitAndPush(
  localPath: string,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  try {
    const git = simpleGit(localPath);
    await git.add(".");
    const commit = await git.commit(message, [], {
      "--author": `${author.name} <${author.email}>`
    });
    await git.push();
    return commit.commit;
  } catch (err) {
    throw wrapGitError(err, "git commit/push failed", {
      local_path: localPath,
      message
    });
  }
}

/**
 * Get current HEAD commit hash + commit time for a local repo.
 */
export async function gitGetHead(localPath: string): Promise<GitRepoInfo> {
  try {
    const git = simpleGit(localPath);
    const hash = (await git.revparse(["HEAD"])).trim();
    const log = await git.log({ maxCount: 1 });
    const time = log.latest?.date ?? new Date().toISOString();
    return { head: hash, head_time: toIso(time) };
  } catch (err) {
    throw wrapGitError(err, "git read HEAD failed", { local_path: localPath });
  }
}

/**
 * Check whether remote has moved past local HEAD (i.e. pull would update).
 * Returns the remote HEAD hash regardless.
 */
export async function gitRemoteHead(localPath: string): Promise<string> {
  try {
    const git = simpleGit(localPath);
    // `git ls-remote origin HEAD` returns: `<hash>\tHEAD`
    // Note: `--heads` would filter to refs/heads/* and exclude HEAD ref.
    const result = await git.listRemote(["origin", "HEAD"]);
    const firstLine = result.trim().split("\n")[0] ?? "";
    const hash = firstLine.split(/\s+/)[0] ?? "";
    if (!/^[0-9a-f]{40}$/i.test(hash)) {
      throw new Error(`unexpected ls-remote output: ${result}`);
    }
    return hash;
  } catch (err) {
    throw wrapGitError(err, "git ls-remote failed", { local_path: localPath });
  }
}

/** True if the local repo has no uncommitted changes. */
export async function gitIsClean(localPath: string): Promise<boolean> {
  try {
    const git = simpleGit(localPath);
    const status = await git.status();
    return status.isClean();
  } catch (err) {
    throw wrapGitError(err, "git status failed", { local_path: localPath });
  }
}

/**
 * Hard-reset the working tree + index of `localPath` to the given ref
 * (e.g. `"origin/HEAD"`). Used by the open-source mirror self-heal path
 * (v0.6 `SyncService.ensureMirrorClean`) to discard any hand-edits that
 * would otherwise block `git pull --ff-only`.
 *
 * Destructive by design. Callers MUST gate on `gitIsClean() === false`
 * AND repo kind (only open-source mirrors are valid recipients) before
 * invoking. See v0.6 spec §A1 for why custom repos are excluded.
 */
export async function gitResetHard(
  localPath: string,
  ref: string
): Promise<void> {
  try {
    const git = simpleGit(localPath);
    await git.raw(["reset", "--hard", ref]);
  } catch (err) {
    throw wrapGitError(err, "git reset --hard failed", {
      local_path: localPath,
      ref
    });
  }
}

/**
 * Attach a standard SimpleGit instance for advanced callers (e.g. log diff).
 * Rare — most code should use the typed helpers above.
 */
export function attachGit(localPath: string): SimpleGit {
  return simpleGit(localPath);
}

// ---------- v0.11 AutoSync primitives ----------
//
// AutoSyncService consumes these *instead of* RepoService.refresh /
// SyncService.syncProject (spec §A1). Naming is intentionally
// different from `gitPull` even though `gitPullFfOnly` is implemented
// the same way: the call-site separation lets logger keys
// (`auto_sync.git.pull_ff_only` vs `repo.refresh.pull`) be partitioned
// for post-hoc debugging without reflecting on the call stack.

/**
 * `git fetch` against `origin` for the current branch. Read-only:
 * mutates `.git/refs/remotes/origin/*` only, never touches the working
 * tree. Used by AutoSync to refresh remote state before deciding the
 * four-quadrant action (spec §4.3).
 */
export async function gitFetch(localPath: string): Promise<void> {
  try {
    const git = simpleGit(localPath);
    await git.fetch();
  } catch (err) {
    throw wrapGitError(err, "git fetch failed", { local_path: localPath });
  }
}

/** Result of `gitStatusWithAhead` — the working-tree + tracking-branch summary. */
export interface GitStatusSummary {
  /** True iff working tree has zero modified / untracked / staged files. */
  clean: boolean;
  /** Commits HEAD is ahead of upstream tracking branch. */
  ahead: number;
  /** Commits HEAD is behind upstream tracking branch. */
  behind: number;
  /** Current branch name, or null when detached. */
  branch: string | null;
  /** Tracking branch (e.g. "origin/main"), or null when none. */
  tracking: string | null;
}

/**
 * Read working-tree status + ahead/behind counters relative to the
 * tracking branch. Caller is expected to have run `gitFetch` first if
 * accuracy of `behind` matters (otherwise the count reflects whatever
 * `origin/<branch>` happened to point at on the last fetch).
 *
 * `simple-git`'s status() returns ahead/behind as numbers; for repos
 * with no upstream tracking branch both are 0 and `tracking` is null
 * — AutoSync treats that case as `noop` (custom) or `skipped` per
 * spec §4.3 (a repo with no remote tracking is not push-able).
 */
export async function gitStatusWithAhead(
  localPath: string
): Promise<GitStatusSummary> {
  try {
    const git = simpleGit(localPath);
    const status = await git.status();
    return {
      clean: status.isClean(),
      ahead: status.ahead ?? 0,
      behind: status.behind ?? 0,
      branch: status.current ?? null,
      tracking: status.tracking ?? null
    };
  } catch (err) {
    throw wrapGitError(err, "git status failed", { local_path: localPath });
  }
}

/**
 * Fast-forward only pull. Equivalent to the existing `gitPull`
 * implementation; exposed under a separate name so AutoSync's call
 * sites are grep-able and its logger keys do not collide with
 * `RepoService.refresh`'s `git pull`. See spec §A1 / §6.4 PR1.
 */
export async function gitPullFfOnly(localPath: string): Promise<void> {
  try {
    const git = simpleGit(localPath);
    await git.pull(["--ff-only"]);
  } catch (err) {
    throw wrapGitError(err, "git pull --ff-only failed", {
      local_path: localPath
    });
  }
}

/**
 * Stage every change + create one commit on the current branch with
 * the given author. Does NOT push. Returns the new commit SHA.
 *
 * AutoSync uses this for the `custom + dirty + behind=0` quadrant
 * (spec §4.3). Author is read from `git config --local user.name/email`
 * via `gitGetLocalIdentity`; we never silently fall back to the
 * `--global` config (risk #2).
 *
 * Hooks (pre-commit etc.) are NOT bypassed: `--no-verify` is
 * forbidden by Git Safety Protocol. A hook failure raises and
 * AutoSyncService maps the error to `commit_failed` via
 * `classifyGitError`.
 */
export async function gitCommitAll(
  localPath: string,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  try {
    const git = simpleGit(localPath);
    await git.add(".");
    const result = await git.commit(message, [], {
      "--author": `${author.name} <${author.email}>`
    });
    return result.commit;
  } catch (err) {
    throw wrapGitError(err, "git commit failed", {
      local_path: localPath,
      message
    });
  }
}

/**
 * Push the current branch to its tracking remote. Plain push — no
 * `--force`, no `--force-with-lease`, no `--no-verify`. AutoSync's
 * decision tree never reaches here unless ahead > 0 AND behind === 0,
 * so a non-fast-forward rejection from the remote is a true conflict
 * and surfaces as `push_rejected`.
 */
export async function gitPush(localPath: string): Promise<void> {
  try {
    const git = simpleGit(localPath);
    await git.push();
  } catch (err) {
    throw wrapGitError(err, "git push failed", { local_path: localPath });
  }
}

/** Result of `gitGetLocalIdentity` — null fields ⇒ "not configured". */
export interface GitLocalIdentity {
  name: string | null;
  email: string | null;
}

/**
 * Read `git config --local user.name` and `--local user.email` — does
 * NOT consult `--global` (spec §4.2 / risk #2). When the local config
 * is unset, AutoSync raises `needs_attention("commit_failed",
 * detail:"no_local_git_identity")` and prompts the user to run
 * `git -C <repo> config --local user.name "..."`. Silently falling
 * back to `--global` is rejected because cross-repo identity pollution
 * (e.g. astack-marketplace uses `zerovoxxx`, FinClaw uses `alexjhwen`) is
 * a real footgun on this maintainer's setup.
 */
export async function gitGetLocalIdentity(
  localPath: string
): Promise<GitLocalIdentity> {
  const git = simpleGit(localPath);
  const readLocal = async (key: string): Promise<string | null> => {
    try {
      // `git config --local <key>` exits 1 when the key is unset; in
      // simple-git this surfaces as a thrown GitError. Treat that
      // specific shape as "not configured" rather than a hard failure.
      const out = await git.raw(["config", "--local", key]);
      const trimmed = out.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  };
  const [name, email] = await Promise.all([
    readLocal("user.name"),
    readLocal("user.email")
  ]);
  return { name, email };
}

// ---------- v0.11 error classification ----------

/**
 * AutoSync's mapping from a thrown git error to one of the documented
 * `needs_attention` reasons (spec §4.5.2 / §A4). Returned `detail` is
 * a short label (`"authentication"`, `"non_fast_forward"`,
 * `"protected_branch"`, …) for the structured field; the verbose
 * stderr excerpt goes into `stderr` for the SSE payload.
 */
export type AutoSyncErrorReason =
  | "fetch_failed"
  | "pull_not_fast_forward"
  | "push_rejected"
  | "commit_failed";

export interface AutoSyncErrorClass {
  /** High-level category — controls which decision-tree branch is final. */
  reason: AutoSyncErrorReason;
  /** Short structured label (e.g. "authentication"). Optional. */
  detail?: string;
  /** Truncated stderr; safe to surface to the user. */
  stderr: string;
}

/**
 * Classify a thrown git error from one of the v0.11 primitives. The
 * input is typed `unknown` to match `catch` semantics; we sniff for
 * `Error.message` (simple-git's `GitError` extends `Error` and bakes
 * stderr into `message`) and the `AstackError` wrapper produced by
 * `wrapGitError` (which carries `details.git_stderr`).
 *
 * `op` lets the caller bias classification: a `push` error with the
 * "non-fast-forward" string is `push_rejected`; the same string from
 * a `pull` is `pull_not_fast_forward`. When `op` is unknown we fall
 * back to `fetch_failed` (the most common entry point of the
 * decision tree).
 */
export function classifyGitError(
  err: unknown,
  op: "fetch" | "pull" | "push" | "commit"
): AutoSyncErrorClass {
  const stderr = extractStderr(err);
  const lower = stderr.toLowerCase();
  const truncated = truncateStderr(stderr);

  if (op === "fetch") {
    if (
      lower.includes("permission denied") ||
      lower.includes("could not read username") ||
      lower.includes("authentication failed") ||
      lower.includes("publickey")
    ) {
      return {
        reason: "fetch_failed",
        detail: "authentication",
        stderr: truncated
      };
    }
    return { reason: "fetch_failed", stderr: truncated };
  }

  if (op === "pull") {
    if (
      lower.includes("not possible to fast-forward") ||
      lower.includes("non-fast-forward")
    ) {
      return { reason: "pull_not_fast_forward", stderr: truncated };
    }
    // A pull failure that is not the FF-only rejection is essentially a
    // fetch problem in disguise (network / auth / hook).
    return { reason: "fetch_failed", stderr: truncated };
  }

  if (op === "push") {
    if (lower.includes("protected branch")) {
      return {
        reason: "push_rejected",
        detail: "protected_branch",
        stderr: truncated
      };
    }
    if (
      lower.includes("non-fast-forward") ||
      lower.includes("rejected") ||
      lower.includes("fetch first")
    ) {
      return {
        reason: "push_rejected",
        detail: "non_fast_forward",
        stderr: truncated
      };
    }
    return { reason: "push_rejected", stderr: truncated };
  }

  // op === "commit" — pre-commit hook failure, missing identity, etc.
  return { reason: "commit_failed", stderr: truncated };
}

/**
 * stderr truncation policy (spec §A4): prefer fatal:/error: lines so
 * the diagnostic doesn't get sliced off; fall back to "tail of last
 * 500 chars" because git tends to emit the actionable message near
 * the end of the output.
 */
export function truncateStderr(stderr: string, max = 500): string {
  const lines = stderr.split("\n");
  const fatal = lines.filter(
    (l) => l.startsWith("fatal:") || l.startsWith("error:") || l.startsWith("hint:")
  );
  if (fatal.length > 0) {
    const joined = fatal.join("\n");
    return joined.length > max ? joined.slice(0, max) + "..." : joined;
  }
  return stderr.length > max ? "..." + stderr.slice(-max) : stderr;
}

function extractStderr(err: unknown): string {
  if (err instanceof AstackError) {
    const stored = err.details?.git_stderr;
    if (typeof stored === "string") return stored;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------- Internal ----------

function wrapGitError(
  err: unknown,
  message: string,
  details: Record<string, unknown>
): AstackError {
  const stderr =
    err instanceof Error && "message" in err
      ? err.message
      : String(err);
  return new AstackError(ErrorCode.REPO_GIT_FAILED, message, {
    ...details,
    git_stderr: stderr
  });
}

function toIso(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.valueOf())
    ? new Date().toISOString()
    : date.toISOString();
}
