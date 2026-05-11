# Iteration10 · AutoSync — Spec Review

> **评审对象：** `docs/version/Iteration10_AutoSync.md` v1.0
>
> **评审时间：** 2026-05-11
>
> **评审人：** spec_review (auto)
>
> **加载基线：** `AGENTS.md` · `docs/version/INDEX.md` · `docs/version/BOUNDARIES.md` · `docs/retro/golden-rules.md` 活跃规则 R1–R8 · `docs/retro/patterns.md` P1–P8

---

## 1. 结构完整性

对照 spec_review skill 标准章节模板：

| 章节 | 状态 | 备注 |
|---|---|---|
| 文档信息（版本/日期/迭代目标/前置依赖） | ✅ | §1 完整 |
| 背景与目标（现状/目标/非目标） | ✅ | §2.1 / §2.2 / §2.3 完整，非目标 12 条非常详尽 |
| 方案对比与决策 | ✅ | §3.1 拆 4 个子决策，每条独立列方案 A/B/C/D 与选型理由 |
| 信息架构与交互 | ✅ | §5 含 UI 树 + 4 条用户流程 |
| 详细设计（数据模型/接口/前端/集成） | ✅ | §4.1–§4.8 八个子节，覆盖 Service / git primitive / 决策树 / DB / Shared / HTTP / 前端 / 配置 |
| 技术实现（架构决策锚点 / PR 切分） | ✅ | §6.3 列 §A1–§A6 六条决策锚点；§6.4 切 PR1–PR4 |
| 验收标准（功能/非功能） | ✅ | §7.1 编号 T1–T17；§7.2 列零丢数据 / 资源 / 兼容 / i18n / Windows |
| 风险与缓解 | ✅ | §8 列 10 条风险，每条带缓解 |
| 变更记录 | ✅ | §9 表格起头 v1.0 |
| **缺失** | — | 无明显结构性遗漏 |

**结论：结构完整，无缺章。**

---

## 2. 方案内部一致性

按 IC1–IC6 维度逐项扫描：

### IC1 · 跨章节字段一致

- §4.5.2 `RepoAutoSyncAttentionPayloadSchema.reason` 枚举：`dirty_working_tree | pull_not_fast_forward | push_rejected | divergent_branches | dirty_and_behind | fetch_failed`（6 项）。
- §4.3 决策树标注的 reason：`dirty_working_tree`、`pull_not_fast_forward`、`push_rejected`、`divergent_branches`、`dirty_and_behind`、`fetch_failed` —— **6 项一致** ✅。
- §A4 错误分类表多出 1 项 `commit_failed` （决策树 §4.3 dirty 路径"commitAll → push"也提到 commit_failed），但 §4.5.2 schema 枚举**不含** `commit_failed`。
- T9 验收里显式提到 `needs_attention("commit_failed")`，T11 提到 `needs_attention("fetch_failed")`。
- **IC1-Issue-1（P0/契约不一致）：`commit_failed` 在 §4.3 决策树、§A4 错误分类表、§7.1-T9 测试里出现，但 §4.5.2 的 SSE schema `reason` 枚举没列入。** 实施时按 schema 走会让 commit_failed 这条路径无法 emit attention 事件（Zod strict 校验失败抛错），或被静默替换成其它枚举值。

### IC2 · 数据流向闭环

- 决策树（§4.3）→ writer 写 DB（§4.4 4 列）→ SSE emit（§4.5.2 attention + cycle_completed）→ HTTP 拉取（§4.6 GET 暂未画但 RepoCard 通过既有 `getRepos()` 拉到 4 列）→ 前端 RepoCard 渲染（§4.7.1.2）→ Dismiss 路径回写清空（§4.6 POST）。
- **链路闭环 ✅**。但 §4.6 的 GET 路径未明示：dismiss 后前端如何 invalidate 该 repo 的查询？§4.6 末尾说"调用方 web 自己 optimistic update"，但 §4.7.1.2 的 Dismiss 按钮文案"toast 'Attention cleared, next cycle will retry'"未提及 invalidate。**IC2-Issue-1（P2）：建议在 §4.7.1.2 Dismiss 行为里补一句 "并 `queryClient.invalidateQueries(reposKey)`"，与现有 v0.10 ReposPage refresh 后的 invalidate 风格对齐**。

### IC3 · 接口契约单一定义（呼应 R2）

- §4.5.3 定义 `DismissAutoSyncAttentionRequestSchema` / `Response`、`GetAutoSyncConfigResponseSchema`、`UpdateAutoSyncConfigRequestSchema`。
- §4.6 路由表与 §6.2 接口表都是引用式描述，没有重复列字段。
- **未发现 R2 反例 ✅**。

### IC4 · 与 BOUNDARIES.md / INDEX.md 一致

- `INDEX.md` 第 11 行：v0.11 状态"🔜 设计中"——本次评审完成后 spec 状态会改为"评审中"，提交完成后应同步刷成"评审通过待实施"。
- `BOUNDARIES.md` v0.11 边界（顶部 8-44 行）：
  - 自动 pull/push 间隔 ~1h ±5min ✅
  - "不丢数据" 红线 ✅
  - 4 列新增（`last_auto_sync_at/status/reason/detail`）✅
  - SSE 新事件 `repo.auto_sync_attention` ✅
  - 但 BOUNDARIES.md 未提 `repo.auto_sync_cycle_completed` —— **IC4-Issue-1（P2）：BOUNDARIES.md 应补 `repo.auto_sync_cycle_completed`，与 §4.5.2 对齐**（PR1 实施前补即可）。
- **IC4-Issue-2（P2）：BOUNDARIES.md 未明确 `RefreshRepoResponseSchema.skipped_reason` 扩 `auto_sync_in_progress` 这一项契约扩展**（v0.10 边界条目本应升级），实施时与 PR1 同步刷新。

### IC5 · 测试覆盖每条主路径

- 决策树 6 个分支：T3/T4（open-source clean/dirty）✅、T5（custom noop）✅、T6（custom pull）✅、T7（custom push）✅、T8（custom divergent）✅、T9（custom dirty+behind=0 commit+push 三态）✅、T10（custom dirty+behind>0）✅、T11（fetch authentication）✅。
- 锁互斥：T12 ✅。
- 配置三层优先级：T14（env 锁定）✅、T15（config.json 写入触发 stop）✅。
- **IC5-Issue-1（P2）：缺少"open-source pull non-ff"路径的单测覆盖**。决策树 §4.3 open-source 分支第 4 步明确给出 `needs_attention("pull_not_fast_forward")`，但 T1–T17 无对应用例。建议补 T3.5。
- **IC5-Issue-2（P2）：缺少"daemon 启动时 `config.enabled === false` 不调用 service.start()"的单测**。T1 只测启用路径。建议补 T1.5。

### IC6 · PR 切分内部自洽

- PR1（后端核心）+ PR2（HTTP 路由）+ PR3（前端）+ PR4（文档）。
- §A5 显式声明 schema 扩展 + writer 必须落同一 PR1 ✅（呼应 R3）。
- 但 §6.4 PR1 列表里写"DB migration + domain type + shared schemas（R3 原子）"，实际上 PR2 的 HTTP 路由会用到 §4.5.3 的 `DismissAutoSyncAttentionRequestSchema` —— 这个 schema 在 PR1 还是 PR2 落地？按 R3 原则应在 PR1 与最大写入点（HTTP handler）一起落，但 handler 在 PR2。
- **IC6-Issue-1（P1）：PR 切分对 §4.5.3 中的三个 HTTP schema 归属不明确。** 建议在 §6.4 PR1 项目符号里显式列出 "shared schemas: 仅 `RepoAutoSyncAttentionPayloadSchema` + `EventType` + `RefreshRepoResponseSchema.skipped_reason` 扩值"；HTTP-only 的三个 schema（`DismissAutoSyncAttentionRequest/Response`、`GetAutoSyncConfigResponse`、`UpdateAutoSyncConfigRequest`）随 PR2 一起进。否则 PR1 引入"无人调用的 schema"，PR1 的测试无法证明 schema 形状对。

---

## 3. 关键问题清单（按 P0/P1/P2 排序）

### P0 — 阻断实施

#### P0-1 · §4.4 引用的 migration 文件机制不存在（违反 R1，与 P1 同型）

> **位置：** spec §4.4 末尾  
> **原文：** "迁移：加一个新的 migration 文件 `packages/server/src/db/migrations/00XX_auto_sync_columns.sql`（编号跟现有规则）"

**事实核对：**

`packages/server/src/db/schema.ts` 注释明言："Single-source schema DDL (no version table and no migration machinery)"。当前**没有任何 migration 目录**也**没有 migration runner**。schema 通过 `CREATE TABLE IF NOT EXISTS` 一次性建表，新增列必须改写 `SCHEMA_DDL` 常量本身并依赖 `IF NOT EXISTS` + `ALTER TABLE` 的开发期手工处理。

**为什么是 P0：**

这与 v0.7（local skills）spec 误描述 `0007_local_skills.ts` migration 文件完全同型 —— 即 retro 反模式 P1（"幻象复用"）的 v0.7 案例。当时 spec_review 复盘时已沉淀为 R1（"复用声明必须 grep 验证"）。**本次又复刻一次**。

**修复方案：**

把 §4.4 的 migration 段改写为：

> 在 `packages/server/src/db/schema.ts` 的 `SCHEMA_DDL` 常量内 `repos` 表 DDL 末尾追加 4 列。由于 `CREATE TABLE IF NOT EXISTS` 不会在已建表上加列，**实施侧需在 `initDb()` 调用 `CREATE TABLE` 之后追加幂等的 `ALTER TABLE repos ADD COLUMN ... IF NOT EXISTS`**（SQLite 3.35+ 支持 `IF NOT EXISTS` 否则需 try/catch 吞 "duplicate column" 错）。本仓库的 SQLite 版本（better-sqlite3）确认支持后再选择。spec 必须显式说明这个机制（不存在 migration 文件）。

#### P0-2 · §0/§2.1/§4.7.1.3 把废弃 localStorage 开关定位错文件（违反 R5）

> **位置：** spec §0、§2.1 表格末行、§4.7.1.3、§6.4 PR3  
> **原文：**
> - §0：" ReposPage 前端有一个历史遗留的 'Auto-sync on focus' localStorage 开关"
> - §2.1：表格末行 "废弃的前端'Auto-sync on focus' localStorage 开关 | ⚠️ 占位未接 | `packages/web/src/pages/ReposPage.tsx`"
> - §4.7.1.3：" 删除废弃开关：原 localStorage `auto-sync-on-focus` 相关代码全部清除"

**事实核对：**

```bash
$ rg "auto.sync" packages/web/src --type tsx
packages/web/src/components/project/ProjectSettingsPanel.tsx:26    // localStorage key: astack:project:<id>:auto_sync
packages/web/src/components/project/ProjectSettingsPanel.tsx:38      `astack:project:${projectId}:auto_sync`,
packages/web/src/components/project/ProjectSettingsPanel.tsx:74    Auto-sync on focus
```

`ReposPage.tsx` 全文（已读前 120 行 + grep）**未发现** `auto-sync-on-focus` / `auto_sync` 任何残留。废弃开关位于 **`packages/web/src/components/project/ProjectSettingsPanel.tsx`**，不在 ReposPage。

**为什么是 P0：**

R5 黄金法则"代码引用必须函数名:行号双锚点"的核心动机就是防止"位置错位"。本次错位是**文件级**位置错位，比 R5 反例（行号张冠李戴）更严重。如果按 spec §4.7.1.3 实施 PR3，"删除 ReposPage.tsx 的 auto-sync-on-focus" 会因为 grep 零命中而被实施者跳过，**真正的废开关 ProjectSettingsPanel.tsx 的 'Auto-sync on focus' 会保留下来** —— spec 目标 §2.2-7"同时移除废弃的 'Auto-sync on focus' localStorage 开关"无法兑现，但 reviewer 看不出来。

**修复方案：**

把 spec 中所有提到 "ReposPage.tsx 的 auto-sync-on-focus" 的句子改为：

- §0：".. 'Auto-sync on focus' localStorage 开关位于 `packages/web/src/components/project/ProjectSettingsPanel.tsx` 的 `Auto-sync on focus` 复选框 (line 38, 74)"
- §2.1 表格末行 location：`packages/web/src/components/project/ProjectSettingsPanel.tsx (line 26-74)`
- §4.7.1.3：" 删除 `ProjectSettingsPanel.tsx` 中 `astack:project:<id>:auto_sync` localStorage 读写 + 渲染该 checkbox 的 JSX 区块（line 26-74）"
- §6.4 PR3 项目符号同步修正

#### P0-3 · §4.2 论证基础与 git.ts 现状不符（违反 R1）

> **位置：** spec §4.2  
> **原文：** "为什么不直接用现有 `gitPull`：AutoSync 需要 ff-only **确定性**行为...而 `gitPull` 的签名历史上允许未来被改成 `--rebase`"

**事实核对：**

```ts
// packages/server/src/git.ts
export async function gitPull(localPath: string): Promise<void> {
  const git = simpleGit(localPath);
  await git.pull(["--ff-only"]);  // line 61 — 已显式 ff-only
}
```

**现有 `gitPull` 已经是 `["--ff-only"]`**，不存在 spec 描述的"签名历史上允许未来被改成 `--rebase`"的现状（除非是对未来重构的预防性论述，但 spec 的语境是"为什么现在必须新增 primitive"）。

**为什么是 P0（不是 P1）：**

如果 reviewer 据此论证去否决 §4.2 的新增 primitive，实施者可能会"复用 gitPull"，那就把"AutoSync 独占的命名空间"耦合掉，未来某天有人改 gitPull 的实现影响所有调用方 —— 同样违 R6（跨 Service 同类 git 操作复用护栏）的精神（虽然这里反过来是"独立命名 vs 复用"的取舍）。**论证必须基于事实**否则 PR 评审会绕进死循环。

**修复方案：**

把 §4.2 论证改为：

> "现有 `gitPull` 已经传递 `["--ff-only"]`（git.ts:61）。AutoSync 仍单独引入 `gitPullFfOnly` 的理由：①语义独立命名，避免未来某次重构修改 `gitPull` 行为牵连 AutoSync；②AutoSync 需要的语义是"非 ff 立即失败"，未来 `gitPull` 可能演化出"非 ff 时降级到 fetch + 报告"等渐进语义；③与 §A1 "AutoSync 不复用 RepoService.refresh / SyncService" 的隔离原则一致 —— 调用栈和 primitive 命名空间都独立。"

### P1 — 重要遗漏

#### P1-1 · §4.2 / 风险 #2 把"新增 author 提取机制"描述得像现状

> **位置：** spec §4.2 `gitCommitAll` 实现 + §8 风险 #2 缓解描述  
> **§4.2 原文：** `--author: ${author.name} <${author.email}>` —— author 由 caller 传入  
> **§8 风险 #2 原文：** "缓解：`gitCommitAll` 的 author 参数从 `git config --local user.name` / `user.email` 读取（不读 global）"

**事实核对：**

`packages/server/src/http/app.ts` line 120-123：

```ts
gitAuthor: { name: "Astack", email: "astack@localhost" },
```

`gitAuthor` 是全局 DI 注入（默认 `Astack/astack@localhost`），**不是从 git config 动态读取**。SyncService 的 `commitAndPush` 也是 `deps.gitAuthor` 全局值。

**为什么是 P1：**

风险 #2 的缓解策略听起来很合理（"从 git config --local 读取避免跨 repo 污染"），但这是**新机制**，不是"沿用现状"。spec §4.2 的代码片段把 author 当作 caller 传入参数，没有说"caller 是 AutoSyncService 内部从 git config 读"。两段不同的描述（§4.2 看起来像沿用 deps.gitAuthor，§8 风险描述像 per-repo 读 git config）让实施者无所适从。

**修复方案：**

在 §4.1 `AutoSyncServiceDeps.git.commitAll` 签名前补一段：

> "**author 来源（与 SyncService 不同）**：AutoSync 不使用全局 `gitAuthor` DI（默认 `Astack/astack@localhost`），而是在每次 `syncOne(custom)` 入口处调 `git config --local user.name/email`（封装为新 primitive `gitGetLocalIdentity(localPath): Promise<{name,email} | null>`）；若 local 未设则该 repo 直接 `needs_attention("commit_failed", detail:"no_local_git_identity")`，不静默降级到 global。"

并在 §4.2 git primitive 列表里补 `gitGetLocalIdentity`，PR1 同步加。

#### P1-2 · §A3 锁机制对手动 Refresh + AutoSync 的并发模型欠缺一处显式断言

> **位置：** spec §A3 末尾  
> **原文：** "AutoSync 的 `syncOne` 反过来在该锁内进行。"

**事实核对：**

`packages/server/src/lock.ts` 的 `LockManager.acquire(key)` 是**阻塞**直到拿到锁（FIFO queue）。如果 AutoSync 在同一 repo 上的 cycle 比 1h 还长（极端情况），手动 Refresh 路径用 `tryAcquire` 直接 `skipped_reason:"auto_sync_in_progress"` 是对的；但 AutoSync 自己的下一个 cycle 调 `syncOne(repoId)` 时，如果该 repo 上还有手动操作正在持有别的锁（比如 SyncService.syncProject 持有的 `projectBootstrapLockKey`）—— spec 没说 AutoSync 是阻塞等还是 try-acquire 跳过。

**为什么是 P1：**

§A3 明言 "手动 Refresh / SyncService 路径**不 acquire 这个锁**"，所以理论上 SyncService.syncProject 不会和 AutoSync 的 `repoAutoSyncLockKey` 冲突。但 SyncService.syncProject 内部确实会调 `gitPull`（通过 `pullOne`），与 AutoSync 在同一目录并发 git 操作 —— spec §A3 倒数第二段已承认 "simple-git / git CLI 本身在同目录并发时的行为 unspecified"，并把"AutoSync 持锁阻挡"作为缓解 —— 但这只解决了"手动 Refresh vs AutoSync"，**没解决"SyncService.syncProject vs AutoSync"**。

**修复方案：**

在 §A3 末尾补一条决策：

> "**SyncService.syncProject 与 AutoSync 的同 repo 并发：** SyncService.syncProject 通过 `pullOne` 触达 git ops，本迭代选择**显式放行**这条并发路径（理由：syncProject 在 v0.5/v0.6 已稳定运行，对 working copy 不写 destructive 操作；AutoSync 对 open-source 也只调 fetch + ff-only pull，对 custom 在 dirty 时 commit；两者 git 操作不会同时 reset 同一 ref）。R6 显式放行条款已对此声明：**两条路径 git 操作集合无交集，无需复用护栏**。若 v0.12+ 引入并发隐患，需在那一版重新评估。"

补这条后 §A3 与 R6 的关联完整化。

#### P1-3 · §A6 配置面双源未覆盖"运行时监听"

> **位置：** spec §A6 + §4.6 POST /api/auto-sync/config  
> **原文：** §4.6："若从 disabled → enabled，立即 autoSyncService.start()；若从 enabled → disabled，autoSyncService.stop()"

**问题：** 如果 daemon 启动时 env `ASTACK_AUTOSYNC_ENABLED=false`，autoSyncService 没起 start；之后用户在 UI 把开关 toggle 到 ON，POST 写 config.json —— 但 env 优先级仍然高，按 §A6 应该 source 仍是 "env" 且 enabled 仍是 false。此时是否调 autoSyncService.start()？

**事实分析：**

§4.6 描述的 side effect "若从 disabled → enabled，立即 start()" 在 env 锁定场景下是**不应该执行**的（用户的写入对生效值无影响）。但 §4.6 没区分。如果实施者按字面执行 "enabled → 立即 start()"，会出现 "env=false + UI toggle on → AutoSync 真起来跑了 + UI 显示锁定 off" 的不一致。

**修复方案：**

§4.6 POST handler 行为改为：

> "若 env 已设（`ASTACK_AUTOSYNC_ENABLED` 存在），仅写 config.json 不触发 service start/stop；response.source 为 'env'，response.enabled 为 env 值。前端 UI 见 source==='env' 时禁用 switch（已在 §4.7.1.1 描述）。"

#### P1-4 · §A4 错误分类的 stderr 截断长度可能丢失关键诊断

> **位置：** spec §A4 表格  
> **原文：** "fetch 抛错，其他 → fetch_failed + detail 截断 stderr 前 200 chars"

**问题：** simple-git 的 stderr 经常前若干行是无关 noise（如 `error: Could not read from remote repository.` 后跟 `Please make sure you have the correct access rights`），关键错误行可能在 200 字符外。前 200 chars 截断是常见做法但需要权衡。

**为什么是 P1：**

诊断信息丢失会让 needs-attention 状态对用户来说成为黑箱（§5.2 流程 4 想象的 "tooltip 'Controlled by ASTACK_AUTOSYNC_ENABLED'" 那种透明度，但 fetch_failed 文案却是 "authentication" 这种通用词）。

**修复方案：**

§A4 表格"截断"项改为：

> "保留 stderr 后 500 chars（保留最近的错误行）；若包含 `fatal:` 行则优先抓取所有 `fatal:` 行拼接，最多 500 chars。前端 RepoCard 展开 detail 区可滚动；不前端截断。"

### P2 — 优化建议

#### P2-1 · §4.5.2 `repo.auto_sync_cycle_completed` schema 未在 §4.5.2 写出

> **位置：** §4.5.2 第二个事件  
> **原文：** "另一个事件：每轮 cycle 结束广播 `repo.auto_sync_cycle_completed`，payload 是 cycle summary（repos 总数 / ok / noop / skipped / attention 数）"

**问题：** 文字描述了 payload 但没给 Zod schema。R3（schema 与 writer 原子绑定）要求所有 schema 在 spec 第一处出现时给完整定义；本节给了 attention 事件的 schema，cycle_completed 缺一个。

**修复方案：**

§4.5.2 末尾补：

```ts
export const RepoAutoSyncCycleCompletedPayloadSchema = z.object({
  cycle_id: z.string(),
  started_at: z.number(),
  duration_ms: z.number(),
  repos_total: z.number(),
  ok: z.number(),
  noop: z.number(),
  skipped: z.number(),
  needs_attention: z.number(),
}).strict()
```

并在 `EventType` 枚举里加 `RepoAutoSyncCycleCompleted = "repo.auto_sync_cycle_completed"`。

#### P2-2 · §4.7.1.2 "Resolve 按钮"的"导航到订阅该 repo 的项目"逻辑不严谨

> **位置：** §4.7.1.2 RepoCard "Resolve" 按钮  
> **原文：** "导航到该 repo 所属项目（若可定位）的 Subscriptions tab → 预调 `openResolveDrawer(repoId)`"

**问题：** 一个 repo 可能被 N 个项目订阅（v0.4 后这是常态）。"该 repo 所属项目"是哪个？取第一个？让用户选？

**修复方案：**

补一段：

> "若 repo 被多个项目订阅，弹一个 dropdown 让用户选择目标项目；若只有 1 个则直接导航；若 0 个则显示 "Open in terminal" fallback（已有方案）。"

#### P2-3 · §6.4 PR1 测试覆盖与 §7.1 编号衔接

> **位置：** §6.4 PR1 末项 "全部后端单测（§7.1 的 T1–T12）"

**问题：** §7.1 T1-T12 是后端单测，T13-T15 是 HTTP 路由单测，T16-T17 是 E2E。PR1 末项"全部后端单测"看起来准确，但 §6.4 PR2 没显式说"PR2 包含 T13-T15"，PR3 没说"包含 T16-T17"。

**修复方案：**

PR2 末项补 "HTTP 路由单测（§7.1 的 T13–T15）"，PR3 末项把 "E2E（§7.1 的 T13–T17）" 改为 "E2E（§7.1 的 T16–T17）"（spec 现有文字写的是 T13-T17 但 T13-T15 是后端 HTTP 路由单测，归属 PR2）。

#### P2-4 · 风险 #10 的"spec-lint 正则修复"建议会扩散到本迭代的修改面

> **位置：** §8 风险 #10  
> **原文：** "推荐在 PR4 顺手把 spec-lint 正则对齐 AGENTS.md（一行改动）"

**问题：** 这是元工程改动（修 spec-lint），扩散到本迭代的核心目标外。最小改动原则建议在独立的小迭代或单独 PR 处理。

**修复方案：**

把 §8 风险 #10 的"推荐在 PR4 顺手"改为"建议另起独立 PR / 小迭代修 spec-lint，不与本迭代耦合"。

---

## 4. Phase 报告（按 §4.1–§4.8 顺序）

每个子节按 A 合理性 / B 清晰度 / C 可行性 / D Harness 实践 评级。D 维度本迭代不涉及 LLM 提示词或 skill 设计，标 N/A。

### Phase 1 · §4.1 AutoSyncService 新服务

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | 选 daemon 内 while-sleep + AbortController 与现有 `startDaemon`/`DaemonHandle.close()` 自然嵌入；冷启动 60s 延迟避免与初始化冲突 |
| B 清晰度 | ⚠️ Minor | `inflight: boolean` 模块级标志的所属（class instance 还是模块级）未明确；`runCycle` 的 "previous_cycle_running" skip 是 outcome 还是不写 DB 不明 |
| C 可行性 | ✅ Pass | `AbortController + sleepAbortable` 是 Node 生态成熟模式 |
| D Harness | N/A | — |

**Phase 1 修复建议：**

§4.1 `AutoSyncService` class 内部加注释明确：

```ts
class AutoSyncService {
  private abort: AbortController | null = null
  private inflight = false  // <-- instance 级，单实例 daemon 保证唯一
  ...
}
```

并明确 "previous_cycle_running" 的处理：**不写 DB、不 emit attention 事件、仅 logger.warn 一行**。

### Phase 2 · §4.2 git.ts 新增 primitive

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ⚠️ 待修 | `gitPull` 现状已 ff-only，§4.2 论证基础不准（P0-3） |
| B 清晰度 | ✅ Pass | 5 个 primitive 签名清晰 |
| C 可行性 | ✅ Pass | 都是 simple-git 直接 API |
| D Harness | N/A | — |

修复见 P0-3 + P1-1。

### Phase 3 · §4.3 syncOne 决策树

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | 四象限决策本身经得起推敲，不丢数据底线扎实 |
| B 清晰度 | ⚠️ Minor | `commit_failed` reason 在 §4.3 出现但 §4.5.2 schema 漏（IC1-Issue-1） |
| C 可行性 | ✅ Pass | 每条分支可独立测（§7.1 的 T3-T11） |
| D Harness | N/A | — |

修复见 IC1-Issue-1。

### Phase 4 · §4.4 DB schema 扩展

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | 新 4 列与 `last_synced` 解耦，避免污染 v0.6 时间字段语义 |
| B 清晰度 | ❌ Fail | 引用了不存在的 migration 机制（P0-1） |
| C 可行性 | ⚠️ 待修 | 实际机制要按 schema.ts SCHEMA_DDL + ALTER TABLE 模式 |
| D Harness | N/A | — |

修复见 P0-1。

### Phase 5 · §4.5 Shared 层

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | domain 类型 + SSE 事件 + HTTP schema 三块齐全 |
| B 清晰度 | ⚠️ Minor | cycle_completed 事件缺 Zod schema（P2-1） |
| C 可行性 | ✅ Pass | — |
| D Harness | N/A | — |

修复见 P2-1。

### Phase 6 · §4.6 HTTP 路由

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | 3 条路由职责清晰 |
| B 清晰度 | ⚠️ Minor | env 锁定时 POST /api/auto-sync/config 的 service start/stop 行为没完全说清（P1-3） |
| C 可行性 | ✅ Pass | — |
| D Harness | N/A | — |

修复见 P1-3。

### Phase 7 · §4.7 前端

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ⚠️ 待修 | 多 project 订阅同 repo 时 Resolve 按钮目标不明（P2-2） |
| B 清晰度 | ❌ Fail | 废弃开关位置整篇错（P0-2） |
| C 可行性 | ✅ Pass | UI 改动是常规 React 组件 |
| D Harness | N/A | — |

修复见 P0-2 + P2-2。

### Phase 8 · §4.8 配置加载

| 维度 | 评级 | 备注 |
|---|---|---|
| A 合理性 | ✅ Pass | env > config.json > default 三层 |
| B 清晰度 | ✅ Pass | `loadAutoSyncConfig` 实现完整 |
| C 可行性 | ✅ Pass | `parsePositiveInt` 是常见 utility，需要新建或复用 |
| D Harness | N/A | — |

**未发现需修问题。** 唯一小提醒：`parsePositiveInt` 当前仓库是否存在需 grep 确认；若不存在 PR1 加 utility。

---

## 5. 综合评价

### 总体判断

**评级：⚠️ 待修复**

Spec 整体设计扎实：决策树严谨、不丢数据底线明确、架构决策锚点（§A1–§A6）显式呼应 R3/R6 等黄金法则。但**事实核对维度的偏差较多**：

- 1 处与 P1 反模式（v0.7 同型）完全复刻：migration 机制不存在
- 1 处 R5 反模式的文件级变种：废弃开关在错误文件
- 1 处论证基础与现状不符：gitPull 已 ff-only
- 1 处现状描述与新增机制混淆：gitCommitAll author 来源
- 多处内部一致性细节遗漏：commit_failed schema 漏列、cycle_completed schema 漏列、env 锁定下 POST 行为不明、并发模型 SyncService.syncProject 路径未声明

这些问题都是"实施前必须修复"性质：P0 不修会让 PR 直接做错或漏做，P1 不修会让评审过程中绕弯路。

### Harness 实践（D 维度）

本迭代是纯工程改动（daemon 调度 + git ops + DB 列），不涉及 LLM prompt 设计、skill manifest 设计、Agent 行为模式。D 维度全程 N/A。

### 关键正向兑现

- ✅ R3（schema 与 writer 原子绑定）：§A5 显式声明
- ✅ R6（跨 Service 同 git 操作护栏复用）：§A2 显式声明 AutoSync 不复用 SyncService.pushOne 的 REPO_READONLY guard 的理由
- ✅ R7（batch outcomes 带 error_code/error_detail）：§4.5.2 attention payload 含结构化 reason + detail
- ✅ R8 不直接相关：本迭代不涉及兜底标记永久化议题

### 反模式触发情况

- ⚠️ **P1（幻象复用）触发**：§4.4 migration 机制
- ⚠️ **P5（行号张冠李戴）触发变种**：废弃开关位置错误（文件级而非行级）
- 其余 P2/P3/P4/P6/P7/P8 未触发

---

## 6. 下一步

1. **【必须】** 修复 P0-1 / P0-2 / P0-3 三处事实性偏差，spec 状态保持"评审中"直到修复完成。
2. **【必须】** 修复 P1-1 / P1-2 / P1-3 / P1-4 四处重要遗漏，特别是 author 来源（P1-1）和 SyncService.syncProject 并发路径（P1-2）。
3. **【建议】** 修复 P2-1 至 P2-4 优化项，尤其 P2-1（cycle_completed Zod schema）有助于实施者一次写对。
4. **【建议】** 同步刷新 `BOUNDARIES.md`（IC4-Issue-1/2）：补 `repo.auto_sync_cycle_completed`、补 `RefreshRepoResponseSchema.skipped_reason` 扩值条目。
5. **【建议】** 补两条遗漏的单测（IC5-Issue-1/2）：open-source non-ff 路径、daemon 启动时 enabled=false 不调 start()。
6. 修复完成后，spec 状态从"评审中"刷为"评审通过待实施"，进入 PR1 编码。
7. 本次评审产出的两条同型反模式触发（P1 复刻 + R5 文件级变种），自动沉淀到 `docs/retro/` 详见下一节。

---

## 7. 知识沉淀

### 沉淀到 golden-rules.md

R1 / R5 已存在，**本次复刻强化案例**，将在 R1 的反例段追加 v0.11 案例，在 R5 的反例段追加文件级位置错位案例。具体 patch 见独立提交。

### 沉淀到 patterns.md

P1（幻象复用）的案例库追加 v0.11 案例：spec §4.4 引用 `packages/server/src/db/migrations/00XX_auto_sync_columns.sql`，实际项目无 migration 框架。

P5（行号张冠李戴）的反模式名应**升级或拆分**：当前定义只覆盖"行号在同文件不同函数间错位"，建议在 patterns.md 增补"位置错位的另一变种：函数定位到错文件" —— 由本次评审触发首次。

---

> **报告完毕。** spec 文档于 2026-05-11 完成 P0/P1/P2/IC 全量修复（spec v1.1，状态切至"评审通过待实施"），可进入 PR1 编码。详见 spec §9 变更记录 v1.1 行的逐项交叉引用。
