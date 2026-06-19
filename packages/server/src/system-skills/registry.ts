/**
 * Hardcoded registry of system skills.
 *
 * v0.4 ships exactly one system skill (`harness-init`). Rather than
 * parsing YAML frontmatter from SKILL.md at startup (which would drag
 * in a dep and a failure surface for just one entry — see v0.4 spec
 * §A8 Issue 5 decision B), the `name` + `description` are hardcoded
 * here. When we add a second system skill, revisit: if the registry
 * exceeds ~3 entries or needs dynamic metadata, switch to parsing.
 *
 * IDs MUST equal the subdirectory name under
 * `<astack-marketplace>/plugins/astack-workflow/skills/` (resolved by
 * `systemSkillsRoot()` in v0.12+ — previously this was
 * `packages/server/system-skills/`). The scanner (A9) uses these IDs
 * as a blacklist to exclude same-named plain skills from user-imported
 * repos. Plugin-marketplace scans use namespaced names such as
 * `astack-workflow/harness-init`, so those remain valid marketplace
 * entries and do not collide with the system seed.
 */

export interface SystemSkillDescriptor {
  /** Stable id, also the directory name under system-skills/. */
  id: string;
  /** Human-readable label shown in UI. */
  name: string;
  /** Short description (copied from SKILL.md — keep in sync manually). */
  description: string;
}

export const SYSTEM_SKILLS: readonly SystemSkillDescriptor[] = [
  {
    id: "harness-init",
    name: "Harness Spec bootstrap",
    description:
      "初始化或迁移项目的轻量 Spec 工作流基础设施（AGENTS.md + docs/astack/INDEX.md），为 astack-workflow 的 spec/plan/dev/ship 四流程打底。"
  }
];

/** Fast id lookup for scanner filter / symlink service guard. */
export const SYSTEM_SKILL_IDS: ReadonlySet<string> = new Set(
  SYSTEM_SKILLS.map((s) => s.id)
);
