# v0.15 — Open-source README and multilingual docs entry

> **文档信息**
>
> | 字段 | 值 |
> |---|---|
> | 文档类型 | SPEC |
> | 文档状态 | 已完成 |
> | 创建日期 | 2026-06-20 |
> | 最后更新 | 2026-06-20 |
> | 作者 | zerovoxxx |
> | 关联文档 | 无 |
> | 一句话目标 | 将根 README 重写为面向开源用户的英文入口，并在 `docs/` 下建立多语言文档入口。 |

## 1. 背景

当前根 README 更像内部架构摘要，能说明 packages 和 daemon 架构，但对第一次访问仓库的开源用户不够直接。用户计划将项目开源，希望陌生用户一眼看懂 Astack 解决什么问题，并尽可能被项目价值吸引。

本次确认的定位是：

- 个人 AI coding 重度用户：多项目、多 AI 工具、多套 skills / commands，痛点是重复维护和同步混乱。
- 团队 / 组织维护者：希望统一分发和治理团队的 AI coding workflows、skills、commands 和项目规范。

## 2. 外部参照与设计取舍

- 外部参照：GitHub README 文档建议 README 说明项目做什么、为什么有用、如何开始、哪里获取帮助，以及谁维护项目；Open Source Guides 建议开源项目明确 README、license、贡献入口和项目目标。
- 可借鉴点：根 README 第一屏应优先回答 `what / why / quick start`，并使用相对链接连接到更长文档。
- 不采用点：本仓库尚未发布 npm 包，根 README 不承诺 `npm install -g astack`；贡献指南、行为准则和 LICENSE 文件本次不新增，避免把 README 改写扩大为完整开源治理改造。
- 本次取舍：根 README 使用英文 problem-first 叙事，保持短而可扫；`docs/` 下建立英文和中文入口，承载更详细的说明。

参考：

- GitHub Docs — About the repository README file: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
- Open Source Guides — Starting an Open Source Project: https://opensource.guide/starting-a-project/

## 3. 目标

1. 根 README 使用英文，第一屏说明 Astack 是什么、为什么有用、适合谁。
2. Quick Start 只承诺源码安装和本地运行，不写尚未发布的 npm 全局安装。
3. README 覆盖核心能力：Git-backed skill repositories、project subscriptions、CLI / daemon / Web Dashboard、sync / status / conflict handling、多工具目录链接。
4. `docs/` 下新增多语言入口，至少包含 English 和 简体中文。
5. README 和 docs 链接使用相对路径，便于 GitHub 和本地 clone 阅读。

## 4. 非目标

- 不发布 npm 包。
- 不新增 LICENSE、CONTRIBUTING 或 CODE_OF_CONDUCT 文件。
- 不修改 CLI、server、web 或 marketplace 运行时代码。
- 不调整 package 的 `private` 字段。
- 不改动历史 `docs/asset/design.md`。

## 5. 变更范围

| 文件 | 操作 | 说明 |
|---|---|---|
| `README.md` | REWRITE | 英文开源入口，采用 problem-first 结构 |
| `docs/README.md` | NEW | 文档语言入口 |
| `docs/en/README.md` | NEW | 英文文档入口 |
| `docs/zh-CN/README.md` | NEW | 中文文档入口 |
| `docs/astack/INDEX.md` | MODIFY | 新增 v0.15 索引与变更记录 |
| `docs/astack/version/Iteration14_OpenSourceReadme_SPEC.md` | NEW | 记录本次 README 改写范围和验证 |

## 6. 实现说明

- 根 README 采用 `Manage AI coding skills across every project` 作为主标题下的一句话定位。
- 第一屏突出痛点：skills、commands 和 workflow 资产不应被困在单个仓库或手工复制流程中。
- Quick Start 使用源码方式：
  - `git clone`
  - `pnpm install`
  - `pnpm build`
  - `alias astack="node $(pwd)/packages/cli/dist/bin.js"`
  - `astack server start`
- README 示例工作流展示 `repos register`、`init`、`subscribe`、`sync`、`status`、`push`，但不假设具体公开 skill repo。
- `docs/README.md` 作为语言选择页，链接到 `docs/en/README.md` 和 `docs/zh-CN/README.md`。
- 英文 docs 解释适用人群、核心概念和源码运行；中文 docs 保持同等信息密度，但不逐字翻译根 README。

## 7. 验证计划

1. `git diff --check`
2. `if rg -n "npm install -g astack|pnpm add|yarn global add" README.md docs/README.md docs/en docs/zh-CN; then exit 1; fi`
3. `test -f docs/README.md && test -f docs/en/README.md && test -f docs/zh-CN/README.md`
4. `rg -n "Manage AI coding skills across every project|Source Install|多语言|简体中文|English" README.md docs/README.md docs/en/README.md docs/zh-CN/README.md`
5. `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration14_OpenSourceReadme_SPEC.md`

## 8. 验收标准

- 根 README 以英文为主，并在开头说明 Astack 面向个人 AI coding 重度用户和团队维护者的价值。
- 根 README 的 Quick Start 使用源码安装，不出现 npm 全局安装承诺。
- 根 README 包含核心概念、示例工作流、架构、开发命令和文档入口。
- `docs/` 下存在英文和中文入口。
- v0.15 在 `docs/astack/INDEX.md` 中有状态条目。

## 9. 验证记录

| 日期 | 命令 | 结果 | 覆盖范围或失败原因 |
|---|---|---|---|
| 2026-06-20 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-20 | `if rg -n "npm install -g astack|pnpm add|yarn global add" README.md docs; then exit 1; fi` | FAIL | 检查范围过宽，命中历史 `docs/asset/design.md` 和本 SPEC 中对 npm 全局安装的说明；已将验证计划收窄到根 README 和新建多语言入口。 |
| 2026-06-20 | `test -f docs/README.md && test -f docs/en/README.md && test -f docs/zh-CN/README.md` | PASS | 多语言 docs 入口文件存在。 |
| 2026-06-20 | `rg -n "Manage AI coding skills across every project|Source install|多语言|简体中文|English" README.md docs/README.md docs/en/README.md docs/zh-CN/README.md` | PASS | 关键入口文本存在；后续将 `Source install` 大小写修正为 `Source Install`。 |
| 2026-06-20 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration14_OpenSourceReadme_SPEC.md` | PASS | v0.15 SPEC 0 errors / 0 warnings。 |
| 2026-06-20 | `git diff --check` | PASS | 修正验证计划后 whitespace 检查通过。 |
| 2026-06-20 | `if rg -n "npm install -g astack|pnpm add|yarn global add" README.md docs/README.md docs/en docs/zh-CN; then exit 1; fi` | PASS | 根 README 和新建多语言入口未承诺 npm 全局安装。 |
| 2026-06-20 | `test -f docs/README.md && test -f docs/en/README.md && test -f docs/zh-CN/README.md` | PASS | 多语言 docs 入口文件存在。 |
| 2026-06-20 | `rg -n "Manage AI coding skills across every project|Source Install|多语言|简体中文|English" README.md docs/README.md docs/en/README.md docs/zh-CN/README.md` | PASS | 英文定位、源码安装和多语言入口关键文本存在。 |
| 2026-06-20 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration14_OpenSourceReadme_SPEC.md` | PASS | 修正验证计划后 v0.15 SPEC 0 errors / 0 warnings。 |
| 2026-06-20 | `git diff --check` | PASS | ship 前新鲜验证：whitespace 检查通过。 |
| 2026-06-20 | `if rg -n "npm install -g astack|pnpm add|yarn global add" README.md docs/README.md docs/en docs/zh-CN; then exit 1; fi` | PASS | ship 前新鲜验证：根 README 和新建多语言入口未承诺 npm 全局安装。 |
| 2026-06-20 | `test -f docs/README.md && test -f docs/en/README.md && test -f docs/zh-CN/README.md` | PASS | ship 前新鲜验证：多语言 docs 入口文件存在。 |
| 2026-06-20 | `rg -n "Manage AI coding skills across every project|Source Install|多语言|简体中文|English" README.md docs/README.md docs/en/README.md docs/zh-CN/README.md` | PASS | ship 前新鲜验证：英文定位、源码安装和多语言入口关键文本存在。 |
| 2026-06-20 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration14_OpenSourceReadme_SPEC.md` | PASS | ship 前新鲜验证：v0.15 SPEC 0 errors / 0 warnings。 |

## 10. 变更记录

| 日期 | 作者 | 摘要 |
|---|---|---|
| 2026-06-20 | zerovoxxx | 创建 v0.15 SPEC，定义开源 README 改写和多语言 docs 入口范围。 |
| 2026-06-20 | zerovoxxx | 重写根 README 为英文开源入口，并新增 `docs/README.md`、`docs/en/README.md`、`docs/zh-CN/README.md`。 |
| 2026-06-20 | zerovoxxx | 完成 ship 前验证，将 v0.15 SPEC 标记为已完成。 |
