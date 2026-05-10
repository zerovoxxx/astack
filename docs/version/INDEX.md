# 迭代状态总表

> 所有迭代的状态追踪。由 `/spec` 和 `/mr` 命令自动维护。
>
> **列说明**：左列 `迭代` 为业务版本号 `v<major>.<minor>`，`文档` 列链接的文件名前缀 `Iteration<N>` 为该迭代的物理序号（从 1 开始递增）。本表即版本号 ↔ 物理序号的权威映射。命名规范见 [`AGENTS.md §4.1`](../../AGENTS.md#41-docsversion-文件命名规范)。

| 迭代 | 标题 | 状态 | 文档 | 创建日期 |
|------|------|------|------|---------|
| v0.10 | Force Refresh：脏 open-source 镜像的显式 reset + pull 入口 | IMPLEMENTED（单次合并，待 E2E 补测） | [Iteration9_ForceRefresh.md](./Iteration9_ForceRefresh.md) | 2026-05-10 |
| v0.9 | Repo 卡片 Refresh / Remove 按钮外显平铺 | SPEC（待实施） | [Iteration8_RepoActionsInline.md](./Iteration8_RepoActionsInline.md) | 2026-05-10 |
| v0.8 | Auto-adopt Reflow（后加 repo 能重分类已兜底 LocalSkill） | SHIPPED（单 PR） | [Iteration7_BootstrapReflow.md](./Iteration7_BootstrapReflow.md) | 2026-04-23 |
| v0.7 | Local Skills as First-Class Citizens | SHIPPED (PR1–PR6)；评审见 [_REVIEW](./Iteration6_LocalSkills_REVIEW.md) | [Iteration6_LocalSkills.md](./Iteration6_LocalSkills.md) | 2026-04-22 |
| v0.6 | Open-source 镜像卫生 + Resolve 路径自愈 + 日志落盘 | SHIPPED (PR1–PR5)；评审见 [_REVIEW](./Iteration5_MirrorHygiene_REVIEW.md)、[_CR](./Iteration5_MirrorHygiene_CR.md) | [Iteration5_MirrorHygiene.md](./Iteration5_MirrorHygiene.md) | 2026-04-22 |
| v0.5 | Subscription Bootstrap for Legacy Projects | IMPLEMENTED (PR1–PR5)；PR6 E2E 规划 | [Iteration4_SubscriptionBootstrap.md](./Iteration4_SubscriptionBootstrap.md) | 2026-04-21 |
| v0.4 | Harness Tab + 系统级 Skill 首次落地 | SHIPPED | [Iteration3_HarnessTab.md](./Iteration3_HarnessTab.md) | 2026-04-20 |
| v0.3 | 项目详情页重设计 + Web 端完整管理能力 | SHIPPED | [Iteration2_ProjectDetailRedesign.md](./Iteration2_ProjectDetailRedesign.md) | 2026-04-20 |
| v0.2 | sqlite 换底 + 多仓库目录兼容 | SHIPPED | [Iteration1_SqliteAndMultiRepo.md](./Iteration1_SqliteAndMultiRepo.md) | 2026-04-19 |
