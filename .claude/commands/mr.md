---
description: "🚀 智能创建MR - 自动分析变更并生成规范的分支和提交"
---

# 🚀 智能创建 Merge Request

分析代码变更，自动生成分支名和提交信息，创建MR。

## 📊 变更分析

### 同步远端信息
!`git fetch origin 2>&1 | tail -5`

### Git状态和分支信息
!`git status --porcelain && echo "--- Current Branch ---" && git branch --show-current && echo "--- Remote ---" && git remote -v | head -1 && echo "--- Behind/Ahead ---" && git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "no upstream"`

### 变更概览
!`git diff --cached --stat 2>/dev/null || git diff --stat`

### 提交历史参考
!`git log --oneline -3 --format="%s"`

### 变更详情
!`git diff --cached --name-status 2>/dev/null || git diff --name-status | head -20`

### 关键变更内容
!`git diff --cached -U2 2>/dev/null || git diff -U2 | head -100`

### 未跟踪文件
!`git ls-files --others --exclude-standard | grep -E '\.(java|kt|scala|groovy|py|go|rs|ts|tsx|js|jsx|vue|svelte|rb|php|cs|cpp|cc|h|hpp|c|swift|xml|sql|properties|yml|yaml|toml|json|md)$' | head -10`

### 构建工具探测
!`echo "--- Build manifests ---" && ls -1 2>/dev/null | grep -E '^(pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|pyproject\.toml|uv\.lock|Pipfile|poetry\.lock|requirements.*\.txt|package\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|go\.mod|Cargo\.toml|Makefile|CMakeLists\.txt|composer\.json|Gemfile|mix\.exs|\.csproj|\.sln|Dockerfile)$' || echo "(无识别的构建清单)"`

## 🎯 执行策略

### 分支命名规范
- `feat/描述` - 新功能
- `fix/描述` - 修复问题  
- `refactor/描述` - 重构
- `docs/描述` - 文档
- `chore/描述` - 构建/工具

### 提交信息规范
遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
```
type(scope): description

feat(agent-cli): 添加新命令
fix(agent-cli): 修复内存泄漏
docs(agent-cli): 更新安装说明
```

## 注意事项
1. **不要使用 gh CLI**
2. **首次代码推送后，命令日志里面会有一个创建 MR 的链接**
3. **不要更新CHANGELOG.md**
4. **禁止强制推送**：任何情况下都不得使用 `git push --force`、`git push -f` 或 `git push --force-with-lease`。若 push 被拒绝，必须通过 rebase 同步远端后重试，不得覆盖远端历史

## ⚠️ 冲突处理策略（多人同分支协作安全守卫）

本命令假设多人在同一分支开发，**必须严格遵守以下规则防止代码丢失**。新流程下有两类冲突场景，本章节统一覆盖：

| 冲突场景 | 触发时机 | 冲突源 |
|---|---|---|
| **rebase 冲突** | 阶段二步骤 7 `git pull --rebase` | 本分支已有未推送 commits vs 远端新提交 |
| **stash pop 冲突** | 阶段二步骤 8 `git stash pop` | 本次未提交改动 vs rebase 后的代码 |

两种场景的分析与解决流程一致，仅"中止"和"继续"的 Git 命令不同（见下文）。

### 核心原则：先拉后推，冲突分析，人工确认

1. **Push 前必须基于最新远端**：阶段二步骤 5 判定 `behind > 0` 时执行 stash + rebase + pop，确保 push 内容基于远端最新基线；`behind == 0` 走快速路径无 rebase 动作
2. **冲突时暂停分析**：无论是 rebase 冲突还是 stash pop 冲突，**不要立即 abort**，先读取冲突文件内容，分析冲突原因，给出解决建议
3. **⛔ 禁止 Agent 直接解决冲突**：Agent 不得自行编辑冲突标记、选择 ours/theirs、或以任何方式直接修改冲突代码。必须将分析结果和建议方案呈现给开发者，等待人工确认
4. **人工确认后执行**：开发者确认采纳某个方案后，Agent 按确认的方案执行冲突解决：
   - **rebase 冲突**：`git add <冲突文件> && git rebase --continue`
   - **stash pop 冲突**：`git add <冲突文件>`（stash pop 冲突无需 continue，加入暂存区即视为已解决；stash 自身在 pop 成功后自动从栈中弹出）
5. **开发者也可选择中止**：
   - **rebase 冲突中止**：`git rebase --abort && git stash pop`（恢复到 fetch 前状态）
   - **stash pop 冲突中止**：保留 stash（`git stash list` 仍可见），由开发者后续手动 `git stash apply` / `git stash drop`
6. **Push 失败重试**：若 push 被拒绝（远端又有新提交），按阶段五步骤 17 流程 `reset --soft + stash` 回退后重新进入阶段二，最多重试 **2 次**；仍失败则终止并提示开发者

### 冲突分析流程

无论 rebase 冲突还是 stash pop 冲突，按以下步骤处理：

1. **收集冲突信息**：执行 `git diff --name-only --diff-filter=U` 获取冲突文件列表
2. **逐文件分析**：对每个冲突文件，读取冲突内容（含 `<<<<<<<`、`=======`、`>>>>>>>` 标记），分析：
   - **本地变更（ours）**：
     - rebase 冲突场景：本分支已有未推送 commit 修改了什么、意图是什么
     - stash pop 冲突场景：本次未提交改动修改了什么、意图是什么
   - **远端变更（theirs）**：
     - rebase 冲突场景：其他开发者推到远端的修改是什么、意图是什么
     - stash pop 冲突场景：rebase 后基线（含其他开发者新提交）相比 stash 前的差异是什么
   - **冲突根因**：是同一行的逻辑冲突、新增位置重叠、还是文件结构变动等
3. **给出解决建议**：对每个冲突文件提供具体方案，例如：
   - "两边修改不冲突，建议保留双方变更（合并）"
   - "两边修改了同一段逻辑，建议采用本地版本因为 ..."
   - "远端新增了 XX 方法，本地重命名了同一文件，建议 ..."
4. **等待人工确认**：将分析结果呈现给开发者，**暂停并等待确认**后再执行

### 冲突分析的输出格式

```
⚠️ {Rebase / Stash Pop} 遇到冲突，需要人工确认解决方案。

冲突文件（共 N 个）：

---
📄 文件 1：path/to/file.java
冲突区域：第 XX-YY 行

本地变更（{你的未推送 commit / 你的工作区改动}）：
  <简要描述本地改了什么>

远端变更（{其他开发者新提交 / rebase 后基线}）：
  <简要描述远端改了什么>

冲突原因：<原因分析>

建议方案：<具体合并建议，含合并后的代码示例>

---
📄 文件 2：...
（同上格式）
---

请确认：
  1. 采纳以上全部建议 → 回复"确认"
  2. 对某个文件有不同意见 → 指出文件和你的处理方式
  3. 冲突过于复杂，中止本次 MR → 回复"中止"
```

## 📋 Spec 文档状态自动流转

阶段三步骤 10 触发本检查（rebase 完成、commit 尚未发生）：

1. **扫描变更文件列表**：本次 commit **尚未发生**，工作区持有"业务改动 + 可能的冲突解决结果"，从以下两处合并提取变更文件路径：
   - `git diff --name-only HEAD`（已跟踪文件的修改 / 删除）
   - `git ls-files --others --exclude-standard`（新增 untracked 文件）
2. **扫描 `docs/version/Iteration*_SPEC.md`**：查找状态中包含 `CR` 字样（如 `CR中`、`CR完成`）的 Spec 文件
3. **匹配判定**：对每个候选 Spec，检查其详细设计中引用的代码文件/模块是否与本次变更文件存在交集；也可通过迭代编号与分支名（`feat/iteration-{N}-*`）或本次 MR 提交信息草稿中的 `iteration-{N}` 进行关联匹配
4. **状态更新**（直接写入工作区文件，等待阶段四随业务代码一起 commit）：
   - Spec 文档中：将匹配到的 Spec 状态更新为 `已完成`（`CR中` / `CR完成` → `已完成`）
   - `docs/version/INDEX.md`：将对应行的状态列从 `🔄 开发中` 更新为 `✅ 已完成`
5. **报告**：在 MR 完成输出中列出已更新状态的 Spec 文件名

## 📦 Spec 容量归档（状态流转完成后检查）

状态流转完成后，检查 `docs/version/` 根目录下 **状态为 ✅ 已完成** 的 SPEC 数量。仅当已完成 SPEC 超过 **10 个**时触发归档：

1. **统计**：扫描 `docs/version/Iteration*_SPEC.md`，读取文档状态，筛选出状态为"已完成"的 SPEC
2. **判定**：若已完成 SPEC 数量 ≤ 10，跳过归档；若 > 10，按迭代编号从小到大排序，**一次性归档最老的 5 个**已完成 SPEC
3. **归档操作**：`mv` SPEC 到 `docs/version/archive/`，更新 `INDEX.md` 中该迭代行链接为 `[Spec](./archive/...SPEC.md)`

**重要约束**：
- **只归档状态为"已完成"的 SPEC**，非已完成状态（🔜 待开发、🔄 开发中、CR中、⏸️ 已挂起等）**永不归档**，无论数量多少
- `docs/version/archive/` 目录不存在时自动创建
- 已在 `archive/` 中的 SPEC 不重复处理（幂等）

## 🔄 INDEX.md 变更记录

阶段三步骤 12 触发本检查（rebase 完成、commit 尚未发生），在 `docs/version/INDEX.md` 的 `## 变更记录` 表格中追加一行（直接写入工作区文件，随阶段四的业务 commit 一起提交）：

```
| {YYYY-MM-DD} | v{next} | {作者/AI} | {提交类型}：{变更摘要}。 |
```

### 变更摘要写作规约（硬约束）

INDEX 的 `## 变更记录` 是**扫读型版本流水**，不是详细修订日志。每行变更摘要必须遵循以下规约：

> 📌 **适用范围**：本规约**仅约束 INDEX.md 表格行**。
>
> - **git commit body**：可适度总结提炼，无 80 字硬上限（但也别事无巨细的流水账）
> - **SPEC §10 / REVIEW.md**：由 `/spec` / `/spec_review` / `/dev` / `/code_review` 各自阶段自然沉淀
> - **`/mr` 阶段**：不再额外去 SPEC §10 / REVIEW.md 补总结性详情（费 token 且与 SPEC 重复）

#### 1. 字数硬上限：≤ 80 字（中英混合视觉宽度）

- 一行表格摘要必须能在常规渲染宽度（120 列）内一行显示完
- 超过 80 字（≈ 200 字节）即**强制拆分或外置详情**，不允许用 `①②③` / 多层 `（含 ...）` / 多重加粗嵌套规避字数
- 表格行内**禁止**使用列表、子项缩进、代码块

#### 2. 信息密度模板：一句话 + 量化指标 + 锚点

每条变更摘要 = **核心动作（一句话）** + **量化指标（1-2 个数字）** + **状态变化** + **详情锚点**

```
{type}({scope})：{核心动作浓缩}（{量化指标}），{状态变化}；详见 {锚点}。
```

> INDEX 行**不应**承载：逐项 P0/P1/P2 修订动作、Phase 子任务全量列、机械校验逐条命中、Deprecated 标记列表、文件 diff 清单、`mvn compile 通过` / `Spec 状态流转 / 归档 均未触发` 等模板话术。详情由 SPEC 文档自身 / git log 自然承载，INDEX 行只放锚点；`/mr` 阶段不要额外去 SPEC §10 / REVIEW.md 补总结性详情（费 token 且与 SPEC 重复）。

#### 3. 反例 vs 范例

❌ **反例**（流水账，5491 字符 / v0.0.99 老格式）：

```
feat(iteration-17)：ws-Gateway → OpenClaw 内核链路彻底重构全量交付（Spec v1.2 → v1.3 → ✅ 已完成）。
**主代码 5 Phase 全部落地**：① **SDK v1.6 增量补丁** —— `GatewaySession.java` 新增 `currentHelloOkPayloadJson()`
getter + `sendFireAndForget(method, paramsJson)` 公共方法 + `volatile String cachedHelloOkPayloadJson` 字段
（`handleConnectSuccess` 末尾缓存 + `connectOnce.finally` / `disconnect` 清理），与 Iter16 §10 v1.6 变更同步；
② **Phase 1 SDK 适配层 5 类落盘** ...（继续 5000+ 字）
```

✅ **范例**（≤ 80 字 + 锚点）：

```
feat(iter17)：OpenClaw 内核链路切 SDK 全量交付（5 Phase / 净减 ~770 行手写协议 / 11 Deprecated），
Spec v1.3 → ✅；同步 Iter16 SDK v1.6 增量补丁；详见 SPEC §9 + Iter16 §10。
```

#### 4. 自检 3 问（写完前必答）

写完一行变更摘要，先问自己：

1. **能否一眼看懂"这次改了啥 / 状态怎么变 / 详情去哪查"？** — 不能则压缩或加锚点
2. **去掉这一行 INDEX 摘要后，是否还能从 SPEC 自身 / git log 还原全貌？** — 能则该锚点策略 OK
3. **字数是否超过 80 字 / 200 字节？** — 超即压缩或重写

## 🧠 兜底知识沉淀

阶段三步骤 13 触发本检查（rebase 完成、commit 尚未发生），扫描以下文件是否有未沉淀的知识（直接写入工作区文件，随阶段四的业务 commit 一起提交）：

1. 检查本次变更对应的 `docs/version/review/Iteration{N}_REVIEW.md`（若存在）是否已提炼规则/反模式
2. 若 REVIEW.md 中有 P0/P1 问题且 `docs/retro/patterns.md` 中尚无对应反模式，自动补写
3. 若发现明显的正面设计模式且 `docs/retro/golden-rules.md` 中尚无对应规则，自动补写

> 兜底策略：不强制每次 MR 都写入，只处理"有评审报告但未沉淀"的漏洞。

## 🛠️ 构建验证策略（按技术栈自适应）

在阶段一步骤 1 调用本章。目标：**基于仓库实际构建清单自动选择命令**，不把任何单一技术栈（Maven / uv / npm 等）写死，也不无意义地跑一个不属于本项目的命令。

### 1. 技术栈探测（按构建清单存在性判定）

按以下映射表从上到下匹配。**一个仓库可能同时命中多项**（例如根目录 `pyproject.toml` + 子目录 `web/package.json`），此时**每项都要执行对应命令**；子目录项需在对应子目录下执行。

| 命中清单 | 技术栈 | 必选验证命令（按就近的包管理器优先） | 可选强化命令 |
|---|---|---|---|
| `pom.xml` | Maven / Java | `mvn -q -DskipTests clean compile -U` | `mvn -q test`（仅当变更涉及 Java 源码） |
| `build.gradle` / `build.gradle.kts` / `settings.gradle*` | Gradle / Java-Kotlin | `./gradlew --no-daemon -q assemble` 或 `gradle -q assemble` | `./gradlew -q test` |
| `pyproject.toml` + `uv.lock` | Python (uv) | `uv sync --frozen` 然后 `uv run ruff check .` + `uv run mypy <主包>`（若配置中有） | `uv run pytest -q` |
| `pyproject.toml` + `poetry.lock` | Python (poetry) | `poetry install --no-interaction` 然后 `poetry run ruff check .` | `poetry run pytest -q` |
| `Pipfile.lock` | Python (pipenv) | `pipenv sync --dev` + `pipenv run ruff check .` | `pipenv run pytest -q` |
| `requirements*.txt`（无 lock） | Python (pip) | `python -m pip install -r requirements.txt --quiet` + `python -m py_compile $(git diff --cached --name-only --diff-filter=d \| grep '\.py$')` | `pytest -q`（若有 tests/） |
| `pnpm-lock.yaml` | Node (pnpm) | `pnpm install --frozen-lockfile` + `pnpm run -s build`（无 build 则 `pnpm run -s lint`） | `pnpm test --silent` |
| `yarn.lock` | Node (yarn) | `yarn install --frozen-lockfile` + `yarn build`（无 build 则 `yarn lint`） | `yarn test --silent` |
| `bun.lockb` | Node (bun) | `bun install --frozen-lockfile` + `bun run build`（或 `bun run lint`） | `bun test` |
| `package-lock.json` 或仅 `package.json` | Node (npm) | `npm ci`（无 lock 时 `npm install --no-audit --no-fund`）+ `npm run -s build`（无 build 则 `npm run -s lint`） | `npm test --silent` |
| `go.mod` | Go | `go build ./...` | `go vet ./...`、`go test ./...` |
| `Cargo.toml` | Rust | `cargo check --all-targets --quiet` | `cargo clippy --quiet -- -D warnings`、`cargo test --quiet` |
| `composer.json` | PHP | `composer install --no-interaction --no-progress --quiet` + `composer run-script lint`（若定义） | `composer test` |
| `Gemfile.lock` | Ruby | `bundle install --quiet` + `bundle exec rubocop --force-exclusion`（若配置） | `bundle exec rspec` |
| `mix.exs` | Elixir | `mix deps.get --quiet && mix compile --warnings-as-errors` | `mix test` |
| `*.csproj` / `*.sln` | .NET | `dotnet build --nologo -v quiet` | `dotnet test --nologo --verbosity quiet` |
| `CMakeLists.txt` | C/C++ (CMake) | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug` + `cmake --build build -j` | `ctest --test-dir build --output-on-failure` |
| `Makefile`（包含 `build` / `all` / `check` 任一 target） | Make | `make -n check 2>/dev/null && make check` 否则 `make -n build 2>/dev/null && make build` 否则 `make` | `make test` |

> **脚本 / 文档 / 纯配置仓库**：若上表没有任何清单命中（例如只有 `.md` 和 `.sh` 变更），跳过构建验证，只做「变更分析」即可；在汇报中注明"未检测到可构建工程，跳过构建验证"。

### 2. 变更相关性裁剪（节省时间）

允许在已命中的栈内进一步按变更文件裁剪验证范围：

- **本次 commit 未改动该栈对应源码**（如只改了根目录 `docs/`，`api/*.py` 无变更）→ 仅执行「必选验证命令」的第一项（依赖/manifest 检查，如 `uv sync --frozen`、`mvn -q dependency:resolve`、`npm ci`），跳过构建/编译本身
- **变更仅涉及该栈的 docs/测试/配置**（而非主代码）→ 只执行「必选」，跳过「可选强化」
- **变更涉及主代码** → 必选 + 可选强化全跑

### 3. 技术栈子目录识别

若构建清单不在仓库根目录（例如 `web/package.json` + `api/pyproject.toml`），按以下规则：

1. 对每个命中的子目录，在其内部独立执行对应命令：`cd <dir> && <cmd>`
2. 仅当本次 commit **改动了该子目录下的文件**（含 manifest 自身），才触发该子目录的构建；否则跳过
3. 多子目录并行不强制，按声明顺序串行即可；任一失败即终止整个 MR 流程

### 4. 缺失工具链的降级

探测到构建清单但当前 shell 找不到对应工具（`command -v <tool>` 失败）时：

- **必选项缺失** → 输出明确提示（如 `mvn: command not found`）并 **⛔ 终止**，让开发者本地安装或换环境
- **可选强化项缺失** → 仅警告，不阻塞

### 5. 覆盖机制（可选）

仓库根目录若存在 `.harness/build.sh`（可执行）则**优先**执行它并以其退出码为准，上表全部忽略。这是用于特殊工程（monorepo / 混合栈 / 特殊依赖顺序）的逃生舱。

## 🚀 自动化流程（Stash-Rebase-Generate-Commit-Push 模式）

**直接在当前分支操作**（除非用户明确要求新建分支，否则禁止新建分支，即使在主干分支也直接提交）

### 设计原则（先理解再执行）

1. **业务 commit 推到最后一步**：先 stash 工作区 → 同步远端 → 取回改动 → 生成索引 → **一次性 commit**（业务代码 + INDEX/Spec 索引变更同一 commit），全程零 `--amend`，commit 内容不动态膨胀
2. **远端无更新走快速路径**：阶段二判定 `behind == 0` 时跳过 stash/rebase/pop（这三步本就是 no-op），直接进入索引生成 + commit + push，省时间也少风险点
3. **失败回滚成本对称**：rebase 失败 / stash pop 失败 / push 失败 → 都能通过 `stash` + `reset --soft` 回到最初的"工作区有改动、未 commit"状态重试

### 阶段零：预检查
0. **环境与状态检查**（以下任一条件不满足则 **⛔ 终止**）：
   - 工作区或暂存区存在变更（`git status --porcelain` 非空），否则输出"无变更，跳过 MR"并终止
   - 不处于 rebase / merge / cherry-pick 中途状态（检查 `.git/rebase-merge`、`.git/MERGE_HEAD` 不存在），否则提示开发者先完成或中止未完成的操作
   - 当前分支有对应的远端追踪分支（`git rev-parse --abbrev-ref @{upstream}` 成功），否则提示先执行 `git push -u origin <branch>`
   - 检查本地未推送 commits 数（`git rev-list --count @{upstream}..HEAD`）：若 > 0，告知开发者"本分支已有 N 个未推送 commit，本次将与之一起推送"（不阻塞，仅提示——这些既有 commits 会在阶段二被 rebase 重放到远端最新之上）

### 阶段一：准备与验证
1. **执行构建验证**：按下方「🛠️ 构建验证策略」探测项目技术栈并运行对应的构建/校验命令；任一必选命令非零退出 → **⛔ 终止 MR 流程**，输出错误信息让开发者修复
2. **分析变更类型和范围**
3. **检查并更新 docs 目录的相关文档**（按本仓库实际存在的文档决定，缺失的路径跳过即可）：
   - 若本次变更涉及数据库表/DDL 新建/变更 → 检查仓库内 DDL 脚本（如 `scripts/*.sql`、`api/config/mysql_init.sql`、`docs/db/` 等）及对应设计文档是否已同步更新
   - 若本次变更涉及新增/修改接口 → 检查对应 Spec 文档中的接口设计是否与实现一致
   - 若本次变更涉及分包/目录结构调整 → 检查总体架构设计文档（如 `AGENTS.md`、`docs/asset/` 下的总体设计）是否需要同步更新

### 阶段二：远端同步判定（快速路径 / 完整 Rebase 路径分流）

> 设计要点：先 fetch 再判 `behind`，**只有 behind > 0 才付出 stash/rebase/pop 的代价**；远端无更新时跳过这三步直接进入阶段三。

4. **刷新远端引用**：`git fetch origin <当前分支>`（确保 behind 判定基于最新远端，不依赖阶段零开头的 fetch 时效）
5. **判定 behind 数**：`git rev-list --count HEAD..@{upstream}`

   - **behind == 0（远端无新提交）→ 走快速路径**
     - 跳过 stash / rebase / pop，工作区改动直接作为最新基线
     - 直接跳到阶段三

   - **behind > 0（远端有新提交）→ 走完整 Rebase 路径**
     - 继续执行步骤 6-9

6. **保护工作区**：`git stash push -u -m "mr-rebase-$(date +%s)"`（`-u` 含 untracked 文件）
7. **同步远端**：`git pull --rebase origin <当前分支>`
   - **若 rebase 冲突**（冲突源：本分支已有未推送 commits vs 远端）：按「⚠️ 冲突处理策略」章节流程分析 + 暂停等待开发者人工确认
   - **开发者中止时**：执行 `git rebase --abort && git stash pop`（恢复到 fetch 前状态）并终止 MR 流程
8. **取回工作区改动**：`git stash pop`
   - **若 pop 冲突**（冲突源：本次未提交改动 vs rebase 后的代码）：同样按「⚠️ 冲突处理策略」章节流程分析 + 暂停等待开发者人工确认
   - **开发者中止时**：保留 stash（`git stash list` 仍可见，可手动 `git stash apply` 恢复）并终止 MR 流程
9. **完成同步**，工作区现在持有"本次改动 + 远端最新基线"，继续阶段三

### 阶段三：基于最新基线生成索引内容

> 此时工作区改动 = 业务代码 + （可能的）冲突解决结果，HEAD 指向最新基线，**尚未 commit**。索引内容直接写入工作区文件，与业务改动合并到同一次 commit。

10. **Spec 文档状态流转**：按「📋 Spec 文档状态自动流转」章节将匹配的 `CR中` / `CR完成` Spec 更新为 `已完成`，并同步更新 `INDEX.md`（**幂等**——状态已是"已完成"则跳过）
11. **Spec 容量归档**：统计根目录已完成 SPEC 数量，超过 10 个时归档最老的 5 个已完成 SPEC（**幂等**——已在 `archive/` 中的 SPEC 不重复处理）
12. **INDEX.md 变更记录**：在 `## 变更记录` 表格中追加一行（版本号、日期基于当前最新基线确定）
13. **兜底知识沉淀**：扫描未沉淀的评审发现并补写

> ⚠️ **重试场景去重提示**：若本次为 push 失败后的重试（阶段五步骤 17 进入），stash pop 后工作区可能带有上一轮的索引草稿。阶段三执行前需要识别并处理：
>
> - **INDEX.md 变更记录**：非幂等。先与 `origin/<当前分支>` 的 `INDEX.md` 比对（`git diff origin/<当前分支> -- docs/version/INDEX.md`），找出工作区中"远端没有的变更记录行"=上一轮草稿，**删除后**再基于新基线追加新行，避免重复追加
> - **Spec 状态流转 / Spec 容量归档**：幂等，正常执行即可（已"已完成"或已归档的不会被重复处理）
> - **兜底知识沉淀**：在 `docs/retro/patterns.md` / `golden-rules.md` 追加内容前，先扫描目标文件中是否已有同名条目，已存在则跳过

### 阶段四：一次性提交（业务代码 + 索引变更）
14. **生成规范提交信息**（整合业务代码 + 索引/文档变更，单一语义）
15. **`git add . && git commit`**（**全程只 commit 一次，零 amend**）

### 阶段五：推送（含重试）
16. **执行 `git push origin <当前分支>`**
17. **若 push 被拒绝**（远端在阶段二判定后、push 前又有新提交）：
    - `git reset --soft HEAD~1`（回退 commit 到 staged 状态，业务改动 + 索引变更均保留在暂存区）
    - `git stash push -u`（暂存所有改动包括 staged + untracked，状态等同于 MR 开始时）
    - 回到**阶段二步骤 4** 重新判定 behind 数并重试（快速路径或完整 Rebase 路径自适应；重试时阶段三的索引生成会基于新基线重新执行，无需特殊处理）
    - **最多重试 2 次**（总共最多 3 次 push 尝试）
18. **若重试仍失败**，终止命令，输出提示：
    ```
    ⛔ 推送失败（已重试 2 次），远端持续有新提交。

    当前工作区改动已通过 stash 保存（git stash list 可查）。
    请稍后手动操作：
      1. git stash pop
      2. git pull --rebase origin <branch>
      3. 若有冲突，解决后 git add <文件> && git rebase --continue
      4. git push origin <branch>
    ```

---
**开始智能MR创建...** 