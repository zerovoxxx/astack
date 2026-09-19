# astack

> 本文件是项目的导航入口。详细方案以 `docs/astack/version/*_SPEC.md` 为准。

## 1. 项目定位

Astack 是 AI Coding 技能跨项目管理工具，用 CLI、后端 daemon 和 Web Dashboard 管理 Claude Code / Cursor / CodeBuddy 项目的 skills、commands、插件 marketplace 与订阅同步。

当前仓库同时维护运行时 packages 和内置 marketplace 插件：`astack-workflow` 提供 `harness-init`、`spec`、`plan`、`dev`、`ship` 流程，`astack-common` 承载非流程类通用 skills。

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
3. 最小改动：只修改当前 SPEC 涉及的文件和模块。
4. 机械校验优先：能用 lint / test / script 检查的规则，不靠人工记忆。
5. 证据先于完成：声明完成前必须运行本次变更对应的验证命令，并在 SPEC 或汇报中记录命令与结果。
6. 文档维护：默认不维护 sidecar 文档，除非用户明确要求专项报告。

## 3. 扩展原则

### 3.1 技术栈边界

- Monorepo package：`@astack/shared`、`@astack/server`、`@astack/cli`、`@astack/web`。
- 后端：Hono + SQLite + git 操作 + SSE；Node.js 必须满足 `>=22.13.0`。
- 前端：React + Vite + Tailwind；Harness 面板状态以 `@astack/shared` 的 domain contract 为准。
- 内置插件：`astack-marketplace/plugins/{astack-workflow,astack-common}/` 同时遵循 Claude Code `.claude-plugin` 与 Codex `.codex-plugin` marketplace 协议。
- 项目本地安装：`.claude/skills/{harness-init,spec,plan,dev,ship}` 来自当前仓库最新 `astack-workflow` 插件源；`.agents` 是指向 `.claude` 的兼容软链。

### 3.2 项目质量门

核心工作流按“当前 SPEC / PLAN → 本节 → 仓库原生入口”的顺序解析验证命令，不猜测其他技术生态的默认工具。

- 文档 / skill：`git diff --check`，并用针对性 `rg` 检查过期引用；marketplace 与本地副本使用 `diff -qr astack-marketplace/plugins/astack-workflow/skills .claude/skills`。
- 静态检查：`pnpm typecheck`。当前 workspace 未配置独立 lint，不把无实际检查的命令作为质量门。
- 聚焦测试：按影响面选择 `pnpm --filter @astack/shared test`、`pnpm --filter @astack/server test`、`pnpm --filter @astack/cli test` 或 `pnpm --filter @astack/web test`。
- 完整测试：`pnpm test`。
- 构建：`pnpm build`。
- 代码变更的完整验证：`pnpm typecheck && pnpm test && pnpm build`；文档 / skill 变更按匹配 SPEC 的验证计划执行，无需机械运行无关代码回归。

## 4. 权威文档

- `docs/astack/INDEX.md` — 新 Harness 工作流的版本 / 迭代 / SPEC 索引。
- `docs/astack/version/Iteration<N>_<Slug>_SPEC.md` — 迭代 SPEC 的默认位置。
- `docs/astack/plan/Iteration<N>_<Slug>_PLAN.md` — 仅复杂任务使用的执行计划。

## 5. Spec 工作流

默认只使用四个核心流程：

```text
/astack-workflow:spec  ->  /astack-workflow:plan  ->  /astack-workflow:dev  ->  /astack-workflow:ship
想清楚要做什么              拆开复杂任务               开始执行                  验证、提交、推送
```

- `/astack-workflow:spec`：创建或更新 SPEC，并维护 `docs/astack/INDEX.md`。每个 SPEC 必须包含验证计划。
- `/astack-workflow:plan`：仅在复杂任务时，把 SPEC 拆成可执行步骤和验证点，输出到 `docs/astack/plan/`。
- `/astack-workflow:dev`：按 SPEC 或 PLAN 实施代码变更，运行验证命令并把证据写回 SPEC。
- `/astack-workflow:ship`：做最终新鲜验证、状态流转、提交并推送。

## 5.1 验证门

1. SPEC 阶段写清楚至少 1 条机械验证命令；纯文档变更可写 `git diff --check`。
2. DEV 阶段每完成一个可独立交付的任务，运行对应验证命令；失败则停止并记录失败原因。
3. SHIP 阶段只接受本轮新鲜验证结果，不用早先的“应该通过”或局部检查替代完整证据。
4. 验证记录只写命令、结果、日期和必要备注，不维护额外 review / retro 文档。

## 5.2 命名规范

1. SPEC 文件统一命名为 `docs/astack/version/Iteration<N>_<PascalSlug>_SPEC.md`。
2. 复杂任务 PLAN 命名为 `docs/astack/plan/Iteration<N>_<PascalSlug>_PLAN.md`。
3. `<N>` 是从 1 开始递增的物理序号，由对应 INDEX 现有最大序号 + 1 得出。
4. 业务版本号 `v<major>.<minor>` 维护在 INDEX 表格中，与物理序号解耦。
5. 泛技术笔记走 `docs/<topic>/`，不占用 `Iteration<N>_*` 命名空间。

## 6. 当前活跃迭代

**当前 SPEC：** 无。

**最近完成：** v0.16 — Polyglot workflow quality gates（2026-08-19，[spec](docs/astack/version/Iteration15_PolyglotWorkflowQualityGates_SPEC.md)）— 核心 skills 保持语言无关，由项目 `CLAUDE.md` 声明真实质量门。

更多迭代见 [`docs/astack/INDEX.md`](docs/astack/INDEX.md)。
