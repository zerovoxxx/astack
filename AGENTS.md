# astack

> 本文件是项目的导航地图，详细内容通过链接指向对应文档。

## 1. 项目定位

待补充

## 2. 核心开发原则

1. Spec 驱动：先设计后编码，所有功能变更必须有对应 Spec
2. 文档即权威：Spec 文档是开发和评审的唯一权威依据
3. 最小改动：只修改方案涉及的文件和模块，不扩散重构
4. 机械校验优于人工约定：能用 lint 检查的规则不靠自觉遵守
5. 知识回流：评审和 CR 中的发现自动沉淀为团队知识

## 3. 权威文档

- `docs/version/` — 版本设计文档（Spec）
- `docs/retro/golden-rules.md` — 黄金法则（评审自动沉淀）

## 4. 导航索引

| 文档 | 内容 | 维护方式 |
|------|------|---------|
| [`docs/version/INDEX.md`](docs/version/INDEX.md) | 迭代状态表 | `/spec`、`/mr` 自动维护 |
| [`docs/version/BOUNDARIES.md`](docs/version/BOUNDARIES.md) | 迭代边界规则 | `/spec` 自动维护 |
| [`docs/retro/golden-rules.md`](docs/retro/golden-rules.md) | 黄金法则（活跃规则） | `/spec_review`、`/code_review` 自动沉淀 |
| [`docs/retro/patterns.md`](docs/retro/patterns.md) | 反模式库 | 同上 |

### 4.1 `docs/version/` 文件命名与目录规范

所有迭代相关文档统一使用 harness-init 规范：`Iteration<N>_<PascalSlug>` 作为 **slug**，其中 `<N>` 为从 1 开始的整数迭代序号，按用途区分后缀与目录：

| 文件类型 | 命名模板 | 举例 | 存放位置 | 谁生产 |
|---------|---------|------|---------|--------|
| Spec 正文（迭代设计文档，权威） | `Iteration<N>_<PascalSlug>_SPEC.md` | `Iteration6_LocalSkills_SPEC.md` | `docs/version/` | `/spec` |
| Spec 评审记录（sidecar） | `Iteration<N>_<PascalSlug>_REVIEW.md` | `Iteration6_LocalSkills_REVIEW.md` | `docs/version/review/` | `/spec_review` |
| 代码评审报告（sidecar） | `Iteration<N>_<PascalSlug>_CR.md` | `Iteration5_MirrorHygiene_CR.md` | `docs/version/review/` | `/code_review` |
| 其他专项报告 | `Iteration<N>_<PascalSlug>_<UPPER_SNAKE>.md`（如 `_SPIKE`、`_POSTMORTEM`） | `Iteration1_SqliteAndMultiRepo_SPIKE.md` | `docs/version/review/` | 人工或对应命令 |
| 已归档历史 spec / sidecar | 原文件名保持不变 | — | `docs/version/archive/` | 人工 |

**目录布局：**

```
docs/version/
├── INDEX.md                                # 迭代状态表（链接活跃 spec）
├── BOUNDARIES.md                           # 迭代边界规则
├── Iteration<N>_<Slug>_SPEC.md             # 活跃 spec 正文
├── review/                                 # 所有 sidecar（REVIEW / CR / SPIKE / POSTMORTEM）
│   └── Iteration<N>_<Slug>_<KIND>.md
└── archive/                                # 已归档（不再活跃）的 spec / sidecar
    └── ...
```

**规则：**

1. **slug 不变**：同一迭代的 spec / REVIEW / CR / SPIKE 共用同一 slug（含 `<N>` 与 `<PascalSlug>`），`ls Iteration<N>_*_SPEC.md docs/version/review/Iteration<N>_*.md` 一把捞齐该迭代全部文档。
2. **SPEC 后缀强制**：spec 正文必须以 `_SPEC.md` 结尾，与各类 sidecar（`_REVIEW` / `_CR` / `_SPIKE` / `_POSTMORTEM`）在文件名层级即可区分。
3. **sidecar 一律落 `review/`**：评审记录、代码评审、专项报告（含 SPIKE / POSTMORTEM）一律放在 `docs/version/review/` 子目录；spec 正文从顶层引用时使用 `./review/<file>` 相对路径，sidecar 反向引用 spec 正文使用 `../<file>`。
4. **archive/ 仅做归档**：当某 spec 或其 sidecar 不再活跃且需要从顶层视图淡出时，相关文件可移入 `docs/version/archive/` 保留历史；INDEX.md 的活跃迭代表不再链接已归档项。
5. **序号从 1 开始递增**：`<N>` 由 `/spec` 创建新迭代时分配为 `INDEX.md` 现有最大序号 + 1；不允许跳号，不允许小数（如 `Iteration0.X` / `Iteration1.5` 均禁止）。
6. **`<N>` 与版本号解耦**：`<N>` 是 spec 文档的物理序号，业务版本号 `v<major>.<minor>` 维护在 `INDEX.md` 表格里，二者通过 INDEX 行映射对齐。
7. **sidecar 不进 INDEX 主列**：`INDEX.md` 的主行只链 spec 正文；sidecar 通过 spec 文档内部引用或 INDEX 的状态列内联链接（链接路径含 `./review/` 前缀）。
8. **禁止其他风格**：不再使用 `v0.X-<kebab-slug>.md` 或不带 `_SPEC` 后缀的 `Iteration<N>_<Slug>.md` 旧风格，历史文件已在 2026-05-11 统一 rename。
9. **不在 `docs/version/` 下放非迭代文档**：泛技术笔记走 `docs/<topic>/`，不占 `Iteration<N>_*` 命名空间。

## 5. 当前活跃迭代

**最近完成：** v0.8 — Auto-adopt Reflow（2026-04-23，[spec](docs/version/Iteration7_BootstrapReflow_SPEC.md)）— 修复"先注册项目→后加 repo→UI 不更新"的闭环 bug：`origin='auto'` LocalSkill 允许被 scanRaw 重分类，subscribe 成功后翻 `name_collision`；前端 `loadBootstrap` 切到幂等写；R8 / P8 沉淀至 retro

**历史完成：**
- v0.7 — Local Skills as First-Class Citizens（2026-04-23，[spec](docs/version/Iteration6_LocalSkills_SPEC.md)）— PR1–PR6 全部落地，LocalSkill 作为一等公民域概念上线；UnmatchedBanner 常驻 / auto-adopt 仅 bootstrap 触发 / jsdom 测试坑已沉淀 retro
- v0.6 — Open-source 镜像卫生 + Resolve 路径自愈 + 日志落盘（2026-04-22，[spec](docs/version/Iteration5_MirrorHygiene_SPEC.md)）— PR1–PR5 全部落地，R6/R7/P6/P7 已沉淀至 retro
- v0.5 — Subscription Bootstrap for Legacy Projects（2026-04-21，[spec](docs/version/Iteration4_SubscriptionBootstrap_SPEC.md)）— PR1–PR5 已落地，PR6 E2E 规划中
- v0.4 — Harness Tab + 系统级 Skill 首次落地（2026-04-20，[spec](docs/version/Iteration3_HarnessTab_SPEC.md)）

## 6. gstack

Use the `/browse` skill from gstack for **all web browsing**. Never use `mcp__claude-in-chrome__*` tools.

### Available Skills

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/retro`
- `/investigate`
- `/document-release`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`
