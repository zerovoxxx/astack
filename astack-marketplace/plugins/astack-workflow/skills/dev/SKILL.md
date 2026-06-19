---
name: dev
description: |
  当需要按照 SPEC 或 PLAN 实现代码或文档变更，并同步记录进度与验证结果时使用。
  触发词：开始开发、按 spec 实现、按 plan 执行、开发这个功能、实现变更。
  Use when implementing code or documentation changes from a SPEC or PLAN while keeping progress and verification evidence synchronized.
---

# 按 SPEC 或 PLAN 开发

从 SPEC 或 PLAN 实现变更，保持最小范围并留下新鲜的验证证据。

## 核心规则

没有新鲜验证，就不声明完成。任务、阶段或 SPEC 在对应命令运行并记录结果之前，均视为未完成。

**业务逻辑强制 TDD**：凡涉及计算逻辑、评分算法、策略规则、数据转换的任务，必须先写测试（此时测试应当失败），再写实现（使测试通过）。跳过这个顺序的代码视为未完成。文档、配置、纯脚手架类变更不受此约束。

## PLAN 模式

当存在 `_PLAN.md` 时：

1. 阅读当前任务及其引用的文件，将来源 SPEC 的 `文档状态` 设为 `开发中`，并同步 `docs/astack/INDEX.md`。
2. 按顺序执行步骤。
3. 每完成一步立即打勾。
4. 运行该任务的验证命令前，将来源 SPEC 的 `文档状态` 设为 `验证中`。
5. 将 PASS / FAIL 证据写入对应 SPEC 的`验证记录`。
6. 验证通过后，将来源 SPEC 与 `docs/astack/INDEX.md` 状态设为 `验证通过`；验证失败时保持 `验证中`。

## SPEC 模式

直接从 `_SPEC.md` 工作时：

1. 将 SPEC `文档状态` 设为 `开发中`，并同步 `docs/astack/INDEX.md`。
2. 阅读相关章节和源文件。
3. 做满足当前目标的最小代码改动。
4. 运行覆盖本次改动的 SPEC `验证计划`命令前，将 SPEC `文档状态` 设为 `验证中`。
5. 写入验证记录行：

```markdown
| YYYY-MM-DD | `实际命令` | PASS / FAIL | 覆盖范围或失败原因 |
```

验证通过后，将 SPEC 与 `docs/astack/INDEX.md` 状态设为 `验证通过`。验证失败时，停止执行，将状态保持为 `验证中`，并记录失败命令。

更新状态时同步更新 `文档信息` 表的 `最后更新` 日期。

## 范围纪律

- 使用项目已有模式。
- 不重构无关代码。
- 不基于意图、视觉检查或旧测试输出声明完成。
- 实现与 SPEC 有偏差时，先更新 SPEC 或询问用户，再继续执行。
