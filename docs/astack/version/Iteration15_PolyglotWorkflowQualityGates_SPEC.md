# v0.16 — Polyglot workflow quality gates

> **文档信息**
>
> | 字段 | 值 |
> |---|---|
> | 文档类型 | SPEC |
> | 文档状态 | 已完成 |
> | 创建日期 | 2026-08-19 |
> | 最后更新 | 2026-08-19 |
> | 作者 | zerovoxxx |
> | 关联文档 | [Iteration12_HarnessDocsLayout_SPEC.md](./archive/Iteration12_HarnessDocsLayout_SPEC.md) |
> | 一句话目标 | 将 `spec`、`plan`、`dev`、`ship` 改为语言无关流程，由各项目在 `CLAUDE.md` 声明真实质量门，并把新约定同步到 Java/Maven 的 AO 项目。 |

## 1. 背景

当前 `astack-workflow` 的四个核心开发 skills 在验证示例和 `ship` 质量检查中硬编码了 `uv`、`pytest` 与 `ruff`。这些命令适用于 Python 项目，却会让 Java/Maven、Node.js 或其他技术栈项目在复用同一工作流时执行无关命令，迫使项目再写反向覆盖规则。

用户已确认采用“语言无关核心流程 + 项目级质量门”的方案，并要求先改造 astack，再同步到 `finclaw-platform-ao`。AO 当前位于 `finclaw-platform-ao-Feature-V5.0D0033` 分支，已经开始删除迁移完成后不再需要的项目级 `harness-init` skill；本迭代必须保留这些既有删除，不重新安装该 skill。

## 2. 目标

1. `spec`、`plan`、`dev`、`ship` 不再硬编码 Python、Java 或其他单一语言的工具命令。
2. 统一验证命令解析顺序：当前 SPEC / PLAN、项目 `CLAUDE.md` 质量门、仓库原生脚本或 wrapper；仍无法确定时停止并说明缺口。
3. Harness 模板显式要求项目填写文档、静态检查、聚焦测试和完整验证命令。
4. `ship` 只运行非修改型最终检查；自动修复或格式化属于 `dev` 阶段，修改后必须重新验证。
5. astack 在根 `CLAUDE.md` 声明 pnpm/TypeScript 质量门，并保持 marketplace 源 skills 与 `.claude` 安装副本一致。
6. AO 同步语言无关的四个核心 skills，并在 `CLAUDE.md` 声明 Maven 质量门，同时不恢复项目级 `harness-init`。

## 3. 非目标

- 不修改 astack daemon、CLI、Web 或共享 domain contract 的运行时代码。
- 不新增 `.astack/project.yaml`、语言探测器或 toolchain adapter 抽象；后续出现重复的确定性操作时再单独设计。
- 不在核心 skills 中维护 `if Python` / `if Java` / `if Node.js` 分支矩阵。
- 不给 AO 新增 Maven Wrapper、lint 插件或业务代码，也不运行与本次文档/skill 改造无关的完整业务回归。
- 不恢复 AO 已删除的 `harness-init` 或用户手动处理的其他本地目录。
- 不在本次请求中提交或推送 astack、AO 的改动。

## 4. 变更范围

| 文件 | 操作 | 说明 |
|---|---|---|
| `astack-marketplace/plugins/astack-workflow/skills/{spec,plan,dev,ship}/SKILL.md` | MODIFY | 移除单语言命令，统一质量门解析规则 |
| `astack-marketplace/plugins/astack-workflow/skills/harness-init/templates/CLAUDE.md.tpl` | MODIFY | 增加项目质量门契约占位 |
| `.claude/skills/{harness-init,spec,plan,dev,ship}/` | MODIFY | 同步 marketplace 源内容 |
| `CLAUDE.md` | MODIFY | 声明 astack 的 pnpm/TypeScript 质量门并更新活跃迭代 |
| `package.json` | MODIFY | 删除当前没有任何 workspace package 实现的失效 `lint` script |
| `docs/astack/INDEX.md` | MODIFY | 新增 v0.16 索引与变更记录 |
| `docs/astack/version/Iteration15_PolyglotWorkflowQualityGates_SPEC.md` | NEW | 记录设计、边界与验证证据 |
| AO `.claude/skills/{spec,plan,dev,ship}/SKILL.md` | MODIFY | 同步语言无关核心 skills |
| AO `CLAUDE.md` | MODIFY | 将现有验证说明整理为 Maven 项目质量门 |
| AO `docs/astack/INDEX.md` | MODIFY | 追加 v16.30 同步记录 |

## 5. 实现说明

### 5.1 三层职责

1. **核心流程层**：`spec`、`plan`、`dev`、`ship` 只定义何时验证、如何留证和如何处理失败，不决定项目使用哪种语言或构建工具。
2. **项目契约层**：每个项目在 `CLAUDE.md` 的“项目质量门”中声明真实、可执行的文档检查、静态检查、聚焦测试与完整验证命令；不存在的门明确省略或标记不适用。
3. **仓库入口层**：优先复用仓库已有 wrapper、package script 或构建入口，避免 skill 绕过项目约定直接拼装工具命令。

本迭代不实现 adapter 层。只有未来多个项目反复需要相同的确定性参数拼装或结果解析时，才考虑把脚本放入 skill 的 `scripts/`。这符合 OpenAI Skills 文档关于“skill 聚焦单一工作、优先使用指令、仅在需要确定性行为或外部工具时使用脚本”的建议：[Build skills](https://learn.chatgpt.com/docs/build-skills)。

### 5.2 验证命令解析

四个核心 skills 使用同一优先级：

1. 当前任务匹配的已审批 SPEC / PLAN 中的具体命令。
2. 项目 `CLAUDE.md` 的“项目质量门”。
3. 仓库已有 wrapper、package scripts、构建清单或 CI 入口中能够无歧义确认的命令。
4. 如果仍无法确定，不猜测其他生态命令；停止并指出缺失的项目契约。

PLAN 保存前不得保留 `{module}`、`<test>` 一类不可直接执行的占位符。SPEC 可以按影响面描述命令模板，但进入 PLAN 或执行前必须解析为当前仓库的具体命令。

### 5.3 阶段边界

- `spec`：按变更类型要求机械验证，但使用项目自己的具体命令。
- `plan`：每个任务记录可执行命令和预期信号，例如退出码、测试数量或零命中。
- `dev`：可以在明确范围内运行格式化或自动修复；任何修改后重新执行覆盖该结果的检查。
- `ship`：最终验证必须是 check、dry-run、test、build 或 verify 等非修改型命令；若命令产生文件改动，检查 diff、确认属于本次范围并重新运行最终门。

### 5.4 项目落地

- astack：文档/skill 使用 `git diff --check` 与针对性 `rg`；代码质量门使用根 `package.json` 的 `pnpm typecheck`、`pnpm test`、`pnpm build`，聚焦验证优先使用受影响 package 的脚本。当前四个 workspace package 均未配置 lint，删除会稳定失败的根 `pnpm lint`，不以 `--if-present` 制造无实际检查的绿色结果。
- AO：文档/skill 使用 `git diff --check` 与针对性 `rg`；编译使用 `mvn clean compile -U`，聚焦测试使用 Maven module / test 选择参数，完整测试使用 `mvn test`，最终完整验证使用 `mvn clean verify -U`。`./build.sh` 会跳过测试，只作为快速打包入口，不单独充当 ship 完整质量门。

## 6. 外部参照与设计取舍

| 参照 | 借鉴点 | 本次取舍 |
|---|---|---|
| [OpenAI — Build skills](https://learn.chatgpt.com/docs/build-skills) | Skill 应聚焦可复用工作流，可包含指令和按需脚本，并明确输入输出 | 核心 skills 保留流程职责，不嵌入语言矩阵；本轮仅修改指令和模板，不新增脚本 |
| 现有 astack Harness 分层 | marketplace 是源，项目 `.claude/skills` 是安装副本，`CLAUDE.md` 是项目治理入口 | 质量门放进现有治理入口，不新增第二份项目配置 SoT |
| AO 现有 Maven 入口 | `build.sh`、`pom.xml` 和已有 Maven 命令反映真实 Java 工程约束 | 复用既有 Maven 生命周期，不为了统一外观引入新 wrapper 或 lint 插件 |

备选方案是让核心 skills 自动探测 `pyproject.toml`、`pom.xml`、`package.json` 并分支执行。该方案看似开箱即用，但会把多语言矩阵、monorepo 差异和项目例外集中进全局流程，长期维护成本更高，也可能绕过项目自己的 wrapper。本次不采用。

## 7. 验证计划

1. 对 marketplace 的 `harness-init`、`spec`、`plan`、`dev`、`ship` 逐个运行 `/Users/alexjhwen/.codex/skills/.system/skill-creator/scripts/quick_validate.py`。
2. `diff -qr astack-marketplace/plugins/astack-workflow/skills .claude/skills`
3. `! rg -n -i 'ruff|pytest|uv run|pyproject' astack-marketplace/plugins/astack-workflow/skills/{spec,plan,dev,ship}/SKILL.md .claude/skills/{spec,plan,dev,ship}/SKILL.md`
4. `rg -n '项目质量门|SPEC / PLAN|非修改|wrapper|pnpm (typecheck|test|build)' CLAUDE.md astack-marketplace/plugins/astack-workflow/skills/{harness-init,spec,plan,dev,ship} .claude/skills/{harness-init,spec,plan,dev,ship}`
5. `! jq -e '.scripts.lint' package.json`
6. `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration15_PolyglotWorkflowQualityGates_SPEC.md`
7. `git diff --check`
8. 在 AO 仓库逐个 `cmp` 四个核心 `SKILL.md` 与 astack marketplace 源文件，并验证 `.claude/skills/harness-init` 不存在。
9. 在 AO 仓库运行 `rg -n '项目质量门|mvn clean compile -U|mvn test|mvn clean verify -U|跳过测试' CLAUDE.md docs/astack/INDEX.md` 与 `git diff --check`。

## 8. 验收标准

- 四个核心 skills 不再出现 `ruff`、`pytest`、`uv run` 或 `pyproject` 等 Python 专属默认命令。
- 四个核心 skills 明确统一的验证命令解析优先级，无法解析时不猜测。
- `ship` 明确最终验证非修改，自动修复归属 `dev`。
- Harness `CLAUDE.md` 模板包含可由项目填写的质量门契约。
- astack 的 marketplace 源 skills 与 `.claude` 安装副本完全一致。
- astack `CLAUDE.md` 包含真实 pnpm 质量门。
- astack 不再暴露没有 workspace package 实现、执行必然失败的根 `pnpm lint` script。
- AO 四个核心 skills 与 astack marketplace 源文件一致，`CLAUDE.md` 包含真实 Maven 质量门。
- AO `.claude/skills/harness-init` 保持不存在，既有删除不被回滚。
- 两个仓库均通过 whitespace 和针对性内容检查。

## 9. 验证记录

| 日期 | 命令 | 结果 | 覆盖范围或失败原因 |
|---|---|---|---|
| 2026-08-19 | `pnpm lint` | FAIL（改造前基线） | 根脚本调用 `pnpm -r run lint`，但 4 个 workspace package 均没有 `lint` script；确认该入口失效后从 `package.json` 删除。 |
| 2026-08-19 | `python3 /Users/alexjhwen/.codex/skills/.system/skill-creator/scripts/quick_validate.py astack-marketplace/plugins/astack-workflow/skills/<skill>`（逐个检查 `harness-init`、`spec`、`plan`、`dev`、`ship`） | PASS | 5 个 marketplace skill 的 frontmatter 和基础结构均合法。 |
| 2026-08-19 | `diff -qr astack-marketplace/plugins/astack-workflow/skills .claude/skills` | PASS | marketplace 源 skills 与 astack 本地安装副本完全一致，无输出。 |
| 2026-08-19 | `! rg -n -i 'ruff|pytest|uv run|pyproject' astack-marketplace/plugins/astack-workflow/skills/{spec,plan,dev,ship}/SKILL.md .claude/skills/{spec,plan,dev,ship}/SKILL.md` | PASS | 四个核心流程无单语言专属默认命令。 |
| 2026-08-19 | `rg -n '项目质量门|SPEC / PLAN|非修改|wrapper|pnpm (typecheck|test|build)' CLAUDE.md astack-marketplace/plugins/astack-workflow/skills/{harness-init,spec,plan,dev,ship} .claude/skills/{harness-init,spec,plan,dev,ship}` | PASS | 项目质量门、命令解析顺序、非修改型 ship 门和 astack pnpm 命令均有明确命中。 |
| 2026-08-19 | `! jq -e '.scripts.lint' package.json` | PASS | 失效的根 `lint` script 已移除，JSON 可正常解析。 |
| 2026-08-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration15_PolyglotWorkflowQualityGates_SPEC.md` | PASS | v0.16 SPEC：0 errors / 0 warnings。 |
| 2026-08-19 | `git diff --check` | PASS | astack 已跟踪文件 whitespace 检查通过。 |
| 2026-08-19 | AO：逐个 `cmp` astack marketplace 与 `.claude/skills/{spec,plan,dev,ship}/SKILL.md`，并执行 `test ! -e .claude/skills/harness-init` | PASS | AO 四个核心 skills 与源逐字一致，项目级 `harness-init` 保持不存在。 |
| 2026-08-19 | AO：检查核心 skills 无单语言默认值，`rg` Maven 质量门，并运行 `git diff --check` | PASS | AO 命中 compile / focused test / full test / verify / skip-test build 规则，whitespace 检查通过。 |
| 2026-08-19 | ship：5 个 skill `quick_validate.py`、源副本 `diff -qr`、单语言命令反向 `rg`、`jq`、`spec-lint.sh`、`git diff --check` | PASS | astack 最终新鲜验证通过；SPEC lint 0 errors / 0 warnings。 |
| 2026-08-19 | ship（AO）：四个核心 skill `cmp`、`harness-init` 缺失检查、单语言命令反向 `rg`、Maven 质量门命中与 `git diff --check` | PASS | AO 最终新鲜验证通过，未运行与文档 / skill 改造无关的 Maven 业务回归。 |

## 10. 变更记录

| 日期 | 作者 | 摘要 |
|---|---|---|
| 2026-08-19 | zerovoxxx | 创建 v0.16 SPEC，确定语言无关核心流程、项目级质量门和 AO 同步边界。 |
| 2026-08-19 | zerovoxxx | 完成核心 skills、Harness 模板、astack pnpm 质量门与 AO Maven 质量门改造，并回写跨仓库验证证据；待 ship。 |
| 2026-08-19 | zerovoxxx | 完成 ship 新鲜验证，将 v0.16 SPEC 与 INDEX 收口为已完成。 |
