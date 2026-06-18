# astack

> 本文件是项目的轻量导航入口。详细方案以 `docs/version/*_SPEC.md` 为准。

## 1. 项目定位

待补充

## 2. 核心开发原则

1. Spec 驱动：有明确行为变化时，先写或更新对应 SPEC。
2. 单一权威：目标、边界、设计、验收和重要结论优先写在 SPEC 本文。
3. 最小改动：只修改当前 SPEC 涉及的文件和模块。
4. 机械校验优先：能用 lint / test / script 检查的规则，不靠人工记忆。
5. 证据先于完成：声明完成前必须运行本次变更对应的验证命令，并在 SPEC 或汇报中记录命令与结果。
6. 轻量维护：默认不维护 sidecar 文档，除非用户明确要求专项报告。

## 3. 权威文档

- `docs/version/INDEX.md` — 版本 / 迭代 / SPEC 索引
- `docs/version/Iteration<N>_<Slug>_SPEC.md` — 迭代设计文档，目标与边界的唯一权威

历史 `docs/version/review/` 文件仅作旧记录查询，不再作为默认工作流产物。

## 4. Spec 工作流

默认只使用四个核心流程：

```text
/astack-workflow:spec  ->  /astack-workflow:plan  ->  /astack-workflow:dev  ->  /astack-workflow:ship
想清楚要做什么              拆开复杂任务               开始执行                  验证、提交、推送
```

- `/astack-workflow:spec`：创建或更新 SPEC，并维护 `docs/version/INDEX.md`。每个 SPEC 必须包含轻量验证计划。
- `/astack-workflow:plan`：仅在复杂任务时，把 SPEC 拆成可执行步骤和验证点。
- `/astack-workflow:dev`：按 SPEC 或 PLAN 实施代码变更，运行验证命令并把证据写回 SPEC。
- `/astack-workflow:ship`：做最终新鲜验证、状态流转、提交并推送。

不再默认维护 `docs/version/BOUNDARIES.md`、`docs/retro/golden-rules.md`、`docs/retro/patterns.md`、`*_REVIEW.md`、`*_CR.md`。

## 4.1 轻量验证门

1. SPEC 阶段写清楚至少 1 条机械验证命令；纯文档变更可写 `git diff --check`。
2. DEV 阶段每完成一个可独立交付的任务，运行对应验证命令；失败则停止并记录失败原因。
3. SHIP 阶段只接受本轮新鲜验证结果，不用早先的“应该通过”或局部检查替代完整证据。
4. 验证记录只写命令、结果、日期和必要备注，不维护额外 review / retro 文档。

## 5. 命名规范

1. SPEC 文件统一命名为 `docs/version/Iteration<N>_<PascalSlug>_SPEC.md`。
2. `<N>` 是从 1 开始递增的物理序号，由 `INDEX.md` 现有最大序号 + 1 得出。
3. 业务版本号 `v<major>.<minor>` 维护在 `INDEX.md` 表格中，与物理序号解耦。
4. 已完成且需要淡出根目录的 SPEC 可移入 `docs/version/archive/`，文件名保持不变。
5. 泛技术笔记走 `docs/<topic>/`，不占用 `Iteration<N>_*` 命名空间。

## 6. 当前迭代

**当前 SPEC：** v0.12 — Plugin Marketplace 布局（2026-05-13，[spec](docs/version/Iteration11_PluginMarketplaceLayout_SPEC.md)）— 在 `ScanRootKind` 上新增 `plugin-marketplace` 成员，扫描 `<root>/<plugin>/{skills,commands,agents}/` 二级容器；skill `name` 通过 `<plugin>/<inner>` 命名空间解决跨 plugin 同名；CLI 同步加 `--scan-config-json`。

**最近完成：** v0.11 — Auto-sync（2026-05-11，[spec](docs/version/Iteration10_AutoSync_SPEC.md)）— daemon 侧周期性 pull / push + 冲突安全停泊。

更多历史迭代见 [`docs/version/INDEX.md`](docs/version/INDEX.md)。

## 7. gstack

Use the `/browse` skill from gstack for **all web browsing**. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills include `/browse`, `/qa`, `/review`, `/ship`, `/investigate`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/codex`, `/cso`, `/autoplan`, `/retro`, and related planning / design / deploy helpers.
