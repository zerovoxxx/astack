---
name: harness-init
description: |
  初始化或迁移项目的轻量 Spec 工作流基础设施（CLAUDE.md 主入口 + AGENTS.md 软链 + docs/astack/INDEX.md 版本索引）。
  当用户说"初始化 harness / 搭建 spec 工作流 / 接入研发流程规范 / 给这个项目加上 CLAUDE.md 或 AGENTS.md / setup harness / init harness"时触发。
  支持三种模式：全新项目从零初始化（fresh）、已有 CLAUDE.md 或 AGENTS.md 的语义迁移（migrate）、已初始化但缺文件的补齐（patch）。
---

# Harness 轻量 Spec 初始化

为项目搭建最小可用的 Spec 工作流。默认只维护一个治理主入口、一个兼容软链和一个文档命名空间：

- `CLAUDE.md`：项目导航和少量硬规则的主文件
- `AGENTS.md`：指向 `CLAUDE.md` 的兼容软链
- `docs/astack/INDEX.md`：版本 / 迭代 / SPEC 的索引和短变更记录
- `docs/astack/version/`：迭代 SPEC
- `docs/astack/plan/`：复杂任务的实现计划

每个迭代的目标、边界、设计、验收和重要结论都优先写在对应 `Iteration<N>_<Slug>_SPEC.md` 中。默认不创建 `BOUNDARIES.md`、`docs/retro/*`、`*_REVIEW.md`、`*_CR.md` 等 sidecar。

## 何时使用

1. **全新项目**：工作区没有 `CLAUDE.md` / `AGENTS.md`，用户想接入 Spec 驱动工作流。
2. **迁移项目**：已有 `CLAUDE.md` 或 `AGENTS.md`，但混入大量迭代状态、边界规则或历史记录，需要重构为目标格式。
3. **补齐项目**：已有部分治理文件，但缺少 `CLAUDE.md`、`AGENTS.md` 软链或 `docs/astack/INDEX.md`。

## 执行流程

### 第 1 步：运行脚手架脚本

在项目根目录运行：

```bash
PLUGIN_ROOT="${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:?missing plugin root}}"
bash "${PLUGIN_ROOT}/skills/harness-init/scripts/init-harness.sh"
```

脚本会自动检测项目状态：

| 检测条件 | 模式 | 脚本行为 |
|---|---|---|
| 无 `CLAUDE.md` 且无 `AGENTS.md` | `fresh` | 询问项目名/描述，渲染 `CLAUDE.md`、创建 `AGENTS.md -> CLAUDE.md` 软链和 `docs/astack/INDEX.md`，创建 `version/` 与 `plan/` |
| 有 `CLAUDE.md` 或 `AGENTS.md`，但无完整 scaffold | `migrate` | 保留既有入口内容，机械迁移为 `CLAUDE.md` 主文件 + `AGENTS.md -> CLAUDE.md` 软链，创建 `INDEX.md`，等待 AI 接手语义迁移 |
| 已有 `CLAUDE.md`、`AGENTS.md -> CLAUDE.md` 和 `docs/astack/INDEX.md` | `patch` | 只补齐缺失目录，不覆盖已存在内容 |

脚本最后会运行轻量验证门：

- 检查 `CLAUDE.md` 存在且不是软链。
- 检查 `AGENTS.md` 是指向 `CLAUDE.md` 的软链。
- 检查 `docs/astack/INDEX.md` 存在。
- 检查 `docs/astack/version/` 和 `docs/astack/plan/` 存在。
- 若发现旧重流程文档（`BOUNDARIES.md`、`docs/retro/*`），只提示 legacy，不把它们当作必需项。

常用参数：

- `--name <项目名>`：非交互式指定项目名（fresh 模式用）
- `--desc <描述>`：非交互式指定一句话描述（fresh 模式用）
- `--dry-run`：只打印计划，不实际修改
- `--force`：覆盖非预期入口文件或软链（谨慎使用）

Codex plugin 环境会提供 `PLUGIN_ROOT`，Claude Code plugin 环境会提供 `CLAUDE_PLUGIN_ROOT`。如果不在 plugin 环境中调试，可从本仓库 checkout 内直接运行：

```bash
bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh
```

### 第 2 步（migrate 模式必做）：AI 接手语义迁移

脚本只做机械创建和备份。只要当前项目已经有 `CLAUDE.md` 或 `AGENTS.md`，AI 必须把旧入口和项目文档当作来源材料，抽象总结后重构成目标格式，不能直接用模板覆盖。

迁移前先阅读：

- 现有 `CLAUDE.md`（若存在）
- 现有 `AGENTS.md` 或 `AGENTS.md.bak`（若存在）
- `README.md`、`package.json`、主要工作区配置
- 现有 `docs/astack/INDEX.md`（若存在）
- 现有 `docs/astack/INDEX.md` 和仍然有效的 `docs/astack/version/Iteration*_SPEC.md`（若存在）
- 用户明确指出的项目规范、发布流程或验证命令

然后按目标格式重写 `CLAUDE.md`：

- 项目定位：用 1-3 句概括项目做什么，来自现有文档或代码事实。
- 核心开发原则：保留模板中的 Karpathy 编程规范原文，并保留 Harness 核心准则。
- 扩展原则：把项目专属技术栈、架构边界、命名规则、领域红线、验证命令、发布流程放在这里；没有证据时保留占位符。
- 权威文档：指向 `docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`；如历史仍在 `docs/version/`，要标注为 legacy 或过渡来源。
- Spec 工作流：保留四流程 `spec -> plan -> dev -> ship`，路径使用 `docs/astack/`。
- 当前活跃迭代：从现有 INDEX / SPEC 中提取真实状态；无法确认时写“无活跃迭代”。

旧内容迁移规则：

| 旧内容 | 迁移目标 |
|---|---|
| 项目定位、核心原则、运行约束 | 抽象后保留在 `CLAUDE.md` |
| 项目专属工程规则 | 放入 `CLAUDE.md` 的 `扩展原则` |
| 迭代状态表 | 迁移到 `docs/astack/INDEX.md`，或在新 INDEX 中链接 legacy `docs/astack/INDEX.md` |
| 变更记录 | 迁移到 `docs/astack/INDEX.md` 的 `## 变更记录` |
| 复杂任务计划 | 迁移到 `docs/astack/plan/` |
| 迭代 SPEC | 迁移到 `docs/astack/version/`，或保留历史链接并在新 INDEX 中登记 |
| 迭代边界、评审结论、复盘规则 | 优先收敛进对应 SPEC；没有对应 SPEC 时保留为 `扩展原则` 的短规则或丢弃过期内容 |

重写时不得：

- 删除仍有效的项目专属约束。
- 把不确定的技术栈、架构分层或发布流程写成事实。
- 改写 Karpathy 编程规范原文。
- 把 `AGENTS.md` 重新变成普通主文件。

### 第 3 步：验证

完成后检查：

1. `CLAUDE.md` 存在且是普通文件。
2. `AGENTS.md` 是 `CLAUDE.md` 的软链。
3. `docs/astack/INDEX.md` 存在且包含迭代表头。
4. `docs/astack/version/` 和 `docs/astack/plan/` 存在。
5. 旧 `CLAUDE.md` / `AGENTS.md` 中仍有效的规则和迭代状态未丢失。
6. 不存在默认生成的 `BOUNDARIES.md`、`docs/retro/golden-rules.md`、`docs/retro/patterns.md`。
7. 脚本输出 `轻量 Spec scaffold 验证通过`，或明确列出缺失文件。

## 目标结构

```text
.
├── CLAUDE.md
├── AGENTS.md -> CLAUDE.md
└── docs/
    └── astack/
        ├── INDEX.md
        ├── version/
        │   └── Iteration<N>_<Slug>_SPEC.md
        └── plan/
            └── Iteration<N>_<Slug>_PLAN.md
```

## Skill 协作关系

| Skill | 作用 | 依赖文件 |
|---|---|---|
| `/astack-workflow:spec` | 创建或更新迭代 SPEC | `CLAUDE.md`、`AGENTS.md`、`docs/astack/INDEX.md` |
| `/astack-workflow:plan` | 拆开复杂任务 | SPEC、项目代码 |
| `/astack-workflow:dev` | 按 SPEC / PLAN 实施 | SPEC / PLAN、项目代码 |
| `/astack-workflow:ship` | 验证、提交、推送 | `docs/astack/INDEX.md`、git 状态 |

**默认工作流只有 `/astack-workflow:spec -> /astack-workflow:plan -> /astack-workflow:dev -> /astack-workflow:ship` 四个核心 skill。** 其他评审、复盘或专项报告只在用户明确要求时临时创建，不作为脚手架基础设施。

## 参考文件

- `skills/harness-init/scripts/init-harness.sh`：机械化脚手架脚本
- `skills/harness-init/templates/CLAUDE.md.tpl`：轻量导航模板
- `skills/harness-init/templates/INDEX.md.tpl`：迭代索引模板
