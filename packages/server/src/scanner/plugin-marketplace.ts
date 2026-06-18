/**
 * Scan a root path as a Claude/Codex plugin marketplace: each
 * first-level subdirectory is a plugin container, identified by the
 * presence of `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`
 * (whitelist principle, same spirit as `SKILL.md` for skill-dirs and
 * `*.md` basename + NAME_REGEX for flat files).
 *
 * For each valid plugin container `<plugin>` under `<rootPath>`:
 *   <rootPath>/<plugin>/skills/    → scanSkillDirs (resultType=skill)
 *   <rootPath>/<plugin>/commands/  → scanFlatFiles (resultType=command)
 *   <rootPath>/<plugin>/agents/    → scanFlatFiles (resultType=agent)
 *
 * Resulting `ScannedSkill.name` is namespaced as `<plugin>/<inner>` so
 * cross-plugin same-inner-names don't collide on the
 * `UNIQUE(repo_id, type, name)` skills key (schema.ts:96). The slash
 * separator is safe because both `<plugin>` and `<inner>` individually
 * pass NAME_REGEX (which does not include `/`); the dedup key in
 * `scanRepo` ("${type}/${name}") therefore stays unambiguous.
 *
 * Non-recursive past depth 2; never descends into nested plugins.
 *
 * Warnings (not failures):
 *   - Subdir whose name passes NAME_REGEX but lacks
 *     `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` → warned
 *     (likely an authoring mistake — author meant to ship a plugin but
 *     forgot the manifest).
 *   - Subdir whose name FAILS NAME_REGEX or starts with `.` → silently
 *     skipped (could be `.git/`, `.github/`, `__archived__/`, etc.;
 *     warning would be noise).
 *   - Plugin with neither skills/ nor commands/ nor agents/ → no
 *     warning, no skill emitted (e.g. pure-MCP plugin = `.mcp.json`
 *     only is a legal plugin shape).
 *
 * The function is pure: it never throws for malformed input. The lone
 * exception is the namePrefix invariant inside scanSkillDirs /
 * scanFlatFiles, which fires only on a programming error in this
 * module (would never happen in production).
 */

import path from "node:path";

import { SkillType } from "@astack/shared";

import type { ScannedSkill } from "./index.js";
import { NAME_REGEX, safeReaddir, isDir, isFile } from "./common.js";
import { scanSkillDirs } from "./skill-dirs.js";
import { scanFlatFiles } from "./flat-files.js";

export function scanPluginMarketplace(
  repoRoot: string,
  rootPath: string,
  out: ScannedSkill[],
  warnings: string[]
): void {
  const dir = rootPath === "" ? repoRoot : path.join(repoRoot, rootPath);
  if (!isDir(dir)) return;

  for (const entry of safeReaddir(dir)) {
    if (!entry.isDirectory()) continue;

    // Dotdirs (`.git`, `.github`, manifest dirs themselves) — skip silently.
    if (entry.name.startsWith(".")) continue;

    const pluginSlug = entry.name;

    if (!NAME_REGEX.test(pluginSlug)) {
      // The slug would corrupt the (type, name) dedup key if we let it
      // through, but staying silent would hide authoring mistakes.
      warnings.push(
        `skipped plugin with invalid name: ${posixJoin(rootPath, pluginSlug)}`
      );
      continue;
    }

    if (!hasPluginManifest(dir, pluginSlug)) {
      // Looks like a plugin (name passes NAME_REGEX) but lacks the
      // marketplace manifest — surface as a warning so the author can
      // notice. Random files / non-plugin folders that fail NAME_REGEX
      // already got skipped silently above.
      const relPath = posixJoin(rootPath, pluginSlug);
      warnings.push(
        "skipped plugin missing .claude-plugin/plugin.json or " +
          `.codex-plugin/plugin.json: ${relPath}`
      );
      continue;
    }

    // Dispatch to the three child scanners. namePrefix injection is the
    // ONLY namespace-glue logic — we deliberately reuse scanSkillDirs /
    // scanFlatFiles instead of re-implementing them here, so any future
    // tweak to NAME_REGEX / safeReaddir / parseFrontmatter behavior
    // applies uniformly across all four ScanRootKinds (R6 spirit:
    // shared helpers, not copy-paste).
    const skillsRel = posixJoin(posixJoin(rootPath, pluginSlug), "skills");
    const commandsRel = posixJoin(posixJoin(rootPath, pluginSlug), "commands");
    const agentsRel = posixJoin(posixJoin(rootPath, pluginSlug), "agents");

    scanSkillDirs(repoRoot, skillsRel, out, warnings, pluginSlug);
    scanFlatFiles(
      repoRoot,
      commandsRel,
      out,
      warnings,
      SkillType.Command,
      pluginSlug
    );
    scanFlatFiles(
      repoRoot,
      agentsRel,
      out,
      warnings,
      SkillType.Agent,
      pluginSlug
    );
  }
}

/**
 * Join path segments as a POSIX relative path. Empty leading segment
 * means "at the repo root", so we drop it to avoid a leading slash.
 *
 * Duplicated from skill-dirs.ts intentionally (kept as a private helper
 * inside the file that uses it; v0.12 spec §2.3 explicitly forbids
 * inline re-implementation of NAME_REGEX / parseFrontmatter / readdir,
 * but this trivial one-liner is fine).
 */
function posixJoin(a: string, b: string): string {
  if (a === "") return b;
  return `${a}/${b}`;
}

function hasPluginManifest(dir: string, pluginSlug: string): boolean {
  return (
    isFile(path.join(dir, pluginSlug, ".claude-plugin", "plugin.json")) ||
    isFile(path.join(dir, pluginSlug, ".codex-plugin", "plugin.json"))
  );
}
