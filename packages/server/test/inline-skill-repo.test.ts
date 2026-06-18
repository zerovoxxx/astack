/**
 * Tests for InlineSkillRepoService (v0.12).
 *
 * Strategy: build a synthetic astack-marketplace/ tree in a tmp dir, point
 * the resolver at it via the ASTACK_MARKETPLACE_ROOT env var, then assert:
 *
 *   1. bootstrap() creates exactly one skill_repo row with the synthetic
 *      git_url, and the row's local_path matches our tmp dir.
 *   2. The scan keeps plugin-namespaced skill / command / agent entries,
 *      including `astack-workflow/harness-init`.
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

function writePlugin(root: string, name: string): string {
  const pluginRoot = path.join(root, "plugins", name);
  fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name, description: "test plugin" }, null, 2)
  );
  return pluginRoot;
}

function writeSkill(pluginRoot: string, name: string, description: string): void {
  const dir = path.join(pluginRoot, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`
  );
}

function writeFlatFile(
  pluginRoot: string,
  kind: "commands" | "agents",
  name: string,
  description: string
): void {
  const dir = path.join(pluginRoot, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.md`),
    `---\ndescription: ${description}\n---\n# ${name}\n`
  );
}

interface Ctx {
  tmpRoot: tmp.DirectoryResult;
  marketplaceRoot: string;
  db: Db;
  events: EventBus;
  emitted: EmittedEvent[];
  service: InlineSkillRepoService;
}

let ctx: Ctx;
let prevEnv: string | undefined;
let prevLegacyEnv: string | undefined;

beforeEach(async () => {
  const tmpRoot = await tmp.dir({ unsafeCleanup: true });
  const marketplaceRoot = path.join(tmpRoot.path, "astack-marketplace");
  fs.mkdirSync(path.join(marketplaceRoot, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        name: "astack-marketplace",
        owner: { name: "test" },
        plugins: [{ name: "astack-workflow", source: "./plugins/astack-workflow" }]
      },
      null,
      2
    )
  );
  const pluginRoot = writePlugin(marketplaceRoot, "astack-workflow");

  // Required sentinel for astackMarketplaceRoot()'s probe.
  writeSkill(pluginRoot, "harness-init", "system skill packaged in plugin");
  // Add scripts/templates so the layout looks realistic (not strictly
  // required by the scanner but ensures we don't pick up any stray files).
  fs.mkdirSync(
    path.join(pluginRoot, "skills", "harness-init", "scripts"),
    { recursive: true }
  );

  // Regular skills + commands + agents that should survive the filter.
  writeSkill(pluginRoot, "alpha", "first regular inline skill");
  writeSkill(pluginRoot, "beta", "second regular inline skill");
  writeFlatFile(pluginRoot, "commands", "do-something", "test command");
  writeFlatFile(pluginRoot, "agents", "helper", "test agent");

  prevEnv = process.env.ASTACK_MARKETPLACE_ROOT;
  prevLegacyEnv = process.env.ASTACK_SKILLS_ROOT;
  process.env.ASTACK_MARKETPLACE_ROOT = marketplaceRoot;
  delete process.env.ASTACK_SKILLS_ROOT;
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

  ctx = { tmpRoot, marketplaceRoot, db, events, emitted, service };
});

afterEach(async () => {
  ctx.db.close();
  await ctx.tmpRoot.cleanup();
  if (prevEnv === undefined) {
    delete process.env.ASTACK_MARKETPLACE_ROOT;
  } else {
    process.env.ASTACK_MARKETPLACE_ROOT = prevEnv;
  }
  if (prevLegacyEnv === undefined) {
    delete process.env.ASTACK_SKILLS_ROOT;
  } else {
    process.env.ASTACK_SKILLS_ROOT = prevLegacyEnv;
  }
  _resetAstackSkillsRootCacheForTests();
});

describe("InlineSkillRepoService.bootstrap", () => {
  it("inserts the skill_repo row with the synthetic inline URL", () => {
    const result = ctx.service.bootstrap();

    expect(result.inserted).toBe(true);
    expect(result.rootPath).toBe(ctx.marketplaceRoot);
    expect(result.repo).not.toBeNull();
    expect(result.repo!.git_url).toBe(INLINE_SKILL_REPO_GIT_URL);
    expect(result.repo!.name).toBe(INLINE_SKILL_REPO_NAME);
    expect(result.repo!.local_path).toBe(ctx.marketplaceRoot);

    // Confirms a single row landed in DB.
    const repos = new RepoRepository(ctx.db).list();
    expect(repos.total).toBe(1);
    expect(repos.rows[0]?.git_url).toBe(INLINE_SKILL_REPO_GIT_URL);
  });

  it("keeps plugin-namespaced skills + commands + agents", () => {
    const result = ctx.service.bootstrap();

    const names = result.skills.map((s) => `${s.type}:${s.name}`).sort();
    expect(names).toEqual([
      "agent:astack-workflow/helper",
      "command:astack-workflow/do-something",
      "skill:astack-workflow/alpha",
      "skill:astack-workflow/beta",
      "skill:astack-workflow/harness-init"
    ]);
    expect(result.warnings).toEqual([]);
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
    expect(
      first.skills.find((s) => s.name === "astack-workflow/alpha")
    ).toBeDefined();

    // User deletes one skill between daemon restarts.
    fs.rmSync(
      path.join(
        ctx.marketplaceRoot,
        "plugins",
        "astack-workflow",
        "skills",
        "alpha"
      ),
      {
        recursive: true,
        force: true
      }
    );

    const second = ctx.service.bootstrap();
    expect(
      second.skills.find((s) => s.name === "astack-workflow/alpha")
    ).toBeUndefined();

    // DB row count for this repo should match the post-prune scan.
    const repoId = second.repo!.id;
    const dbSkills = new SkillRepository(ctx.db).listByRepo(repoId);
    expect(
      dbSkills.find((s) => s.name === "astack-workflow/alpha")
    ).toBeUndefined();
    expect(
      dbSkills.find((s) => s.name === "astack-workflow/beta")
    ).toBeDefined();
  });

  it("self-heals stale local_path when the workspace moves", () => {
    const first = ctx.service.bootstrap();
    const repoId = first.repo!.id;

    // Simulate a stale row: poke a different local_path directly.
    ctx.db
      .prepare<[string, number]>("UPDATE skill_repos SET local_path = ? WHERE id = ?")
      .run("/some/stale/elsewhere", repoId);

    const second = ctx.service.bootstrap();
    expect(second.repo!.local_path).toBe(ctx.marketplaceRoot);
  });

  // NOTE: a "missing astack-marketplace/" path test is intentionally NOT
  // included here. Inside the monorepo working tree the workspace
  // fallback in `astackMarketplaceRoot()` always finds the real
  // `<repo>/astack-marketplace/`, so the only way to exercise the "not
  // located" branch is to shell out to a sandbox with no source tree
  // visible — not worth the test infra weight. The contract is
  // verified instead by:
  //   - logger.warn("inline_skill_repo.locate_failed") on resolver throw
  //   - logger.info("inline_skill_repo.skipped_missing_root") on null
  // which a daemon-level integration test would catch.
});

describe("InlineSkillRepoService — marketplace namespace contract", () => {
  it("harness-init is included under the plugin namespace even with the system blacklist", () => {
    const looseService = new InlineSkillRepoService({
      db: ctx.db,
      events: ctx.events,
      logger: nullLogger(),
      systemSkillIds: () => new Set(["harness-init"])
    });
    const result = looseService.bootstrap();
    expect(
      result.skills.find((s) => s.name === "astack-workflow/harness-init")
    ).toBeDefined();
  });
});
