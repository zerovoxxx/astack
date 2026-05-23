/**
 * Tests for InlineSkillRepoService (v0.12).
 *
 * Strategy: build a synthetic astack-skills/ tree in a tmp dir, point
 * the resolver at it via the ASTACK_SKILLS_ROOT env var, then assert:
 *
 *   1. bootstrap() creates exactly one skill_repo row with the synthetic
 *      git_url, and the row's local_path matches our tmp dir.
 *   2. The scan filters out `harness-init` (the system-skill blacklist)
 *      while keeping the other skill / command / agent entries.
 *   3. A second bootstrap() call is idempotent (no duplicate row, skills
 *      get re-scanned + upserted, no extra emissions).
 *   4. Deleting a skill from disk + re-bootstrapping prunes it from DB.
 */

import fs from "node:fs";
import path from "node:path";

import tmp from "tmp-promise";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EventType } from "@astack/shared";

import { openDatabase, type Db } from "../src/db/connection.js";
import { RepoRepository } from "../src/db/repos.js";
import { SkillRepository } from "../src/db/skills.js";
import { EventBus, type EmittedEvent } from "../src/events.js";
import { nullLogger } from "../src/logger.js";
import {
  INLINE_SKILL_REPO_GIT_URL,
  INLINE_SKILL_REPO_NAME,
  InlineSkillRepoService
} from "../src/services/inline-skill-repo.js";
import { _resetAstackSkillsRootCacheForTests } from "../src/system-skills/paths.js";

function writeSkill(root: string, name: string, description: string): void {
  const dir = path.join(root, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`
  );
}

function writeFlatFile(
  root: string,
  kind: "commands" | "agents",
  name: string,
  description: string
): void {
  const dir = path.join(root, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.md`),
    `---\ndescription: ${description}\n---\n# ${name}\n`
  );
}

interface Ctx {
  tmpRoot: tmp.DirectoryResult;
  skillsRoot: string;
  db: Db;
  events: EventBus;
  emitted: EmittedEvent[];
  service: InlineSkillRepoService;
}

let ctx: Ctx;
let prevEnv: string | undefined;

beforeEach(async () => {
  const tmpRoot = await tmp.dir({ unsafeCleanup: true });
  const skillsRoot = path.join(tmpRoot.path, "astack-skills");
  fs.mkdirSync(skillsRoot, { recursive: true });

  // Required sentinel for astackSkillsRepoRoot()'s probe.
  writeSkill(skillsRoot, "harness-init", "system-skill that must be filtered");
  // Add scripts/templates so the layout looks realistic (not strictly
  // required by the scanner but ensures we don't pick up any stray files).
  fs.mkdirSync(path.join(skillsRoot, "skills", "harness-init", "scripts"), {
    recursive: true
  });

  // Regular skills + commands + agents that should survive the filter.
  writeSkill(skillsRoot, "alpha", "first regular inline skill");
  writeSkill(skillsRoot, "beta", "second regular inline skill");
  writeFlatFile(skillsRoot, "commands", "do-something", "test command");
  writeFlatFile(skillsRoot, "agents", "helper", "test agent");

  prevEnv = process.env.ASTACK_SKILLS_ROOT;
  process.env.ASTACK_SKILLS_ROOT = skillsRoot;
  _resetAstackSkillsRootCacheForTests();

  const db = openDatabase({ path: ":memory:" });
  const events = new EventBus();
  const emitted: EmittedEvent[] = [];
  events.subscribe((e) => emitted.push(e));

  const service = new InlineSkillRepoService({
    db,
    events,
    logger: nullLogger(),
    // Mirror the production wiring: SystemSkillService.list() returns
    // [{ id: "harness-init" }, ...]. We just hardcode the id here.
    systemSkillIds: () => new Set(["harness-init"])
  });

  ctx = { tmpRoot, skillsRoot, db, events, emitted, service };
});

afterEach(async () => {
  ctx.db.close();
  await ctx.tmpRoot.cleanup();
  if (prevEnv === undefined) {
    delete process.env.ASTACK_SKILLS_ROOT;
  } else {
    process.env.ASTACK_SKILLS_ROOT = prevEnv;
  }
  _resetAstackSkillsRootCacheForTests();
});

describe("InlineSkillRepoService.bootstrap", () => {
  it("inserts the skill_repo row with the synthetic inline URL", () => {
    const result = ctx.service.bootstrap();

    expect(result.inserted).toBe(true);
    expect(result.rootPath).toBe(ctx.skillsRoot);
    expect(result.repo).not.toBeNull();
    expect(result.repo!.git_url).toBe(INLINE_SKILL_REPO_GIT_URL);
    expect(result.repo!.name).toBe(INLINE_SKILL_REPO_NAME);
    expect(result.repo!.local_path).toBe(ctx.skillsRoot);

    // Confirms a single row landed in DB.
    const repos = new RepoRepository(ctx.db).list();
    expect(repos.total).toBe(1);
    expect(repos.rows[0]?.git_url).toBe(INLINE_SKILL_REPO_GIT_URL);
  });

  it("filters harness-init while keeping other skills + commands + agents", () => {
    const result = ctx.service.bootstrap();

    const names = result.skills.map((s) => `${s.type}:${s.name}`).sort();
    expect(names).toEqual([
      "agent:helper",
      "command:do-something",
      "skill:alpha",
      "skill:beta"
    ]);

    // The exclusion warning must reference harness-init by name so
    // operators can grep daemon.log.
    expect(
      result.warnings.some((w) => /harness-init/.test(w) && /reserved/.test(w))
    ).toBe(true);
  });

  it("is idempotent: a second call neither duplicates the row nor re-emits RepoRegistered", () => {
    ctx.service.bootstrap();
    const before = ctx.emitted.filter(
      (e) => e.event.type === EventType.RepoRegistered
    ).length;

    const second = ctx.service.bootstrap();
    expect(second.inserted).toBe(false);

    const after = ctx.emitted.filter(
      (e) => e.event.type === EventType.RepoRegistered
    ).length;
    expect(after).toBe(before);

    const repos = new RepoRepository(ctx.db).list();
    expect(repos.total).toBe(1);
  });

  it("dynamically prunes skills that disappear from disk between bootstraps", () => {
    const first = ctx.service.bootstrap();
    expect(first.skills.find((s) => s.name === "alpha")).toBeDefined();

    // User deletes one skill between daemon restarts.
    fs.rmSync(path.join(ctx.skillsRoot, "skills", "alpha"), {
      recursive: true,
      force: true
    });

    const second = ctx.service.bootstrap();
    expect(second.skills.find((s) => s.name === "alpha")).toBeUndefined();

    // DB row count for this repo should match the post-prune scan.
    const repoId = second.repo!.id;
    const dbSkills = new SkillRepository(ctx.db).listByRepo(repoId);
    expect(dbSkills.find((s) => s.name === "alpha")).toBeUndefined();
    expect(dbSkills.find((s) => s.name === "beta")).toBeDefined();
  });

  it("self-heals stale local_path when the workspace moves", () => {
    const first = ctx.service.bootstrap();
    const repoId = first.repo!.id;

    // Simulate a stale row: poke a different local_path directly.
    ctx.db
      .prepare<[string, number]>("UPDATE skill_repos SET local_path = ? WHERE id = ?")
      .run("/some/stale/elsewhere", repoId);

    const second = ctx.service.bootstrap();
    expect(second.repo!.local_path).toBe(ctx.skillsRoot);
  });

  // NOTE: a "missing astack-skills/" path test is intentionally NOT
  // included here. Inside the monorepo working tree the workspace
  // fallback in `astackSkillsRepoRoot()` always finds the real
  // `<repo>/astack-skills/`, so the only way to exercise the "not
  // located" branch is to shell out to a sandbox with no source tree
  // visible — not worth the test infra weight. The contract is
  // verified instead by:
  //   - logger.warn("inline_skill_repo.locate_failed") on resolver throw
  //   - logger.info("inline_skill_repo.skipped_missing_root") on null
  // which a daemon-level integration test would catch.
});

describe("InlineSkillRepoService — system-skill blacklist contract (regression)", () => {
  it("when the blacklist is empty, harness-init IS included (sanity check)", () => {
    const looseService = new InlineSkillRepoService({
      db: ctx.db,
      events: ctx.events,
      logger: nullLogger(),
      systemSkillIds: () => new Set<string>()
    });
    const result = looseService.bootstrap();
    expect(result.skills.find((s) => s.name === "harness-init")).toBeDefined();
  });
});
