# {{PROJECT_NAME}}

> 本文件是项目的轻量导航入口。详细方案以 `docs/astack/version/*_SPEC.md` 为准。

## 1. 项目定位

{{PROJECT_DESC}}

## 2. 核心开发原则

### 1. 🚀 编码哲学 (Karpathy-Inspired Coding Guidelines)

> "Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment."

#### 1. Think Before Coding
- **State your assumptions explicitly.** If uncertain, ask.
- **Don't assume. Don't hide confusion. Surface tradeoffs.**
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- **If something is unclear, stop. Name what's confusing. Ask.**

#### 2. Simplicity First
- **Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- **If you write 200 lines and it could be 50, rewrite it.**

#### 3. Surgical Edits
- **Touch only what you must. Clean up only your own mess.**
- Avoid "while I'm here" refactoring of unrelated code.
- Keep diffs small and focused.
- If a change requires touching 10 files, explain why before doing it.
- Don't reformat code unless it's the primary task.

#### 4. Goal-Driven Execution
- **Define success criteria. Loop until verified.**
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make them pass"
- "Refactor X" → "Ensure tests pass before and after"
- **Validation is the only path to finality.**

### 2. Harness 核心准则

1. Spec 驱动：有明确行为变化时，先写或更新对应 SPEC。
2. 单一权威：目标、边界、设计、验收和重要结论优先写在 SPEC 本文。
3. 影响面可解释：跨模块、接口、数据流或运行流程变更必须先写清涉及文件和原因。
4. 机械校验优先：能用 lint / test / script 检查的规则，不靠人工记忆。
5. 轻量维护：默认不维护 sidecar 文档，除非用户明确要求专项报告。

## 3. 扩展原则

> 本节预留给不同项目补充自己的工程约束。未补充前，不应凭空推断技术栈、架构分层或领域禁令。

（待补充：项目专属技术栈、架构边界、命名规则、领域红线、验证命令或发布流程。）

## 4. 权威文档

- `docs/astack/INDEX.md` — 版本 / 迭代 / SPEC 索引
- `docs/astack/version/Iteration<N>_<Slug>_SPEC.md` — 迭代设计文档，目标与边界的唯一权威
- `docs/astack/plan/Iteration<N>_<Slug>_PLAN.md` — 仅复杂任务使用的执行计划

## 5. Spec 工作流

默认只使用四个核心流程：

```text
/astack-workflow:spec  →  /astack-workflow:plan  →  /astack-workflow:dev  →  /astack-workflow:ship
想清楚要做什么              拆开复杂任务               开始执行                  验证、提交、推送
```

- `/astack-workflow:spec`：创建或更新 SPEC，并维护 `docs/astack/INDEX.md`。每个 SPEC 必须包含轻量验证计划。
- `/astack-workflow:plan`：仅在复杂任务时，把 SPEC 拆成可执行步骤和验证点，输出到 `docs/astack/plan/`。
- `/astack-workflow:dev`：按 SPEC 或 PLAN 实施代码变更，运行验证命令并把证据写回 SPEC。
- `/astack-workflow:ship`：做最终新鲜验证、状态流转、提交并推送。

## 5.1 设计与影响面

当用户要求需求设计、方案设计、影响面分析或跨组件变更时，先完成轻量设计再编码。小范围文档或单文件修正可以裁剪，但不得跳过假设、影响面和验证目标。

SPEC 至少写清：

- 背景与目标：做什么、不做什么、为什么现在做。
- 假设与约束：哪些来自用户，哪些来自代码搜索，哪些是推断。
- 影响面：涉及哪些组件、文件、接口或数据流，以及为什么必然涉及。
- 改动清单：按文件标注 `NEW` / `MODIFY`，避免无关扩散。
- 验证计划：至少 1 条可执行命令；纯文档变更可写 `git diff --check`。

## 5.2 轻量验证门

1. SPEC 阶段写清楚至少 1 条机械验证命令。
2. DEV 阶段每完成一个可独立交付的任务，运行对应验证命令；失败则停止并记录失败原因。
3. SHIP 阶段只接受本轮新鲜验证结果，不用早先的“应该通过”或局部检查替代完整证据。
4. 验证记录只写命令、结果、日期和必要备注，不维护额外 review / retro 文档。

## 5.3 编码红线

- 不自造命名；新增文件名、类名、函数名、字段名、常量名前先 `rg` 同类实现。
- 不为未来扩展新增配置项、Handler、Filter 或抽象。
- 不修改无关代码的格式、注释或逻辑。
- 复用已有数据流；上游已经取得的数据，不重复请求或跨层查询。
- 复杂逻辑必须有针对性测试；没有新鲜验证，不声明完成。

## 6. 当前活跃迭代

（无活跃迭代）
