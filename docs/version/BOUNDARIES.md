# 迭代边界规则

> 每个迭代的范围边界，防止跨迭代的范围蔓延。由 `/spec` 命令自动维护。
> spec_review 评审时作为迭代边界遵守（A3）的评审基准。
>
> **文件命名规范**：迭代文档统一 slug `Iteration<N>_<PascalSlug>`（harness-init 规范，`<N>` 从 1 开始的整数序号）；spec 正文以 `_SPEC.md` 结尾放在 `docs/version/`，评审 / 代码评审 / 专项报告（`_REVIEW.md` / `_CR.md` / `_SPIKE.md` / `_POSTMORTEM.md`）一律落 `docs/version/review/`，归档文件落 `docs/version/archive/`。详见 [`AGENTS.md §4.1`](../../AGENTS.md#41-docsversion-文件命名与目录规范)。

## v0.12 — Plugin Marketplace 布局：扫描 `<root>/<plugin>/{skills,commands,agents}/` 二级容器

**本迭代做：**
- `packages/shared/src/domain.ts::ScanRootKind` 追加第 4 个枚举值 `PluginMarketplace = "plugin-marketplace"`；`ScanRoot.kind` JSDoc 同步追加该 kind 的语义说明；`DEFAULT_SCAN_CONFIG` / `BUILTIN_SEED_URLS` 不动
- `packages/server/src/scanner/plugin-marketplace.ts`（新文件）：`scanPluginMarketplace(repoRoot, rootPath, out, warnings)`，对 `<rootPath>` 第一层每个含 `.claude-plugin/plugin.json` 的子目录 `<plugin>` 派发到 `scanSkillDirs(<rootPath>/<plugin>/skills, namePrefix=plugin)` + `scanFlatFiles(<rootPath>/<plugin>/commands, namePrefix=plugin, command)` + `scanFlatFiles(<rootPath>/<plugin>/agents, namePrefix=plugin, agent)`
- `packages/server/src/scanner/skill-dirs.ts::scanSkillDirs` / `flat-files.ts::scanFlatFiles` 各扩第 N 个**可选**参数 `namePrefix?: string`（默认 ""），原 3 个调用方零改动；helper 内部把 `name = namePrefix ? `${namePrefix}/${entry}` : entry` 一次性产出 plugin-namespaced 名（§A1 复用契约 + §A4 注入而非外层加工）
- `packages/server/src/scanner/index.ts::scanRepo` switch 新增第 4 个 case 派发到 `scanPluginMarketplace`；不动 dedup / blacklist 后段（v0.4 systemSkillIds 仍按裸 name 等值比对，§A6）
- skill `name` 由 plugin-marketplace 模式产出时含单 `/` 分隔（如 `code-review/code-review`），全链路把 name 视作不透明 NonEmptyString（grep 验证：`SkillSchema` `common.ts:182` / `subscription.ts:163-191` / `manifest.ts` / `local-skill.ts:585` / `canonicalWorkingRelPath` `sync.ts:1281` 均无字符集约束 + `copyFile (fs-util.ts:122)` / `mirrorDir (fs-util.ts:178)` 已 `mkdirSync(recursive)` 兜底，§A1 路径自然成立）
- skills 表 `UNIQUE(repo_id, type, name)` (`schema.ts:96`) 不动；plugin slug 编进 name 自然解决跨 plugin 同名冲突（§A1 替代加列方案）
- `packages/shared/src/schemas/repos.ts::RegisterRepoRequestSchema` 不动，`scan_config: ScanConfigSchema.nullish()` 透传任意 layout
- `packages/cli/src/commands/repos.ts::runReposRegister` opts 扩 `scanConfigJson?: string`：`JSON.parse` + `ScanConfigSchema.parse` 双层校验（解析失败 → `VALIDATION_FAILED`），透传到 `client.registerRepo({...,scan_config})`；`packages/cli/src/bin.ts` reposCmd register 子命令 `.option("--scan-config-json <json>", ...)` + 透传
- 测试：T1–T8 后端 scanner 单测（happy path / 无 plugin.json 跳过 / 空 plugin / 跨 plugin 同名两条都进 / frontmatter 不比对前缀 / NAME_REGEX 拦截非法 plugin slug / dotdir 静默 skip / systemSkillIds 不剥前缀比对）+ T9–T11 CLI 单测（合法 JSON 透传 / JSON 解析失败 / Zod 校验失败均报 `VALIDATION_FAILED`）
- 文档：AGENTS.md "当前活跃迭代" 切换 + INDEX.md 加 v0.12 行（物理序号 11）+ 本 spec 表 SHIPPED 后 `/retro` 走查决定候选黄金法则 R9（"Scanner kind 抽象的扩张必须以新 helper 文件落地"）是否进活跃规则
- 按 3 个 PR 切分（PR1 shared 域 + scanner 三文件原子 + 后端单测 / PR2 CLI option 透传 + CLI 单测 / PR3 文档 + retro）

**本迭代不做（延后到 v0.13+）：**
- **不**预置 `claude-plugins-official` 为 builtin seed（`seeds.ts:1-25` 注释明示每个 seed 都是有意决策；marketplace 含 50 个第三方 plugin，分发风险非零，等独立调研）
- **不**做 Web UI 的 ScanConfig 编辑器 / "切换 layout 类型" 选择器（牵涉 RepoCard 展开区改造 + ScanConfig editor 组件 + SSE 重 scan，独立 UX 迭代）
- **不**引入 `recurse_depth` / `glob` 等通用递归参数（方案 C；语义模糊，下次新 layout 仍抽不出明确语义；显式 marketplace kind 是有意设计）
- **不**改 `name` 字符集校验为允许单 `/`（scanner 内部生成已合规，外部 NAME_REGEX 0 拦截点；用户手填 / API 传含 `/` 的 skill_name 仍非法）
- **不**做 plugin-level `version` / `description` 解析（plugin.json 仅作存在性凭证）
- **不**做 marketplace 模式下 `.mcp.json` 解析（MCP 全栈 0 支持，独立迭代）
- **不**做 web UI "按 plugin 分组展示 skills" 的 UX 增强（先 raw name 直显）
- **不**为 v0.2 三 kind 加迁移（现存 3 个 builtin seeds 完全不变）
- **不**允许 namePrefix 嵌套 / 多段（helper invariant assert：namePrefix 通过 NAME_REGEX 或为空，含 `/` 直接 throw）
- **不**复用 `BOOTSTRAP_SCAN_CONFIG`（项目 `.claude/` 不会有 marketplace 结构，bootstrap 路径与 marketplace 正交）

## v0.11 — Auto-sync：Daemon 侧周期性 pull / push + 冲突安全停泊

**本迭代做：**
- `packages/server/src/services/auto-sync.ts`：新 `AutoSyncService`（`start / stop / runCycle / syncOne`），daemon while-sleep + AbortController 循环（~1h interval + ±5min jitter + 60s 冷启动延迟），instance 级 `inflight` 防重入（命中即 `auto_sync.cycle_skipped` warn 一行，不写 DB / 不发 attention 事件 / 不发 cycle_completed），新 `repoAutoSyncLockKey(repoId)` per-repo 锁
- `packages/server/src/git.ts` 新 primitive：`gitFetch` / `gitStatusWithAhead` / `gitPullFfOnly` / `gitCommitAll` / `gitPush` / `gitGetLocalIdentity`（读 `git config --local user.name/email`，不读 `--global`） / `classifyGitError`（与既有 `gitPull` / `gitCommitAndPush` 并存不改）
- `AutoSyncService.syncOne` 四象限决策：open-source+clean→pullFfOnly、open-source+dirty→skip、custom(clean,0,0)→noop、custom(clean,0,>0)→pullFfOnly、custom(clean,>0,0)→push、custom(clean,>0,>0)→needs_attention("divergent_branches")、custom(dirty,*,0)→commitAll+push、custom(dirty,*,>0)→needs_attention("dirty_and_behind")；**任何 needs_attention 分支绝不自动 merge/rebase/force-push/stash pop/reset**
- `packages/server/src/daemon.ts::startDaemon` 挂 `autoSyncService.start()`，`DaemonHandle.close()` 前 `await autoSyncService.stop()`（在 `server.close()` 之前）
- DB schema 改动（**项目无 migration 框架**，走 `schema.ts::SCHEMA_DDL` + `db/connection.ts::initDb` 内幂等 ALTER TABLE 双路径）：`skill_repos` 加 `last_auto_sync_at` / `last_auto_sync_status` / `last_auto_sync_reason` / `last_auto_sync_detail` 4 列（不复用 `last_synced`，保持镜像新鲜度语义）
- `packages/shared/src/schemas/events.ts`：新 `RepoAutoSyncAttentionPayloadSchema`（`reason` 枚举含 `dirty_working_tree` / `pull_not_fast_forward` / `push_rejected` / `divergent_branches` / `dirty_and_behind` / `fetch_failed` / `commit_failed`）+ `EventType.RepoAutoSyncAttention`；新 `RepoAutoSyncCycleCompletedPayloadSchema`（aggregate 计数：`cycle_id` / `started_at` / `duration_ms` / `repos_total` / `ok` / `noop` / `skipped` / `needs_attention`，**不含 per-repo 列表**）+ `EventType.RepoAutoSyncCycleCompleted`
- `packages/shared/src/schemas/repos.ts::RefreshRepoResponseSchema.skipped_reason` enum 扩 `"auto_sync_in_progress"`（非 breaking additive，用于 §A3 try-acquire 锁路径，与 v0.10 已有的 `"dirty_working_tree"` 并列）；新 `DismissAutoSyncAttentionRequest/Response` / `GetAutoSyncConfigResponse` / `UpdateAutoSyncConfigRequest`
- `packages/server/src/services/repo.ts::refresh` 开头 try-acquire `repoAutoSyncLockKey`，AutoSync 在跑时直接返回 `skipped_reason:"auto_sync_in_progress"`
- `packages/server/src/http/routes.repos.ts::POST /:id/dismiss-auto-sync-attention`：清 4 列 auto-sync 状态、保留 `last_auto_sync_at` 作为最后尝试时间
- `packages/server/src/http/routes.auto-sync.ts`（新）：`GET /api/auto-sync/config` + `POST /api/auto-sync/config`，POST 写 `~/.astack/config.json`，env > config.json > default 优先级，response 诚实反映 `source`
- `packages/server/src/config.ts::loadAutoSyncConfig`：读 `ASTACK_AUTOSYNC_ENABLED` / `ASTACK_AUTOSYNC_INTERVAL_MS` / `ASTACK_AUTOSYNC_JITTER_MS`
- `packages/web/src/pages/ReposPage.tsx`：顶部新 `Switch` "Auto-sync (~1h)"（env 锁定时 readonly + tooltip）；`RepoCard` 展开区新 SyncStateSection，`needs_attention` 橙色 banner + Dismiss 按钮（点击 invalidate repos query）+ Resolve 按钮（仅 custom + divergent/dirty_and_behind；多项目订阅时弹 dropdown 选目标项目）或 "Open in terminal" 复制路径
- `packages/web/src/components/project/ProjectSettingsPanel.tsx`：**删除废弃 `auto-sync-on-focus` localStorage 代码（line 26-74）** —— 注意位置在 ProjectSettingsPanel 不在 ReposPage
- `packages/web/src/lib/api.ts`：`getAutoSyncConfig` / `updateAutoSyncConfig` / `dismissAutoSyncAttention` + `RepoAutoSyncAttentionEvent` / `RepoAutoSyncCycleCompletedEvent` 类型 + SSE invalidate 两个 query key
- `gitCommitAll` 的 author 来自 `gitGetLocalIdentity(localPath)`（读 `git config --local user.name/email`），local 未设 → `commit_failed + detail "no_local_git_identity"` 进 needs-attention（不回落 global，避免跨 repo 身份污染）；AutoSync **不**复用 `app.ts::gitAuthor` 全局 DI
- daemon 启动时 export `GIT_TERMINAL_PROMPT=0`，阻止鉴权交互挂起（fetch 鉴权失败 → `fetch_failed + detail "authentication"`）
- 测试：T1 / T1.5 / T2 / T3 / T3.5 / T4–T12 后端单测（生命周期 / 四象限 / 鉴权分类 / 锁竞态 / no_local_git_identity）+ T13–T15 HTTP 单测（含 env 锁定下 POST 不触发 start/stop）+ T16–T17 E2E（switch toggle + needs_attention banner + Dismiss）
- 按 4 个 PR 切分（PR1 后端核心 + 后端 schema 原子 / PR2 HTTP 路由 + HTTP-only schema / PR3 前端 + 删 ProjectSettingsPanel 废开关 / PR4 文档 — **不**包含 spec-lint 正则修复）

**本迭代不做（延后到 v0.12+）：**
- CLI 命令（`astack auto-sync start/stop/status`）—— CLI 一致性统一迭代
- 智能 rebase / 3-way merge 自动化 —— divergent / dirty+behind 一律 needs-attention
- per-repo 独立间隔 / 独立开关 —— 全局一个间隔、全局一个开关足够
- "Sync all now" 手动按钮 —— 触发源聚合复杂度高，用户可点每卡片 Refresh 或等 cycle
- 复用 `RepoService.refresh` / `SyncService.syncProject`（§A1：独立服务直调 git primitive，保持日志 / SSE 事件隔离）
- open-source repo 的自动 force reset —— 保持 v0.6 决策：open-source dirty 只由用户手动 Force pull（v0.10 路径）
- post-commit / pre-push hook 绕过（`--no-verify`）—— 违 Git Safety Protocol
- 自动 PR / upstream protected branch 自动处理 —— push rejected 进 needs-attention，用户手动处理
- 退避重试 —— 失败直接进 needs-attention，下次 cycle 重试；简单 backoff 会混淆真错误
- 外部状态文件 `.astack/auto-sync-state.json` —— 状态全部入库 SQLite + SSE 广播，单真相源
- OAuth token 续签 / SSH key 管理 —— 鉴权失败等同 needs-attention
- 把 auto-sync 接到既有 `sync.completed` / `repo.refreshed` SSE —— 独立事件类型避免每小时事件风暴
- 并行跑多 repo cycle —— 串行可接受（10 repo ~5s），并行对 git CLI 并发行为 unspecified
- 修复 spec-lint 正则与 AGENTS.md §4.1 命名规范的偏差（独立小迭代处理，本迭代 PR4 接受 spec-lint 报"命名规则"一条 ERROR）之外的脚本问题（bash 3.2 `declare -A` 不兼容）
- 非 `.claude` primary_tool 的特殊处理 / Windows 路径兼容（沿用历史决策）

## v0.10 — Force Refresh：脏 open-source 镜像的显式 reset + pull 入口

**本迭代做：**
- `packages/shared/src/schemas/repos.ts`：新增 `RefreshRepoRequestSchema = z.object({ force: z.boolean().default(false) }).strict()`；`RefreshRepoResponseSchema` 扩 `skipped_reason?: "dirty_working_tree"` + `reset_performed?: boolean`（§A7 互斥）
- `packages/shared/src/schemas/events.ts`：`RepoMirrorResetPayloadSchema.reason` 枚举扩 `"user_forced"`（additive，不 breaking 既有 listener）；`EventType.RepoMirrorReset` JSDoc 同步 v0.10 第二个调用方
- `packages/shared/src/errors.ts`：`ErrorCode.REPO_READONLY` JSDoc 扩展到对称用法（push-on-open-source / force-on-custom）
- `packages/server/src/services/repo.ts`：
  - `GitImpl` 扩 optional `resetHard?`；`defaultGitImpl.resetHard = gitResetHard`
  - `RefreshOutput` 接口扩 `skipped_reason?` / `reset_performed?`
  - `refresh(repoId, opts?: { force?: boolean })` 签名 + 三分支（open-source+dirty+!force → skip+`skipped_reason`；open-source+dirty+force → `remoteHead → resetHard("origin/HEAD") → warn → emit RepoMirrorReset(user_forced)` 然后 fall-through 到正常 pull；custom+force → `REPO_READONLY`；clean / 其余 → 原路径）
  - 新 logger key `repo.refresh.user_forced_reset`
- `packages/server/src/http/routes.repos.ts`：`POST /:id/refresh` 用 `parseRefreshBody(req)` 手动解析 body（空 body → `{force:false}`，非法 JSON → 空 body fallback，非 boolean `force` / 额外字段 → ZodError → 全局 handler 转 `VALIDATION_FAILED` 400）；response 带 optional `skipped_reason` / `reset_performed` 字段
- `packages/cli/src/client.ts::refreshRepo(id, opts?)`：始终 POST JSON body `{force:...}`
- `packages/cli/src/commands/repos.ts::runReposRefresh`：分支 copy（`skipped_reason` → `printWarn` 引导 `--force`；`reset_performed` → `reset + pulled`；其余原 copy 不变）
- `packages/cli/src/bin.ts`：`repos refresh <id>` 加 `--force` option
- `packages/web/src/lib/api.ts::refreshRepo(id, opts?)`：始终带 JSON body
- `packages/web/src/pages/ReposPage.tsx`：
  - `RepoCardProps` 加 `onForceRefresh?: () => Promise<void>`，`undefined` → 按钮不渲染
  - `RepoCard` 渲染 `[Refresh][Force pull?][Remove]` 三按钮，Force pull 仅 `kind==="open-source"` 时出现
  - 独立 `forcing` useState，`busy = refreshing || forcing`
  - `handleForceRefresh(repo)` 用 `window.confirm` 弹 `Force pull will reset ~/.astack/repos/<name>/ to origin/HEAD and DISCARD any local edits...` 文案（§A3 本地化路径）
  - `handleRefresh(id, {force})` toast 三分支（skipped 用 `toast.warn` 引导 Force pull / reset_performed 用 `toast.ok "Mirror reset + pulled"` / 其余保留 v0.9 copy）

**本迭代不做（延后到 v0.11+）：**
- custom repo 的 force pull 放开（语义与未提交 push 流程强耦合，需单独 spec）
- Force pull 批量版本（一次性对所有 dirty mirror 执行，危险度过高）
- Force pull dry-run 预览（`git diff HEAD origin/HEAD` 可视化；UI 工程量大，用户可用 IDE 看）
- `RepoService.refresh` 自身改成 "auto-heal like SyncService"（违背 v0.6 "skip + warn 是诚实信号" 的既有决策）
- `RepoMirrorReset.reason` 加 `"detached_head"` 等新值（无对应代码路径，不预先加值）
- CLI `--force` 的交互式 prompt（CLI 流式 API，用户传 `--force` 即视为确认）
- `RepoMirrorReset` payload 扩 `reset_by: "user" | "auto"`（`reason` 已经区分够）
- 新 `ErrorCode.REPO_DIRTY_WORKING_TREE`（skipped 是 HTTP 200 成功短路，用 `skipped_reason` 字段不用错误码）
- 抽 `ensureMirrorClean` 到公共 helper（§A4：两份调用方 DI 表面不同，保持各自实现 + 注释互指）
- Project Detail 页同步加"强制 sync"（sync 路径 `ensureMirrorClean` 已自愈，无 UI 行动需求）

## v0.9 — Repo 卡片操作按钮外显平铺

**本迭代做：**
- `packages/web/src/pages/ReposPage.tsx`：移除 `RepoMenu` + `MenuItem` 组件（原 `⋯` popover 菜单），在 `RepoCard` 右上操作区直接渲染两个 `Button size="sm"`：`variant="ghost"` 的 Refresh 与 `variant="danger"` 的 Remove
- Refresh 按钮点击走卡片内本地 `refreshing: useState<boolean>`，await 父组件 `handleRefresh(id)`（返回 Promise）期间禁用 + 文案切 `Refreshing…`；`onRefresh` prop 类型由 `() => void` 收紧为 `() => Promise<void>`
- 按钮容器保留 `pointer-events-auto` + `stopPropagation` 契约，避免点击按钮触发卡片整体展开/折叠（与 v0.3 建立的"整卡可点"契约共存）
- 不扩 `Button` primitive（现有 `size` / `variant` 已覆盖 `sm` + `ghost` + `danger`，R1 grep 对齐过）
- `Remove` 按钮继续走现有 `handleDelete` 中的原生 `confirm(...)`（v0.3 决策 T8 Dialog primitive 仍 out of scope）
- E2E 覆盖：Refresh 可见可点 + loading 态切换；Remove 可见可点 + confirm 取消/确认两分支；点击按钮时 `expanded` 不翻转

**本迭代不做（延后到 v0.10+）：**
- 批量 "Refresh all"（跨卡片操作）
- Open-source 脏镜像的"强制 pull / reset --hard"显式 UI（后端 `gitResetHard` 已就绪但 v0.6 显式保留 `RepoService.refresh` 的 skip+warn 语义）
- Refresh 进度细粒度（pulling → scanning → upserting 分段 SSE）
- 第三个以上 repo action（查看日志 / 复制 clone URL / 固定 version）
- 抽 unified `Menu` primitive（当前无第二个消费点，避免过早泛化）
- `ProjectDetailPage` 等其他页面类似 `⋯` 菜单的一致化改造
- 移动端按钮区空间不足时回退菜单的响应式方案
- 卡片级键盘快捷键（`R` / `D`）—— `CommandPalette` 已有 repo 命令入口

## v0.8 — Auto-adopt Reflow（后加 repo 能重分类已兜底 LocalSkill）

**本迭代做：**
- `ProjectBootstrapService.scanRaw` 的 `adoptedLocalKeys` 过滤缩紧为仅 `origin='adopted'`；`origin='auto'` 的 LocalSkill 行允许重新参与 `matched / ambiguous / unmatched` 三元分类
- `ProjectBootstrapService.scanAndAutoSubscribe` 在持 `projectBootstrapLockKey` 锁内追加 snapshot + flip 流程：subscribe 成功后把对应 `origin='auto'` LocalSkill 行翻 `status='name_collision'`（§A6 反方向契约）
- `LocalSkillService.markNameCollisionUnderLock(projectId, refs)` 新方法，与 `autoAdoptFromUnmatched` 对称的无锁下游接口；翻转数 > 0 时 emit 一次 `local_skills.changed`
- `ProjectDetailPage.loadBootstrap` 从 `api.inspectBootstrap`（纯读）切到 `api.scanBootstrap`（幂等写），每次打开项目页自动触发重分类收敛
- 测试：更新 PR4 test 3 注释；新增 v0.8 test 7（auto → 后加 repo → subscribe + name_collision）+ v0.8 test 8（adopted 后加 repo 不翻转）
- retro 沉淀 R8（兜底标记不应被当作永久 ownership）+ P8（兜底决策的永久化）

**本迭代不做（延后到 v0.9+）：**
- name_collision 的用户裁决 UI（一键 unadopt / 退订）
- `origin='auto'` 匹配成功后自动 unadopt（决策：保留让用户决定）
- 反向修复已订阅 skill 被 adopt 后的顺序一致性（§A6 正方向已覆盖，未见盲区再加）
- Daemon 启动时对所有项目 re-run scanAndAutoSubscribe
- 非 `.claude` primary_tool 的 bootstrap 重分类
- 把 `origin='auto'` LocalSkill 纳入 Subscriptions 面板的 ambiguous 面板
- CLI 层对 "rescan after new repo" 的命令入口（跟其他 CLI 一致性统一迭代）

## v0.7 — Local Skills as First-Class Citizens

**本迭代做：**
- 新增 `LocalSkill` 领域概念 + 独立 `local_skills` SQLite 表（`origin: adopted | auto`、`status: present | missing | modified | name_collision`、`content_hash`），不进 `skills` / `subscriptions` / `system_skills` 任何既有表
- `LocalSkillService`：`list / adopt / unadopt / rescan / suggestFromUnmatched` 五个方法；`unadopt` 默认不删 fs 文件，可选 `delete_files: true` 显式删除；`rescan` 只刷新已 adopted 条目的 hash/status，不导入新文件（A7）
- 5 个 HTTP 端点：`GET /local-skills`（纯读）/ `POST /local-skills/adopt` / `unadopt` / `rescan` / `GET /local-skills/suggestions`；response shape 对齐 v0.5 `ApplyResolutionsResult`（`succeeded + failed[]` 带 error_code + message，遵 R7）
- `ProjectBootstrapService.scanAndAutoSubscribe` 扩展 auto-adopt：扫描出 `unmatched` 中符合 heuristic（scanner 合法 + 不在 `ignored_local` + 无订阅）的条目自动 adopt 为 `origin: "auto"` LocalSkill；`scanRaw` 在三元分类前加过滤 "已 adopt LocalSkill"（与 `ignored_local` / 已订阅并列）
- 1 个新 SSE 事件：`local_skills.changed`（coarse-grained，payload 含 `summary: { added, removed, modified, missing }`；不新增分项事件）
- A9 跨服务锁扩展：LocalSkill 三条写路径（adopt / unadopt / rescan）复用 v0.5 `projectBootstrapLockKey(projectId)` 锁，与 ProjectBootstrapService / SyncService.syncProject 共用
- A8 进程内锁：`inflightRescan: Map<projectId, Promise>` 防并发 rescan
- 前端：新 `Local Skills` tab（位于 Subscriptions 之后）+ `LocalSkillsPanel` + `AdoptDrawer` + api 层 5 个方法 + `useQuery(['local-skills', projectId])`；`SubscriptionsPanel` 的 `UnmatchedEmptyState` 条件放宽为 `unmatched.length > 0`（原为 `subscriptions.length === 0 && unmatched.length > 0`），copy 改为 "N local skills not tracked → [Manage in Local Skills tab]"
- E2E ≥ 3 scenario（legacy register 触发 auto-adopt / 手动 adopt+unadopt / rescan 发现 missing）

**本迭代不做（延后到 v0.8+）：**
- LocalSkill → git repo 的 "Promote to repo" 向导（跨迭代 UX，涉及 repo 创建流程）
- LocalSkill 内容编辑器（Web 里改 `.claude/commands/dev.md`）—— 文件所有权原则，astack 只读+索引，编辑走 IDE
- LocalSkill 的跨项目复制 / 借用（是 fs copy，不需 astack 介入）
- LocalSkill 发分项 SSE 事件（adopted / unadopted / modified 分离）—— coarse `.changed` 足够
- CLI `astack local adopt / unadopt / list` —— 本迭代只 Web，CLI 一致性 v0.8 补齐
- 非 `.claude` primary_tool 的 LocalSkill 支持 —— 同 v0.4 / v0.5 保持 `.claude` only
- LocalSkill 与 `ignored_local` 合并 —— 保持独立，`ignored_local` 专指 bootstrap ambiguous 不订阅
- 把 LocalSkill 纳入 Sync 流程 / 头部 `1 skill · 0 tools` 计数（A10）
- Team 协作 UI / 跨开发者 LocalSkill 同步（本质 per-machine；靠 git 的 `.claude/**` 文件 + auto-adopt heuristic 幂等性）
- Daemon 启动时全项目 rescan
- name_collision 的自动裁决按钮（仅标状态，让用户看到）
- v0.5 `ignored_local` 字段迁移到 `local_skills` 表（两表语义不同：§A3）
- `BOOTSTRAP_SCAN_CONFIG` 与 `DEFAULT_SCAN_CONFIG` 的全局合并（同 v0.5 Out of scope #8）

## v0.6 — Open-source 镜像卫生 + Resolve 路径自愈 + 日志落盘

**本迭代做：**
- `SyncService.ensureMirrorClean(repo)` 私有方法：对 `kind=open-source` 仓库 pull 前 `isClean()` 探测；脏态则 `git reset --hard origin/HEAD` 自愈 + `sync.mirror_reset` warn 日志 + `repo.mirror_reset` SSE；`kind=custom` 仓库 short-circuit 不自愈（见 A1）；`isClean()` 自身抛错原样冒泡不尝试 reset（P1-2）
- 插入点：`sync.ts` **2 处** `git.pull` 之前（`pullOne (sync.ts:177)` / `resolve (sync.ts:670)`）；**不插入** `pushOne (sync.ts:471)`（该路径只对 custom 仓库触达，dirty 是 push 流程合法中间态）；**不插入** `pullBatchUnderLock`（不直接调 pull，通过 `pullOne` 间接触达，由 `repoPulled` Set 去重）；**不改** `services/repo.ts::refresh (repo.ts:285)` 既有 skip+warn 语义
- `git.ts` 新增 `gitResetHard(localPath, ref)`；`SyncServiceDeps.gitImpl` 扩 `isClean?` / `resetHard?` optional（保持向后兼容，测试 double 不必改）
- 新 SSE 事件 `repo.mirror_reset`，payload `{ repo_id, repo_name, repo_kind: "open-source", reason: "dirty_working_tree" }`；`RepoMirrorResetPayloadSchema` Zod 定义在 `shared/schemas/events.ts`
- `BatchResolveResponseSchema` outcomes 元素扩 `error_code?` + `error_detail?` 两个 optional 字段（R3 原子：schema 扩 + `resolveBatch` 组装点同 PR）；前端 `ProjectDetailPage::onResolveAllConflicts` toast 展开首 3 条 `error_detail`
- `logger.ts::createLogger(minLevel, stream | stream[])` 扩签名为单 stream 或多 stream（向后兼容）；`daemon.ts::startDaemon` 移除外部 `logger` 参数、内部打开 `config.logFile` WritableStream 并构造 tee logger；`DaemonHandle` 新增 `logger` 字段；`handle.close()` 尾部 `logFileStream.end()`；`cli/commands/server.ts::runServerStart` 改用 `handle.logger`
- 按 5 个 PR 切分（PR1 自愈核心 + SSE schema 原子 / PR2 error_detail 穿透 R3 原子 / PR3 前端 toast / PR4 日志落盘（独立，可并行）/ PR5 文档 + retro 沉淀）
- 测试覆盖：5 个 ensureMirrorClean 用例（open-source 脏自愈 / custom 脏不自愈 / open-source clean no-op / resetHard 失败冒泡 / isClean 自身抛错冒泡）+ 1 pullOne batch `repoPulled` 去重 + 1 resolve-batch outcomes 带 error_code/error_detail + 1 daemon.log 含 daemon.started + 1 前端 toast 展开

**本迭代不做（延后到 v0.7+）：**
- CLI `astack mirror doctor` 主动健康检查所有镜像（价值次级）
- 把 pull / push 路径所有错误结构化到前端（仅 resolve-batch 的 outcomes 聚合层有此损耗，单条路径走 AstackError 已够用）
- daemon.log 轮转（logrotate / size-based rotation；保留策略单独讨论）
- 修改 `services/repo.ts::refresh` 现有的 "skip + warn" 语义（refresh 的语义对用户调试友好，不强制改自愈）
- Scanner / subscribe 路径加相同镜像护栏（它们不调 `git.pull`，不受脏态影响）
- 为 `resetHard` 行为开 safety switch（open-source 镜像 dirty 本身异常，不留 escape hatch）
- CLI `astack subscribe` / `astack sync` batch 失败展开错误（CLI 是 streaming，问题只在 Web toast 聚合层）
- Tee logger 加异步 queue / back-pressure（单用户本地日志，无需过度工程化）

## v0.5 — Subscription Bootstrap for Legacy Projects

**本迭代做：**
- `ProjectBootstrapService`：注册 legacy 项目时自动扫 `<project>/<primary_tool>/`，跟已注册 repo 的 skill 按 `(type, name)` pair 匹配
- 三元分类：`matched`（单 repo 唯一命中，自动订阅）/ `ambiguous`（多 repo 同名，UI 让用户选）/ `unmatched`（无 repo 提供，保持 pure local）
- `BOOTSTRAP_SCAN_CONFIG`：在 `DEFAULT_SCAN_CONFIG`（skills + commands）基础上叠加 `agents/` root，bootstrap 场景专用，**不改全局 DEFAULT_SCAN_CONFIG**
- `.astack.json` 扩展 `ignored_local: Array<{type, name, ignored_at?}>` 字段（带 default `[]`，向后兼容）；PR1 原子改动必须同时扩展 `rewriteManifest` 保留该字段
- 4 个 HTTP 端点：`GET /bootstrap`（纯读）/ `POST /bootstrap/scan`（扫+自动订阅 matched）/ `POST /bootstrap/resolve`（用户选择应用）/ `POST /bootstrap/ignore`（显式忽略）
- 统一 response shape：`ApplyResolutionsResult = {subscribed, ignored, failed, remaining_ambiguous}`；partial success 用 HTTP 200 + `failed[]` 结构化错误
- Subscriptions tab 新增 `BootstrapBanner` + `ResolveBootstrapDrawer`；`ProjectDetailPage` 独立 `useQuery(['bootstrap', projectId])`
- 2 个新 SSE 事件：`subscriptions.bootstrap_needs_resolution`、`subscriptions.bootstrap_resolved`（**不复用也不新增 `subscription.added`**，前端靠 bootstrap_* 事件 invalidate `['status']` + `['bootstrap']` 两个 query key）
- 订阅 `project.registered` 事件做 fire-and-forget 自动扫描 + auto-subscribe matched（失败不阻塞注册）
- A8 per-project 进程内 promise 锁（Map<projectId, Promise>）避免并发 scan 交错
- A9 LockManager 跨服务锁：`project-bootstrap-${projectId}` 由 bootstrap 的所有写入路径 + `SyncService.syncProject` 共同 acquire，防止 `reconcileFromManifest` 与 bootstrap 写入交错（PR2 搭便车修 1 行 `sync.ts`）
- `autoSubscribeMatched` / `applyResolutions` 强制 per-item try/catch（对齐 `subscribeBatch:287-313`），AstackError 归入 `failed[]`，非 AstackError 向上冒泡
- 复用 v0.4 A9 的 `systemSkillIds` 过滤：`harness-init` 等系统 skill 永远不进 bootstrap 任何分类
- E2E 覆盖：pure empty / all matched happy path / ambiguous → resolved / unmatched → ignored

**本迭代不做（延后到 v0.6+）：**
- 自动 sync bootstrap 后的订阅（覆盖本地 drift）—— 违背"不覆盖用户内容"原则
- 按内容 hash 匹配 / smart 匹配提示"内容 95% 相似"—— 命中率低 / 实现复杂
- Bootstrap 时自动建 `linked_dirs`（`.cursor` → `.claude` 等）—— 正交问题，LinkedDirsPanel 已有独立入口
- "重新匹配"已订阅的 skill（换 repo）—— 走现有 unsubscribe + subscribe 流程
- CLI `astack bootstrap scan/resolve/ignore` —— v0.6 跟其他 CLI 一致性补齐
- Team 协作 UI（多人对同一 ambiguous 的解决结果实时同步）—— 靠 git 提交 `.astack.json` 隐式同步
- Daemon 启动时 re-scan 所有项目的 bootstrap —— 注册 + 手动 Re-scan 两个触发点已足够
- 扩展 `SubscriptionState` 枚举新增 `imported` 等状态 —— 沿用现有状态
- 非 `.claude` primary_tool 的 bootstrap —— bootstrap handler 跳过，同 v0.4 A4
- 全局扩展 `DEFAULT_SCAN_CONFIG` 为三 root（让 repo scan 也覆盖 agents）—— 本迭代只做 bootstrap 场景专用 `BOOTSTRAP_SCAN_CONFIG`，避免扩大 blast radius
- Sidebar 项目列表上 pending ambiguous 的 badge —— UX 加分项，v0.6
- Settings tab 的 "Ignored local skills" 管理 UI（un-ignore）—— v0.6 补
- "Bootstrap baseline" 内容 hash 快照（诊断用）—— 价值有但非必须

## v0.4 — Harness Tab + 系统级 Skill 首次落地

**本迭代做：**
- `SystemSkill` 领域类型（独立于 `Skill` / `Subscription`，不进 `subscriptions` 表）
- 搬运 `scripts/harness-init` → `packages/server/system-skills/harness-init/`，npm publish 带上
- 注册项目时通过事件订阅 fire-and-forget seed 到 `<project>/.claude/skills/harness-init/`（仅当目标目录不存在时 seed，不覆盖已有内容）
- `.astack/system-skills.json` stub 文件记录 seed 时的内置 hash + seeded_at + last_error
- `Project Detail` 新增 **Harness** tab（4 状态：`installed / drift / missing / seed_failed`）
- **内置版本即真相源**：用户不允许修改 seed 目录；被修改时 UI 显示 `drift` 诚实告知"will be overwritten on next Re-install"；点 Re-install 强制覆盖
- Sidebar "Skill Matrix" 重命名为 "Matrix"（纯文案）
- 新 SSE 事件：`harness.changed`（仅在 seed/install 真改动 fs 时广播；inspect 不广播）
- Scanner 过滤系统 skill 同名的 repo skill（`scanRepo` 注入 `systemSkillIds` 黑名单）+ SymlinkService 兜底 guard，防止命名空间污染
- E2E 覆盖：installed happy path / drift overwrite / legacy 项目不被 seedIfMissing 覆盖 / 污染 repo 被 scanner 剔除

**本迭代不做（延后到 v0.5+）：**
- 自动清理 seed 目录 / 基于 `AGENTS.md+INDEX.md` 的项目 initialized 检测（需求 v2 决策取消）
- `GET /harness` 等 read 路径带写副作用（v2 改为纯读）
- 60s reconcile 节流 + `sync.completed` 触发 reconcile（v2 决策：无 reconcile 概念）
- Daemon 启动时扫全部项目做 drift 覆盖（v0.5 配合版本升级语义一起做）
- SystemSkill 版本升级检测（存根存 `built_in_hash` 预留，v0.5 加 "Built-in updated, Re-install" UI 提示）
- 多个系统级 skill 的管理 UI（仅 harness-init 一个，但类型设计保留扩展位）
- Harness 子命令（`/spec`、`/dev` 等）的健康检测（只管 skill 目录 hash）
- `astack.json` 里声明系统 skill 依赖（用独立 stub 文件，见 A1）
- CLI `astack harness install/status`（v0.5 跟其他 CLI 一致性补齐）
- 非 `.claude` primary_tool 的 seed 适配（UI 提示，不 seed）
- Dialog primitive 抽象（T8 待 v0.5）
- Windows 路径兼容（沿用 v0.3 决策）

## v0.3 — 项目详情页重设计 + Web 端完整管理能力

**本迭代做：**
- ProjectDetailPage 重写为 Tabs 布局（Subscriptions / Linked Dirs / Sync History / Settings）
- `Tabs` + `Drawer` 两个 UI primitive
- `BrowseSkillsDrawer`（Web 端订阅入口）+ `SyncResultCard`（Sync 可视化）
- 后端 `GET /api/projects/:id/sync-logs` + `LinkedDir.target_path` + batch subscribe partial-success
- `ui.tsx` → `ui/` 目录 + `useProjectActions` hook（纯重构，作为前置）
- `packages/web` Playwright E2E 脚手架
- 移动端响应式 + CommandPalette 扩展 + a11y 专项测试

**本迭代不做（延后到 v0.4+）：**
- Pin version UI（后端字段保留，UI 延后）
- Bulk actions（多选 sync / unsubscribe）
- 3-way merge UI
- `sync_logs` 过期清理 cron
- `GET /api/skills?q=` 聚合查询（Browse Drawer 当前接受 N+1）
- Windows junction 兼容
- Custom linked dir path（先 3 个预设 dropdown）
- DESIGN.md 单一事实来源（独立跑 `/design-consultation`）

## v0.2 — sqlite 换底 + 多仓库目录兼容

已 SHIPPED，见 [Iteration1_SqliteAndMultiRepo_SPEC.md](./Iteration1_SqliteAndMultiRepo_SPEC.md) § 1。
