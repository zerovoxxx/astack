# v0.13 — Harness docs layout and CLAUDE template refinement

> **文档信息**
>
> | 字段 | 值 |
> |---|---|
> | 文档类型 | SPEC |
> | 文档状态 | 已完成 |
> | 创建日期 | 2026-06-19 |
> | 最后更新 | 2026-06-19 |
> | 作者 | AI |
> | 关联文档 | 无 |
> | 一句话目标 | 将 harness 生成的治理文档收敛到 `docs/astack/` 命名空间，并把 `CLAUDE.md` 作为治理主入口，`AGENTS.md` 作为兼容软链。 |

## 1. 背景

`astack-workflow:harness-init` 当前为目标项目生成：

- `CLAUDE.md` / `AGENTS.md`
- `docs/astack/INDEX.md`
- `docs/astack/version/Iteration<N>_<Slug>_SPEC.md`

这让 harness 自身的治理资料和普通项目文档混在旧 version 根目录下，也没有给复杂任务的 PLAN 留出稳定目录。本迭代将生成项目内的 harness 文档统一放到 `docs/astack/` 下：

- `docs/astack/INDEX.md`
- `docs/astack/version/`
- `docs/astack/plan/`

用户提供的参考 AGENTS 文档包含很多项目专属内容（交易系统技术栈、四层架构、数据库禁令）。本迭代保留 Karpathy 编程规范原文，并把其他项目专属规则留给 `扩展原则` 占位符。按最新反馈，生成入口改为 `CLAUDE.md` 主文件，并在创建后建立 `AGENTS.md -> CLAUDE.md` 软链。

## 2. 目标

1. `harness-init` fresh / migrate / patch 都以 `docs/astack/INDEX.md` 作为索引入口，并确保 `docs/astack/version/` 与 `docs/astack/plan/` 存在。
2. `spec` skill 默认读写 `docs/astack/INDEX.md` 和 `docs/astack/version/Iteration<N>_<PascalSlug>_SPEC.md`。
3. `plan` skill 默认输出到 `docs/astack/plan/Iteration<N>_<Slug>_PLAN.md`。
4. `dev` / `ship` / `spec-lint.sh` 的路径说明和校验逻辑与新目录一致。
5. Astack 服务器和 Web Harness 面板用 `docs/astack/INDEX.md` 判断 scaffold 是否完整。
6. `CLAUDE.md.tpl` 保留轻量导航定位，同时原文保留 Karpathy 编程规范，并提供 `扩展原则` 占位符承载项目专属技术栈或架构规则。
7. `harness-init` 在创建或迁移 `CLAUDE.md` 后，幂等创建 `AGENTS.md -> CLAUDE.md` 软链。
8. 若当前项目已有 `CLAUDE.md`，`harness-init` skill 必须要求 AI 参考当前项目已有文档做抽象总结，并按目标格式重构，而不是直接覆盖。
9. `spec` / `plan` skill 使用统一 `文档信息` 表；SPEC 状态使用固定枚举和标准流转。

## 3. 非目标

- 不恢复 `BOUNDARIES.md`、`docs/retro/*`、`*_REVIEW.md`、`*_CR.md` 等默认 sidecar。
- 不改变 `astack-workflow` 的四个核心 skill 名称。
- 不新增 marketplace runtime 格式或 plugin manifest 字段。

## 4. 变更范围

| 文件 | 操作 | 说明 |
|---|---|---|
| `astack-marketplace/plugins/astack-workflow/skills/harness-init/**` | MODIFY | 更新脚本、文档、模板路径和 `CLAUDE.md` 主入口迁移规则 |
| `astack-marketplace/plugins/astack-workflow/skills/{spec,plan,dev,ship}/SKILL.md` | MODIFY | 更新 workflow 规范路径 |
| `astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh` | MODIFY | 默认检查 `docs/astack/version` 并比对 `docs/astack/INDEX.md` |
| `packages/shared/src/domain.ts` | MODIFY | 更新 scaffold 必需文件常量 |
| `packages/server/src/system-skills/registry.ts` | MODIFY | 同步系统 skill 描述 |
| `packages/web/src/components/project/HarnessPanel.tsx` | MODIFY | 同步 UI 文案 |
| `packages/server/test/*harness*`、`packages/web/test/harness-panel.test.tsx` | MODIFY | 更新新 scaffold 路径断言 |
| `docs/astack/INDEX.md` | MODIFY | 新增 v0.13 索引 |
| `docs/astack/version/*.md` | MOVE | 从旧 version 目录迁移存量 SPEC |
| `docs/version/`、`docs/version/review/`、`docs/version/archive/` | DELETE | 删除旧目录和废弃 sidecar 文档 |
| `.agents` | NEW | 根目录新增指向 `.claude` 的兼容软链 |

## 5. 实现说明

- 采用 `docs/astack` 作为规范拼写；用户原文中的 `/astsck` 按项目名判断为笔误。
- `AGETN.md` 按现有文件和 harness 语义判断为 `AGENTS.md`。
- `docs/astack/INDEX.md` 是版本索引；SPEC 放在 `docs/astack/version/`；复杂任务 PLAN 放在 `docs/astack/plan/`。
- SPEC / PLAN 的 `文档信息` 表统一为：`文档类型`、`文档状态`、`创建日期`、`最后更新`、`作者`、`关联文档`、`一句话目标`。业务版本只在 INDEX 维护，物理序号只由文件名表达；`作者` 优先取当前仓库 `git config user.name`，为空时写 `AI`。
- SPEC 状态固定为 `设计中`、`待实施`、`开发中`、`验证中`、`验证通过`、`已完成`、`阻塞`；标准流转为 `设计中 -> 待实施 -> 开发中 -> 验证中 -> 验证通过 -> 已完成`，`阻塞` 可从任意状态进入。
- `HARNESS_SCAFFOLD_FILES` 要求 `CLAUDE.md`、`AGENTS.md` 与 `docs/astack/INDEX.md` 存在；`version/` 和 `plan/` 目录由脚本创建，但不作为 server scaffold 完整性的文件项。
- `CLAUDE.md` 是治理主文件，`AGENTS.md` 必须是指向 `CLAUDE.md` 的相对软链。
- 本仓库存量 SPEC 已迁移到 `docs/astack/version/`；旧 review/archive sidecar 已删除。
- 本项目根目录新增 `.agents -> .claude` 软链，复用同一套本地插件安装文件。

## 6. 验证计划

1. `pnpm --filter @astack/server exec vitest run test/system-skill-service.test.ts test/harness-routes.test.ts`
2. `pnpm --filter @astack/web exec vitest run test/harness-panel.test.tsx`
3. `bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh`
4. `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run`
5. `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md`
6. `git diff --check`

## 7. 验收标准

- fresh harness 输出包含 `CLAUDE.md`、`AGENTS.md -> CLAUDE.md`、`docs/astack/`、`version/`、`plan/` 和 `docs/astack/INDEX.md`。
- server scaffold missing 列表使用 `CLAUDE.md`、`AGENTS.md` 和 `docs/astack/INDEX.md`。
- Web Harness 面板显示的新 scaffold 路径为 `CLAUDE.md`、`AGENTS.md` 和 `docs/astack/INDEX.md`。
- workflow skill 文档不再把新 harness 输出写成旧 version 目录。
- `spec` / `plan` skill 文档中的 `文档信息` 示例字段一致，且不包含业务版本或物理序号字段；`作者` 字段说明优先取当前仓库 git 用户。
- `dev` / `ship` skill 文档按固定 SPEC 状态枚举推进流转，不再使用 `开发完成（验证通过）`、`IMPLEMENTED`、`SHIPPED` 等混合描述作为新 SPEC 状态。
- `CLAUDE.md` 模板原文包含 Karpathy 编程规范，并包含 `扩展原则` 占位符。
- migrate 模式的 skill 说明要求读取既有 `CLAUDE.md`、`AGENTS.md`、README 和历史 SPEC 后再语义重构。

## 8. 验证记录

| 日期 | 命令 | 结果 | 覆盖范围或失败原因 |
|---|---|---|---|
| 2026-06-19 | `./node_modules/.bin/tsc -b packages/shared` | PASS | 生成 `@astack/shared` dist，供 workspace 测试解析更新后的 scaffold 常量。 |
| 2026-06-19 | `./node_modules/.bin/vitest run packages/server/test/system-skill-service.test.ts packages/server/test/harness-routes.test.ts` | PASS | 2 files / 33 tests passed；覆盖 server scaffold missing / installed 状态。 |
| 2026-06-19 | `(cd packages/web && ../../node_modules/.bin/vitest --config vitest.config.ts run test/harness-panel.test.tsx)` | PASS | 1 file / 10 tests passed；覆盖 Harness 面板新路径文案与 missing 文件列表。 |
| 2026-06-19 | `bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh` | PASS | shell 语法检查通过。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run` | PASS | migrate dry-run 输出 `docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `tmpdir=$(mktemp -d); (cd "$tmpdir" && bash /home/alexk/data/codebase/github/astack/astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --name Demo --desc 'Demo project'); find "$tmpdir" -maxdepth 4 -type f -o -type l -o -type d \| sort; rm -rf "$tmpdir"` | PASS | fresh scaffold 创建 `CLAUDE.md`、`AGENTS.md -> CLAUDE.md`、`docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 0 errors / 0 warnings。 |
| 2026-06-19 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-19 | `diff -u <(awk Karpathy-block pasted-text-1.txt) <(awk Karpathy-block CLAUDE.md.tpl)` | PASS | Karpathy 编程规范块与用户 pasted reference 提取块一致，diff 无输出。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run` | PASS | 更新后 dry-run 仍输出 `docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `tmpdir=$(mktemp -d); (cd "$tmpdir" && bash /home/alexk/data/codebase/github/astack/astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --name Demo --desc 'Demo project'); rg -n "^### 1\\. 🚀 编码哲学|^## 3\\. 扩展原则|待补充：项目专属" "$tmpdir/CLAUDE.md"; test "$(readlink "$tmpdir/AGENTS.md")" = "CLAUDE.md"; rm -rf "$tmpdir"` | PASS | fresh scaffold 生成的 `CLAUDE.md` 包含 Karpathy 原文标题和 `扩展原则` 占位符，且 `AGENTS.md` 指向 `CLAUDE.md`。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 更新后仍为 0 errors / 0 warnings。 |
| 2026-06-19 | `git diff --check` | PASS | 更新后 whitespace 检查通过。 |
| 2026-06-19 | `./node_modules/.bin/tsc -b packages/shared` | PASS | 共享 domain contract 类型构建通过。 |
| 2026-06-19 | `./node_modules/.bin/vitest run packages/server/test/system-skills-paths.test.ts packages/server/test/system-skill-service.test.ts packages/server/test/harness-routes.test.ts` | PASS | 3 files / 39 tests passed；覆盖 system skill 路径、scaffold missing / installed 状态。 |
| 2026-06-19 | `(cd packages/web && ../../node_modules/.bin/vitest --config vitest.config.ts run test/harness-panel.test.tsx)` | PASS | 1 file / 10 tests passed；覆盖 Harness 面板 `CLAUDE.md` / `AGENTS.md` / `docs/astack/INDEX.md` 文案。 |
| 2026-06-19 | `bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh && bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md && git diff --check` | PASS | shell 语法、迁移后 SPEC lint、whitespace 检查通过。 |
| 2026-06-19 | `test -f CLAUDE.md && test ! -L CLAUDE.md && test -L AGENTS.md && test "$(readlink AGENTS.md)" = "CLAUDE.md" && test ! -e docs/version && test -f docs/astack/INDEX.md && test -f docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 本项目 `CLAUDE.md` 主文件 / `AGENTS.md` 软链成立，旧 `docs/version` 目录已删除，SPEC 已迁移到 `docs/astack/version/`。 |
| 2026-06-19 | `test -L .agents && test "$(readlink .agents)" = ".claude" && test -d .agents/skills/harness-init` | PASS | 根目录 `.agents` 指向 `.claude`，并能透过软链访问已安装的 `harness-init` skill。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 0 errors / 0 warnings；覆盖统一 `文档信息` 表和新 SPEC 状态解析。 |
| 2026-06-19 | `diff -qr .claude/skills astack-marketplace/plugins/astack-workflow/skills` | PASS | 本地安装副本与 marketplace 源目录保持一致。 |
| 2026-06-19 | `if rg -n '^> \| (业务版本|物理序号) \|' .claude/skills astack-marketplace/plugins/astack-workflow/skills docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md; then exit 1; fi` | PASS | SPEC / PLAN 文档信息示例和当前 SPEC 不再包含业务版本、物理序号字段。 |
| 2026-06-19 | `if rg -n '文档信息与状态|SPEC 状态只使用|标准流转为|文档类型.*文档状态' .claude/skills/harness-init/templates astack-marketplace/plugins/astack-workflow/skills/harness-init/templates; then exit 1; fi` | PASS | `CLAUDE.md.tpl` 未写入详细文档信息和状态流转规则，保持模板克制。 |
| 2026-06-19 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-19 | `bash -n astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh && bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 最终新鲜检查：lint 脚本语法通过；当前 SPEC 0 errors / 0 warnings，`验证通过` 状态可被识别。 |
| 2026-06-19 | `diff -qr .claude/skills astack-marketplace/plugins/astack-workflow/skills` | PASS | 本地安装副本与 marketplace 源目录保持一致。 |
| 2026-06-19 | `rg -n "git config user\.name|<git config user\.name>" .claude/skills/spec/SKILL.md .claude/skills/plan/SKILL.md astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md astack-marketplace/plugins/astack-workflow/skills/plan/SKILL.md` | PASS | SPEC / PLAN skill 均说明 `作者` 优先取当前仓库 `git config user.name`。 |
| 2026-06-19 | `if rg -n '^> \| 作者 \| AI \|' .claude/skills/spec/SKILL.md .claude/skills/plan/SKILL.md astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md astack-marketplace/plugins/astack-workflow/skills/plan/SKILL.md; then exit 1; fi` | PASS | SPEC / PLAN 示例不再把作者固定写成 `AI`。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 0 errors / 0 warnings；覆盖本次 SPEC 状态与文档信息字段。 |
| 2026-06-19 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-19 | `bash -n astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh && bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | ship 前新鲜验证：lint 脚本语法通过；当前 SPEC 0 errors / 0 warnings。 |
| 2026-06-19 | `diff -qr .claude/skills astack-marketplace/plugins/astack-workflow/skills` | PASS | ship 前新鲜验证：本地安装副本与 marketplace 源目录一致。 |
| 2026-06-19 | `rg -n "git config user\.name|<git config user\.name>" .claude/skills/spec/SKILL.md .claude/skills/plan/SKILL.md astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md astack-marketplace/plugins/astack-workflow/skills/plan/SKILL.md` | PASS | ship 前新鲜验证：SPEC / PLAN skill 均声明作者优先取当前仓库 git 用户。 |
| 2026-06-19 | `if rg -n '^> \| 作者 \| AI \|' .claude/skills/spec/SKILL.md .claude/skills/plan/SKILL.md astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md astack-marketplace/plugins/astack-workflow/skills/plan/SKILL.md; then exit 1; fi` | PASS | ship 前新鲜验证：SPEC / PLAN 示例未固定作者为 `AI`。 |
| 2026-06-19 | `if rg -n '文档信息与状态|SPEC 状态只使用|标准流转为|文档类型.*文档状态' .claude/skills/harness-init/templates astack-marketplace/plugins/astack-workflow/skills/harness-init/templates; then exit 1; fi` | PASS | ship 前新鲜验证：模板未承载详细文档信息和状态流转规则。 |
| 2026-06-19 | `git diff --check` | PASS | ship 前新鲜验证：whitespace 检查通过。 |

## 9. 变更记录

| 日期 | 作者 | 摘要 |
|---|---|---|
| 2026-06-19 | AI | 创建 v0.13 SPEC，定义 harness docs layout 与治理入口模板优化范围。 |
| 2026-06-19 | AI | 完成 `docs/astack` scaffold contract、workflow skill 文档、治理入口模板、server/web 状态检测与测试更新。 |
| 2026-06-19 | AI | 按反馈将 Karpathy 编程规范原文保留进 `CLAUDE.md` 模板，并新增 `扩展原则` 占位符。 |
| 2026-06-19 | AI | 按反馈将治理入口改为 `CLAUDE.md` 主文件，`AGENTS.md` 改为指向 `CLAUDE.md` 的软链，并补充既有 `CLAUDE.md` 的语义迁移要求。 |
| 2026-06-19 | AI | 按反馈迁移本仓库存量 SPEC 到 `docs/astack/version/`，删除旧 version/review/archive 文档，并瘦身根 `CLAUDE.md`。 |
| 2026-06-19 | AI | 根目录新增 `.agents -> .claude` 兼容软链。 |
| 2026-06-19 | AI | 统一 SPEC / PLAN 的 `文档信息` 表字段，并收敛 SPEC 状态枚举和流转规则；模板文件不承载详细规则。 |
| 2026-06-19 | AI | 调整 SPEC / PLAN `作者` 字段规则，优先取当前仓库 `git config user.name`，为空时才写 `AI`。 |
| 2026-06-19 | AI | 完成文档信息格式、SPEC 状态流转和作者字段规则的最终验证与交付状态更新。 |
