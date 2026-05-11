# v0.9 — Repo 卡片操作按钮外显平铺（Refresh / Remove 出菜单）

> **文档状态：SPEC（待实施）· 2026-05-10**
>
> 创建于 2026-05-10，分支 main
>
> **前置依赖：** 无（纯 UI 调整）。后端 `POST /api/repos/:id/refresh`（`routes.repos.ts:50-59` → `RepoService.refresh` (`repo.ts:246-314`)：加锁 → `open-source` 脏态 skip → `git pull --ff-only` (`git.ts:58-65`) → `scanAndUpsert` → emit `EventType.RepoRefreshed`）与前端 `api.refreshRepo / deleteRepo`（`web/src/lib/api.ts:142-146`）均已就绪，本迭代不动后端。
>
> **触发事件（2026-05-10）：** 用户反馈 `ReposPage` 的每张 repo 卡片右上 `⋯` 菜单（`ReposPage.tsx:667-738` 的 `RepoMenu` 组件）里只有 "Refresh" / "Remove" 两项，发现度低、需要两次点击（展开 → 选）才能触发常用操作。希望把这两个操作外显平铺成按钮。
>
> **本迭代性质：** 纯前端 UI 调整，不改 API、不改 DB、不改 SSE 事件集。

## 0. 迭代缘起

v0.3 Graphite UI 重设计时对 `ReposPage` 的卡片定了两条：
1. "Actions 移入 `⋯` 菜单让卡片 header 保持干净"（`ReposPage.tsx:16-18` 注释）
2. "整张卡片是展开触发区"（同上）

实际运行一段时间后第一条被证伪：

- 每张卡片只有两个 action（Refresh / Remove），放菜单里反而比平铺**更啰嗦** —— 从视觉扫描角度 `⋯` 后用户仍要预期"最多 2 个选项"，信息密度并不低。
- Refresh 是高频动作（v0.6 镜像脏态自愈 / v0.8 auto-adopt reflow 场景下用户被教育要主动点 Refresh 验证状态收敛），每次两次点击累加起来足以抹平"卡片干净"的审美收益。
- Remove 是低频但危险动作，藏在菜单里反而让用户误以为"这东西可以随便点"；平铺后用显式的次要按钮 + destructive hover 态更直接表达"这是个破坏性动作"。

第二条（整卡可点展开）**保留**——展开看 skills 是主场景，改成按钮区不影响它（按钮区 `pointer-events-auto` + `stopPropagation`，已有机制，见 `ReposPage.tsx:354-358`）。

### 为什么现在能做

1. 后端 `POST /api/repos/:id/refresh` 链路成熟（v0.6 的 `ensureMirrorClean` 自愈已覆盖 SyncService 侧，`RepoService.refresh` 自身的 "open-source 脏态 skip + warn" 语义被 v0.6 §Out of scope 显式保留，本次 UI 变化不触动该契约）。
2. `RepoMenu` 的 `onRefresh` / `onDelete` 两个 props 与父组件 `handleRefresh(id)` / `handleDelete(repo)` 的连接已经存在，不需要搬动状态。
3. `Button` / `IconButton` primitive（`ui/Button.tsx` / `ui/IconButton.tsx`）就位，不需要新 primitive。

## 1. 本次迭代的边界

### In scope（本迭代做）

**前端 — `ReposPage` 卡片右上操作区改造**

1. `packages/web/src/pages/ReposPage.tsx`：
   - **移除** `RepoMenu` 组件（`ReposPage.tsx:665-764` 整段，含 `MenuItem` 内部组件）—— 不保留 "有状态 popover" 路径。
   - `RepoCard` 的 actions 区（`ReposPage.tsx:352-360`）改为直接渲染两个按钮：
     - `<Button variant="ghost" size="sm">Refresh</Button>` （次要视觉权重，中性色）
     - `<Button variant="ghost" size="sm" tone="destructive">Remove</Button>`（destructive hover 红色）
   - 两按钮横向并排，按钮区继续 `pointer-events-auto` + `onClick stopPropagation` 防止冒泡到"整卡展开"按钮（与现有契约一致）。
   - Refresh 点击后到返回前按钮进入 **loading 状态**（禁用 + 文案切换为 `Refreshing…`），避免用户重复点。Loading 状态由 `RepoCard` 自己持有（local `useState<boolean>`），不提升到父组件 —— 父组件的 `handleRefresh(id)` 返回 Promise 即可 await。
   - Remove 点击后弹原有 `confirm(...)`（`handleDelete` 内部，`ReposPage.tsx:199`），行为不变。
2. `packages/web/src/components/ui/Button.tsx`：如需要新增 `size="sm"` / `tone="destructive"` 两个 prop 变体（查现状后按需）。

**测试**

3. 新增 / 更新 E2E（如 `packages/web/tests/repos.spec.ts`）：
   - test A：卡片 Refresh 按钮可见、可点，点击后触发一次 `POST /api/repos/:id/refresh`，按钮短暂置灰 + 文案变 `Refreshing…`，resolve 后恢复。
   - test B：卡片 Remove 按钮可见、可点，点击后弹 `confirm`，取消 → 无 network 调用，确认 → 触发一次 `DELETE /api/repos/:id`。
   - test C：点两个按钮时 `expanded` 状态不变（不会意外展开折叠卡片）。
   - 删除掉原 `⋯` 菜单相关的 E2E / 快照（若存在）。

**文档**

4. `docs/version/INDEX.md` / `BOUNDARIES.md` 追加 v0.9 行。
5. `AGENTS.md` 的"当前活跃迭代"区块更新最近完成到 v0.9（如按该项目惯例，由 `/ship` 时点写入）。

### Out of scope（不做，延后）

- 批量 "Refresh all" 按钮（跨卡片操作）—— 价值待验证，v0.10+。
- 强制 pull（open-source 脏态 `git reset --hard origin/HEAD` 的显式 UI）—— 后端 `gitResetHard` 已有，但属于新语义决策，`repo.ts::refresh` 的 "skip + warn" 在 v0.6 被显式保留为"用户可见的调试信号"，这次不动它。
- Refresh 进度条 / 细粒度状态（pulling → scanning → upserting）—— 动作通常 < 2s，不值得额外 SSE 字段。
- 卡片操作区加第三个 action（查看日志 / 复制 clone URL / 固定版本）—— 出现频次低 + 有别处入口（Settings / 剪贴板手动），扩项前先看真实反馈。
- `RepoMenu` primitive 重构为复用的 `Menu` 组件 —— 整体删除更简单，若其他页面未来需要菜单再独立抽取。
- `ProjectDetailPage` 等其他页面的类似 `⋯` 菜单 —— 本迭代只动 `ReposPage`，其他页面等各自反馈触发。
- 移动端紧凑布局（按钮区宽度不够时的折叠回菜单）—— 当前 `ReposPage` 响应式方案已有优先级，该回归等到整体移动端审阅一起做。
- 键盘快捷键（卡片 focus 时 `R` = Refresh / `D` = Remove）—— `CommandPalette` 已有 repo 相关命令，不重复入口。

## 2. 架构决策

### §A1 — 按钮状态就地化，不走全局 store

`RepoCard` 的 `refreshing` loading 状态 **仅保存在卡片自己的 `useState`**，不上提到 `ReposPage` 也不进 `useQuery` 或其他全局 store。理由：

1. 只在单张卡片范围内用，父组件和其他卡片不需要感知。
2. Refresh 完成后父组件 `load()` 会重新 set `repos`，`RepoCard` 基于新 props 渲染，loading 状态随卡片同步重建——不会有"卡片消失但 loading 状态残留"的脏数据问题（卡片只在 repo 被删除时才消失，而删除不走 Refresh 按钮）。
3. `handleRefresh(id)` 返回 Promise，`RepoCard` 内只需 `setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); }`，契约最小。

### §A2 — 不提 unified `Menu` primitive

`RepoMenu` 是 `ReposPage` 当前**唯一**的 `⋯` 菜单实例（grep 过 `packages/web/src` 其他 `.tsx` 无同类模式）。本次只删不抽：

- 抽 `Menu` primitive 需要考虑 a11y（roving tabindex / `aria-activedescendant`）/ 定位（portal / flip）/ 键盘导航——都是额外工程量。
- 如果未来其他页面需要菜单，那时再基于新的真实需求抽取，不要预先泛化（R6 的反面：过早护栏也是工程税）。

### §A3 — Refresh / Remove 按钮视觉权重定义

两按钮都用 **ghost（次要）** 变体而非 `primary`。理由：

- 卡片主 CTA 是 "展开看 skills"（整卡可点），Refresh / Remove 是辅助操作。
- `primary` 按钮同屏幕不超过 1 个的视觉规则（见 `ui/Button.tsx` 的注释惯例）在 Repos 列表里是"Register repo"（`ReposPage.tsx:232-234`）占位。
- Remove 用 destructive tone（hover 红色 + 红文字）而非红色 filled，避免把"破坏性"误升级成"鼓励点击"。

### §A4 — `confirm(...)` 的原生 dialog 保留不改

`handleDelete` 里用浏览器原生 `confirm(...)`（`ReposPage.tsx:199`）。本次不换成自定义 `Drawer` / `Dialog` primitive：

- 原生 `confirm` 是同步阻塞 API，替换要重写 `handleDelete` 的控制流。
- v0.3 已决定"Dialog primitive 抽象（T8 待 v0.5）"并在 v0.5/0.6 继续延后，不在本迭代范围内兜底。
- Remove 是低频操作，原生 confirm 的 UX 足够防误操作。

## 3. 数据流 / 调用关系

不变。新 UI 调用现有父组件方法：

```
RepoCard::<Refresh button>.onClick
  → setRefreshing(true)
  → await props.onRefresh()            // 即 ReposPage::handleRefresh(id)
      → api.refreshRepo(id)            // POST /api/repos/:id/refresh
          → RepoService::refresh       // git pull --ff-only + scan + upsert + emit
      → toast.ok(...)
      → await load() + fetchSkills(id)
  → setRefreshing(false)               // finally
```

SSE `repo.refreshed` 事件继续走现有 `useEventListener("repo.refreshed", ...)` 路径（`ReposPage.tsx:164-167`），不与按钮 loading 冲突。

## 4. PR 切分

单 PR 即可（改动量小、耦合度低）：

- **PR1** — `ReposPage.tsx` 删 `RepoMenu` / 加两按钮 + `Button` primitive 按需加 `size="sm"` 和 `tone="destructive"` + E2E 覆盖。同 PR 更新 `INDEX.md` / `BOUNDARIES.md` 新增 v0.9 行。

若 `Button` primitive 扩展触发太多消费点需要适配，则降级为 PR0（primitive 扩展） + PR1（页面改造）两步走；但现有 `Button` 大概率已经支持 `size` / `tone`，实施前 grep 确认（遵循 R1）。

## 5. 测试策略

- **E2E**（见 §1.in_scope test A/B/C）—— 覆盖交互契约。
- **视觉回归**（若 `packages/web` 有 visual regression 基线）—— 更新 Repos 页面快照。
- **单元测试** 不新增 —— `RepoCard` 的 loading 状态纯 React local state，E2E 已覆盖其可观察行为。

## 6. 对黄金法则的呼应

- **R1（复用声明必须 grep 验证）**：实施前 grep `Button` primitive 是否已有 `size="sm"` 和 `tone="destructive"` 变体；没有则同 PR 扩展。本 spec 声明的"`handleRefresh` / `handleDelete` / `api.refreshRepo` / `api.deleteRepo` / `POST /api/repos/:id/refresh` / `RepoService.refresh` 全部就位"均已按 R5 格式 grep 对齐（见 §0 / §3）。
- **R5（代码引用必须函数名:行号双锚点）**：全文所有代码位置引用均用 `function (file:line)` 格式。
- **R4 / R6 / R7 / R8 不适用**：本迭代不动 service 层、不新增 batch API、不加前置过滤器、不引入 fire-and-forget 路径。

## 7. retro 沉淀（本迭代预期）

本迭代太小，预计**不**产生新黄金法则。若实施/评审中发现"隐藏在菜单里的高频 action" 这类 UX 反模式值得沉淀，再回填至 `docs/retro/golden-rules.md` 或 `docs/retro/patterns.md`。
