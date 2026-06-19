# v0.11 — Auto-sync：Daemon 侧周期性 pull / push + 冲突安全停泊

> **文档状态：已完成**
>
> 创建于 2026-05-11，分支 main · v1.0 → v1.1（据 `Iteration10_AutoSync_REVIEW.md` 修复 P0/P1/P2/IC）
>
> **前置依赖：**
> - v0.6 已落地（`SyncService.ensureMirrorClean (sync.ts:1204-1240)`、`gitResetHard (git.ts:146-159)`、`EventType.RepoMirrorReset` 就位；tee logger 基础设施就位）
> - v0.7 已落地（`RepoKind` 枚举稳定；`RepoService.pushOne` 对 `open-source` 抛 `REPO_READONLY` 的约束在位）
> - v0.10 已落地（`RefreshRepoRequestSchema` / `skipped_reason` / `reset_performed` 字段模型已引入；`force` 的语义严格限定 `open-source`）
>
> **触发事件（2026-05-11）：** 用户 Alex 反馈希望 Daemon 能"每小时自动 git pull / push"：本地无改动时 pull，有改动时 commit+push，并对冲突场景给出安全方案。当前项目**完全没有周期性任务**（`grep setInterval` 在 `packages/server/src/` 零命中），`two-way sync` 标签只是权限标签，push 仅靠手动触发。前端 `packages/web/src/components/project/ProjectSettingsPanel.tsx` 内有一个历史遗留的 "Auto-sync on focus" localStorage 开关（key: `astack:project:<id>:auto_sync`，line 26-74），但后端从未接上（废开关）。`grep -r "auto_sync\|auto-sync-on-focus" packages/web/src` 验证：仅 `ProjectSettingsPanel.tsx` 命中 3 处，**`ReposPage.tsx` 全文零命中**。
>
> **本迭代性质：** Daemon 侧新增后台循环调度器 + `custom` repo 的双向同步闭环 + 冲突"安全停泊"状态 + ReposPage 可见化 needs-attention 状态。不改 DB 列语义（仅新增两列）；SSE 事件集合加 1 个新事件；HTTP 路由新增 1 个查询 + 1 个清除 attention 的 POST。

## 0. 迭代缘起

`two-way sync` 这个标签从 v0.4 引入 `RepoKind.Custom` 起就存在，但直到本迭代之前它的语义只有两条：

1. **允许 push**：`SyncService.pushOne (sync.ts:478-485)` 对 `kind === "open-source"` 抛 `REPO_READONLY`，`custom` 可过。
2. **允许 `keep-local` / `manual` resolve 策略**：`SyncService.resolve` 对 open-source 拒绝这两种策略。

**但从没有任何路径会自动 push**。

用户的合理期望是：我注册了 `astack-skills` 这个 custom repo 到 Astack（带标签 `two-way sync`），那它应该**在后台被 Astack 当成一个活的 working copy 来维护** —— 我在这台机器上改了 skill 文件，Astack 帮我 commit 并 push；远端我的另一台机器提交了新 skill，Astack 帮我 pull。否则 `two-way sync` 这个标签就是在撒谎。

之前没做的原因：

- v0.4 / v0.5 / v0.6 都把重心放在**让用户看清状态**上（resolve UI、bootstrap 三元分类、镜像自愈），没到"后台代替用户做决定"这一步。
- 后台自动 push 一旦触发冲突，如果处理不当，可能让用户的 working copy 留下 merge 半成品（`.git/MERGE_HEAD` + conflict markers 散落在 `.claude/skills/*.md` 里），这是灾难级体验问题。
- 没有常驻后台循环的抽象；直接写 `setInterval` 会因为叠加执行、daemon 冷启动时序、手动触发和定时触发撞车等问题翻车。

### 为什么现在能做

1. **Daemon 是常驻进程**（`@astack/server` 的 Hono + `serve()`），挂后台任务的基建现成。
2. v0.6 的 `ensureMirrorClean` + `gitResetHard` 已经把 "自愈式 pull" 在 SyncService 侧跑了 ~20 天无故障，同类思路可以外推。
3. v0.10 的 `skipped_reason` / `reset_performed` 结构化字段模式已经在 refresh 路径上建立，本迭代的"冲突进入 needs-attention 状态并回传结构化理由"完全沿用该范式（retro 候选 R9 的正向兑现）。
4. **冲突解决 UI 已经就位**：v0.5 的 `SyncService.resolve` + `use-remote` / `keep-local` / `manual` 三策略 + 前端 `ProjectDetailPage::onResolveAllConflicts` batch toast 可以直接复用 —— 本迭代的 needs-attention 产物正好是那套 UI 的输入。

---

## 1. 文档信息

- 文档版本：v1.0
- 日期：2026-05-11
- 迭代目标：在 daemon 侧引入每小时一次的自动同步循环，对 `open-source` repo 执行幂等 pull、对 `custom` repo 执行 pull/commit/push 双向同步；冲突不自动 merge/rebase/force-push，进入 `needs-attention` 状态并在 ReposPage 外显 + 复用 v0.5 resolve UI 兜底。
- 前置依赖：v0.6（ensureMirrorClean / gitResetHard）、v0.7（RepoKind 稳态）、v0.10（skipped_reason 结构化字段范式）

---

## 2. 背景与目标

### 2.1 当前状态

| 能力 | 状态 | 位置 |
|---|---|---|
| Daemon 常驻进程 | ✅ 已有 | `packages/server/src/daemon.ts::startDaemon` |
| 手动 pull（refresh） | ✅ 已有 | `RepoService.refresh (repo.ts:246-314)` |
| 手动 pull（单 skill sync） | ✅ 已有 | `SyncService.pullOne (sync.ts:170+)` |
| 手动 push | ⚠️ 仅 resolve / 单 skill | `SyncService.pushOne (sync.ts:471+)`、`resolve (sync.ts:670+)` |
| 镜像脏态自愈（open-source） | ✅ 已有 | `SyncService.ensureMirrorClean (sync.ts:1204-1240)` |
| 镜像脏态 force reset（refresh） | ✅ v0.10 | `RepoService.refresh({ force: true })` |
| 冲突解决 UI（use-remote / keep-local / manual） | ✅ 已有 | `ProjectDetailPage::onResolveAllConflicts` |
| **周期性后台任务** | ❌ **不存在** | `grep setInterval packages/server/src/` 零命中 |
| **Custom repo 的自动 push** | ❌ **不存在** | — |
| **Repo needs-attention 状态** | ❌ **不存在** | — |
| 废弃的前端"Auto-sync on focus" localStorage 开关 | ⚠️ 占位未接 | `packages/web/src/components/project/ProjectSettingsPanel.tsx (line 26-74)`（**注意：不在 `ReposPage.tsx`**；grep 验证 `auto_sync` 仅命中 ProjectSettingsPanel.tsx 3 处） |

### 2.2 本次迭代目标

1. 在 daemon 启动时起一条后台循环，每 ~1h（含 ±5min 抖动）对所有已注册 repo 执行一次 `syncOne`；daemon 停止时优雅终止。
2. `open-source` repo 的 `syncOne` ≈ `RepoService.refresh({ force:false })`：clean 则 pull，dirty 则 skip+warn（复用 v0.10 `skipped_reason`），不自动 force reset（force reset 保留为**用户显式行为**，不下放到后台）。
3. `custom` repo 的 `syncOne` 按四象限决策：
   - clean + 0 ahead + 0 behind → no-op
   - clean + 0 ahead + >0 behind → `pull --ff-only`
   - clean + >0 ahead + 0 behind → `push`
   - clean + >0 ahead + >0 behind → 进入 needs-attention（divergent，不自动 rebase）
   - dirty + 0 behind → 自动 commit（`astack-auto-sync: YYYY-MM-DD HH:mm`）+ push
   - dirty + >0 behind → 进入 needs-attention（不自动 stash merge）
4. 冲突 / divergent / push 被拒 → 进入 `needs-attention` 状态，**绝不自动 merge/rebase/force-push/stash pop**；工作树保持触发时的干净语义（若中途 stash 过，stash 留在 ref 里，不丢）。
5. ReposPage 的 repo 卡片新增橙色 "Needs attention" 徽章，点击展开可见 `last_sync_error_code` + `last_sync_error_detail`；提供 "Dismiss" 按钮（清除 attention 状态但不做任何修复动作）。
6. SSE 新增 `repo.auto_sync_attention` 事件；daemon.log 每轮写一行结构化摘要。
7. 配置面最小：env `ASTACK_AUTOSYNC_ENABLED`（默认 `true`）、`ASTACK_AUTOSYNC_INTERVAL_MS`（默认 `3_600_000`）、`ASTACK_AUTOSYNC_JITTER_MS`（默认 `300_000`）。ReposPage 顶部加一个"Enable auto-sync"总开关（写到同一 env 的 `~/.astack/config.json` 覆盖层），**同时移除废弃的 "Auto-sync on focus" localStorage 开关（位于 `packages/web/src/components/project/ProjectSettingsPanel.tsx:26-74`，不在 ReposPage）**。

### 2.3 非目标

1. **不做 CLI 命令**（`astack auto-sync start/stop/status`）—— 配置面只开一个前端开关 + env，CLI 一致性放 v0.12+。
2. **不做"智能 rebase"或"3-way merge"自动化** —— divergent / dirty+behind 一律进 needs-attention。
3. **不做 per-repo 的独立间隔配置** —— 全局一个间隔足够，per-repo 配置打开后 UX/并发模型复杂度激增。
4. **不做 "手动触发一次 auto-sync"** 按钮（即 "Sync all now"）—— 用户可点每个卡片的 Refresh 触发既有手动路径，或等下一轮 cycle；避免两条触发源的锁竞争与事件风暴。
5. **不动 `RepoService.refresh` 本身的语义** —— auto-sync 是**新的服务**，内部调既有 git.ts primitive 而**不是**调 `RepoService.refresh`（避免 refresh 的日志 / SSE 事件被 auto-sync 污染）。
6. **不给 `open-source` repo 做自动 force reset** —— 保持 v0.6 决策：open-source 脏态只由用户手动 Force pull。
7. **不新增 `post-commit` / `pre-push` hook 绕过**（如 `--no-verify`）—— 遵守 Git Safety Protocol。
8. **不自动生成 PR 或处理 upstream protected branch 策略** —— push 被拒（protected branch / required reviewer）直接进 needs-attention，用户手动处理。
9. **不把 auto-sync 接到 SSE 的 `sync.completed` / `repo.refreshed` 事件** —— 本迭代是独立事件类型，前端按 SSE key 分派。
10. **不做退避重试**（failed → exponential backoff）—— 失败直接进 needs-attention，等用户 Dismiss 或下次 cycle 重试；简单重试会把"真错误"和"暂时网络抖动"混淆。
11. **不做 `.astack/auto-sync-state.json` 等外部状态文件** —— 状态全部入库（SQLite），SSE 广播，单真相源。
12. **不做 OAuth token 自动续签 / SSH key 管理** —— 鉴权失败（`FETCH_HEAD` 拒绝）等同于 needs-attention，用户去 terminal 跑一次 `git pull` 认证即可。

---

## 3. 方案决策

### 3.1 方案对比

#### 3.1.1 调度器放在哪

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| **A. Daemon 内起 async loop** | 在 `startDaemon` 里起一个 while-sleep 循环，`stopDaemon` 里 AbortController 停 | 与现有 daemon 生命周期自然绑定；无新进程；日志 / SSE 复用；单实例保证（daemon.pid 已唯一） | 需要自己管 loop / sleep / cancellation |
| B. Node 的 `setInterval` | 裸 `setInterval(1h)` | 代码量最小 | 上一轮未完成时下一轮会叠（并发）；cancellation 容易忘；shutdown 时可能卡住 timer |
| C. 单独 worker 进程 | `astack-server worker` 子进程 | 隔离；崩溃不影响 HTTP | 需要 IPC；额外进程管理；与 daemon.pid 语义冲突 |
| D. 前端定时触发 HTTP | 用户打开 Web UI 时前端 setInterval 调 refresh | 不改 daemon | 用户不开 Web → 永远不跑；多 tab 叠触发 |

**选 A**。理由：daemon 已常驻，无需引入新进程；while-sleep + AbortController 是 10 行的代码，避免 `setInterval` 的叠加陷阱。

#### 3.1.2 dirty + behind 冲突怎么办

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 自动 `git stash → pull --ff-only → stash pop` | 尝试自动化 | 成功路径用户无感 | stash pop 冲突时工作树留 marker；用户下次打开 repo 看到 merge 半成品；违"不丢数据"边界 |
| B. 自动 `git pull --rebase` | rebase on top | 历史线性 | rebase 冲突同样留半成品；且 force-push 需要 —— 违 Git Safety Protocol |
| **C. 安全停泊（needs-attention）** | 检测到 dirty+behind / divergent / push 被拒 直接停；记录结构化 reason；SSE 广播；UI 橙标；复用 v0.5 resolve UI 人工处理 | 从不破坏工作树；从不 force-push；用户看见问题；复用现有 UI | 需要用户介入；首次实现带来一个新状态机 |
| D. 放弃 auto-push，只 auto-pull | 降级 | 最稳 | 用户诉求"本地有改动就 push"没满足；`two-way sync` 标签继续撒谎 |

**选 C**。理由：
- **不丢数据**是绝对底线（Git Safety Protocol "never force-push", "avoid rewriting history"）。
- Astack 已经有冲突解决 UI（v0.5），**这是最好的复用机会** —— auto-sync 的冲突产物正好是 resolve UI 的输入。
- needs-attention 状态在数据面只是 repo 表的 2 列（`last_sync_status` + `last_sync_error_detail`），小成本。

#### 3.1.3 "本地有改动就 commit" 的 commit message 怎么写

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 固定字符串 `astack-auto-sync` | 不带时间 | 最短 | 同一个 repo 多次自动 commit 在历史里全同名，无法区分 |
| **B. `astack-auto-sync: YYYY-MM-DD HH:mm`** | 带触发时间 | 可追溯；与用户手动 commit 明显区分 | message 稍长 |
| C. `astack-auto-sync: <list of changed files>` | 列变更文件 | 更具体 | 超长；文件名变化时 diff 已有 |
| D. 复用 user.name / email 的 "Signed-off-by" | 标识 auto 路径 | 与人工 commit 彻底区分 | 项目的 commit convention 可能禁用 sign-off |

**选 B**。理由：带时间戳足以区分；commit author / committer 会带 git 全局配置的 name+email（本仓库是 `zerovoxxx / neolue42@gmail.com`），这点用户已知。

#### 3.1.4 配置面的最小暴露

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 只有 env（不暴露 UI） | 开发者友好 | 简洁 | 普通用户无法一键停 |
| **B. ReposPage 顶部一个总开关 + env 覆盖** | UI 一个 switch；env 优先级高于配置文件 | 覆盖 99% 场景；env 用于 CI / 一次性 debug | 需要读写 config.json |
| C. 每 repo 一个 opt-in 开关 | 细粒度 | 灵活 | 状态爆炸；用户第一次看就要决策 N 次 |
| D. Settings tab 专区 | 聚合所有 auto-* 配置 | 规范 | 当前还没 Settings tab；本迭代只有 1 个配置不值得铺 |

**选 B**。理由：1 个 switch 覆盖开关；env 保留给运维 / 开发；`~/.astack/config.json` 仅记录用户 UI 上 toggle 的覆盖值（默认 `true`，UI 显式 off 才写 `false`）。

### 3.2 选型结论

- **调度器**：daemon 内 async while-sleep 循环（方案 3.1.1-A）
- **冲突**：安全停泊 needs-attention，复用 v0.5 resolve UI（方案 3.1.2-C）
- **commit 信息**：`astack-auto-sync: YYYY-MM-DD HH:mm`（方案 3.1.3-B）
- **配置**：ReposPage 顶部单开关 + env 覆盖（方案 3.1.4-B）

---

## 4. 详细设计

### 4.1 新服务：`AutoSyncService`

位置：`packages/server/src/services/auto-sync.ts`（新文件）。

```ts
export interface AutoSyncServiceDeps {
  readonly db: AstackDb
  readonly events: EventBus
  readonly logger: Logger
  readonly git: {
    fetch(p: string): Promise<void>             // 新增 primitive（见 §4.2）
    statusWithAhead(p: string):                 // 新增
      Promise<{ clean: boolean; ahead: number; behind: number; branch: string }>
    pullFfOnly(p: string): Promise<void>        // 新增（明确 --ff-only 语义独立命名）
    /**
     * 注意：author 由 caller 显式传入，AutoSync 不读全局 `gitAuthor` DI。
     * AutoSync 在每次 syncOne(custom) 入口处调 `getLocalIdentity(p)`：
     *   - 返回 {name,email} → 传入 commitAll
     *   - 返回 null → 直接 needs_attention("commit_failed", "no_local_git_identity")
     *     不静默回落到全局 gitAuthor（避免跨 custom repo 身份污染，见 §8 风险 #2）
     */
    commitAll(p: string, msg: string, author: { name: string; email: string }):
      Promise<{ sha: string } | { skipped: "no_changes" }>
    push(p: string): Promise<void>              // 新增（独立暴露，区别于 gitCommitAndPush 原子操作）
    /** 新增 primitive：读取 repo local git config 的 user.name/user.email。
     *  执行 `git config --local user.name` / `git config --local user.email`，
     *  任一为空或命令失败 → 返回 null（不读 --global，AutoSync 不复用全局 gitAuthor）。 */
    getLocalIdentity(p: string): Promise<{ name: string; email: string } | null>
  }
  readonly config: {
    enabled: boolean
    intervalMs: number
    jitterMs: number
  }
}

export class AutoSyncService {
  private abort: AbortController | null = null
  /**
   * Instance-level reentrancy guard. Single-daemon-instance invariant
   * (daemon.pid 唯一) means one AutoSyncService instance suffices.
   * 上一轮 cycle 未结束（通常因网络慢）时，新一轮 wake 命中 `inflight === true`
   * 直接 return（见 runCycle 实现）：**不写 DB、不 emit attention 事件、不发 cycle_completed
   * 事件**，仅 `logger.warn("auto_sync.cycle_skipped", { reason: "previous_cycle_running" })`
   * 一行；待当前 cycle 完成后下一次 wake 自然恢复。
   */
  private inflight = false

  start(): void { /* 挂 loop */ }
  async stop(): Promise<void> { /* abort + await last cycle */ }

  async runCycle(): Promise<AutoSyncCycleSummary> { /* 内部用，也可被 test 直调 */ }
  async syncOne(repoId: string): Promise<AutoSyncOutcome> { /* 单 repo 决策 */ }
}
```

**生命周期挂载点**：

- `daemon.ts::startDaemon` 末尾：`if (config.autoSync.enabled) autoSyncService.start()`
- `daemon.ts::DaemonHandle.close()` 开头：`await autoSyncService.stop()`（在 `server.close()` 之前，让 cycle 能优雅终止）
- 冷启动延迟：`start()` 内先 `await sleep(60_000)` 再进 loop 第一轮，避免 daemon 刚起时抢 SQLite / 同用户 terminal 里 git 操作。

**循环主体**（`start()` 内部）：

```ts
this.abort = new AbortController()
const signal = this.abort.signal
void (async () => {
  await sleepAbortable(60_000, signal)
  while (!signal.aborted) {
    try {
      await this.runCycle()
    } catch (e) {
      this.deps.logger.error("auto_sync.cycle_crashed", { error: asErrorPayload(e) })
      // 不 rethrow：单轮失败不影响后续
    }
    const jitter = Math.floor(Math.random() * this.deps.config.jitterMs)
    await sleepAbortable(this.deps.config.intervalMs + jitter, signal)
  }
})()
```

**并发锁**：模块级 `inflight: boolean`。如果上一轮没跑完（比如网络慢），下一轮的 while 循环虽然按时 wake up，但 `runCycle` 开头 `if (inflight) return { skipped: "previous_cycle_running" }` 直接跳过。**且**每个 repo 的 `syncOne` 开头要 acquire v0.5 引入的 `projectBootstrapLockKey` 等价的跨服务锁（§A3），避免和手动 Refresh / SyncService.syncProject 冲撞。

### 4.2 `git.ts` 新增 primitive

在 `packages/server/src/git.ts` 加 3 个函数（复用 simple-git）：

```ts
export async function gitFetch(localPath: string): Promise<void> {
  const g = simpleGit(localPath)
  await g.fetch(["--all", "--prune"])
}

export async function gitStatusWithAhead(localPath: string): Promise<{
  clean: boolean; ahead: number; behind: number; branch: string
}> {
  const g = simpleGit(localPath)
  const s = await g.status()
  return {
    clean: s.isClean(),
    ahead: s.ahead,
    behind: s.behind,
    branch: s.current ?? "HEAD",
  }
}

export async function gitPullFfOnly(localPath: string): Promise<void> {
  const g = simpleGit(localPath)
  await g.pull(["--ff-only"])  // 明确写出 --ff-only；现有 gitPull 行为一致但不显式
}
```

**为什么不直接用现有 `gitPull`**：现有 `gitPull (git.ts:60-63)` 已经传 `["--ff-only"]`，行为上与 `gitPullFfOnly` 等价。AutoSync 仍单独引入 `gitPullFfOnly` 的理由：

1. **语义独立命名**，避免未来某次重构修改 `gitPull` 行为牵连 AutoSync 的 ff-only 不变式（v0.6 / v0.10 已经多次扩 `gitPull` 调用方的语义，未来可能演化出"非 ff 时降级到 fetch + 报告"等渐进语义）。
2. **AutoSync 的语义是"非 ff 立即失败 → needs-attention"**，命名上要与"普通 pull"区分。
3. 与 §A1 "AutoSync 不复用 RepoService.refresh / SyncService" 的隔离原则一致 —— 调用栈和 primitive 命名空间都独立。

**`commitAll` 复用既有的 `gitCommitAndPush`**？不。`gitCommitAndPush` 是 commit + push **原子**操作，AutoSync 需要分开：先 commit，再根据 behind 决定 push 时机 / 中断 push。所以拆成：

```ts
export async function gitCommitAll(
  localPath: string,
  message: string,
  author: { name: string; email: string }
): Promise<{ sha: string } | { skipped: "no_changes" }> {
  const g = simpleGit(localPath)
  await g.add(".")
  const status = await g.status()
  if (status.isClean()) return { skipped: "no_changes" }
  const commit = await g.commit(message, undefined, {
    "--author": `${author.name} <${author.email}>`,
  })
  return { sha: commit.commit }
}
```

`gitPush` 也单独暴露出来（之前是 `gitCommitAndPush` 内部的私有步骤）：

```ts
export async function gitPush(localPath: string): Promise<void> {
  const g = simpleGit(localPath)
  await g.push()
}
```

**既有 `gitCommitAndPush` 不动**（单 skill 同步仍然需要原子性）。

**author 来源新 primitive `gitGetLocalIdentity`：**

AutoSync 不复用 `app.ts:120-123` 里全局注入的 `gitAuthor: { name: "Astack", email: "astack@localhost" }`（见 §A1 / §8 风险 #2 的论证）。新增：

```ts
export async function gitGetLocalIdentity(
  localPath: string
): Promise<{ name: string; email: string } | null> {
  const g = simpleGit(localPath)
  try {
    // 注意 ["--local"] —— 不读 --global，避免跨 custom repo 身份污染
    const name = (await g.raw(["config", "--local", "user.name"])).trim()
    const email = (await g.raw(["config", "--local", "user.email"])).trim()
    if (!name || !email) return null
    return { name, email }
  } catch {
    // simple-git 在 config 未设时会抛 GitError；视作 null
    return null
  }
}
```

返回 null 时 `AutoSyncService.syncOne` 直接进入 `needs_attention("commit_failed", detail:"no_local_git_identity")`，文案引导用户 `git -C <repo> config --local user.name "..."`。

### 4.3 `syncOne` 的决策树

```
input: repo (from DB)
output: AutoSyncOutcome = {
  repo_id, repo_kind,
  status: "ok" | "noop" | "needs_attention" | "skipped",
  reason?: string,       // for needs_attention / skipped
  detail?: string,       // human readable
  changed_files?: number,
  pushed?: boolean,
  pulled?: boolean,
  committed_sha?: string,
}

──────── open-source branch ────────
1. git fetch
2. clean = gitIsClean()
3. if (!clean) → status:"skipped", reason:"dirty_working_tree"
   (用户需去 Repos 页点 Force pull — v0.10 的路径)
4. git pullFfOnly()
   on success → status:"ok", pulled: headMoved
   on fail (non-ff) → status:"needs_attention", reason:"pull_not_fast_forward"
   (open-source 镜像出 divergent 通常意味 upstream force-push，极罕见)

──────── custom branch ────────
1. git fetch
2. s = gitStatusWithAhead()
3. dispatch by (clean, ahead, behind):
   (T,0,0)  → status:"noop"
   (T,0,>0) → pullFfOnly → status:"ok", pulled:true
              on ff fail → "needs_attention"("pull_not_fast_forward")
   (T,>0,0) → push → status:"ok", pushed:true
              on push rejected → "needs_attention"("push_rejected")
   (T,>0,>0) → "needs_attention"("divergent_branches")
   (F,*,0)  → commitAll(msg, author) → push
              commit 成功但 push 失败 → "needs_attention"("push_rejected",
                                      detail 带 local_sha 让用户知道 commit 已本地落定)
   (F,*,>0) → "needs_attention"("dirty_and_behind")
              (不动工作树：不 stash，不 commit；让用户决定)
```

**关键约束**：
- **任何 needs_attention 分支都不尝试修复**。不 stash、不 rebase、不 reset、不 force-push。
- `commitAll` 和 `push` 之间出错（commit 成功 push 失败），**保留 commit**，让用户下次打开 terminal `git push` 就能接。
- `fetch` 失败（网络 / 鉴权）→ `status:"needs_attention"`, `reason:"fetch_failed"`，不消费后续步骤。

### 4.4 DB schema 扩展

**现状勘察（grep 验证）：** `packages/server/src/db/schema.ts` 注释明言：

> *"Single source of truth for the shape of the database. During the pre-1.0 development phase this file represents the **current** schema — there is no version table and no migration machinery."*

`packages/server/src/db/` 目录下**没有任何 migration 文件**（`find packages/server/src/db -name "*.sql" -o -name "00*.ts"` 零命中），仓库使用单一 `SCHEMA_DDL` 常量 + `CREATE TABLE IF NOT EXISTS` 一次性建表的模式。schema 改动通过编辑 `schema.ts` + 用户重启 daemon（pre-1.0 工作流允许 `rm -f ~/.astack/astack.sqlite3*` 重建）落地。

**因此本迭代的 schema 扩展走如下双路径，PR1 内一次性完成：**

#### 4.4.1 路径 A — 编辑 `schema.ts::SCHEMA_DDL`（建表初始路径）

在 `skill_repos` 表 DDL 末尾追加 4 列（保持 `last_synced` 之后、`created_at` 之前）：

```sql
CREATE TABLE IF NOT EXISTS skill_repos (
  ...
  last_synced TEXT,
  /* v0.11 auto-sync: per-repo cycle outcome cache. Decoupled from
     last_synced (which is the mirror HEAD timestamp set by RepoService.refresh)
     to avoid polluting "synced X ago" intuition with auto-sync no-ops. */
  last_auto_sync_at      INTEGER,  -- epoch ms; null = never auto-synced
  last_auto_sync_status  TEXT      -- 'ok' | 'noop' | 'skipped' | 'needs_attention'
                         CHECK (last_auto_sync_status IS NULL OR
                                last_auto_sync_status IN ('ok','noop','skipped','needs_attention')),
  last_auto_sync_reason  TEXT,     -- error/skip code (see §4.3)
  last_auto_sync_detail  TEXT,     -- human readable, optional
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

新数据库创建走此路径，4 列直接随建表落地。

#### 4.4.2 路径 B — `db/connection.ts::initDb` 加幂等 `ALTER TABLE`（已有 DB 升级路径）

由于 `CREATE TABLE IF NOT EXISTS` 不会在已建表上加列，对**老用户已存在的 DB**，需在 `initDb()` 跑完 SCHEMA_DDL 之后追加幂等 ALTER：

```ts
// db/connection.ts::initDb 内，SCHEMA_DDL 执行后追加：
const AUTOSYNC_COLUMNS_v0_11 = [
  ["last_auto_sync_at",     "INTEGER"],
  ["last_auto_sync_status", "TEXT"],
  ["last_auto_sync_reason", "TEXT"],
  ["last_auto_sync_detail", "TEXT"],
] as const

for (const [col, type] of AUTOSYNC_COLUMNS_v0_11) {
  try {
    db.exec(`ALTER TABLE skill_repos ADD COLUMN ${col} ${type}`)
  } catch (e) {
    // SQLite 在重复添加列时抛 "duplicate column name"；视作幂等成功
    if (!String(e).includes("duplicate column")) throw e
  }
}
```

**为什么不用 `IF NOT EXISTS`：** SQLite 仅 3.35+ 支持 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`；本仓库依赖 `better-sqlite3` 的版本未确认包含该特性。try/catch 吞 "duplicate column" 是更保守的兼容方案。**实施时 PR1 需 grep `better-sqlite3` 版本并在 commit message 备注。**

向后兼容：旧 `skill_repos` 行新增 4 列后值为 NULL，前端按 NULL 展示"Never auto-synced"。

**为什么不复用 `last_synced`**：`last_synced` 是 `RepoService.refresh` 更新的字段，语义是"镜像的 HEAD 时间"；auto-sync 的"上次尝试时间"和"上次结果"语义不同，混用会让 Repos 页的 "synced 1h ago" 行为被污染（auto-sync 哪怕只是 noop 也会刷时间 → 用户失去"镜像新不新"的直觉）。**保持 `last_synced` 的语义不变**，新增独立列。

### 4.5 Shared 层

#### 4.5.1 Domain 新类型

`packages/shared/src/domain.ts`：

```ts
export type AutoSyncStatus = "ok" | "noop" | "skipped" | "needs_attention"

export interface AutoSyncState {
  last_auto_sync_at: number | null
  last_auto_sync_status: AutoSyncStatus | null
  last_auto_sync_reason: string | null
  last_auto_sync_detail: string | null
}
```

`SkillRepo` 类型扩展这 4 字段（或用组合 type，按现有风格选）。

#### 4.5.2 SSE 事件

`packages/shared/src/schemas/events.ts`：

```ts
export const RepoAutoSyncAttentionPayloadSchema = z.object({
  repo_id: z.string(),
  repo_name: z.string(),
  repo_kind: RepoKindSchema,
  reason: z.enum([
    "dirty_working_tree",          // open-source only
    "pull_not_fast_forward",
    "push_rejected",
    "divergent_branches",
    "dirty_and_behind",
    "fetch_failed",
    "commit_failed",               // custom dirty 路径 commit 阶段失败（含 no_local_git_identity）
  ]),
  detail: z.string().optional(),
  occurred_at: z.number(), // epoch ms
}).strict()

export type RepoAutoSyncAttentionPayload =
  z.infer<typeof RepoAutoSyncAttentionPayloadSchema>

export const RepoAutoSyncCycleCompletedPayloadSchema = z.object({
  cycle_id: z.string(),       // uuid v4，写入 daemon.log 同一行用作关联
  started_at: z.number(),     // epoch ms
  duration_ms: z.number(),
  repos_total: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  noop: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  needs_attention: z.number().int().nonnegative(),
}).strict()

export type RepoAutoSyncCycleCompletedPayload =
  z.infer<typeof RepoAutoSyncCycleCompletedPayloadSchema>
```

`EventType` 枚举 + discriminated union 加：
- `RepoAutoSyncAttention = "repo.auto_sync_attention"`
- `RepoAutoSyncCycleCompleted = "repo.auto_sync_cycle_completed"`

**两个事件的用途分工：**

- `repo.auto_sync_attention` — per-repo，状态变化时 emit（首次进入 needs_attention，或 reason 变化）。前端 ReposPage 据此 invalidate 单 repo 查询并显示橙标。
- `repo.auto_sync_cycle_completed` — per-cycle，每轮 cycle 结束广播一次，payload 仅含 aggregate 计数（不含 per-repo 列表，避免 SSE stream 数据量爆炸）。前端据此 invalidate 整个 repos query key 拉最新列表。

#### 4.5.3 HTTP Schema

`packages/shared/src/schemas/repos.ts`：

```ts
export const DismissAutoSyncAttentionRequestSchema = z.object({}).strict()
export const DismissAutoSyncAttentionResponseSchema = z.object({
  repo: SkillRepoSchema,  // 清除 attention 后的 repo（last_auto_sync_status 置 null）
}).strict()

export const GetAutoSyncConfigResponseSchema = z.object({
  enabled: z.boolean(),
  interval_ms: z.number(),
  jitter_ms: z.number(),
  source: z.enum(["env", "config_file", "default"]),
}).strict()

export const UpdateAutoSyncConfigRequestSchema = z.object({
  enabled: z.boolean(),
}).strict()
```

### 4.6 HTTP 路由

`packages/server/src/http/routes.repos.ts` 加：

```
POST /api/repos/:id/dismiss-auto-sync-attention
  → body: {} (strict)
  → auth: none (与其他 repo 路由一致)
  → effect: UPDATE repos SET last_auto_sync_status=NULL, last_auto_sync_reason=NULL,
            last_auto_sync_detail=NULL WHERE id=:id (last_auto_sync_at 保留，记录最后尝试时间)
  → response: { repo }
  → SSE: 不广播新事件（UI 已经拿到 response 足够），但 emit 一次 repo.auto_sync_cycle_completed 也可接受。
          决策：不发 SSE（减少噪音）。调用方 web 自己 optimistic update。
```

新路由文件 `packages/server/src/http/routes.auto-sync.ts`：

```
GET  /api/auto-sync/config
  → response: GetAutoSyncConfigResponseSchema
POST /api/auto-sync/config
  → body: UpdateAutoSyncConfigRequestSchema
  → effect: 写 ~/.astack/config.json 的 auto_sync.enabled 字段（始终写，
            即便 env 已设也写，保证用户的偏好持久化；env 移除后会回退到 config.json 值）
  → side effect（区分 env 是否锁定）:
      - **env 已设**（`process.env.ASTACK_AUTOSYNC_ENABLED !== undefined`）:
          仅写 config.json,**不**调用 autoSyncService.start() / stop()；
          response.source = "env"，response.enabled 取 env 的值（与请求 body 可能不同）。
          前端 UI 见 source==="env" 时本就 disable switch（§4.7.1.1），
          诚实反映"你的 toggle 已记录但当前不生效"。
      - **env 未设**:
          写完 config.json 后按 enabled 变化触发：
            disabled → enabled : autoSyncService.start()
            enabled → disabled : await autoSyncService.stop()
            状态未变 : no-op
          response.source = "config_file"，response.enabled = body.enabled。
```

**为什么不在 env 锁定下也触发 start/stop**：会出现"env=false + UI toggle on → AutoSync 真起来跑了 + UI 显示锁定 off" 的不一致 —— 决策权属 env，UI 操作不应越权。

### 4.7 前端

#### 4.7.1 ReposPage 变更

`packages/web/src/pages/ReposPage.tsx`：

1. **顶部右上角**（原 `Register repo` 按钮左侧）新增一个 `<Switch>` + label `Auto-sync (~1h)`。
   - 初始状态从 `api.getAutoSyncConfig()` 获取。
   - toggle → `api.updateAutoSyncConfig({ enabled })`。
   - env 锁定（source === "env"）时 switch 渲染为 readonly + tooltip "Controlled by ASTACK_AUTOSYNC_ENABLED"。

2. **RepoCard** 展开区（点整卡后的 skills 列表上方）新增 "Sync state" 区段：
   - 正常（`last_auto_sync_status in {"ok","noop",null}`）：不渲染或渲染小灰字 "auto-synced 12 min ago · no changes"。
   - `needs_attention`：橙色 banner，标题 "Needs attention: {reason}"，详情展开 `last_auto_sync_detail`；
     - **Dismiss 按钮**：调 `POST /api/repos/:id/dismiss-auto-sync-attention`；toast "Attention cleared, next cycle will retry"；点击后 **`queryClient.invalidateQueries(reposKey)` 强制刷新**（与 v0.10 ReposPage Refresh 后的 invalidate 风格对齐，防止乐观更新失败时 UI 状态错乱）。
     - **Resolve 按钮**（仅对 "divergent_branches" / "dirty_and_behind" 显示，且 `repo.kind === "custom"`）：
       - 查询订阅该 repo 的项目列表（前端通过 `api.getProjects()` 已有数据 + 本地 join `subscriptions[]` 计算）：
         - **0 个项目订阅**：按钮文案改为 "Open in terminal"，点击复制 `~/.astack/repos/<name>/` 路径到剪贴板，提示 "Run `git status` there to resolve"。
         - **1 个项目订阅**：直接导航到该项目 Subscriptions tab → 预调 `openResolveDrawer(repoId)`，复用 v0.5 的 resolve UI。
         - **多个项目订阅（>=2）**：弹一个轻量 dropdown / popover 让用户选目标项目（列出项目名 + 路径），用户选定后再导航。dropdown 顶部加一行 "Or [Open in terminal]" fallback，永远不让用户卡住。

3. **删除废弃开关**：原废弃 "Auto-sync on focus" 代码全部清除：
   - 文件：`packages/web/src/components/project/ProjectSettingsPanel.tsx`（**注意：不在 ReposPage.tsx**）
   - 涉及行：
     - `line 26`: 注释 `// localStorage key: astack:project:<id>:auto_sync`
     - `line 38`: ` localStorage.setItem(\`astack:project:${projectId}:auto_sync\`, ...)` 等读写
     - `line 74`: ` Auto-sync on focus` checkbox label + 对应 JSX 区块
   - 验证脚本（PR3 实施后跑）：`rg "auto_sync|auto-sync-on-focus" packages/web/src` **必须零命中**（v0.11 的"Auto-sync (~1h)"开关 key 是 `astack:auto_sync_enabled` 风格，不与废开关 grep 命中冲突；若有冲突 PR3 改新开关 key）。

#### 4.7.2 SSE 订阅

`api.ts` 新增 `RepoAutoSyncAttentionEvent` / `RepoAutoSyncCycleCompletedEvent` 类型；`ReposPage` 订阅两者并调 `invalidateRepos()`（既有 query key）。

### 4.8 配置加载

`packages/server/src/config.ts`：

```ts
export interface AutoSyncConfig {
  enabled: boolean
  intervalMs: number
  jitterMs: number
  source: "env" | "config_file" | "default"
}

export function loadAutoSyncConfig(): AutoSyncConfig {
  // env 最高优先级
  if (process.env.ASTACK_AUTOSYNC_ENABLED !== undefined) {
    return {
      enabled: process.env.ASTACK_AUTOSYNC_ENABLED === "true",
      intervalMs: parsePositiveInt(process.env.ASTACK_AUTOSYNC_INTERVAL_MS, 3_600_000),
      jitterMs: parsePositiveInt(process.env.ASTACK_AUTOSYNC_JITTER_MS, 300_000),
      source: "env",
    }
  }
  // config.json 次优先
  const fileCfg = readConfigJson()?.auto_sync
  if (fileCfg) return { ...defaults, ...fileCfg, source: "config_file" }
  // default
  return { enabled: true, intervalMs: 3_600_000, jitterMs: 300_000, source: "default" }
}
```

---

## 5. 信息架构与交互

### 5.1 UI 结构

```
ReposPage
├─ Header
│  ├─ Title "Repos"
│  ├─ [NEW] Switch "Auto-sync (~1h)"     ← env locked tooltip 态
│  └─ Button "Register repo"
└─ RepoList
   └─ RepoCard (each)
      ├─ Header row (name, tags, actions: Refresh / Force pull? / Remove)
      │  └─ [NEW when attention] 橙色 AlertBadge "Needs attention"
      └─ Expanded body
         ├─ [NEW] SyncStateSection (only when expanded)
         │  └─ If needs_attention:
         │     ├─ Reason + detail
         │     ├─ Button "Dismiss"
         │     └─ Button "Resolve" (conditional) or "Open in terminal"
         │     If ok/noop/null: 一行灰字 "auto-synced X ago"
         └─ SkillList (现有)
```

### 5.2 用户流程

#### 流程 1：happy path（custom repo，用户 push 代码）

1. 用户在 `~/path/to/astack-skills/` 编辑了 `skills/foo.md`
2. 约 1h 后 auto-sync cycle 触发
3. `syncOne(custom, dirty, behind=0)` → commitAll + push → `status:"ok"`
4. 无 UI 通知（默默 push）
5. 用户下次打开 ReposPage 或展开该卡片看到 "auto-synced 10 min ago · pushed 1 commit"

#### 流程 2：happy path（open-source repo，上游更新）

1. anthropic 仓库有新 skill
2. cycle 触发 → `syncOne(open-source, clean)` → pullFfOnly → `status:"ok"`
3. ReposPage SSE 收到 `repo.auto_sync_cycle_completed` → invalidate → UI 刷新 skill 数

#### 流程 3：needs-attention（divergent）

1. 用户两台机器都在改 astack-skills，同一分支，都没 push
2. 机器 A auto-sync：先 commit 本地改动 + push → OK
3. 机器 B auto-sync：detect ahead>0 + behind>0 → `needs_attention("divergent_branches")`
4. SSE 广播 → ReposPage 的机器 B 实例 UI 橙标
5. 用户点 Resolve → 导航到订阅该 repo 的项目 Subscriptions tab → resolve 流程
6. 手动合好后下次 cycle 自动清 attention（因为新 cycle 成功时会 UPDATE status）

#### 流程 4：env 锁定

1. 管理员设置 `ASTACK_AUTOSYNC_ENABLED=false` 启动 daemon
2. ReposPage 顶部 switch 显示 off + 禁用态 + tooltip "Controlled by ASTACK_AUTOSYNC_ENABLED"
3. 用户点 switch 无反应；要改得去 env

---

## 6. 技术实现

### 6.1 数据模型

见 §4.4（DB migration）+ §4.5.1（domain type）。

### 6.2 接口定义

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/repos/:id/dismiss-auto-sync-attention` | `{}` | `{ repo }` |
| GET | `/api/auto-sync/config` | — | `{ enabled, interval_ms, jitter_ms, source }` |
| POST | `/api/auto-sync/config` | `{ enabled }` | `{ enabled, interval_ms, jitter_ms, source }` |

SSE 事件：
- `repo.auto_sync_attention`（见 §4.5.2）
- `repo.auto_sync_cycle_completed`

### 6.3 架构决策锚点

#### §A1 — AutoSyncService **不**调 `RepoService.refresh` / `SyncService.syncProject`

AutoSync 是独立服务，内部直接调 `git.ts` primitive。理由：

1. **语义清晰**：`RepoService.refresh` 的日志 key 是 `repo.refresh.*`，SyncService 的是 `sync.*`。AutoSync 若复用它们，日志会把"用户主动 refresh"和"后台 auto-sync"混在同一 key 下，事后排查困难。
2. **事件隔离**：`RepoService.refresh` 会 emit `repo.refreshed` SSE；若 AutoSync 调它，前端会每小时收到一次 `repo.refreshed` 风暴（每个 repo）。AutoSync 的 cycle completed 是独立事件类型，前端可选择订阅。
3. **决策树不同**：Refresh 只做 pull（force 分支是 v0.10 加的 reset）；SyncService.syncProject 是 skill-level 三路同步；AutoSync 的决策树是 repo-level 四象限，和两者都不同。强行复用会把 4 个判断硬塞进 refresh，恶化 refresh 的可读性。

**代价**：git.ts primitive 会被三个消费方用（SyncService / RepoService / AutoSyncService）。primitive 本身稳定，这是好事 —— 护栏集中在 primitive 层面。

#### §A2 — 冲突策略对 R6（跨 Service 同类 git 操作护栏复用）的呼应

v0.6 引入的 R6 要求"跨 Service 同类 git 操作必须复用同一护栏或显式声明放行"。本迭代的情况：

- **`gitFetch`**：AutoSync 独占，没有护栏需求（fetch 不改本地）。
- **`gitPullFfOnly`**：AutoSync 独占（SyncService 不做 ff-only，它有 auto-heal）。
- **`gitCommitAll`**：AutoSync 独占。
- **`gitPush`**：与 SyncService.pushOne 重叠。SyncService.pushOne 的护栏是 "reject open-source repo"（`sync.ts:478-485`）。AutoSync 不会对 open-source 调 `gitPush`（决策树保证），所以**无需复用 SyncService 的护栏代码**，但 spec 必须显式声明这一点（R6 的"显式放行"条款）。

**显式声明**：AutoSync 的 custom-branch 决策树隐含 "only custom 走到 push"。在 `AutoSyncService.syncOne` 的实现注释里写明：
```
// Invariant: this branch only reachable when repo.kind === "custom".
// open-source branch short-circuits at (line XX). We therefore skip
// the REPO_READONLY guard that SyncService.pushOne enforces.
```

#### §A3 — 跨服务锁复用 `projectBootstrapLockKey`？NO

v0.5 引入的 `projectBootstrapLockKey(projectId)` 是 **per-project** 锁，而 AutoSync 的 `syncOne` 是 **per-repo**。一个 repo 可能被多个项目订阅。复用 project 锁会让 AutoSync 需要先查所有订阅该 repo 的项目并逐一 acquire —— 死锁风险与复杂度激增。

**新增** `repoAutoSyncLockKey(repoId)`，per-repo。手动 Refresh / SyncService 路径**不 acquire 这个锁**（它们的工作语义不同），所以手动 Refresh 和 AutoSync 可能在同一 repo 上**同时**对 git 操作 —— simple-git / git CLI 本身在同目录并发时的行为 unspecified。

**减轻策略**：
- 手动 Refresh 在 `RepoService.refresh` 开头 acquire `repoAutoSyncLockKey` 的 **try-acquire**（非阻塞）：如果 AutoSync 正在处理该 repo，refresh 直接返回 `skipped_reason: "auto_sync_in_progress"`（v0.10 已有 skipped_reason 范式，enum 扩一个值）。
- AutoSync 的 `syncOne` 反过来在该锁内进行。

**向后兼容性**：v0.10 的 `RefreshRepoResponseSchema.skipped_reason` 是 `z.enum(["dirty_working_tree"]).optional()`，本迭代把 enum 扩到 `z.enum(["dirty_working_tree", "auto_sync_in_progress"])`。这是加值不是改值，非 breaking。

**SyncService.syncProject 与 AutoSync 的同 repo 并发：** SyncService.syncProject 通过 `pullOne` 触达 git ops，本迭代选择**显式放行**这条并发路径，理由：

1. SyncService.syncProject 在 v0.5 / v0.6 已稳定运行，对 working copy 走 `mirrorDir` 拷贝模式，对镜像走 `gitPull (--ff-only)`，**不写 destructive 操作**（reset / push / commit 都不在它的路径上）。
2. AutoSync 对 open-source 也只走 fetch + ff-only pull（与 SyncService 同语义），对 custom 在 dirty 时才 commit。
3. **两条路径的 git 操作集合无交集**：SyncService 不 push、不 commit、不 reset；AutoSync 的 reset 路径不存在（决策树明示）。即便同时操作同一镜像目录，simple-git 内部对 `git fetch` / `git pull --ff-only` 的并发请求由 git 自身的 `.git/index.lock` 互斥处理（同一 ref 的修改加锁，不同 ref 的读取并发安全）。
4. **R6 显式放行条款已对此声明**：两条路径无需复用同一护栏，因 git 操作集合不重叠；仅 `repoAutoSyncLockKey` 用于隔离"手动 Refresh / dismiss 的 DB 写"与"AutoSync 的 DB 写"。

若 v0.12+ AutoSync 引入并行多 repo cycle 或 SyncService 加 destructive 操作，需在那一版重新评估并发模型。

#### §A4 — Git primitive 的鉴权 / 错误分类

`simple-git` 的 push / fetch 鉴权失败会抛 `GitError`，messsage 里带 stderr。AutoSync 需要区分：

| 错误类型 | reason 标签 |
|---|---|
| `fetch` 抛错，stderr 含 "Permission denied" / "could not read Username" / "fatal: Authentication failed" | `fetch_failed` + detail "authentication" |
| `fetch` 抛错，其他 | `fetch_failed` + detail（截断策略见下） |
| `pull --ff-only` 抛错，stderr 含 "Not possible to fast-forward" | `pull_not_fast_forward` |
| `push` 抛错，stderr 含 "rejected" + "non-fast-forward" | `push_rejected` + detail "non_fast_forward" |
| `push` 抛错，stderr 含 "protected branch" | `push_rejected` + detail "protected_branch" |
| `commit` 抛错（pre-commit hook 失败、`no_local_git_identity` 等） | `commit_failed` + detail（截断策略见下） |

**stderr 截断策略**（避免 "前 200 chars 把关键 fatal 行截掉"）：

```ts
function truncateStderr(stderr: string, max = 500): string {
  const fatal = stderr.split("\n").filter(l => l.startsWith("fatal:") || l.startsWith("error:"))
  if (fatal.length > 0) {
    const joined = fatal.join("\n")
    return joined.length > max ? joined.slice(0, max) + "..." : joined
  }
  // 无 fatal/error 标记则取 stderr 后 max 字符（保留最近的输出，git 通常把诊断放最后）
  return stderr.length > max ? "..." + stderr.slice(-max) : stderr
}
```

前端 RepoCard 展开 detail 区可滚动；不前端二次截断。

实现：`git.ts` 新增 `classifyGitError(e: unknown): AutoSyncErrorClass` helper，AutoSyncService.syncOne 的每个 await 外包 try/catch 调用它。

#### §A5 — R3 呼应（Schema 扩与 writer 原子绑定）

本迭代所有 schema 扩展与 writer 绑定：
- `RepoAutoSyncAttentionPayloadSchema`（新，含 `commit_failed` 枚举）+ `EventType.RepoAutoSyncAttention`（新）+ `AutoSyncService.syncOne` emit → 同 1 个 PR（PR1）。
- `RepoAutoSyncCycleCompletedPayloadSchema`（新）+ `EventType.RepoAutoSyncCycleCompleted`（新）+ `AutoSyncService.runCycle` 末尾 emit → 同 1 个 PR（PR1）。
- `RefreshRepoResponseSchema.skipped_reason` 扩 `"auto_sync_in_progress"` + `RepoService.refresh` try-acquire 路径写入 → 同 1 个 PR（PR1 搭便车）。
- DB schema 4 列扩展 + 4 列 writer（`AutoSyncService.persistOutcome` 私有方法 / Dismiss handler 的清空 UPDATE）+ domain type 扩展 → 同 1 个 PR（PR1）。
- HTTP-only schemas（`DismissAutoSyncAttentionRequest/Response`、`GetAutoSyncConfigResponse`、`UpdateAutoSyncConfigRequest`）随 PR2 一起进 — 这三个 schema 的 writer / handler 都在 PR2 的 routes 文件，按 R3 "schema 与最大写入点同 PR" 原则归 PR2。

**显式分工：** 凡 `AutoSyncService` 内部 emit / DB 写的 schema 全归 PR1；HTTP route handler emit / handle 的 schema 全归 PR2。两个 PR 的 schema 列表零交集。

#### §A6 — 配置面双源的优先级

ENV > config.json > hardcoded default。

POST /api/auto-sync/config 写 config.json 而非 env。response 的 `source` 字段诚实反映当前生效来源。前端 UI 依此决定 switch 是否可编辑。

这个方式避免了用户点 UI 关掉 auto-sync 但 env 有值导致 UI 说"enabled"而实际已关掉（或反之）的鬼畜场景。

### 6.4 PR 切分

按最小原子性 + reviewability：

- **PR1 — 后端核心（原子）**
  - `git.ts` 新 primitive（`gitFetch` / `gitStatusWithAhead` / `gitPullFfOnly` / `gitCommitAll` / `gitPush` / `gitGetLocalIdentity` / `classifyGitError`）
  - `AutoSyncService` 新文件
  - `daemon.ts` start/stop hook + 启动时 export `GIT_TERMINAL_PROMPT=0`
  - DB schema 改动（路径 A：`schema.ts::SCHEMA_DDL` 加 4 列；路径 B：`db/connection.ts::initDb` 内幂等 ALTER TABLE）
  - shared schemas（**仅后端用**）：`RepoAutoSyncAttentionPayloadSchema`（含 `commit_failed`）+ `EventType.RepoAutoSyncAttention` + `RepoAutoSyncCycleCompletedPayloadSchema` + `EventType.RepoAutoSyncCycleCompleted` + `RefreshRepoResponseSchema.skipped_reason` 扩 `auto_sync_in_progress` + `domain.ts::AutoSyncStatus / AutoSyncState`
  - `RepoService.refresh` try-acquire 锁 + `skipped_reason: "auto_sync_in_progress"` 路径
  - `lock.ts::repoAutoSyncLockKey(repoId)`
  - `config.ts::loadAutoSyncConfig` + `parsePositiveInt` utility（若未存在）
  - 全部后端单测（§7.1 的 T1 / T1.5 / T2 / T3 / T3.5 / T4–T12）

- **PR2 — HTTP 路由 + HTTP-only schemas**
  - shared schemas（**仅 HTTP route 用**）：`DismissAutoSyncAttentionRequestSchema` / `DismissAutoSyncAttentionResponseSchema` / `GetAutoSyncConfigResponseSchema` / `UpdateAutoSyncConfigRequestSchema`
  - `routes.auto-sync.ts`（GET / POST config，含 env 锁定下 not-trigger-start/stop 行为）
  - `routes.repos.ts::POST /:id/dismiss-auto-sync-attention`
  - HTTP 路由单测（§7.1 的 T13–T15）

- **PR3 — 前端**
  - `api.ts` 新方法 + 类型（含 `RepoAutoSyncAttentionEvent` / `RepoAutoSyncCycleCompletedEvent`）
  - `ReposPage.tsx` 顶部 switch + RepoCard Needs attention 区段 + Dismiss / Resolve 按钮（含多项目订阅 dropdown 分支）
  - **删除 `ProjectSettingsPanel.tsx:26-74` 的废弃 "Auto-sync on focus" localStorage 代码**（**不在 ReposPage.tsx**）
  - PR3 验证脚本：`rg "auto_sync\b|auto-sync-on-focus" packages/web/src` 命中数应 = "本 PR 新增的 'Auto-sync (~1h)' 开关 key 命中数"，**ProjectSettingsPanel 旧 key 必须零命中**
  - SSE 订阅 `repo.auto_sync_attention` + `repo.auto_sync_cycle_completed`
  - E2E（§7.1 的 T16–T17）

- **PR4 — 文档**
  - `docs/astack/INDEX.md` 追 v0.11 行
  - 已删除的历史 `BOUNDARIES.md` 同步：补 `repo.auto_sync_cycle_completed` 事件描述、补 `RefreshRepoResponseSchema.skipped_reason` 扩 `auto_sync_in_progress` 条目
  - 本 spec 状态 "评审中" → "SPEC（待实施）" → 实施完成后再切 "SHIPPED"
  - **不做** spec-lint 正则修复（见 §8 风险 #10：解耦至独立小迭代）

---

## 7. 验收标准

### 7.1 功能验收

编号清单（每条可独立验证）：

**后端单测**

1. T1：daemon 启动时 `config.enabled === true` → autoSyncService.start() 被调用；stop() 会等 in-flight cycle 完成后返回（单测用假的长跑 cycle 验证 abort 优雅）。
2. T1.5：daemon 启动时 `config.enabled === false` → autoSyncService.start() **不**被调用；后续 stop() no-op 不抛错。
3. T2：`runCycle()` 对每个 repo 依次调 `syncOne`；某 repo 抛错不影响其他 repo（per-repo try/catch，R4 规则延伸）。
4. T3：`syncOne(open-source, clean)` → 调 1 次 `gitFetch` + 1 次 `gitPullFfOnly` → `status:"ok"`。
5. T3.5：`syncOne(open-source, clean)` 但 `gitPullFfOnly` 抛 "Not possible to fast-forward" → `status:"needs_attention", reason:"pull_not_fast_forward"`（覆盖 §4.3 open-source 分支第 4 步的非-ff 路径）。
6. T4：`syncOne(open-source, dirty)` → 不调 pull → `status:"skipped", reason:"dirty_working_tree"`。
7. T5：`syncOne(custom, clean, ahead=0, behind=0)` → `status:"noop"`，无 git 写操作。
8. T6：`syncOne(custom, clean, ahead=0, behind=1)` → `pullFfOnly` → `status:"ok", pulled:true`。
9. T7：`syncOne(custom, clean, ahead=1, behind=0)` → `push` → `status:"ok", pushed:true`。
10. T8：`syncOne(custom, clean, ahead=1, behind=1)` → 不调 pull/push → `status:"needs_attention", reason:"divergent_branches"`。
11. T9：`syncOne(custom, dirty, behind=0)` → `getLocalIdentity` 返回有效身份 → `commitAll` + `push` → `status:"ok", committed_sha:<sha>, pushed:true`。子用例 T9a：`getLocalIdentity` 返回 null → `needs_attention("commit_failed", detail:"no_local_git_identity")`，**不**调 commitAll。子用例 T9b：commit 失败（hook reject） → `needs_attention("commit_failed")`；T9c：commit 成功 push 失败 → `needs_attention("push_rejected")` + detail 带 `committed_sha`。
12. T10：`syncOne(custom, dirty, behind=1)` → 不动工作树 → `needs_attention("dirty_and_behind")`。
13. T11：fetch 抛 Authentication 错 → `needs_attention("fetch_failed")` + detail "authentication"。
14. T12：`runCycle` 期间手动 `RepoService.refresh` 该 repo → refresh 返回 `skipped_reason:"auto_sync_in_progress"`（§A3）。

**HTTP 路由单测**

13. T13：POST `/api/repos/:id/dismiss-auto-sync-attention` 将对应列清空 + response repo 的状态为 null。
14. T14：POST `/api/auto-sync/config` body `{enabled:false}` 时 env 已设 → 仍写 config.json，但 response `source:"env"` + `enabled:` 取 env 值。
15. T15：POST `/api/auto-sync/config` body `{enabled:false}` 且 env 未设 + 当前 service 在跑 → service.stop() 被调用。

**E2E**

16. T16：开 auto-sync 开关 → refresh daemon → 等 1 cycle（测试里 env 把 interval 调到 5s + jitter=0）→ ReposPage 能看到 "auto-synced X ago"。
17. T17：mock 一个 custom repo 到 `divergent_branches` 状态 → UI 橙色 Needs attention banner + Dismiss 按钮 + 点 Dismiss 后状态清除。

### 7.2 非功能验收

- **零丢数据**（必须人工审 PR1）：evaluate `AutoSyncService.syncOne` 所有分支的 git 操作序列，确认不存在任何分支会执行 `git reset --hard` / `git push --force` / `git stash pop`（stash 在本迭代完全不用）/ `git rebase` / `git merge` 自动 resolve。
- **daemon.log**：每轮 cycle 结束写一行 `auto_sync.cycle_completed`，格式：`{ cycle_id, started_at, duration_ms, repos_total, ok, noop, skipped, needs_attention }`。
- **资源占用**：10 个 repo 的 cycle 应在 ~5s 内完成（本地仓库 + 小 diff）；网络 fetch 占大头，串行执行可接受；**本迭代不并行**（并行对 git CLI 的行为更复杂，留 v0.12+）。
- **向后兼容**：
  - 老 repo 行（新增 4 列为 NULL）→ `syncOne` 正常运行，首次后写入字段。
  - v0.10 `skipped_reason` 扩枚举（`auto_sync_in_progress`）→ 老 client 看到未知值应 fallback 到通用 "Repo up to date" copy 而非崩溃（Zod strict 在 server 侧生效，client 侧 Zod 要宽容或前端做枚举 fallback）。
- **i18n / 文案**：全部英文，沿用项目既有风格。
- **Windows**：与其他迭代一致，不做 Windows 路径兼容（沿用 v0.3 决策）。

---

## 8. 风险与缓解

1. **风险：auto-sync 的 push 触发用户团队的 CI 风暴**（每小时有改动就 push，CI 连跑） → **缓解**：commit message 带 `astack-auto-sync:` 前缀，用户可在团队 CI 侧加 skip 规则；spec 在 README / release note 里明确告知。

2. **风险：commit author 落成 git 全局配置的 name/email，可能不是用户期望的身份**（astack 项目规范是 `zerovoxxx / neolue42@gmail.com`，但其他 custom repo 可能要求 `alexjhwen@tencent.com`） → **缓解**：AutoSync **不复用**全局 `gitAuthor` DI（`app.ts:120` 默认 `Astack/astack@localhost`），新增 `gitGetLocalIdentity(localPath)` primitive（见 §4.2 末段）：在每次 `syncOne(custom)` 入口处调 `git config --local user.name/user.email`（明确不读 `--global`）。任一为空 → `needs_attention("commit_failed", detail:"no_local_git_identity")`，文案引导用户 `git -C <repo> config --local user.name "..."` —— **不静默回落到 global**，避免跨 repo 身份污染。

3. **风险：auto-sync 与用户正在用 IDE 编辑同一文件时撞车**（auto-sync commit 的瞬间用户 save 了新内容） → **缓解**：
   - `gitCommitAll` 只对 tracked files + add 后一次性 commit，与 IDE 的 save 是原子竞态；simple-git 的 `git add .` 会快照当前 working tree，commit 后用户的下次 save 会成为新的 dirty state，下一轮 cycle 再处理。
   - 不做任何"检测 IDE 在编辑"的启发式（不可靠）。
   - 文档里建议用户：**关键编辑期间先关 auto-sync 开关**。

4. **风险：fetch 的鉴权弹窗**（如 HTTPS 密码提示、SSH passphrase） → **缓解**：`simple-git` 默认 `GIT_TERMINAL_PROMPT=0` 环境变量；daemon 启动时 export 之，fetch 遇到需要交互的鉴权直接失败而非挂起；失败进 needs-attention 文案明确 "authentication required"。

5. **风险：SQLite 并发写（auto-sync 写状态列 + 用户操作 skill 同时）** → **缓解**：现有 DB 已是 WAL 模式（假设 v0.2 sqlite 换底后就是；若不是，spec 实施前 check）；auto-sync 的 UPDATE 单行小事务，与其他写路径冲突概率低；若真竞争，simple-retry（最多 3 次）写入。

6. **风险：`repo.auto_sync_cycle_completed` 事件每小时一次但每次 payload 包含所有 repo 摘要 → 事件数据量可控但 SSE stream 热点** → **缓解**：payload 只带 aggregate 数字（5 个 int），不带 per-repo 列表；per-repo 的 attention 用独立事件。

7. **风险：测试里的 setInterval / sleep 与 daemon 生命周期冲突** → **缓解**：`AutoSyncService.runCycle` 可独立调用（public），测试不起 `start()` 而是直接 await `runCycle()`；只有 T1 / T16 专门测 start/stop 生命周期。

8. **风险：用户在第三方仓库（不是自己的 fork）被 Astack 当 custom 注册，auto-sync 试图 push 到无权限的 upstream** → **缓解**：注册时不检测（v0.7 决策），push 失败 → needs-attention，文案引导用户改 remote 或转回 open-source kind；未来可在 spec review 加"首次 push 前 dry-run ls-remote 检测权限"但本迭代不做。

9. **风险：用户的 astack-skills 有 pre-commit / pre-push hook（比如 linter、commit message 检查）导致 auto-commit 永远失败** → **缓解**：commit_failed / push_rejected 进 needs-attention，detail 带 hook stderr；**严格禁止** `--no-verify`（Git Safety Protocol）。用户要么去 repo 里适配 hook 接受 auto commit message，要么在该 repo 上关 auto-sync（当前是全局开关，单 repo 关 = 本迭代不做；用户 workaround：移到 open-source kind 或暂时全局关）。

10. **风险：本 spec 本身的文件名不带 `_SPEC.md` 后缀会让 `.claude/scripts/spec-lint.sh` 的命名规则报 ERROR** → **缓解**：这是 spec-lint 与 AGENTS.md §4.1 的既有偏差（AGENTS.md §4.1 是权威），历史 spec（Iteration1-9）均不带该后缀。**本迭代 PR4 仅接受 spec-lint 报这条 ERROR**（命名规则一项），**不在 PR4 内修 spec-lint 正则** —— 元工程改动会扩散本迭代的修改面，违反"最小改动"原则；spec-lint 正则与 AGENTS.md 对齐应另起独立小迭代单 PR 处理（建议 v0.12 顺手）。

---

## 9. 变更记录

| 日期 | 版本 | 变更人 | 变更说明 |
|---|---|---|---|
| 2026-05-11 | v1.0 | zerovoxxx | 初版：定义 AutoSync 服务、四象限决策树、needs-attention 安全停泊、ReposPage UI 变更、3 个架构决策（§A1–A6）、7 个验收 T 族 / 10 个风险 |
| 2026-05-11 | v1.1 | spec_review 修复 | 据 `Iteration10_AutoSync_REVIEW.md` 修复 P0/P1/P2/IC：①§4.4 删 migration 文件描述，改写为 SCHEMA_DDL + 幂等 ALTER 双路径（P0-1）；②§0/§2.1/§2.2/§4.7.1.3/§6.4 PR3 把废弃开关位置从 ReposPage.tsx 改正为 ProjectSettingsPanel.tsx:26-74（P0-2）；③§4.2 修正 gitPull 现状论证（已 ff-only），新增 gitGetLocalIdentity primitive（P0-3 + P1-1）；④§A3 末段补 SyncService.syncProject 并发显式放行声明（P1-2）；⑤§4.6 POST /api/auto-sync/config 区分 env 锁定下不触发 start/stop（P1-3）；⑥§A4 stderr 截断改为优先抓 fatal/error 行 + 末尾 500 字符（P1-4）；⑦§4.5.2 reason 枚举补 commit_failed，cycle_completed 给出完整 Zod schema（IC1-Issue-1 + P2-1）；⑧§4.7.1.2 多项目订阅 Resolve 加 dropdown 分支 + Dismiss 加 invalidate（P2-2 + IC2-Issue-1）；⑨§6.4 PR 切分按 PR1 后端 schema / PR2 HTTP-only schema 分组（IC6-Issue-1）；⑩§7.1 补 T1.5 / T3.5 + T9 拆 T9a/b/c 覆盖 no_local_git_identity（IC5-Issue-1/2）；⑪§A5 与 §6.4 同步声明 schema 与 PR 的归属切分；⑫§8 风险 #10 解耦 spec-lint 修复至独立迭代（P2-4）。 |
