# Iteration11 — Plugin Marketplace 布局 · 代码审查报告

> 对 [`Iteration11_PluginMarketplaceLayout_SPEC.md`](../Iteration11_PluginMarketplaceLayout_SPEC.md) 的实现做按 Phase（PR1 / PR2 / PR3）的代码审查。
>
> **执行时间**：2026-05-13
> **审查模式**：方案审查（模式 A）
> **代码基线**：`main` 分支当前 working tree（含 staged + unstaged 修改）
> **测试基线**：
> - `pnpm --filter @astack/server test --run` → 35 files / 454 tests passed
> - `pnpm --filter @astack/cli exec vitest run test/repos.test.ts` → 1 file / 10 tests passed（含 T9–T11 + T11a–d 校验扩展）
> - 其它 CLI 套件中 `server-cmd.test.ts` 3 处失败由 port 7432 已被本机 daemon 占用引起，与本迭代无关。

## Phase 1 — PR1：shared 域 + scanner 三文件原子 + 后端单测

### 审查文件清单

- `packages/shared/src/domain.ts`
- `packages/shared/src/schemas/common.ts`
- `packages/server/src/scanner/index.ts`
- `packages/server/src/scanner/plugin-marketplace.ts`（新增）
- `packages/server/src/scanner/skill-dirs.ts`
- `packages/server/src/scanner/flat-files.ts`
- `packages/server/src/scanner/common.ts`（间接依赖）
- `packages/server/test/scanner.test.ts`
- `packages/server/test/scanner-system-skill-filter.test.ts`

### 审查结论摘要

| 子任务 | spec 要求 | 结论 |
|--------|-----------|------|
| §1.1 `ScanRootKind` 加 `PluginMarketplace` 成员 + JSDoc | 第 4 个枚举值 + JSDoc 说明 | **通过** — `domain.ts:205-211` 加入 `PluginMarketplace: "plugin-marketplace"`；`domain.ts:188-201` `ScanRoot.kind` JSDoc 第 4 行枚举说明完整且解释了 namespace 策略 |
| §1.1 `DEFAULT_SCAN_CONFIG` / `BUILTIN_SEED_URLS` 不动 | 不动 | **通过** — `domain.ts:216-221` / `230-234` 仍是 v0.2 / v0.4 原貌 |
| §1.2 `ScanConfigSchema` 接受新成员 | 显式 `z.enum(...)` 加 4 列 | **通过** — `common.ts:53-58` 显式列出 4 个枚举值，与 spec "实施备注" 完全一致 |
| §1.3 `scanRepo` switch 加第 4 case | 同形派发 | **通过** — `index.ts:95-101` 派发 `scanPluginMarketplace`；`default` 分支 `_exhaustive: never` 保留（type-level exhaustiveness check 仍生效） |
| §1.4 新建 `scanPluginMarketplace` | JSDoc 行为契约 + 强制复用 helper | **通过** — `plugin-marketplace.ts` 完整呈现：`isDir → safeReaddir → 跳过 dotdir → NAME_REGEX 校验 → manifest 白名单 → scanSkillDirs/scanFlatFiles ×3`；grep 验证 `parseFrontmatter` / `safeReaddir` / `NAME_REGEX` 在该文件内 0 处实现性使用，全部为 import 或 JSDoc 引用，符合 §2.3 复用契约 |
| §1.4 `name` = `<plugin>/<innerName>` 命名空间 | 通过 namePrefix 注入 | **通过** — 见 §1.5 / §1.6；`<plugin>` 通过 NAME_REGEX 后才进入派发，自然保证只有一个 `/` 分隔符 |
| §1.5 `scanSkillDirs` 加可选 `namePrefix` | 第 5 参数缺省 `""` + invariant assert | **通过** — `skill-dirs.ts:36-47` 参数声明 + `NAME_REGEX.test(namePrefix)` invariant；`skill-dirs.ts:78-82` frontmatter 不一致 warning 比对 `entry.name`（裸 inner），符合 §1.5 / §1.6 / T5b |
| §1.6 `scanFlatFiles` 加可选 `namePrefix` | 第 6 参数对称 | **通过** — `flat-files.ts:35-41` 同形 invariant；`flat-files.ts:63` frontmatter 比对裸 `base` |
| §1.7 / §1.8 / §1.9 / §1.10 fs / DB / API 不动 | 声明保留 | **通过** — 当前 working tree `git diff` 验证 `sync.ts` / `subscription.ts` / `schema.ts` / `repos.ts` 的 4 处锚点均未触动 |
| §1.13 后端测试 T1–T7 | 8 个用例覆盖 happy path + 边角 | **通过** — `scanner.test.ts:430-687` `describe("scanRepo — plugin-marketplace layout (v0.12)")` 包含 T1 / T2 / T3 / T4 / T5a / T5b（拆为两个）/ T6 / T7 + 1 额外 multi-root 用例，测试细节断言到 `relPath` / `description` 而非仅 `name`，覆盖度优于 spec 列举的最低契约 |
| §1.14 后端测试 T8 | systemSkillIds 不剥前缀 | **通过** — `scanner-system-skill-filter.test.ts:136-172` T8 完整：构建 `code-review/harness-init` plugin-namespaced skill + `systemSkillIds: { harness-init }`，断言 skill 仍命中 + warning 不含 `reserved` |

### 问题清单

无。PR1 实现完全符合 spec，并且：

- §2.3 R6-spirit 复用契约**严格执行**：`plugin-marketplace.ts` 内 `parseFrontmatter` / `safeReaddir` / `NAME_REGEX` 的 grep 命中点全部在 import 或注释中，无 inline 重新实现（这是 spec 在 §2.3 里点名要求"PR1 §A1 强制契约"的最关键护栏）
- §2.4 namePrefix 注入而非外层加工：实现选择把前缀注入 helper 内部，避免了 `relPath` 与 `name` 维护漂移的潜在风险（spec §2.4 明确选定的方案）
- 未来 scanner kind 扩展的 type-level guard 仍保留（`scanRepo` 的 `default: const _exhaustive: never = root.kind`）
- T1 不仅断言 `name`，还断言 `relPath` 与 `description`，比 spec 最低契约覆盖更厚

### 关键依据

- `plugin-marketplace.ts:64` `manifestAbs = path.join(dir, pluginSlug, ".claude-plugin", "plugin.json")` —— 路径拼接正确（`dir` 已含 `<repoRoot>/<rootPath>`）
- `plugin-marketplace.ts:66-73` 优先 `NAME_REGEX` 校验后 `isFile(manifestAbs)`，与 spec §2.5 噪声控制一致：通过 NAME_REGEX 但缺 manifest 才 warn，dot-dir / 非法 slug 静默跳过（dot-dir 已在 line 61 `startsWith(".")` 提前 skip，line 66 NAME_REGEX 失败发独立"invalid name"warning）
- `index.ts:124-136` blacklist 区域加注释精确解释为何不剥前缀比对（与 spec §2.6 决策一致）

### 遗留问题

无。

---

## Phase 2 — PR2：CLI `--scan-config-json` 透传 + 单测

### 审查文件清单

- `packages/cli/src/bin.ts`
- `packages/cli/src/commands/repos.ts`
- `packages/cli/test/repos.test.ts`（新增）

### 审查结论摘要

| 子任务 | spec 要求 | 结论 |
|--------|-----------|------|
| §1.11 `runReposRegister` 加 `scanConfigJson` opts | JSON.parse + ScanConfigSchema.parse | **通过** — `commands/repos.ts:32-56` 抽出纯函数 `parseScanConfigJson(raw)`，先 `JSON.parse` 失败 → `VALIDATION_FAILED("invalid JSON")` + `details.detail`；再 `ScanConfigSchema.safeParse` 失败 → `VALIDATION_FAILED("schema validation failed")` + `details.detail` 拼接所有 ZodError issues。两条错误路径都按 spec §1.11 设计 |
| §1.11 解析顺序：先校验后请求 | "解析 + 校验 BEFORE 网络" | **通过** — `commands/repos.ts:80-94` 解析在 `ensureDaemonOnline` 之前；T10 / T11 同时断言 `spy not.toHaveBeenCalled()`，固化此顺序 |
| §1.12 `bin.ts` reposCmd register 加 option | `.option("--scan-config-json <json>", ...)` | **通过** — `bin.ts:211-214` 加 option（含 spec 里给的字面量 sample）+ `bin.ts:221` 透传 `scanConfigJson: opts.scanConfigJson` |
| §1.15 T9–T11 测试 | 合法透传 / 非法 JSON / Zod 失败 | **通过** — `test/repos.test.ts` 实现 10 个用例：T11a / T11b / T11c / T11d 覆盖 4 种 schema 失败模式（含 `min(1)` 的空 roots 数组），happy path 测了 4 kind 合法值；T9 happy + T9b 兜底（不传 → undefined）+ T10 + T11 网络短路。10/10 全绿 |
| §1.15 测试 seam 不污染生产路径 | 仅在传入 client 时跳过 daemon check | **通过** — `commands/repos.ts:77` 加 `client?: AstackClient` 仅在测试场景使用；`commands/repos.ts:87-94` 生产路径 `opts.client === undefined`，仍然 `new AstackClient` + `ensureDaemonOnline`，行为无回归 |

### 问题清单

无实质问题。一个可记录的低级别观察（不构成审查问题）：

- spec §1.11 用 `ScanConfigSchema.parse(parsed)`（throw ZodError 直接冒泡），实施改为 `safeParse` + 自己拼 `detail` 后用 `AstackError(VALIDATION_FAILED)` 抛出。这是一个**比 spec 更友善**的实现：对 CLI 用户提供格式化的 issue 描述（`<root>: roots: Required` 等），而原 ZodError 信息更原始。**不是偏离方案意图**——spec 的目标是"让用户得到字段级错误"，实施满足且更易读。无需追平 spec 文本。

### 关键依据

- `commands/repos.ts:43-54` `safeParse` 失败时 `result.error.issues.map(...).join("; ")` 拼接所有错误，与 R7 的 `error_detail` 精神对齐（虽然 R7 关注的是 batch outcomes，但同源思想：技术细节必须可机读）
- `test/repos.test.ts:60-72` 用 prototype 注入 `registerRepo` 而非真实 HTTP，避免了网络 / 端口依赖
- `bin.ts:211-214` 帮助字符串里的 JSON 转义 `\"` 在 shell 文档语境里是正确的（commander 渲染时不会把 `\` 输出）

### 遗留问题

无。

---

## Phase 3 — PR3：文档同步 + retro 走查

### 审查文件清单

- `AGENTS.md`（§5 当前活跃迭代）
- `docs/version/INDEX.md`
- `docs/version/BOUNDARIES.md`
- `docs/version/Iteration11_PluginMarketplaceLayout_SPEC.md`（自身状态行）
- `docs/retro/golden-rules.md`（候选 R9 走查）

### 审查结论摘要

| 子任务 | spec 要求 | 结论 |
|--------|-----------|------|
| §1.16 AGENTS.md 切换到 v0.12 | 当前活跃 + v0.11 移到历史完成 | **通过** — `AGENTS.md:70` "当前 SPEC: v0.12 ..." 完整一行；`AGENTS.md:72` "最近完成: v0.11 ..." 已挪位 |
| §1.17 INDEX.md 加 v0.12 行 | 物理序号 11 / 状态翻 IMPLEMENTED | **通过** — `INDEX.md:9` v0.12 行 + 文件名 `Iteration11_PluginMarketplaceLayout_SPEC.md` 一致 |
| §1.18 BOUNDARIES.md 加 v0.12 章节 | In/Out scope 章节 | **通过** — `BOUNDARIES.md:8-33` 完整章节，列举 In scope 11 条 / Out of scope 10 条，引用都带文件锚点 |
| §1.19 候选 R9 走查 | retro 决定是否进活跃规则 | **部分符合** — spec 里说"`/retro` 走查正式纳入活跃规则的动作留待合并后单独执行"。当前 `golden-rules.md` 活跃规则区域仍是 R1–R8（8 条），未加 R9。这与 spec 第 19 条"实施备注"一致（实施过程**严格按 R9 候选规则落地**，但暂不沉淀到活跃规则）。无问题；待本轮 `/code_review` 自动沉淀环节复核 |
| Spec 自身状态行 | 状态从 SPEC → IMPLEMENTED | **通过** — `Iteration11_PluginMarketplaceLayout_SPEC.md:3-5` 状态行 `已完成（IMPLEMENTED · 2026-05-13）` 清晰；本次 `/code_review` 在顶部追加了 `CR中（2026-05-13）` 一行，符合"审查开始前更新文档状态"约束 |

### 问题清单

无。

### 关键依据

- `AGENTS.md:70` 中 v0.12 描述明确指出 "**不**预置 `claude-plugins-official` 为 builtin seed，**不**动 Web UI、DB schema、subscription/sync 路径"，与 spec § Out of scope 一致，未隐式扩大本迭代范围
- `BOUNDARIES.md:11-20` 11 条 In scope 与 spec §1 序号一一对应（不再像历史迭代有"进/退路混淆"）

### 遗留问题

候选 R9（"Scanner kind 抽象的扩张必须以新 helper 文件落地，禁止在现有 helper 内 inline 增加分支"）是否纳入活跃规则的决议留待 spec §19 所述"合并后 `/retro` 走查"环节做。本次 `/code_review` 不替 `/retro` 决议。

---

## 跨阶段交叉复核

1. **dedup 与 namespace 互动** — `scanRepo` 的 `${type}/${name}` dedup key 在 plugin-marketplace 模式下是 `command/<plugin>/<inner>`（含两个 `/`）。读 `index.ts:115` `const key = ${s.type}/${s.name}` 与 `seen` Set 比对，T4 测试已验证两条同 inner 不同 plugin 的 commands **都进 skills 数组**而非互相 dedup。✅ 行为正确。
2. **systemSkillIds 跨 plugin 合理性** — 看 `index.ts:142-149` 黑名单循环条件 `s.type === SkillType.Skill && blacklist.has(s.name)`，对于 plugin-namespaced 名 `code-review/harness-init`，`blacklist.has("code-review/harness-init")` → false（除非用户在 blacklist 里恰好放了带前缀名）。这与 spec §2.6 的"v0.4 黑名单是为了避免和 `<project>/.claude/skills/<id>/` 系统 seed 撞目录"逻辑一致，T8 测试也固化此行为。✅ 一致。
3. **namePrefix invariant 双层防护** — `scanSkillDirs` 与 `scanFlatFiles` 各自带一个 `NAME_REGEX.test(namePrefix)` invariant assert，即使 marketplace scanner 误传含 `/` 的 prefix 也会立即 throw（而非污染 `(type, name)` dedup key）。这是 §1 Out of scope #9 "不允许 namePrefix 嵌套" 的防御性兑现。✅ 双层护栏存在。
4. **dot-dir 与 NAME_REGEX 的优先级** — `plugin-marketplace.ts:61` 先 `startsWith(".")` 静默 skip → `line 66` 才 NAME_REGEX warn。对 `.git` / `.github` / `.claude-plugin` 不会产生噪声 warning。T7 测试固化。✅ 与 §2.5 决策一致。
5. **`scan_config` 跨层流通** — CLI `runReposRegister(scan_config)` → `RegisterRepoRequest.scan_config: ScanConfigSchema.nullish()`（`repos.ts:41`）→ daemon scanner。Schema 层接受 4 个枚举，CLI 层 happy 测试 + happy 测试都覆盖了 4 个 kind 透传。✅ 全链路 type-safe。

---

## 总体结论

| 维度 | 结论 |
|------|------|
| **PR1 实现完整性** | 通过 |
| **PR1 测试覆盖** | 通过（T1–T8 + 多额外用例，超 spec 最低契约） |
| **PR2 实现完整性** | 通过 |
| **PR2 测试覆盖** | 通过（T9–T11 + T11a–d + T9b 兜底） |
| **PR3 文档同步** | 通过（仅 R9 retro 沉淀按 spec 决定后置） |
| **R6-spirit 复用契约** | 通过（grep 验证：`plugin-marketplace.ts` 内 0 处 inline 重写 helper 内部） |
| **R3 schema-写入点原子绑定** | 通过（`ScanRootKind` 与 4 个写入点 — `ScanConfigSchema` / `scanRepo` switch / `scanPluginMarketplace` / `scanSkillDirs+scanFlatFiles` namePrefix — 都在 PR1 同一变更集内）|
| **R5 函数名:行号双锚点** | spec 自身已规范使用；本审查报告对引用代码位置全部按 `function (file:line)` 或 `file.ts:line-line` 双锚点注明 |
| **本次审查发现的高/中/低问题数** | 高 0 / 中 0 / 低 0 |
| **是否建议合入** | 已 IMPLEMENTED（合入完毕）；本审查未发现需要 follow-up 改动的问题 |

---

## 自动知识沉淀

本轮审查未发现高/中级别问题。按 `/code_review` 流程定义：

> 仅有"低"级别问题或全部"通过"则跳过自动沉淀。

**结论**：跳过 `docs/retro/` 自动写入。如需沉淀本次"R9 候选规则被 spec 严格落地"的正面案例，建议另行手动运行 `/retro` 走查决议（与 spec §1.19 "实施备注"提到的后续动作合并执行）。

`golden-rules.md` 当前活跃规则 8 条，距 15 条上限仍有 7 条余量，**无容量提醒**。

---

**自动知识沉淀**: 新增反模式 0 条，新增黄金法则 0 条，更新已有条目 0 条
