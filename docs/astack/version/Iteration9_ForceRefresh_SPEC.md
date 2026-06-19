# v0.10 — Force Refresh：脏 open-source 镜像的显式 reset + pull 入口

> **文档状态：SPEC（待实施）· 2026-05-10**
>
> 创建于 2026-05-10，分支 main
>
> **前置依赖：** v0.6 已落地（`SyncService.ensureMirrorClean (sync.ts:1204-1240)` / `gitResetHard (git.ts:146-159)` / `EventType.RepoMirrorReset` / `RepoMirrorResetPayloadSchema` 就位）；v0.9 已落地（`ReposPage.tsx` 的 Refresh / Remove 按钮外显平铺就位，本迭代在其旁边新增第三个按钮）。
>
> **触发事件（2026-05-10）：** v0.9 把 Refresh 按钮外显后，暴露了一个更深层的问题 —— 若用户的 `~/.astack/repos/<name>/` 被外部工具或手动编辑搞脏了，点 Refresh 只会触发 `RepoService.refresh (repo.ts:246-314)` 的 "clean-check → skip + warn" 分支，toast 显示 "Repo up to date"（`ReposPage.tsx::handleRefresh` 第 186 行根据 `changed:false` 产出该 copy），用户完全看不出来 "因为镜像脏所以我跳过了 pull"。SyncService 侧有 `ensureMirrorClean` 自愈，但 refresh 路径在 v0.6 spec §Out of scope 被显式保留为 "skip + warn 的诚实信号"。现在需要把那个信号在 UI 上做出来，并给用户一个显式 opt-in 的 "强制 pull"（reset --hard + pull）入口。
>
> **本迭代性质：** API 契约扩展（refresh body 增 `force` + response 增 `skipped_reason?`）+ 后端 `RepoService.refresh` 分支扩展 + 前端新增第三按钮。不改 DB schema，不改既有 SSE 事件类型集合（`RepoMirrorReset` 的 `reason` 枚举扩 1 个值，复用而非新增事件）。

## 0. 迭代缘起

v0.6 迭代把开源镜像的脏态自愈 **局限在 SyncService** 一条路径（`pullOne` / `resolve` 前的 `ensureMirrorClean`），刻意**不动** `RepoService.refresh` 的 "skip + warn" 语义，理由见 v0.6 §Out of scope #4："refresh 的语义对用户调试友好"。

这条决策在 v0.6 当时合理：SyncService 是后台批量操作的热路径，用户无从干预，必须自愈；refresh 是用户主动触发的一次性动作，"skip + warn" 让 `~/.astack/repos/<name>` 里的手改保留下来，用户自己 `git status` / 手动 revert 之后再次点 Refresh 即可。

但 v0.6 的决策有**两个隐藏的漏洞**，v0.9 按钮外显后被放大：

1. **"skip + warn" 的 "warn" 只进 daemon.log**（`repo.ts:265-270` 的 `logger.warn("repo.refresh.dirty_skip", ...)`），HTTP response 不带任何脏态信号 —— 前端根据 `changed:false` 产出的 "Repo up to date" 是**错的**，用户以为镜像已经是 origin/HEAD 但其实是个脏的 stale HEAD。
2. **用户没有显式的 "重置并拉取" 入口**。能用的 workaround 只有三条，都不好：
   - 从 Repos 页面删除 repo 再重注册 → 破坏所有下游 subscription 的 `last_synced version` 参考，触发全项目 re-sync，代价过大。
   - 手动去 `~/.astack/repos/<name>/` 跑 `git reset --hard origin/HEAD && git pull` → 需要用户知道 Astack 的内部目录结构，违背"前端可操作一切"的产品原则。
   - 触发任意一条 SyncService 路径（pull / resolve）曲线救 → 间接，且在没有 subscription 的 repo 上不成立。

v0.10 的定位：**把 SyncService 的自愈能力挪一份到 refresh 路径，但要求用户显式 opt-in（传 `force: true`），避免和 v0.6 "skip + warn 是诚实信号" 的决策冲突**。默认 `force` 缺省 = false，既有行为原样保留。

### 为什么现在能做

1. `gitResetHard (git.ts:146-159)` 已就位，且 v0.6 已经反复验证 `git.ts::gitResetHard` + `"origin/HEAD"` ref 的行为（open-source mirror self-heal 路径上线 ~20 天，日志里没有一次失败回归）。
2. `EventType.RepoMirrorReset` / `RepoMirrorResetPayloadSchema` 就位，只需把 `reason` 枚举扩 `"user_forced"` 一个值 —— 这是加值不是改值，对既有 listener 零破坏（Zod `.enum([...])` 扩枚举是非 breaking 的 `additive` 变更）。
3. v0.9 的卡片 actions 区已经平铺化，第三个按钮的插入点结构清晰（`RepoCard` 的 actions `<div>`），不需要再动布局容器。
4. `RepoService.refresh` 的 `open-source` 分支（`repo.ts:262-280`）已经做了 `isClean()` 探测，我们只需在"脏态"分支里根据 `opts.force` 二岔：false → 保持 skip+warn + 响应带 `skipped_reason`；true → `gitResetHard("origin/HEAD")` → 继续既有 pull+scan 流程。

## 1. 本次迭代的边界

### In scope（本迭代做）

**Shared schema 扩展（R3：schema 扩展与所有写入点原子绑定）**

1. `packages/shared/src/schemas/repos.ts`：
   - 新增 `RefreshRepoRequestSchema`：
     ```ts
     export const RefreshRepoRequestSchema = z.object({
       force: z.boolean().default(false)
     }).strict();
     export type RefreshRepoRequest = z.infer<typeof RefreshRepoRequestSchema>;
     ```
     - `.default(false)` 保证旧 CLI / 第三方 client 没带 body 也能工作（向后兼容）。
     - `.strict()` 防止未来悄悄加字段 —— 新字段必须进 spec。
   - `RefreshRepoResponseSchema` 扩：
     ```ts
     repo: SkillRepoSchema,
     skills: z.array(SkillSchema),
     changed: z.boolean(),
     /**
      * Present iff the refresh took a short-circuit path. Today only one
      * value: "dirty_working_tree" for non-force refresh against dirty
      * open-source mirror. Absent means "normal pull + scan happened".
      */
     skipped_reason: z.enum(["dirty_working_tree"]).optional(),
     /**
      * Present iff `force=true` triggered a `git reset --hard origin/HEAD`
      * before the pull. Absent means "no reset happened" (either clean
      * tree or force not requested). Used by Web toast to say "Mirror
      * reset + pulled" instead of just "Pulled".
      */
     reset_performed: z.boolean().optional(),
     ```

2. `packages/shared/src/schemas/events.ts`：
   - `RepoMirrorResetPayloadSchema.reason` 枚举由 `z.enum(["dirty_working_tree"])` 扩为 `z.enum(["dirty_working_tree", "user_forced"])`。
   - JSDoc 上的枚举说明同步修订："`user_forced` — user explicitly clicked Force pull; `dirty_working_tree` — SyncService auto-heal"。

**后端 — `RepoService.refresh` 二岔**

3. `packages/server/src/services/repo.ts::RefreshOutput` 接口扩 `skipped_reason?: "dirty_working_tree"` + `reset_performed?: boolean`。
4. `packages/server/src/services/repo.ts::refresh(repoId, opts?: { force?: boolean })`：
   - 签名改为可选 `opts`，缺省 `{ force: false }`（保持测试签名兼容）。
   - 分支改造（伪代码，真实 diff 在 PR1）：
     ```
     if (repo.kind === RepoKind.OpenSource) {
       const clean = await this.git.isClean(repo.local_path);
       if (!clean) {
         if (!opts.force) {
           logger.warn("repo.refresh.dirty_skip", ...)    // 保留
           return { repo, skills, changed: false,
                    skipped_reason: "dirty_working_tree" }  // 新字段
         }
         // force 分支：reset --hard origin/HEAD + 继续 pull
         await this.git.remoteHead(repo.local_path)       // 先探 remote
         await this.git.resetHard(repo.local_path, "origin/HEAD")
         logger.warn("repo.refresh.user_forced_reset", { repo_id, repo_name })
         events.emit({ type: RepoMirrorReset,
                       payload: { repo_id, repo_name,
                                  repo_kind: "open-source",
                                  reason: "user_forced" }})
         resetPerformed = true
         // fall through to pull + scan
       }
     } else if (opts.force) {
       // custom repo 不允许 force — 脏态可能是合法未提交改动
       throw new AstackError(
         ErrorCode.REPO_READONLY,  // 复用该码，HTTP 403（v0.10 §A2 解释）
         "force refresh only allowed on open-source repos",
         { repo_id, repo_kind: repo.kind })
     }
     // 既有 pull + scan 流程不动
     ```
   - 返回 `{ repo, skills, changed, reset_performed: resetPerformed || undefined }`（仅 force 且真执行了 reset 才携带）。

5. `RepoServiceDeps.GitImpl.resetHard?` 新增 optional 方法（与 `SyncServiceDeps` 对称；老测试 double 未提供 `resetHard` 时 force 分支走错误路径抛 `REPO_STRUCTURE_INVALID` / `INTERNAL`，见 §A4）。

**HTTP 路由**

6. `packages/server/src/http/routes.repos.ts`：
   - `POST /:id/refresh` 接 `zValidator("json", RefreshRepoRequestSchema)`（当前是无 body，扩为可选 JSON body；Hono 的 `zValidator` 在 body 为空时走 default → `force:false`，需验证；不行则走 `.optional()` 包裹，取 `valid ?? { force: false }`）。
   - `ctx.req.valid("json")` 取出 `force`，传入 `c.repoService.refresh(id, { force })`。
   - response 包含 `skipped_reason` / `reset_performed` 字段（透传，无额外映射）。

**CLI**

7. `packages/cli/src/commands/repos.ts::runReposRefresh(id, opts)`：
   - `opts` 扩 `force?: boolean`。
   - 传给 `client.refreshRepo(id, { force })`。
   - `printOk` copy 按 response 字段分支：
     - `skipped_reason === "dirty_working_tree"` → 打印 `printWarn("skipped: mirror has uncommitted changes; rerun with --force to reset + pull")`（或 yellow highlight，按 `commands/repos.ts` 现有 helper）。
     - `reset_performed === true` → 打印 `"reset + pulled id=<id> (HEAD moved; N skill(s))"`。
     - 其余保持现有 `"refreshed repo id=<id> (...)"` copy。
8. `packages/cli/src/client.ts::refreshRepo(id, opts?: RefreshRepoRequest)`：body 透传。
9. `packages/cli/src/bin.ts` 的 `repos refresh <id>` 命令加 `.option("--force", "reset --hard origin/HEAD then pull (open-source only)")`。

**前端 — Refresh 路径增强 + 新按钮**

10. `packages/web/src/lib/api.ts::refreshRepo(id, opts?: { force?: boolean })`：body 透传，`POST /api/repos/${id}/refresh` 永远带 JSON body（即使 `force:false`）以统一 Content-Type。

11. `packages/web/src/pages/ReposPage.tsx`：
    - `RepoCardProps` 增第三个回调 `onForceRefresh?: () => Promise<void>`；`undefined` 时按钮**不渲染**（gating 机制见下一点，仅 open-source repo 显示）。
    - `RepoCard` 渲染三按钮：`[Refresh][Force pull][Remove]`（Force pull 仅当 `repo.kind === "open-source"` 时出现，避免暴露一个"点了会报错"的按钮）。
      - Force pull 样式：`<Button variant="danger" size="sm">` 但**不在同一行标红**与 Remove 混淆；加 `title` tooltip "Reset open-source mirror to origin/HEAD and pull"。
      - 点击走 `window.confirm("Force pull will reset ~/.astack/repos/<name>/ to origin/HEAD and DISCARD any local edits in that directory. Continue?")`（带 repo name + 路径提示；是 destructive action 必须二次确认，见 §A3）。
      - 确认后 await `onForceRefresh()`，loading 态按钮禁用文案切 `"Pulling…"`，与现有 Refresh 的 loading 态独立。
    - 父组件 `handleRefresh(id, opts?)` 扩 `opts: { force?: boolean }`：
      - 传 `force:true` → 调 `api.refreshRepo(id, { force: true })`。
      - toast 按 response 分支：
        - `skipped_reason === "dirty_working_tree"` → `toast.warn("Refresh skipped", "Mirror has uncommitted changes. Click Force pull to reset and retry.")`。
        - `reset_performed === true` → `toast.ok("Mirror reset + pulled", res.changed ? "HEAD moved" : "no upstream change")`。
        - 其余保留现有 "Repo refreshed / Repo up to date" 分支。
    - `handleForceRefresh(repo)` 即 `handleRefresh(repo.id, { force: true })` 的 thin wrapper。

12. 图标：`Force pull` 按钮文案全文 "Force pull"（不用 "Force refresh"，与 `git` 术语对齐；用户从 git 角度理解"强制"更直观）。

**测试**

13. 后端单测（`packages/server/tests/services/repo.spec.ts`，若已有就补 case；没有就新建）：
    - test: `refresh(force=false)` 对脏 open-source mirror 返回 `skipped_reason: "dirty_working_tree"` + `changed:false` + 不调用 `resetHard`。
    - test: `refresh(force=true)` 对脏 open-source mirror 调一次 `resetHard("origin/HEAD")` + 一次 `pull` + 返回 `reset_performed:true` + 发射 `RepoMirrorReset` 事件 `reason:"user_forced"`。
    - test: `refresh(force=true)` 对 clean open-source mirror 不调 `resetHard`（clean 分支 pass-through）+ `reset_performed` 字段不出现（undefined）。
    - test: `refresh(force=true)` 对 custom repo 抛 `REPO_READONLY`（保护用户未提交改动）。
    - test: `refresh(force=false)` 对 clean open-source mirror 行为与 v0.9 完全一致（regression guard）。
    - test: `RepoServiceDeps.GitImpl.resetHard` 缺失 + `force=true` 对 dirty open-source mirror → 抛 `INTERNAL`（R6 防止静默跳过）。

14. HTTP routes 单测：
    - `POST /api/repos/:id/refresh`（无 body） → 默认 `force:false`。
    - `POST /api/repos/:id/refresh` body `{"force": true}` → 走 force 分支。
    - `POST /api/repos/:id/refresh` body `{"force": "yes"}` → `VALIDATION_FAILED`（Zod 拒非 boolean）。
    - `POST /api/repos/:id/refresh` body `{"unknown": 1}` → `VALIDATION_FAILED`（strict）。

15. E2E（`packages/web/tests/repos.spec.ts` 或同类文件）：
    - test: 脏 open-source repo 点 Refresh → toast 是 warn 级别 + 文案含 "Click Force pull"。
    - test: 脏 open-source repo 点 Force pull → 二次 confirm 弹窗 → 确认 → 请求带 `force:true` + toast ok "Mirror reset + pulled"。
    - test: 二次 confirm 取消 → 无 network 调用。
    - test: custom repo 卡片上 Force pull 按钮**不渲染**。

**文档**

16. `docs/astack/INDEX.md` / `BOUNDARIES.md` 追加 v0.10 行。

### Out of scope（不做，延后）

- **Custom repo 的 force pull**（允许用户显式丢弃未提交的 working copy 改动）—— 语义等同 `git reset --hard` custom 仓库的 staging + working tree，与 push 流程强耦合（如果用户正在 push 中途 reset，会丢 `gitCommitAndPush` 还没跑完的内容）。单独开 spec 再讨论。
- **Force pull 的批量版本**（一次性对所有 dirty open-source mirror 执行）—— 危险度远高于本迭代的 per-repo opt-in，不做。
- **Force pull 的 "dry-run" 预览**（显示 `git diff HEAD origin/HEAD` 给用户看）—— UI 工程量大；用户真需要可用 IDE 打开 `~/.astack/repos/<name>/` 看。
- **`RepoService.refresh` 自身改成 "auto-heal like SyncService"**（去掉 `force` 参数，默认自愈）—— 违背 v0.6 "skip + warn 是诚实信号" 的决策，不做。
- **SSE 事件专门区分 `auto_healed` / `user_forced`** 以外的 reason（如 `"detached_head"`）—— 当前没有对应代码路径，留 enum 扩展位即可，不预先加值。
- **Project Detail 页同步加"强制 sync"按钮** —— 同类问题但在 sync 路径上 `ensureMirrorClean` 已自愈，无 UI 行动需求。
- **CLI `astack repos refresh --force` 的 confirm prompt** —— CLI 侧不做交互式 prompt（CLI 是 streaming API），用户直接传 `--force` 即视为确认；Web UI 有 confirm 足够。
- **`RepoMirrorReset` payload 扩 `reset_by: "user" | "auto"`** —— `reason` 已经区分得够，不过度工程化。
- **`ErrorCode.REPO_DIRTY_WORKING_TREE`** 新错误码 —— 本次不把 skipped 做成 error（skipped 是**成功**的短路返回，HTTP 200 携带 `skipped_reason` 字段；失败才抛 error）。

## 2. 架构决策

### §A1 — `force` 的作用域严格限定 `open-source`

实现分支明确：

| repo kind | tree state | `force`=false（缺省） | `force`=true |
|-----------|-----------|----------------------|--------------|
| open-source | clean | pull + scan（今天行为）| pull + scan（`reset_performed:undefined`）|
| open-source | dirty | skip + `skipped_reason` | reset + pull + scan + `reset_performed:true` + emit `RepoMirrorReset(user_forced)` |
| custom    | clean | pull + scan | pull + scan（`force` 被忽略）**← 待定，见下** |
| custom    | dirty | pull + scan（今天行为：custom 不做 clean-check）| `REPO_READONLY` error |

**custom + clean + force=true 的边界**：为了让调用方 "force" 参数有**不变的**语义（= "脏了也强制拉"），我们选择**对所有 custom repo 的 force=true 请求抛错**，不论脏/净。这样：

- 前端只对 `kind === "open-source"` 渲染按钮，客户端 never 对 custom 传 force=true → 不走错误路径。
- CLI 用户若手写 `--force` 对 custom 仓库 → 得到清晰的 `REPO_READONLY` 错误码而不是静默 no-op，避免 "传了 --force 但没效果" 的认知偏差。
- 未来若决定放开 custom + force 语义，只需放宽该分支 —— 不会破坏现有契约。

### §A2 — 错误码复用 `REPO_READONLY`，不新增码

custom repo 拒绝 force 的错误语义是 "这条操作你不能在 readonly-除外的 kind 上执行"。`REPO_READONLY` 当前的定义是 "attempt to push to open-source repo"（`errors.ts:45-46`），方向相反但语义对称：**"该 repo kind 不支持该写操作"**。我们在 spec 里明确复用，JSDoc 补一行 "Also used when force-refresh is attempted on a `custom` repo — symmetric direction"；不新增 `REPO_WRONG_KIND` 之类的码（避免 ErrorCode 空间碎片化）。

### §A3 — Force pull 的二次 confirm 必须本地化路径

Web confirm 的文案必须**包含 `~/.astack/repos/<name>/` 的完整路径** + 按 `repo.name` 动态生成。理由：v0.6 教训是用户对 "upstream mirror" 的概念陌生，描述性 "will reset the mirror" 不如 "will reset `~/.astack/repos/anthropic-skills/` to origin/HEAD and DISCARD any local edits in that directory"。后者让用户能立刻判断：
1. 我在那个路径下到底有没有手改 → 能回忆起 → 知道该不该点确认；
2. 即使忘了，confirm 的 copy 足够具体，事后看 daemon.log 里 `repo.refresh.user_forced_reset` 能对账。

### §A4 — R6：`ensureMirrorClean` 不复用而是**镜像 hoist**

v0.6 的 `SyncService::ensureMirrorClean (sync.ts:1204-1240)` 是 private 方法，且包含 SyncService 特定的逻辑（用 `this.deps.events` / `this.deps.logger`）。本迭代的做法：

- **不**把 `ensureMirrorClean` 搬成公共 helper；那需要把 events / logger 抽成参数，改动面铺到整个 SyncService，违背最小改动原则（AGENTS.md §2 原则 3）。
- 改为：`RepoService.refresh` 的 force 分支**就地重写** `remoteHead → resetHard → warn + emit RepoMirrorReset` 的 4 步逻辑。虽然有 ~8 行重复，但两份调用方的 event 来源（`sync.*` vs `repo.*` logger key）需要区分，强行复用反而制造抽象债。
- R6 要求 "跨 Service 同类 git 操作必须复用同一护栏或显式声明放行"，这里做到后者：spec 显式声明 "refresh 路径的 force 分支是 SyncService `ensureMirrorClean` 的对称克隆，两份都走相同的 `resetHard("origin/HEAD")` + `RepoMirrorReset` 事件"。**并在 `repo.ts` 的新代码处加注释指向 `sync.ts:1204` 作为锚点**，让未来改 reset 策略的人能同步改两边。
- 若未来第三个调用点出现，再抽公共 helper（rule of three）。

### §A5 — `resetHard` 缺失 test double 的回退路径（R6）

`RepoServiceDeps.GitImpl.resetHard?` 是 optional 的。实施时两种选择：
- (a) `force=true` 且 `resetHard` 未注入 → 静默当作 `force=false` 处理。
- (b) `force=true` 且 `resetHard` 未注入 → 抛 `INTERNAL` 错。

**选 (b)**。理由：`force=true` 是用户**显式** opt-in 的 destructive action，任何"静默降级"都是违反最小意外原则。生产环境 `defaultGitImpl.resetHard = gitResetHard` 永远就位，只有测试 double 会触发这条路径 —— 测试若忘了注入 resetHard，应该用显式错误提醒作者更新 double，而不是让 force 测试偶然通过。

### §A6 — `strict()` body schema 的选择

`RefreshRepoRequestSchema` 用 `z.object({...}).strict()`：

- 当前版本 CLI / web 都只传 `force`，不会有未知字段。
- 未来若加字段（比如 `ref: "origin/main"` 指定 reset 到的 ref），**必须**更新 schema，不允许前端偷偷传值而后端忽略。
- **空 body 与非法 JSON 的区分处理**（v0.10 CR #2 修订）：
  - **零字节 body** → 走 `schema.parse({})` → `force:false`（兼容旧 CLI 无 body 调用）。
  - **非零但 JSON 语法非法**（如 `{"force": tru}`）→ 显式抛 `AstackError(VALIDATION_FAILED)` → HTTP 400。**不静默降级为空 body**。原因：静默降级会把"用户点了 Force pull 但 payload 拼错"的场景伪装成"用户传了 force:false"，前端收到 `skipped_reason` toast 时无法定位问题。明确错误反馈 > 宽容兼容。
  - **合法 JSON 但字段非法**（额外字段 / `force` 非 boolean）→ Zod strict 拒绝 → 全局 `buildErrorHandler` 把 ZodError 转成 `VALIDATION_FAILED` 400。

### §A7 — `RefreshRepoResponse` 的 `skipped_reason` / `reset_performed` 互斥

契约：这两个字段不可能同时 truthy。
- `skipped_reason = "dirty_working_tree"` ⟹ `changed=false`，`reset_performed` absent（因为根本没调 reset）。
- `reset_performed = true` ⟹ `skipped_reason` absent（因为我们真的 pull 了）。
- 两者都 absent = 普通 clean pull（force=false 时，或 force=true 但 mirror 已 clean）。

这个约束**不**靠 Zod 做（Zod 的 refine 在错误提示里难看），改为在 `RepoService.refresh` 的单一返回语句里静态保证：每条 return 路径只设其中之一。单测加一条断言 "never both truthy" 兜底。

> **CR #3 补充（前端 UX）**：`force=true` + clean mirror 这个子场景虽然 response 的 `reset_performed` 为 undefined 与 `force=false` 的 clean pull 在 wire 层无法区分，但**前端**基于本地 `force` 变量做 toast 分支，产出 "Force pull completed · Mirror was already clean and up to date"，让用户知道点击有效而非无响应。后端契约不需要扩字段。

## 3. 数据流 / 调用关系

```
┌─────────────────────────────────────────────────────────────────┐
│ UI: click <Refresh>                                             │
│   → api.refreshRepo(id, { force: false })                       │
│   → POST /api/repos/:id/refresh  body={force:false}             │
│   → RepoService.refresh(id, {force:false})                      │
│        ├── open-source + clean → pull + scan → {changed}        │
│        ├── open-source + dirty → skip+warn                      │
│        │                     → {changed:false,                  │
│        │                        skipped_reason:"dirty_..."}     │
│        └── custom → pull + scan → {changed}                     │
│   → UI toast:                                                   │
│     skipped_reason ? warn(Click Force pull...) :                │
│     changed ? ok(HEAD moved) : ok(up to date)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ UI: click <Force pull>  (only rendered for open-source)         │
│   → window.confirm("reset ~/.astack/repos/<name>/ ... Continue?")│
│   → api.refreshRepo(id, { force: true })                        │
│   → POST /api/repos/:id/refresh  body={force:true}              │
│   → RepoService.refresh(id, {force:true})                       │
│        ├── custom → throw REPO_READONLY (HTTP 403)               │
│        ├── open-source + clean → pull + scan → {changed}        │
│        │      (reset_performed NOT set — nothing was reset)     │
│        └── open-source + dirty                                  │
│              → remoteHead probe                                 │
│              → resetHard("origin/HEAD")                         │
│              → warn log repo.refresh.user_forced_reset          │
│              → emit RepoMirrorReset(reason:"user_forced")       │
│              → pull + scan                                      │
│              → {changed, reset_performed:true}                  │
│   → UI toast:                                                   │
│     reset_performed ? ok(Mirror reset + pulled) :               │
│     changed ? ok(HEAD moved) : ok(up to date)                   │
└─────────────────────────────────────────────────────────────────┘
```

## 4. PR 切分

按原子性 + reviewability，建议 3 个 PR，但合并成 1 个也可接受（改动 ~300 行，耦合紧）：

- **PR1** — Shared schema + 后端逻辑（原子）：
  - `repos.ts` schema 扩（`RefreshRepoRequestSchema` / response 扩字段）
  - `events.ts` 枚举扩 `"user_forced"`
  - `RepoService.refresh` 签名 + 分支实现
  - `routes.repos.ts` 接 body schema
  - 后端单测（§1.13/14 全部）
  - **R3 原子绑定**：schema 加字段和所有 writer 必须同 PR。

- **PR2** — CLI：
  - `client.ts::refreshRepo` 签名扩
  - `commands/repos.ts::runReposRefresh` 分支 copy
  - `bin.ts` 加 `--force` option

- **PR3** — 前端 + E2E：
  - `api.ts::refreshRepo` 签名扩
  - `ReposPage.tsx` 三按钮 + `handleRefresh` toast 分支 + confirm 文案
  - E2E（§1.15 全部）
  - `INDEX.md` / `BOUNDARIES.md` 更新

## 5. 测试策略

见 §1.13 / §1.14 / §1.15。关键覆盖（列出是为了 code_review 时做 checklist）：

- ✅ 脏 open-source, force=false → `skipped_reason` 字段
- ✅ 脏 open-source, force=true → reset + pull + emit `user_forced`
- ✅ clean open-source, force=true → 不 reset（pass-through）
- ✅ dirty open-source, force=true, `resetHard` 缺失 → `INTERNAL`（R6 / §A5）
- ✅ custom, force=true → `REPO_READONLY`
- ✅ HTTP body schema：空 body / `{force:false}` / `{force:true}` / 非法类型 / strict 拒额外字段
- ✅ E2E: Force pull 按钮仅 open-source 可见
- ✅ E2E: confirm 取消 → 无 network
- ✅ E2E: skip 路径 toast 是 warn 且文案引导到 Force pull

## 6. 对黄金法则的呼应

- **R1（复用声明必须 grep 验证）**：spec 里所有 "复用 X" 的点都 grep 对齐过：`ensureMirrorClean (sync.ts:1204-1240)`、`gitResetHard (git.ts:146-159)`、`RepoMirrorReset / RepoMirrorResetPayloadSchema (events.ts:52, 163-170)`、`ErrorCode.REPO_READONLY (errors.ts:45-46)`、`ToastContextValue.ok|warn|error (toast.tsx:30-35)`、`AstackEventSchema discriminated union (events.ts:314-389)`。
- **R3（Schema 扩展与所有写入点原子绑定）**：PR1 把 `RefreshRepoRequestSchema` + `RefreshRepoResponseSchema` + `RepoMirrorResetPayloadSchema.reason` 的扩展，和所有 writer（`routes.repos.ts::POST /:id/refresh`、`RepoService.refresh`）放同一个 PR。CLI / Web 读取新字段放后续 PR 是只读消费方向，不破坏原子性。
- **R4（Fire-and-forget 路径 per-item try/catch）**：本迭代不引入 fire-and-forget 路径（refresh 是单次 await 的 request/response 模型），不适用。
- **R5（代码引用函数名:行号双锚点）**：全文引用均按 `functionName (file.ts:line)` 格式。
- **R6（跨 Service 同类 git 操作护栏复用）**：§A4 明确本迭代不复用 `ensureMirrorClean`，改为 "在新代码加注释指向 sync.ts:1204 锚点" 的声明式显式放行。这是 R6 允许的 "显式声明" 选项，而非漏写护栏。
- **R7（Batch API outcomes 必带 error_code + error_detail）**：refresh 是 single-item API，不适用。
- **R8（兜底标记不应被当作永久 ownership）**：本迭代引入的 `skipped_reason: "dirty_working_tree"` **不是**兜底标记 —— 它是一次具体调用的短路原因，每次调用重新计算，下次 pull 若干净了就不再出现。不存在 "下游把它当永久 ownership" 的风险。

## 7. retro 沉淀（本迭代预期）

- **候选 R9（待评审）**：**"skip + warn" 这类 "诚实但静默" 的服务端分支必须在 HTTP response 里带结构化标识**，不能靠 daemon.log 传递给前端用户。v0.6 当时的决策 "保留 refresh skip 作为诚实信号" 只做对了一半 —— warn 仅落日志 = UI 把 `changed:false` 错翻译成 "up to date"。规则建议：任何 "服务端选择不执行主操作但 HTTP 200" 的路径必须在 response schema 里有 `skipped_reason` / `noop_reason` 之类的字段，前端据此产出 copy，而不是依赖聚合字段反推。

  若 v0.10 实施过程/评审中没有反例补强这个规则，`/retro` 命令应该把它升格为 R9（或合并进 R7 的 batch 约束的"单 item 扩展版"）。

- **候选 P9（待评审）**：对应反模式"服务端短路的信号只写 log"。
