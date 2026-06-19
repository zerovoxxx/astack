---
name: plan
description: |
  当已有审批通过的 SPEC 需要拆解为可执行实现计划时使用。仅在 SPEC 过大或风险较高、无法直接执行时调用。
  触发词：把 spec 拆成任务、出一个实现计划、拆解开发计划、生成 plan、任务分解。
  Use when turning an approved SPEC into an executable implementation plan with task steps and verification commands.
---

# SPEC 转实现计划

仅在 SPEC 过大或风险较高、无法直接执行时使用。计划将设计意图转化为带具体验证的小粒度任务。

## 输入

阅读以下内容：

- 完整 SPEC。
- `CLAUDE.md`（以及兼容软链 `AGENTS.md`）。
- SPEC 引用的现有源文件。
- 当前 SPEC 显式引用的所有前置 SPEC。

## 输出

在 `docs/astack/plan/Iteration<N>_<Slug>_PLAN.md` 创建实现计划，并在文档开头链接来源 SPEC。

文档开头必须使用与 SPEC 一致的 `文档信息` 表。`作者` 优先填写当前仓库 `git config user.name` 的结果；为空时写 `AI`：

```markdown
> **文档信息**
>
> | 字段 | 值 |
> |---|---|
> | 文档类型 | PLAN |
> | 文档状态 | 待执行 |
> | 创建日期 | YYYY-MM-DD |
> | 最后更新 | YYYY-MM-DD |
> | 作者 | `<git config user.name>`，为空则 `AI` |
> | 关联文档 | [Iteration<N>_<Slug>_SPEC.md](../version/Iteration<N>_<Slug>_SPEC.md) |
> | 一句话目标 | 用一句话描述本计划要拆解和验证的交付结果。 |
```

PLAN 只使用两个状态：`待执行` 和 `已完成`。新 PLAN 默认为 `待执行`；所有任务执行并验证 PASS 后，由 `dev` 更新为 `已完成`。

包含：

- 来源 SPEC 链接。
- 文件地图：文件、操作、职责。
- 带语义锚点的有序任务（不使用脆弱的行号）。
- 具体执行步骤。
- 每个任务的验证命令。
- 跨文件契约的评审节点。
- 要求更新 SPEC 验证记录的最终检查清单。

## 验证规则

每个任务至少要有一条带预期信号的命令，例如：

```text
uv run pytest tests/domains/market/test_service.py -v  → exit 0
uv run ruff check backend/ → exit 0
```

避免模糊检查（如"构建通过"），除非明确给出命令名称。不引入 SPEC 中没有的设计决策；不明确的需求标注为 `Spec 待明确`。

## 约束

- 规划阶段不编辑生产代码。
- 不执行 git commit / push。
- 每个任务保持足够小，可独立验证。

## 完成

输出 `_PLAN.md` 后立即停止。不进入开发执行阶段。等待用户显式调用 `/dev` 再开始实现。
