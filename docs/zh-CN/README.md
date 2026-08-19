# Astack 文档

Astack 用来跨项目管理 AI coding 的 skills、commands、agents 和 workflow plugins。

如果根 README 只需要快速了解项目，这里则作为中文文档入口，帮助个人用户和团队维护者理解核心概念与源码运行方式。

## 从这里开始

- [根 README](../../README.md)：英文项目概览、源码安装和第一条使用链路。
- [架构设计说明](../asset/design.md)：更完整的产品与系统设计背景。
- [Harness 迭代索引](../astack/INDEX.md)：当前 SPEC、实现历史和验证记录。
- [内置 marketplace 插件](../../astack-marketplace/README.md)：`astack-workflow` 与 `astack-common` 的安装说明。

## Astack 管什么

- **Skill repository**：用 Git 管理的 AI coding 资产集合。
- **Project**：通过 `astack init` 注册的本地项目。
- **Subscription**：项目订阅的某个 skill、command 或 agent。
- **Working copy**：实际落到项目 `.claude/` 目录下的文件。
- **Linked tool directory**：把 Cursor / CodeBuddy 等工具目录链接回 `.claude/`，避免多处复制。

## 源码安装摘要

```bash
git clone https://github.com/zerovoxxx/astack.git
cd astack
corepack enable
pnpm install
pnpm build
alias astack="node $(pwd)/packages/cli/dist/bin.js"
astack server start
```

Dashboard 默认地址：`http://127.0.0.1:7432`。

## 常用命令

```bash
astack repos register <git-url>
astack repos list
astack init
astack subscribe <name>
astack sync
astack status
astack diff <name>
astack push <name>
astack resolve <name> --use-remote
astack link add cursor
astack link list
```

## 给团队维护者

如果团队已经沉淀了一批好用的 AI coding workflow、项目规范、skills 或 commands，Astack 可以把它们放进统一的 Git 仓库中维护，再让不同项目按需订阅。这样可以减少手工复制，也能保留 review、diff、sync 和冲突处理链路。

## 给贡献者

运行时是 TypeScript monorepo：

- `packages/shared`
- `packages/server`
- `packages/cli`
- `packages/web`

修改运行时行为前，先查看 [`docs/astack/INDEX.md`](../astack/INDEX.md) 中的当前 SPEC 和历史迭代。
