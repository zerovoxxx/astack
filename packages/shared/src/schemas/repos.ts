/**
 * Endpoint contracts for /api/repos/*.
 *
 * Endpoints (see design.md § Eng Review § 8):
 *   POST   /api/repos                      — register skill repo
 *   GET    /api/repos                      — list registered repos
 *   DELETE /api/repos/:id                  — remove repo
 *   POST   /api/repos/:id/refresh          — force pull latest
 *   GET    /api/repos/:id/skills           — list skills in a repo
 */

import { z } from "zod";

import {
  IdSchema,
  NonEmptyStringSchema,
  PaginationSchema,
  RepoKindSchema,
  ScanConfigSchema,
  SkillRepoSchema,
  SkillSchema
} from "./common.js";

// ---------- POST /api/repos ----------

export const RegisterRepoRequestSchema = z.object({
  /** Remote git URL, e.g. "git@github.com:alexjhwen/my-skills.git". */
  git_url: NonEmptyStringSchema,
  /** Optional override; default = last segment of git_url without .git. */
  name: NonEmptyStringSchema.optional(),
  /**
   * Ownership model.
   * - "custom"      — default; two-way sync (pull + push)
   * - "open-source" — pull-only; push returns REPO_READONLY
   */
  kind: RepoKindSchema.default("custom"),
  /**
   * Override scan layout. Null / omitted = use `DEFAULT_SCAN_CONFIG`
   * (skills/<n>/SKILL.md + commands/*.md). Added in v0.2.
   */
  scan_config: ScanConfigSchema.nullish()
});
export type RegisterRepoRequest = z.infer<typeof RegisterRepoRequestSchema>;

/** Returns the newly-created repo plus initial scan result. */
export const RegisterRepoResponseSchema = z.object({
  repo: SkillRepoSchema,
  skills: z.array(SkillSchema),
  /** Convenience counts to show in UI toast / CLI output. */
  command_count: z.number().int().nonnegative(),
  skill_count: z.number().int().nonnegative()
});
export type RegisterRepoResponse = z.infer<typeof RegisterRepoResponseSchema>;

// ---------- GET /api/repos ----------

export const ListReposQuerySchema = PaginationSchema;
export type ListReposQuery = z.infer<typeof ListReposQuerySchema>;

export const ListReposResponseSchema = z.object({
  repos: z.array(SkillRepoSchema),
  total: z.number().int().nonnegative()
});
export type ListReposResponse = z.infer<typeof ListReposResponseSchema>;

// ---------- DELETE /api/repos/:id ----------

export const RepoParamsSchema = z.object({
  id: z.coerce.number().pipe(IdSchema)
});
export type RepoParams = z.infer<typeof RepoParamsSchema>;

export const DeleteRepoResponseSchema = z.object({
  deleted: z.literal(true),
  id: IdSchema
});
export type DeleteRepoResponse = z.infer<typeof DeleteRepoResponseSchema>;

// ---------- POST /api/repos/:id/refresh ----------

/**
 * Body for `POST /api/repos/:id/refresh` (v0.10+).
 *
 * `force=true` means "reset the open-source mirror to `origin/HEAD` before
 * pulling" — i.e. discard any uncommitted edits inside
 * `~/.astack/repos/<name>/`. Only valid for `kind=open-source` repos;
 * the server returns `REPO_READONLY` for `custom` repos so the semantics
 * of the flag stay invariant (see v0.10 spec §A1-A2).
 *
 * `.strict()` so unknown fields are rejected — any future flag must be
 * added to this schema explicitly. Pre-v0.10 callers that POST with no
 * body default to `{ force: false }` via the server-side fallback in
 * `routes.repos.ts`.
 */
export const RefreshRepoRequestSchema = z
  .object({
    force: z.boolean().default(false)
  })
  .strict();
export type RefreshRepoRequest = z.infer<typeof RefreshRepoRequestSchema>;

/** Returns the repo after forced pull, plus freshly scanned skills. */
export const RefreshRepoResponseSchema = z.object({
  repo: SkillRepoSchema,
  skills: z.array(SkillSchema),
  /** True if HEAD moved during this refresh. */
  changed: z.boolean(),
  /**
   * Present iff the refresh took a short-circuit path. Today only one
   * value: `"dirty_working_tree"` for non-force refresh against a dirty
   * open-source mirror (`RepoService.refresh` logged
   * `repo.refresh.dirty_skip`). Absent means "a normal pull + scan
   * happened or `force=true` successfully reset the mirror".
   *
   * Web clients use this to show a warn-level toast that points users
   * to the Force pull button instead of the misleading
   * `Repo up to date` copy pre-v0.10 emitted.
   *
   * Mutually exclusive with `reset_performed`: a skipped refresh never
   * reset, and a successful force-reset is not a skip.
   */
  skipped_reason: z.enum(["dirty_working_tree"]).optional(),
  /**
   * Present iff `force=true` triggered a `git reset --hard origin/HEAD`
   * before the pull (i.e. the mirror was dirty and the user explicitly
   * opted in). Absent means "no reset happened" — either the tree was
   * clean already or `force` was not set.
   *
   * Clients use this to differentiate the toast copy:
   *   `reset + pulled` vs plain `pulled`.
   */
  reset_performed: z.boolean().optional()
});
export type RefreshRepoResponse = z.infer<typeof RefreshRepoResponseSchema>;

// ---------- GET /api/repos/:id/skills ----------

export const ListRepoSkillsResponseSchema = z.object({
  skills: z.array(SkillSchema)
});
export type ListRepoSkillsResponse = z.infer<typeof ListRepoSkillsResponseSchema>;
