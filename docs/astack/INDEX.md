# 迭代状态总表

> 所有迭代的状态追踪。由 `/astack-workflow:spec` 和 `/astack-workflow:ship` 维护。
>
> **列说明**：左列 `迭代` 为业务版本号 `v<major>.<minor>`，`文档` 列链接的文件名前缀 `Iteration<N>` 为该迭代的物理序号（从 1 开始递增）。本表即版本号 ↔ 物理序号的权威映射。命名规范见 [`CLAUDE.md §5.2`](../../CLAUDE.md#52-命名规范)。

> 已归档迭代见 [version/archive/INDEX.md](version/archive/INDEX.md)。

| 迭代 | 标题 | 状态 | 文档 | 创建日期 |
|------|------|------|------|---------|
| v0.16 | Polyglot workflow quality gates | 已完成 | [Iteration15_PolyglotWorkflowQualityGates_SPEC.md](./version/Iteration15_PolyglotWorkflowQualityGates_SPEC.md) | 2026-08-19 |
| v0.15 | Open-source README：英文首屏与 `docs/` 多语言入口 | 已完成 | [Iteration14_OpenSourceReadme_SPEC.md](./version/Iteration14_OpenSourceReadme_SPEC.md) | 2026-06-20 |
| v0.14 | Spec skill：复杂方案设计增加外部参照与设计取舍检查 | 已完成 | [Iteration13_SpecDesignReference_SPEC.md](./version/Iteration13_SpecDesignReference_SPEC.md) | 2026-06-20 |
| v0.12 | Plugin Marketplace 布局：扫描 `<root>/<plugin>/{skills,commands,agents}/` 二级容器 | IMPLEMENTED（PR1–PR3 已落地） | [Iteration11_PluginMarketplaceLayout_SPEC.md](./version/Iteration11_PluginMarketplaceLayout_SPEC.md) | 2026-05-13 |
| v0.11 | Auto-sync：Daemon 侧周期性 pull / push + 冲突安全停泊 | SHIPPED | [Iteration10_AutoSync_SPEC.md](./version/Iteration10_AutoSync_SPEC.md) | 2026-05-11 |
| v0.10 | Force Refresh：脏 open-source 镜像的显式 reset + pull 入口 | IMPLEMENTED（单次合并，待 E2E 补测） | [Iteration9_ForceRefresh_SPEC.md](./version/Iteration9_ForceRefresh_SPEC.md) | 2026-05-10 |
| v0.9 | Repo 卡片 Refresh / Remove 按钮外显平铺 | SPEC（待实施） | [Iteration8_RepoActionsInline_SPEC.md](./version/Iteration8_RepoActionsInline_SPEC.md) | 2026-05-10 |
| v0.8 | Auto-adopt Reflow（后加 repo 能重分类已兜底 LocalSkill） | SHIPPED（单 PR） | [Iteration7_BootstrapReflow_SPEC.md](./version/Iteration7_BootstrapReflow_SPEC.md) | 2026-04-23 |
| v0.7 | Local Skills as First-Class Citizens | SHIPPED (PR1–PR6) | [Iteration6_LocalSkills_SPEC.md](./version/Iteration6_LocalSkills_SPEC.md) | 2026-04-22 |
| v0.6 | Open-source 镜像卫生 + Resolve 路径自愈 + 日志落盘 | SHIPPED (PR1–PR5) | [Iteration5_MirrorHygiene_SPEC.md](./version/Iteration5_MirrorHygiene_SPEC.md) | 2026-04-22 |
| v0.5 | Subscription Bootstrap for Legacy Projects | IMPLEMENTED (PR1–PR5)；PR6 E2E 规划 | [Iteration4_SubscriptionBootstrap_SPEC.md](./version/Iteration4_SubscriptionBootstrap_SPEC.md) | 2026-04-21 |
| v0.4 | Harness Tab + 系统级 Skill 首次落地 | SHIPPED | [Iteration3_HarnessTab_SPEC.md](./version/Iteration3_HarnessTab_SPEC.md) | 2026-04-20 |
| v0.3 | 项目详情页重设计 + Web 端完整管理能力 | SHIPPED | [Iteration2_ProjectDetailRedesign_SPEC.md](./version/Iteration2_ProjectDetailRedesign_SPEC.md) | 2026-04-20 |
| v0.2 | sqlite 换底 + 多仓库目录兼容 | SHIPPED | [Iteration1_SqliteAndMultiRepo_SPEC.md](./version/Iteration1_SqliteAndMultiRepo_SPEC.md) | 2026-04-19 |

## 变更记录

| 日期 | 版本 | 作者 | 摘要 |
|------|------|------|------|
| 2026-08-19 | v0.16 | zerovoxxx | ship：完成多语言项目质量门改造的最终验证与状态收口。 |
| 2026-08-19 | v0.16 | zerovoxxx | refactor(workflow)：核心 skills 改为语言无关验证流程，项目质量门下沉到 `CLAUDE.md`，并同步 AO Maven 工程。 |
| 2026-08-19 | v0.16 | zerovoxxx | docs(workflow)：创建多语言核心流程与项目级质量门 SPEC。 |
| 2026-06-20 | v0.15 | zerovoxxx | ship：完成开源 README 与多语言 docs 入口的最终验证与状态更新。 |
| 2026-06-20 | v0.15 | zerovoxxx | docs：创建开源 README 改写与多语言 docs 入口 SPEC。 |
| 2026-06-20 | v0.14 | zerovoxxx | ship：完成 `spec` skill 外部参照规则增强的最终验证与状态更新。 |
| 2026-06-20 | v0.14 | zerovoxxx | docs(workflow)：为 `spec` skill 增加复杂方案设计的外部参照与设计取舍检查。 |
| 2026-06-19 | v0.13 | AI | docs：创建 Harness docs layout 与治理入口模板优化 SPEC。 |
| 2026-06-19 | v0.13 | AI | feat(harness)：scaffold contract 改为 `docs/astack/INDEX.md` + `version/` + `plan/`，并同步治理入口模板与 Harness 状态检测。 |
| 2026-06-19 | v0.13 | AI | docs(harness)：`CLAUDE.md` 模板原文保留 Karpathy 编程规范，并新增 `扩展原则` 占位符。 |
| 2026-06-19 | v0.13 | AI | feat(harness)：治理入口改为 `CLAUDE.md` 主文件，`AGENTS.md` 改为指向 `CLAUDE.md` 的兼容软链。 |
| 2026-06-19 | v0.13 | AI | docs：迁移存量 SPEC 到 `docs/astack/version/`，删除旧 version/review/archive 文档。 |
| 2026-06-19 | v0.13 | AI | chore：根目录新增 `.agents -> .claude` 兼容软链。 |
| 2026-06-18 | v0.12 | AI | refactor：默认资产迁移为 `astack-marketplace` Claude plugin marketplace；内联扫描改用 `plugin-marketplace` 布局。 |
| 2026-05-23 | v0.12 | AI | feat(server)：内联资产仓库 daemon 启动自扫（6 测），harness-init 迁入内联资产。 |
