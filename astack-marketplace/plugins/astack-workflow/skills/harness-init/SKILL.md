---
name: harness-init
description: |
  初始化或迁移项目的轻量 Spec 工作流基础设施（AGENTS.md 导航 + docs/version/INDEX.md 版本索引）。
  当用户说"初始化 harness / 搭建 spec 工作流 / 接入研发流程规范 / 给这个项目加上 AGENTS.md / setup harness / init harness"时触发。
  支持三种模式：全新项目从零初始化（fresh）、已有 AGENTS.md 迁移瘦身（migrate）、已初始化但缺文件的补齐（patch）。
---

# Harness 轻量 Spec 初始化

为项目搭建最小可用的 Spec 工作流。默认只维护两个入口：

- `AGENTS.md`：项目导航和少量硬规则
- `docs/version/INDEX.md`：版本 / 迭代 / SPEC 的索引和短变更记录

每个迭代的目标、边界、设计、验收和复盘都优先写在对应 `Iteration<N>_<Slug>_SPEC.md` 中。默认不创建 `BOUNDARIES.md`、`docs/retro/*`、`*_REVIEW.md`、`*_CR.md` 等 sidecar。

## 何时使用

1. **全新项目**：工作区没有 `AGENTS.md`，用户想接入 Spec 驱动工作流。
2. **迁移项目**：已有 `AGENTS.md` 但混入大量迭代状态、边界规则或历史记录，需要瘦身为导航结构。
3. **补齐项目**：已有 `AGENTS.md` 和部分 `docs/version/` 文件，但缺少 `INDEX.md`。

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
| 无 `AGENTS.md` | `fresh` | 询问项目名/描述，渲染 `AGENTS.md` 和 `docs/version/INDEX.md` |
| 有 `AGENTS.md`，无 `docs/version/INDEX.md` | `migrate` | 备份 `AGENTS.md` → `AGENTS.md.bak`，创建 `INDEX.md`，等待 AI 接手语义迁移 |
| 有 `AGENTS.md` 且有 `docs/version/INDEX.md` | `patch` | 只补齐缺失入口，不覆盖已存在文件 |

脚本最后会运行轻量验证门：

- 检查 `AGENTS.md` 存在。
- 检查 `docs/version/INDEX.md` 存在。
- 检查 `CLAUDE.md` 软链若存在则指向 `AGENTS.md`。
- 若发现旧重流程文档（`BOUNDARIES.md`、`docs/retro/*`），只提示 legacy，不把它们当作必需项。

常用参数：

- `--name <项目名>`：非交互式指定项目名（fresh 模式用）
- `--desc <描述>`：非交互式指定一句话描述（fresh 模式用）
- `--dry-run`：只打印计划，不实际修改
- `--force`：覆盖已存在入口文件（谨慎使用）

Codex plugin 环境会提供 `PLUGIN_ROOT`，Claude Code plugin 环境会提供 `CLAUDE_PLUGIN_ROOT`。如果不在 plugin 环境中调试，可从本仓库 checkout 内直接运行：

```bash
bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh
```

### 第 2 步（仅 migrate 模式）：AI 接手语义迁移

脚本只做机械创建。旧 `AGENTS.md` 的内容需要 AI 按语义迁移：

| 旧内容 | 迁移目标 |
|---|---|
| 项目定位、核心原则、运行约束 | 保留在 `AGENTS.md` |
| 迭代状态表 | 迁移到 `docs/version/INDEX.md` |
| 变更记录 | 迁移到 `docs/version/INDEX.md` 的 `## 变更记录` |
| 迭代边界、评审结论、复盘规则 | 优先收敛进对应 SPEC；没有对应 SPEC 时保留为 AGENTS 的短规则或丢弃过期内容 |

重写后的 `AGENTS.md` 建议控制在 80 行以内，只保留：

- 项目定位
- 核心开发原则
- 权威文档入口
- 当前活跃 SPEC 链接
- 必须遵守的少量项目规则

### 第 3 步：验证

完成后检查：

1. `AGENTS.md` 存在且链接有效。
2. `docs/version/INDEX.md` 存在且包含迭代表头。
3. 旧 `AGENTS.md` 中仍有效的迭代状态未丢失。
4. 不存在默认生成的 `BOUNDARIES.md`、`docs/retro/golden-rules.md`、`docs/retro/patterns.md`。
5. 脚本输出 `轻量 Spec scaffold 验证通过`，或明确列出缺失文件。

## 目标结构

```text
.
├── AGENTS.md
└── docs/
    └── version/
        ├── INDEX.md
        ├── Iteration<N>_<Slug>_SPEC.md
        └── archive/
```

## Skill 协作关系

| Skill | 作用 | 依赖文件 |
|---|---|---|
| `/astack-workflow:spec` | 创建或更新迭代 SPEC | `AGENTS.md`、`docs/version/INDEX.md` |
| `/astack-workflow:dev` | 按 SPEC / PLAN 实施 | SPEC / PLAN、项目代码 |
| `/astack-workflow:mr` | 提交前验证、状态流转、更新 INDEX | `docs/version/INDEX.md` |

**默认工作流只有 `/astack-workflow:spec → /astack-workflow:dev → /astack-workflow:mr` 三个核心 skill。** 其他评审、复盘或专项报告只在用户明确要求时临时创建，不作为脚手架基础设施。

## 参考文件

- `skills/harness-init/scripts/init-harness.sh`：机械化脚手架脚本
- `skills/harness-init/templates/AGENTS.md.tpl`：轻量导航模板
- `skills/harness-init/templates/INDEX.md.tpl`：迭代索引模板
