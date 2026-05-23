# Changelog

本仓库所有值得记录的变更均汇总于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- **重大重构：仓库定位收敛为"纯元数据资产库"**。本仓库不再承载任何业务逻辑、CLI 工具或适配器实现，仅保留 AI 编程资产（Agents / Commands / Hooks / MCP Configs / Plugins / Rules / Skills）的元数据与源文件，作为下游各 IDE / 工具统一拉取与分发的单一可信来源。
- **`init-harness.sh` 重构为 `skills/harness-init/` Skill**：将原游离在 `scripts/` 下的初始化脚本重新打包为完整 Skill，含 `SKILL.md`（触发契约 + AI 语义迁移指引）、`scripts/init-harness.sh`（瘦身版，从模板渲染）、`templates/*.tpl`（外置模板）。`commands/init_harness.md` 相应瘦身为薄包装，避免与 Skill 重复维护。

### Removed

- 移除 `claude-hub/` 子项目（TypeScript 实现的 CLI、适配器、schemas、manifest 等全部业务代码）。
- 移除 `_reference/` 参考仓库 submodule 集合（`everything-claude-code`、`gstack`、`pua`、`skills`、`superpowers` 等）。
- 移除 `.gitmodules`，不再通过 submodule 管理外部参考仓库。
- 删除所有与 IDE 适配器、安装推荐、版本治理流水线相关的运行时代码与配置。
- 删除 `scripts/init-harness.sh`（已迁移至 `skills/harness-init/scripts/init-harness.sh`）。

### Retained

- 保留七类资产目录作为元数据载体：`agents/`、`commands/`、`hooks/`、`mcp-configs/`、`plugins/`、`rules/`、`skills/`。
- 保留 `AGENTS.md` 作为仓库治理说明，保留 `README.md`、`CLAUDE.md` 作为使用与协作入口。
- 保留 `scripts/spec-lint.sh` 作为 Spec 机械化校验器（后续可能演进为 Hook，单独讨论）。

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
