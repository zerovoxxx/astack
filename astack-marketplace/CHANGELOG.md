# Changelog

本仓库所有值得记录的变更均汇总于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- **Marketplace protocol migration**：目录从 `astack-skills/` 迁移为 `astack-marketplace/`，新增 `.claude-plugin/marketplace.json` 与 `plugins/astack-workflow/.claude-plugin/plugin.json`，按 Claude Code plugin marketplace 协议发布。
- **Codex plugin protocol support**：新增 `.agents/plugins/marketplace.json` 与 `plugins/astack-workflow/.codex-plugin/plugin.json`，同一个 `astack-workflow` plugin 同时支持 Claude Code 与 Codex marketplace。
- **单插件收敛**：默认交付形态收敛为 `astack-workflow` plugin，内部只保留轻量 Spec 工作流 skills 与同插件内脚本。
- **个人 AI Coding 四流程**：默认工作流收敛为 `spec → plan → dev → ship` 四个核心 skill，`harness-init` 只生成 `AGENTS.md` 与 `docs/version/INDEX.md`，不再创建边界索引、retro 知识库或评审 sidecar。
- **轻量验证门**：`spec` skill 模板新增验证计划 / 验证记录，`dev` skill 要求执行并回写验证证据，`ship` skill 仅在新鲜验证通过后提交和推送。
- **仓库定位收敛为 Claude Code / Codex plugin marketplace**。本仓库不再承载业务逻辑、CLI 工具或适配器实现；根目录只维护 marketplace catalog 与 `plugins/astack-workflow/` 插件源文件。
- **`init-harness.sh` 归入 `astack-workflow` plugin**：脚本、模板与 `harness-init` skill 一起放在 `plugins/astack-workflow/skills/harness-init/`，保证 plugin 安装后不依赖仓库外部文件。

### Removed

- 移除全部默认 command 资产；核心工作流已迁移为 `plugins/astack-workflow/skills/{spec,plan,dev,ship}/`。
- 移除 `spec-declutter` skill；归档不再作为默认流程。
- 移除与 Spec 主线无关的旧 skills，只保留 `astack-workflow` plugin 内的最佳 Spec 工作流。
- 移除 `harness-init` 中的 `BOUNDARIES.md`、`golden-rules.md`、`patterns.md` 模板。
- 移除 `claude-hub/` 子项目（TypeScript 实现的 CLI、适配器、schemas、manifest 等全部业务代码）。
- 移除 `_reference/` 参考仓库 submodule 集合（`everything-claude-code`、`gstack`、`pua`、`skills`、`superpowers` 等）。
- 移除 `.gitmodules`，不再通过 submodule 管理外部参考仓库。
- 删除所有与 IDE 适配器、安装推荐、版本治理流水线相关的运行时代码与配置。
- 删除旧根级 `scripts/init-harness.sh`（已迁移至 `plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh`）。

### Retained

- 保留 `plugins/astack-workflow/skills/` 作为当前元数据载体；Slash Command 不再作为本仓库默认交付形态。
- 保留 `AGENTS.md` 作为仓库治理说明，保留 `README.md`、`CLAUDE.md` 作为使用与协作入口。
- 保留 `plugins/astack-workflow/scripts/spec-lint.sh` 作为 Spec 机械化校验器。

---

## [v1.2] - 2026-03-31

### Changed

- `refactor(commands)`：`_backend` 命令模板适配 Java/DDD 后端项目，新增 `new/` 通用模板备份。

## [v1.1] - 2026-03-20

### Added

- 迭代 1 范围扩展：七种资产类型（Agent / Command / Hook / MCP Config / Plugin / Rule / Skill）+ 五种 IDE 适配支持（Claude Code / Codex / Gemini CLI / CodeBuddy / Cursor）。

## [v1.0] - 2026-03-20

### Added

- 新增迭代 1：Skill 与 Command 统一管理。
