---
name: spec
description: |
  当用户需要创建或更新迭代 SPEC 文档、版本索引条目或变更的验收标准时使用。
  触发词：出一个 spec、写需求文档、创建迭代文档、更新 SPEC、写验收标准、spec、新建迭代。
  Use when creating or updating iteration specs, version index entries, or acceptance criteria.
---

# 轻量级 Spec 工作流

为变更创建或更新单一 SPEC 作为唯一事实来源。工作流保持轻量：只维护 SPEC 和 `docs/astack/INDEX.md`，默认不创建旁路评审或复盘文件。

## 核心流程

1. 阅读 `CLAUDE.md`（以及兼容软链 `AGENTS.md`）、`docs/astack/INDEX.md` 以及现有的 `docs/astack/version/Iteration*_SPEC.md`。
2. 从已有最高编号 `Iteration<N>` 中选取下一个迭代编号。
3. 创建或更新 `docs/astack/version/Iteration<N>_<PascalSlug>_SPEC.md`。
4. 在 `docs/astack/INDEX.md` 中添加一行状态条目和简短变更日志行。
5. 仅当 SPEC 过大、无法直接执行时，才建议使用 `plan`。

## SPEC 必填章节

小变更保持简洁：

- 文档信息：业务版本、作者、日期、单行目标。
- 目标与非目标。
- 变更范围。
- 实现说明。
- 验证计划。
- 验收标准。
- 验证记录。
- 变更日志。

较大变更可补充：方案对比、详细设计、实现计划、风险与回退。

## 验证门槛

每个 SPEC 必须包含至少一条可执行的验证命令。

| 变更类型 | 最低验证要求 |
|---|---|
| Markdown / 文档 / skill | `git diff --check` + 针对性 `rg` 检查过期引用 |
| Python 业务逻辑 | `uv run pytest tests/{module}/ -v` |
| API / Schema 变更 | `uv run pytest tests/api/ -v` + `uv run ruff check .` |
| 基础设施 / DB | 相关 repository 测试 + migration 验证 |

不得以"人工检查"作为唯一验证方式，除非变更纯属视觉呈现且明确记录了截图或手动步骤。

## 边界

- 默认不创建 `BOUNDARIES.md`、`docs/retro/*`、`*_REVIEW.md` 或 `*_CR.md`。
- 不在 `INDEX.md` 中放逐任务细节，细节保留在 SPEC 中。
- 如用户要求临时报告，仅针对该次请求创建，不纳入默认工作流。
