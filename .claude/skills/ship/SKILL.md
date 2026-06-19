---
name: ship
description: |
  当本地代码或文档变更准备好进行最终验证、提交、推送或交付时使用。
  触发词：提交代码、推送变更、ship、发布、完成开发准备提交、最终验证、创建 MR、出一个 PR。
  Use when local code or documentation changes are ready for final verification, commit, push, or MR creation.
---

# Ship

用新鲜的验证证据、规范的提交信息和安全的 git 操作交付当前变更。

## 预检

以下情况停止执行：

- 没有本地变更。
- 正在进行 merge、rebase 或 cherry-pick。
- 当前处于 detached HEAD 或无法确认当前分支。

## 代码质量检查

```bash
ruff format .
ruff check . --fix
```

**必须解决本次改动引入的新问题**，已有问题可忽略。纯文档/skill 变更跳过此步，改用 `git diff --check`。

## 验证

在最后一次代码或文档改动后，运行新鲜验证。优先顺序：

- 如存在匹配的 SPEC，使用 SPEC `验证计划` 中的命令。
- 对受影响模块运行 `uv run pytest tests/{module}/ -v`。
- 纯文档/skill 变更使用 `git diff --check`。

存在匹配 SPEC 时，将命令、退出码、日期和覆盖范围记录到 SPEC `验证记录`。

## SPEC 与 INDEX 流程

验证 PASS 后：

1. 将变更文件与相关 `docs/astack/version/Iteration*_SPEC.md` 匹配。
2. 将匹配的 SPEC `文档状态` 设为 `已完成`，并更新 `文档信息` 表的 `最后更新` 日期。
3. 更新对应 `docs/astack/INDEX.md` 的状态为 `已完成`。
4. 如本次变更对应 PLAN，将 PLAN `文档状态` 确认为 `已完成`。

默认不创建评审或复盘旁路文件。

## 分支策略

默认不切分支。无论当前分支是 `main` / `master` 还是开发分支，`ship` 都在当前分支完成验证、提交和推送。

只有用户明确要求“切分支”、“新建分支”或“开 PR 分支”时，才创建或切换分支。若用户给出分支名，使用用户给定名称；若用户明确要求切分支但未给名称，再按以下格式命名：

| 类型 | 格式 | 示例 |
|------|------|------|
| 新功能 | `feat/描述` | `feat/add-sector-ranking` |
| 修复 | `fix/描述` | `fix/order-race-condition` |
| 重构 | `refactor/描述` | `refactor/market-service` |
| 文档 | `docs/描述` | `docs/update-api-spec` |
| 构建/工具 | `chore/描述` | `chore/upgrade-dependencies` |

## 提交信息规范

遵循 Conventional Commits 1.0.0，Header 必填，Body 推荐，Footer 按需。

```text
<type>(<scope>): <subject>

[Body: 说明为什么这样改、解决思路]

[Footer: BREAKING CHANGE 或 Closes #issue]
```

**Type**：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`

**Subject**：中文，祈使句（"新增"而非"增加了"），不加句号，≤50 字符。

示例：
```text
feat(market): 新增板块优先级评分与轮动分析

引入 P1-P5 评分体系，对标参考项目板块分类映射，
数据通过行业 ETF 日行情异步计算写入 sector_score 表。
```

## 文档同步

检查 `docs/`，若本次变更涉及架构、接口或数据模型，必须同步更新对应文档后再提交。

## Git 安全

- 只在验证 PASS 后提交。
- 暂存前检查 `git status --short --branch` 和 `git diff --stat`，只暂存目标文件。
- 推送前若分支有上游跟踪，使用 rebase 拉取最新。
- 出现 rebase 冲突时，分析后询问用户再处理。
- 禁止 force-push。
- 推送被拒绝时，最多重试两次 rebase + 验证。
- 只在用户要求或仓库工作流要求时创建 PR。
- **不使用 `gh` CLI**；首次推送后命令输出中会有创建 MR 的链接，告知用户点击。

## 输出

报告以下内容：

- 验证命令及结果。
- SPEC / INDEX 更新情况（如有）。
- Commit hash。
- 推送目标或 MR 链接。
