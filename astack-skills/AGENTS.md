## 1. 项目治理说明

本文件用于维护项目级治理信息，包括仓库定位、目录约定、资产治理原则与变更记录。若项目文档与实现存在冲突，以本文件与 `CHANGELOG.md` 为准。

## 2. 仓库定位

`super-claude-code` 是一个**纯元数据资产仓库**，作为 AI 编程资产的单一可信来源（Single Source of Truth），专门托管可跨 IDE / 工具复用的 Agents、Commands、Hooks、MCP Configs、Plugins、Rules 与 Skills。

**明确边界：**

1. 本仓库**不**包含任何业务逻辑代码、CLI 工具、适配器实现或运行时服务。
2. 本仓库**不**负责资产的安装、分发、版本适配与同步流水线——这些能力由下游消费者（如具体 IDE 插件、脚本、CI 流程）自行实现。
3. 本仓库**只**负责资产元数据与源文件本身的编写、评审与版本记录。

## 3. 目录结构

```
.
├── AGENTS.md          # 本文件：仓库治理说明
├── CHANGELOG.md       # 变更记录
├── README.md          # 仓库入口与使用说明
├── CLAUDE.md          # Claude 协作约定（可选）
├── agents/            # Agent 资产
├── commands/          # 命令（Slash Commands）资产
├── hooks/             # Hook 资产
├── mcp-configs/       # MCP Server 配置资产
├── plugins/           # Plugin 资产
├── rules/             # Rule 资产
├── skills/            # Skill 资产
└── scripts/           # 供 Commands / Skills / CI 调用的底层工具脚本（非 AI 资产）
```

每类资产目录内按需组织子目录，每个资产应自带清晰的元数据（frontmatter / manifest / README 等）以便下游消费。

`scripts/` 目录定位说明：该目录下放**确定性、机械化的 shell 工具**（如 lint、校验、批量处理），供 Commands 通过 `!` 调用、供 Skills 打包引用、供 CI 流水线执行。此类脚本不走 AI 触发路径，不具备 frontmatter 元数据。脚本应自带 `--help` 与 `--dry-run`，退出码规范：`0 = 成功，1 = 有阻塞性错误`。

## 4. 权威文档与优先级

1. `AGENTS.md`（本文件）
2. `CHANGELOG.md`
3. 各资产目录下的 README 或 manifest

## 5. 全局设计原则

1. **单一可信来源**：仓库是所有 AI 编程资产的权威版本，禁止在多处维护无法追溯的分叉副本。
2. **IDE 无关**：资产采用通用标准编写，不耦合任何特定 IDE 的私有格式；格式转换由下游适配器层负责。
3. **可追溯**：任何资产的新增、修改、删除都应通过 Git 提交历史与 `CHANGELOG.md` 可追溯。
4. **精简聚焦**：仓库只做元数据，不承担分发、安装、升级、回滚等运行时能力。

## 6. 资产治理要求

1. 每个资产应具备唯一标识（目录名或 manifest 中的 id）与清晰的用途说明。
2. 资产需注明来源（原创 / 引用 / 改编）；改编自外部资产时应保留原始出处信息。
3. 资产质量以"可跨项目复用"为最低标准，强项目耦合的内容不应入库。
4. 下游消费者如需为特定 IDE 做格式转换，应在各自工程内维护适配层，不污染本仓库。

## 7. 协作流程

1. 新增或修改资产通过 Pull Request 完成评审。
2. 每次合并需更新 `CHANGELOG.md` 的 `[Unreleased]` 段落，说明新增 / 变更 / 删除内容。
3. 发布新版本时，将 `[Unreleased]` 条目归档为对应版本号段落。
4. 删除或废弃资产时，必须在 `CHANGELOG.md` 中显式记录原因，便于下游消费者感知。

## 8. 分支约定

1. 默认分支：`main`。
2. 功能分支命名建议：`feat/{slug}`、`fix/{slug}`、`refactor/{slug}`、`docs/{slug}`。
3. 小修改（如单一资产微调）可直接提交到 `main`，但应在 `CHANGELOG.md` 中留痕。

## 9. 变更记录

详见 [`CHANGELOG.md`](./CHANGELOG.md)。

关键里程碑：

| 日期 | 版本 | 变更人 | 变更说明 |
|---|---|---|---|
| 2026-04-19 | Unreleased | alexjhwen | `init-harness.sh` 重构为 `skills/harness-init/` Skill（含 SKILL.md + 外置模板 + 瘦身脚本），`commands/init_harness.md` 瘦身为薄包装。 |
| 2026-04-19 | Unreleased | alexjhwen | **重大重构**：仓库收敛为纯元数据资产库，移除 `claude-hub/`、`_reference/` 与所有业务逻辑代码。 |
| 2026-03-31 | v1.2 | alexjhwen | refactor(commands)：`_backend` 命令模板适配 Java/DDD 后端项目。 |
| 2026-03-20 | v1.1 | alexjhwen | 资产类型扩展到七种 + 五种 IDE 适配支持。 |
| 2026-03-20 | v1.0 | zerovoxxx | 新增迭代 1：Skill 与 Command 统一管理。 |
