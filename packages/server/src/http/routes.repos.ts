/**
 * /api/repos routes.
 *
 * Mount: app.route("/api/repos", reposRoutes(container))
 */

import {
  ListReposQuerySchema,
  RefreshRepoRequestSchema,
  RegisterRepoRequestSchema,
  RepoParamsSchema,
  AstackError,
  ErrorCode,
  type ListReposResponse,
  type RefreshRepoRequest,
  type RegisterRepoResponse,
  type RefreshRepoResponse,
  type ListRepoSkillsResponse,
  type DeleteRepoResponse
} from "@astack/shared";
import { zValidator } from "./validator.js";
import { Hono } from "hono";

import type { ServiceContainer } from "./container.js";

export function reposRoutes(c: ServiceContainer): Hono {
  const app = new Hono();

  // POST /api/repos — register a skill repo.
  app.post("/", zValidator("json", RegisterRepoRequestSchema), async (ctx) => {
    const body = ctx.req.valid("json");
    const result = await c.repoService.register(body);
    const response: RegisterRepoResponse = result;
    return ctx.json(response, 201);
  });

  // GET /api/repos — list registered repos.
  app.get("/", zValidator("query", ListReposQuerySchema), (ctx) => {
    const q = ctx.req.valid("query");
    const { repos, total } = c.repoService.list(q);
    const response: ListReposResponse = { repos, total };
    return ctx.json(response);
  });

  // DELETE /api/repos/:id — unregister.
  app.delete("/:id", zValidator("param", RepoParamsSchema), (ctx) => {
    const { id } = ctx.req.valid("param");
    c.repoService.remove(id);
    const response: DeleteRepoResponse = { deleted: true, id };
    return ctx.json(response);
  });

  // POST /api/repos/:id/refresh — force pull + re-scan.
  //
  // Body contract (v0.10): optional `{ force?: boolean }`. `force=true`
  // asks the server to `git reset --hard origin/HEAD` before pulling on
  // a dirty open-source mirror. We parse + validate the body manually
  // here (rather than `zValidator("json", ...)`) because pre-v0.10 CLI
  // clients POST with no body at all, and Hono's JSON parser treats an
  // empty body as `null` which `RefreshRepoRequestSchema.parse(null)`
  // would reject.
  //
  // Zero-byte body → `{force:false}` via schema default. Anything else
  // — malformed JSON, unknown fields, non-boolean `force` — raises
  // VALIDATION_FAILED 400. We deliberately do NOT silently downgrade
  // malformed JSON to an empty body: a typo like `{"force": tru}` should
  // surface an error so the caller can fix it, not quietly run as
  // `force:false` and confuse the user ("I clicked Force but got a
  // skipped toast?"). See v0.10 CR #2 / spec §A6.
  app.post("/:id/refresh", zValidator("param", RepoParamsSchema), async (ctx) => {
    const { id } = ctx.req.valid("param");
    const body = await parseRefreshBody(ctx.req.raw);
    const { repo, skills, changed, skipped_reason, reset_performed } =
      await c.repoService.refresh(id, { force: body.force });
    const response: RefreshRepoResponse = {
      repo,
      skills,
      changed,
      // Omit optional fields when absent so wire output matches schema
      // semantics (present iff truthy / classified).
      ...(skipped_reason ? { skipped_reason } : {}),
      ...(reset_performed ? { reset_performed } : {})
    };
    return ctx.json(response);
  });

  // GET /api/repos/:id/skills — list skills in a repo.
  app.get("/:id/skills", zValidator("param", RepoParamsSchema), (ctx) => {
    const { id } = ctx.req.valid("param");
    const skills = c.repoService.listSkills(id);
    const response: ListRepoSkillsResponse = { skills };
    return ctx.json(response);
  });

  return app;
}

/**
 * Parse + validate the refresh request body.
 *
 * Lenient ONLY for zero-byte bodies (pre-v0.10 CLI clients that POST
 * without any payload) — these resolve to `{force:false}` via the
 * schema default. Malformed JSON is surfaced as a VALIDATION_FAILED
 * 400: silently downgrading a typo like `{"force": tru}` to
 * `{force:false}` would hide a real client bug (user clicks Force
 * pull, sees a "skipped" toast, has no way to diagnose — see v0.10
 * CR #2). Zod then rejects unknown fields / non-boolean `force`,
 * which the global error handler converts to the same
 * VALIDATION_FAILED 400.
 */
async function parseRefreshBody(req: Request): Promise<RefreshRepoRequest> {
  const text = await req.text();
  if (text.length === 0) {
    return RefreshRepoRequestSchema.parse({});
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new AstackError(
      ErrorCode.VALIDATION_FAILED,
      "request body is not valid JSON",
      { parse_error: err instanceof Error ? err.message : String(err) }
    );
  }
  return RefreshRepoRequestSchema.parse(raw);
}
