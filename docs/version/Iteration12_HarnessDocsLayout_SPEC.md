# v0.13 — Harness docs layout and AGENTS template refinement

> **文档状态: 开发完成（验证通过）**
>
> 创建日期：2026-06-19
>
> 目标：将 harness 生成的治理文档收敛到 `docs/astack/` 命名空间，并把 AGENTS 模板改成更明确的轻量研发准则。

## 1. 背景

`astack-workflow:harness-init` 当前为目标项目生成：

- `AGENTS.md`
- `docs/version/INDEX.md`
- `docs/version/Iteration<N>_<Slug>_SPEC.md`

这让 harness 自身的治理资料和普通项目文档混在 `docs/version/` 根下，也没有给复杂任务的 PLAN 留出稳定目录。本迭代将生成项目内的 harness 文档统一放到 `docs/astack/` 下：

- `docs/astack/INDEX.md`
- `docs/astack/version/`
- `docs/astack/plan/`

用户提供的参考 AGENTS 文档包含很多项目专属内容（交易系统技术栈、四层架构、数据库禁令）。本迭代保留 Karpathy 编程规范原文，并把其他项目专属规则留给 `扩展原则` 占位符。

## 2. 目标

1. `harness-init` fresh / migrate / patch 都以 `docs/astack/INDEX.md` 作为索引入口，并确保 `docs/astack/version/` 与 `docs/astack/plan/` 存在。
2. `spec` skill 默认读写 `docs/astack/INDEX.md` 和 `docs/astack/version/Iteration<N>_<PascalSlug>_SPEC.md`。
3. `plan` skill 默认输出到 `docs/astack/plan/Iteration<N>_<Slug>_PLAN.md`。
4. `dev` / `ship` / `spec-lint.sh` 的路径说明和校验逻辑与新目录一致。
5. Astack 服务器和 Web Harness 面板用 `docs/astack/INDEX.md` 判断 scaffold 是否完整。
6. `AGENTS.md.tpl` 保留轻量导航定位，同时原文保留 Karpathy 编程规范，并提供 `扩展原则` 占位符承载项目专属技术栈或架构规则。

## 3. 非目标

- 不迁移本仓库历史 `docs/version/Iteration*_SPEC.md`；它们仍是 astack 项目自身的历史权威记录。
- 不恢复 `BOUNDARIES.md`、`docs/retro/*`、`*_REVIEW.md`、`*_CR.md` 等默认 sidecar。
- 不改变 `astack-workflow` 的四个核心 skill 名称。
- 不新增 marketplace runtime 格式或 plugin manifest 字段。

## 4. 变更范围

| 文件 | 操作 | 说明 |
|---|---|---|
| `astack-marketplace/plugins/astack-workflow/skills/harness-init/**` | MODIFY | 更新脚本、文档和模板路径 |
| `astack-marketplace/plugins/astack-workflow/skills/{spec,plan,dev,ship}/SKILL.md` | MODIFY | 更新 workflow 规范路径 |
| `astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh` | MODIFY | 默认检查 `docs/astack/version` 并比对 `docs/astack/INDEX.md` |
| `packages/shared/src/domain.ts` | MODIFY | 更新 scaffold 必需文件常量 |
| `packages/server/src/system-skills/registry.ts` | MODIFY | 同步系统 skill 描述 |
| `packages/web/src/components/project/HarnessPanel.tsx` | MODIFY | 同步 UI 文案 |
| `packages/server/test/*harness*`、`packages/web/test/harness-panel.test.tsx` | MODIFY | 更新新 scaffold 路径断言 |
| `docs/version/INDEX.md` | MODIFY | 新增 v0.13 索引 |

## 5. 实现说明

- 采用 `docs/astack` 作为规范拼写；用户原文中的 `/astsck` 按项目名判断为笔误。
- `AGETN.md` 按现有文件和 harness 语义判断为 `AGENTS.md`。
- `docs/astack/INDEX.md` 是版本索引；SPEC 放在 `docs/astack/version/`；复杂任务 PLAN 放在 `docs/astack/plan/`。
- `HARNESS_SCAFFOLD_FILES` 只要求 `AGENTS.md` 与 `docs/astack/INDEX.md` 存在；`version/` 和 `plan/` 目录由脚本创建，但不作为 server scaffold 完整性的文件项。
- 旧项目若已有 `docs/version/INDEX.md`，新脚本不把它当作完成态；migrate / patch 需要补齐 `docs/astack/INDEX.md`。

## 6. 验证计划

1. `pnpm --filter @astack/server exec vitest run test/system-skill-service.test.ts test/harness-routes.test.ts`
2. `pnpm --filter @astack/web exec vitest run test/harness-panel.test.tsx`
3. `bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh`
4. `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run`
5. `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/version/Iteration12_HarnessDocsLayout_SPEC.md`
6. `git diff --check`

## 7. 验收标准

- fresh harness dry-run 输出包含 `docs/astack/`、`version/`、`plan/` 和 `docs/astack/INDEX.md`。
- server scaffold missing 列表使用 `docs/astack/INDEX.md`。
- Web Harness 面板显示的新 scaffold 路径为 `docs/astack/INDEX.md`。
- workflow skill 文档不再把新 harness 输出写成 `docs/version/INDEX.md` 或 `docs/version/Iteration*_SPEC.md`。
- AGENTS 模板原文包含 Karpathy 编程规范，并包含 `扩展原则` 占位符。

## 8. 验证记录

| 日期 | 命令 | 结果 | 覆盖范围或失败原因 |
|---|---|---|---|
| 2026-06-19 | `./node_modules/.bin/tsc -b packages/shared` | PASS | 生成 `@astack/shared` dist，供 workspace 测试解析更新后的 scaffold 常量。 |
| 2026-06-19 | `./node_modules/.bin/vitest run packages/server/test/system-skill-service.test.ts packages/server/test/harness-routes.test.ts` | PASS | 2 files / 33 tests passed；覆盖 server scaffold missing / installed 状态。 |
| 2026-06-19 | `(cd packages/web && ../../node_modules/.bin/vitest --config vitest.config.ts run test/harness-panel.test.tsx)` | PASS | 1 file / 10 tests passed；覆盖 Harness 面板新路径文案与 missing 文件列表。 |
| 2026-06-19 | `bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh` | PASS | shell 语法检查通过。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run` | PASS | migrate dry-run 输出 `docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `tmpdir=$(mktemp -d); (cd "$tmpdir" && bash /home/alexk/data/codebase/github/astack/astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --name Demo --desc 'Demo project'); find "$tmpdir" -maxdepth 4 -type f -o -type d \| sort; rm -rf "$tmpdir"` | PASS | fresh scaffold 创建 `AGENTS.md`、`docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 0 errors / 0 warnings。 |
| 2026-06-19 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-19 | `diff -u <(awk Karpathy-block pasted-text-1.txt) <(awk Karpathy-block AGENTS.md.tpl)` | PASS | Karpathy 编程规范块与用户 pasted reference 提取块一致，diff 无输出。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run` | PASS | 更新后 dry-run 仍输出 `docs/astack/INDEX.md`、`docs/astack/version/`、`docs/astack/plan/`。 |
| 2026-06-19 | `tmpdir=$(mktemp -d); (cd "$tmpdir" && bash /home/alexk/data/codebase/github/astack/astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --name Demo --desc 'Demo project'); rg -n "^### 1\\. 🚀 编码哲学|^## 3\\. 扩展原则|待补充：项目专属" "$tmpdir/AGENTS.md"; rm -rf "$tmpdir"` | PASS | fresh scaffold 生成的 `AGENTS.md` 包含 Karpathy 原文标题和 `扩展原则` 占位符。 |
| 2026-06-19 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/version/Iteration12_HarnessDocsLayout_SPEC.md` | PASS | 更新后仍为 0 errors / 0 warnings。 |
| 2026-06-19 | `git diff --check` | PASS | 更新后 whitespace 检查通过。 |

## 9. 变更记录

| 日期 | 作者 | 摘要 |
|---|---|---|
| 2026-06-19 | AI | 创建 v0.13 SPEC，定义 harness docs layout 与 AGENTS 模板优化范围。 |
| 2026-06-19 | AI | 完成 `docs/astack` scaffold contract、workflow skill 文档、AGENTS 模板、server/web 状态检测与测试更新。 |
| 2026-06-19 | AI | 按反馈将 Karpathy 编程规范原文保留进 AGENTS 模板，并新增 `扩展原则` 占位符。 |
