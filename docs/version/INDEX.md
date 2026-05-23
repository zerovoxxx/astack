# 迭代状态总表

> 所有迭代的状态追踪。由 `/spec` 和 `/mr` 命令自动维护。
>
> **列说明**：左列 `迭代` 为业务版本号 `v<major>.<minor>`，`文档` 列链接的文件名前缀 `Iteration<N>` 为该迭代的物理序号（从 1 开始递增）。本表即版本号 ↔ 物理序号的权威映射。命名规范见 [`AGENTS.md §4.1`](../../AGENTS.md#41-docsversion-文件命名与目录规范)。

| 迭代 | 标题 | 状态 | 文档 | 创建日期 |
|------|------|------|------|---------|
| v0.12 | Plugin Marketplace 布局：扫描 `<root>/<plugin>/{skills,commands,agents}/` 二级容器 | IMPLEMENTED（PR1–PR3 已落地）；CR 见 [_CR](./review/Iteration11_PluginMarketplaceLayout_CR.md) | [Iteration11_PluginMarketplaceLayout_SPEC.md](./Iteration11_PluginMarketplaceLayout_SPEC.md) | 2026-05-13 |
| v0.11 | Auto-sync：Daemon 侧周期性 pull / push + 冲突安全停泊 | SHIPPED；评审见 [_REVIEW](./review/Iteration10_AutoSync_REVIEW.md) | [Iteration10_AutoSync_SPEC.md](./Iteration10_AutoSync_SPEC.md) | 2026-05-11 |
| v0.10 | Force Refresh：脏 open-source 镜像的显式 reset + pull 入口 | IMPLEMENTED（单次合并，待 E2E 补测） | [Iteration9_ForceRefresh_SPEC.md](./Iteration9_ForceRefresh_SPEC.md) | 2026-05-10 |
| v0.9 | Repo 卡片 Refresh / Remove 按钮外显平铺 | SPEC（待实施） | [Iteration8_RepoActionsInline_SPEC.md](./Iteration8_RepoActionsInline_SPEC.md) | 2026-05-10 |
| v0.8 | Auto-adopt Reflow（后加 repo 能重分类已兜底 LocalSkill） | SHIPPED（单 PR） | [Iteration7_BootstrapReflow_SPEC.md](./Iteration7_BootstrapReflow_SPEC.md) | 2026-04-23 |
| v0.7 | Local Skills as First-Class Citizens | SHIPPED (PR1–PR6)；评审见 [_REVIEW](./review/Iteration6_LocalSkills_REVIEW.md) | [Iteration6_LocalSkills_SPEC.md](./Iteration6_LocalSkills_SPEC.md) | 2026-04-22 |
| v0.6 | Open-source 镜像卫生 + Resolve 路径自愈 + 日志落盘 | SHIPPED (PR1–PR5)；评审见 [_REVIEW](./review/Iteration5_MirrorHygiene_REVIEW.md) | [Iteration5_MirrorHygiene_SPEC.md](./Iteration5_MirrorHygiene_SPEC.md) | 2026-04-22 |
| v0.5 | Subscription Bootstrap for Legacy Projects | IMPLEMENTED (PR1–PR5)；PR6 E2E 规划 | [Iteration4_SubscriptionBootstrap_SPEC.md](./Iteration4_SubscriptionBootstrap_SPEC.md) | 2026-04-21 |
| v0.4 | Harness Tab + 系统级 Skill 首次落地 | SHIPPED | [Iteration3_HarnessTab_SPEC.md](./Iteration3_HarnessTab_SPEC.md) | 2026-04-20 |
| v0.3 | 项目详情页重设计 + Web 端完整管理能力 | SHIPPED | [Iteration2_ProjectDetailRedesign_SPEC.md](./Iteration2_ProjectDetailRedesign_SPEC.md) | 2026-04-20 |
| v0.2 | sqlite 换底 + 多仓库目录兼容 | SHIPPED | [Iteration1_SqliteAndMultiRepo_SPEC.md](./Iteration1_SqliteAndMultiRepo_SPEC.md) | 2026-04-19 |

## 变更记录

| 日期 | 版本 | 作者 | 摘要 |
|------|------|------|------|
| 2026-05-23 | v0.12 | AI | feat(server)：astack-skills 内联仓库 daemon 启动自扫（6 测），harness-init 迁至 astack-skills。 |
