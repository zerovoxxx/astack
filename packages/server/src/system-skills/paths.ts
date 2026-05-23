/**
 * Locate the inline `astack-skills/` skill repository on disk.
 *
 * v0.12+: the previously-bundled `packages/server/system-skills/`
 * directory has been promoted to a top-level inline skill repo
 * `<workspace>/astack-skills/` with the standard `{skills, commands,
 * agents}` layout. It is BOTH:
 *
 *   1. the source of truth for **system skills** that `SystemSkillService`
 *      seeds into projects (currently just `harness-init`). These live
 *      at `<astack-skills>/skills/<id>/` — `systemSkillsRoot()` returns
 *      that subdir for backward compatibility with `loadRegistry()`.
 *
 *   2. the daemon's **default inline skill repo**, scanned & upserted
 *      on every startup by `InlineSkillRepoService.bootstrap()`. The
 *      whole repo root (containing `skills/`, `commands/`, `agents/`)
 *      is returned by `astackSkillsRepoRoot()`.
 *
 * Resolution order (first hit wins):
 *   1. `ASTACK_SKILLS_ROOT` env var (production / docker override).
 *   2. The `@astack/server` package's neighbour `../../astack-skills/`
 *      (npm-installed layout: server's package dir → up two → root).
 *   3. pnpm workspace fallback: walk up from `__dirname` to the
 *      monorepo root and look for `astack-skills/` there.
 *
 * Throws `INTERNAL` only when **all** candidates miss AND `harness-init`
 * is therefore unrecoverable. A broken install manifests as missing
 * system skills at startup, not silent degradation.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AstackError, ErrorCode } from "@astack/shared";

const HARNESS_INIT_SENTINEL = path.join("skills", "harness-init", "SKILL.md");

/** Cache the resolved root to avoid repeating fs probes on every call. */
let cachedRepoRoot: string | null = null;

/**
 * Absolute path to the `astack-skills/` repo root.
 *
 * Structure (at this root):
 *   <root>/
 *   ├── README.md
 *   ├── skills/
 *   │   ├── harness-init/          (the one system skill — seeded by
 *   │   │   ├── SKILL.md            SystemSkillService, excluded from
 *   │   │   ├── scripts/            inline-repo scan via blacklist)
 *   │   │   └── templates/
 *   │   └── <other>/SKILL.md       (regular inline-repo skills)
 *   ├── commands/*.md
 *   └── agents/*.md
 *
 * Does not throw; returns null when nothing on disk matches. Callers
 * decide whether the miss is fatal (SystemSkillService) or a warn-only
 * (InlineSkillRepoService).
 */
export function astackSkillsRepoRoot(): string | null {
  if (cachedRepoRoot !== null) {
    return cachedRepoRoot;
  }
  const require_ = createRequire(import.meta.url);
  const candidates: string[] = [];

  // 1. Explicit override (production / containerized deployments).
  const envOverride = process.env.ASTACK_SKILLS_ROOT?.trim();
  if (envOverride) {
    candidates.push(envOverride);
  }

  // 2. Neighbour of the installed @astack/server package: in npm global /
  //    pnpm-deploy layouts the package lives at .../@astack/server/, and we
  //    expect astack-skills/ to be vendored next to it as a sibling.
  try {
    const pkg = require_.resolve("@astack/server/package.json");
    // <prefix>/@astack/server/package.json → <prefix>/astack-skills
    candidates.push(path.join(path.dirname(pkg), "..", "..", "astack-skills"));
    // Or directly bundled inside the package dir.
    candidates.push(path.join(path.dirname(pkg), "astack-skills"));
  } catch {
    // Package not available — fall through.
  }

  // 3. pnpm workspace fallback. __dirname for this file is
  //    .../packages/server/{src,dist}/system-skills/ — both layouts sit
  //    exactly 4 levels below the workspace root, so a single 4-up walk
  //    covers tsx (src) and node-on-dist alike.
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, "..", "..", "..", "..", "astack-skills"));
  } catch {
    // ignore — only fileURLToPath would fail and only on exotic URL schemes
  }

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, HARNESS_INIT_SENTINEL))) {
      cachedRepoRoot = path.resolve(c);
      return cachedRepoRoot;
    }
  }
  return null;
}

/**
 * Absolute path to `<astack-skills>/skills/` — where SYSTEM_SKILLS subdirs
 * live (currently just `harness-init/`).
 *
 * Throws `INTERNAL` when astack-skills/ can't be located on disk —
 * SystemSkillService cannot operate without it (harness-init would
 * silently disappear from registry, breaking project bootstrap).
 *
 * Called once per daemon startup by `SystemSkillService.loadRegistry()`.
 */
export function systemSkillsRoot(): string {
  const repoRoot = astackSkillsRepoRoot();
  if (!repoRoot) {
    throw new AstackError(
      ErrorCode.INTERNAL,
      "astack-skills/ directory not found; astack install may be broken",
      {
        hint:
          "expected <workspace>/astack-skills/skills/harness-init/SKILL.md; " +
          "override with ASTACK_SKILLS_ROOT env var"
      }
    );
  }
  return path.join(repoRoot, "skills");
}

/** Test-only: clear the resolution cache so a re-rooted fs test starts fresh. */
export function _resetAstackSkillsRootCacheForTests(): void {
  cachedRepoRoot = null;
}
