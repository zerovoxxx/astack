# Changelog

本仓库所有值得记录的变更均汇总于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **`ship` SPEC 归档器**：新增 skill 自带的确定性归档脚本，按阈值回收已完成 SPEC、保留最新三项并同步主/归档 INDEX；支持 dry-run、强制执行、两种 INDEX 链接形态、碰撞预检和失败回滚。
- **`astack-common` plugin**：新增 Claude Code / Codex 双协议通用技能插件，恢复 `branch-manager`、`bug-review`、`dep-upgrade`，并从 FinClaw Platform AO 同步 `db-design`；不恢复 iWiki 与 `devops-pipeline`。

### Changed

- **`spec` 校验器自包含**：将 `spec-lint.sh` 从插件根目录下沉到 `skills/spec/scripts/`，仅由 `spec` 在创建或更新 SPEC 后调用，并兼容 macOS 默认 Bash 3.2。
- **`ship` 合并冲突分级**：补充三方 stage 判读、rebase ours/theirs 语义、生成物重建、编号资源顺延、语义冲突裁决、冲突后双层验证和安全中止规则。
- **Marketplace protocol migration**：目录从 `astack-skills/` 迁移为 `astack-marketplace/`，新增 `.claude-plugin/marketplace.json` 与 `plugins/astack-workflow/.claude-plugin/plugin.json`，按 Claude Code plugin marketplace 协议发布。
- **Codex plugin protocol support**：新增 `.agents/plugins/marketplace.json` 与 `plugins/astack-workflow/.codex-plugin/plugin.json`，同一个 `astack-workflow` plugin 同时支持 Claude Code 与 Codex marketplace。
- **插件职责拆分**：`astack-workflow` 只保留轻量 Spec 工作流，非流程类通用技能统一放入 `astack-common`。
- **个人 AI Coding 四流程**：默认工作流收敛为 `spec → plan → dev → ship` 四个核心 skill，`harness-init` 只生成 `CLAUDE.md`、`AGENTS.md` 软链与 `docs/astack/INDEX.md`，不再创建边界索引、retro 知识库或评审 sidecar。
- **Harness 文档命名空间**：新项目 scaffold 统一使用 `docs/astack/{INDEX.md,version,plan}`，避免和业务文档的 `docs/version/` 混用。
- **CLAUDE 模板可扩展**：`CLAUDE.md` 模板原文保留 Karpathy 编程规范，并新增 `扩展原则` 占位符承载项目专属约束；`AGENTS.md` 作为兼容软链指向 `CLAUDE.md`。
- **轻量验证门**：`spec` skill 模板新增验证计划 / 验证记录，`dev` skill 要求执行并回写验证证据，`ship` skill 仅在新鲜验证通过后提交和推送。
- **仓库定位收敛为 Claude Code / Codex plugin marketplace**。本仓库不再承载业务逻辑、CLI 工具或适配器实现；根目录只维护 marketplace catalog 与 `plugins/*/` 插件源文件。
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
- 保留 `CLAUDE.md` 作为仓库治理说明，保留 `AGENTS.md` 作为兼容入口，保留 `README.md` 作为使用入口。
- 保留 `plugins/astack-workflow/skills/spec/scripts/spec-lint.sh` 作为 `spec` skill 自带的机械化校验器。

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
