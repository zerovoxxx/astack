# v0.12 — Plugin Marketplace 布局：扫描 `<root>/<plugin>/{skills,commands,agents}/` 二级容器

> **文档状态: 已完成（IMPLEMENTED · CR 通过 · 2026-05-13）**
>
> PR1（shared 域 + scanner 三文件原子 + 后端单测 T1–T8）/ PR2（CLI `--scan-config-json` + 单测 T9–T11）/ PR3（文档同步）全部落地；38 个 server scanner 测试 + 10 个 cli repos 测试全绿；server / cli typecheck 通过。
>
> **`/code_review` 结论（2026-05-13）：** 三 Phase 全部通过，0 高 / 0 中 / 0 低问题，审查报告见 [`./review/Iteration11_PluginMarketplaceLayout_CR.md`](./review/Iteration11_PluginMarketplaceLayout_CR.md)。候选黄金法则 R9 是否沉淀留待合并后 `/retro` 走查单独决议。

> **文档状态：SPEC（待实施）· 2026-05-13**
>
> 创建于 2026-05-13，分支 main
>
> **前置依赖：**
> - v0.2 已落地：`ScanConfig` / `ScanRoot` / `ScanRootKind` 三段式抽象（`packages/shared/src/domain.ts:176-207`）+ `scanRepo` 多 root 派发（`packages/server/src/scanner/index.ts:75-134`）+ `scan_config` 字段透传（`RegisterRepoRequestSchema` `packages/shared/src/schemas/repos.ts:26-42`）。
> - v0.4 已落地：`systemSkillIds` 黑名单过滤复用入口（`scanRepo` `options.systemSkillIds`）。
> - v0.7 已落地：`LocalSkillService` 用 `(skill.type, skill.name)` 作为命名空间 key（`local-skill.ts:585`），本迭代要求 `name` 含 `/` 时仍能稳定匹配。
> - v0.10 已落地：CLI 在 `repos refresh` 上有 `--force` option 的多 option 模式（`packages/cli/src/bin.ts:235-249`），本迭代复用同一模式给 `repos register` 加 `--scan-config-json`。
>
> **触发事件（2026-05-13）：** 用户 register `git@github.com:anthropics/claude-plugins-official.git` 后 dashboard 显示 `read-only · empty · No skills scanned from this repo`。该仓库根目录只有 `plugins/` 与 `external_plugins/` 两个容器，每个 plugin 自带 `.claude-plugin/plugin.json` + 可选 `skills/<n>/SKILL.md` / `commands/*.md` / `agents/*.md`（35 个 internal + 15 个 external，覆盖 `code-review` / `feature-dev` / `skill-creator` / `playwright` 等高价值条目）。Astack 现有 3 种 `ScanRootKind`（`skill-dirs` / `command-files` / `agent-files`）都是**第一层平铺**，无法表达 "先按 plugin 容器分组、再按容器内部 skills/commands/agents 子目录扫" 的二级语义，导致 0 命中。这是 v0.2 三 kind 抽象**首次遇到的真实结构性盲区**。
>
> **本迭代性质：** 在 `ScanRootKind` 上**新增第 4 个枚举值** `plugin-marketplace`，对应 scanner 派发新增一个 case 函数；**复用** v0.2 的 `ScanRoot.path` / `ScanRoot.kind` shape 不动；**复用** scanner whitelist 原则（`.claude-plugin/plugin.json` 替代 `SKILL.md` 作为 plugin 容器存在性凭证）；**复用** `(type, name)` 作为 skills 表唯一键，通过把 plugin slug 拼进 `name`（`<plugin>/<inner>`）解决跨 plugin 同名冲突，**不动 DB schema**、**不动 SubscriptionRow / LocalSkillRow shape**。CLI 同步加 `--scan-config-json` 让用户能 register 任意自定义 layout（解决"必须打 curl"的 UX 缺口）。**本迭代不引入 builtin seed**、**不动 Web UI**。
>
> **Follow-up 修复（2026-05-14）：** 用户从 Web 注册 `anthropics/claude-plugins-official` 时不会传 `scan_config`，旧 repo 行会一直落回 `DEFAULT_SCAN_CONFIG`，Refresh / Force pull 只能复扫旧布局，仍显示 `empty`。补丁选择方案 C：在 server 注册/刷新路径对已知 marketplace git URL 自动推断 `scan_config`，且对 `scan_config IS NULL` 的旧行在 refresh 时写回正确布局并重扫。该修复仍不把 marketplace 仓库加入 builtin seed，也不新增 Web UI 表单。

## 0. 迭代缘起

### 0.1 v0.2 三 kind 抽象的盲区

v0.2（`Iteration1_SqliteAndMultiRepo_SPEC.md` § "多仓库目录兼容"）当时面对三个示例仓库（`anthropics/skills` / `garrytan/gstack` / `affaan-m/everything-claude-code`）抽象出 `skill-dirs | command-files | agent-files` 三个 kind。共同隐含假设：**根 path 之下的第一层条目就是 skill / command / agent 本身**（容器目录 = 单个 skill）。

`anthropics/claude-plugins-official`（这个仓库到 2026-05 已经是 19.2k stars / 2.4k forks，是 Claude Code 官方插件市场）打破了这个假设：

```
claude-plugins-official/
├── .claude-plugin/marketplace.json    # 市场级 manifest
├── plugins/                            # 容器目录（35 个 internal）
│   ├── code-review/
│   │   ├── .claude-plugin/plugin.json
│   │   └── commands/code-review.md
│   ├── feature-dev/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── agents/{code-architect.md, code-explorer.md, code-reviewer.md}
│   │   └── commands/feature-dev.md
│   ├── skill-creator/
│   │   ├── .claude-plugin/plugin.json
│   │   └── skills/skill-creator/SKILL.md
│   ├── example-plugin/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── commands/example-command.md
│   │   └── skills/{example-command/, example-skill/}
│   └── … (35 个内部插件)
└── external_plugins/                   # 容器目录（15 个 third-party）
    ├── playwright/, github/, linear/, …
```

每个 plugin **就是 v0.2 三 kind 的一个迷你重现**。整个仓库需要的扫描语义是 "把 `plugins/` 与 `external_plugins/` 这两层先展开成 50 个隐式 sub-repo，对每个 sub-repo 套用 v0.2 三 kind 的 `{skills,commands,agents}` 完整组合"。

### 0.2 为什么不能用 v0.2 现有抽象凑

最直接的"硬凑"想法 —— 让用户在 register 时给一个 long-form `scan_config`：

```json
{
  "roots": [
    { "path": "plugins/code-review/commands", "kind": "command-files" },
    { "path": "plugins/feature-dev/commands", "kind": "command-files" },
    { "path": "plugins/feature-dev/agents", "kind": "agent-files" },
    { "path": "plugins/skill-creator/skills", "kind": "skill-dirs" },
    … (≈ 150 行)
  ]
}
```

不可接受的三个原因：

1. **数量级不可写**：50 个 plugin × 3 类 root = 150 条 ScanRoot，纯人工配置；
2. **不可维护**：每次 upstream 加 / 删一个 plugin（这种 marketplace 仓库**就是高频被新增/移除**），用户必须重新生成配置 + `repos remove + register` 才能反映；
3. **跨 plugin 同名冲突**：`code-review` plugin 的 `commands/code-review.md` 与 `pr-review-toolkit` plugin 的 `commands/code-review.md`（如果存在）会撞 v0.2 scanner 的 dedup key `${type}/${name}`，后者直接被丢弃 + warn。

所以必须给 `ScanRootKind` 加一个**显式表达 "marketplace 分组"** 的成员。

### 0.3 v0.6 学过的"复用现有锁/过滤" 教训复用

v0.6 spec § 1.4 的 R6 最早是因为 SyncService.pullOne 与 RepoService.refresh 复制了 `isClean()` 各自一份导致脱节。本迭代的 `scanPluginMarketplace` 同样面临 "诱惑：把 plugin 容器内的 `skills/commands/agents` 三套扫描逻辑就地复制三份" —— **必须复用** 现有 `scanSkillDirs (skill-dirs.ts:25-72)` / `scanFlatFiles (flat-files.ts:19-60)` 两个 helper（PR1 §A1 强制契约），不允许 inline 重新实现，避免日后 `NAME_REGEX` / `safeReaddir` / `parseFrontmatter` 行为漂移。

## 1. 本次迭代的边界

### In scope（本迭代做）

**Shared 域模型扩展（R3：schema 扩展与所有写入点原子绑定）**

1. `packages/shared/src/domain.ts`：**【已完成】**
   - `ScanRootKind` 常量对象**追加**第 4 个成员：
     ```ts
     export const ScanRootKind = {
       SkillDirs: "skill-dirs",
       CommandFiles: "command-files",
       AgentFiles: "agent-files",
       PluginMarketplace: "plugin-marketplace"   // 新增
     } as const;
     ```
   - 同文件 `ScanRoot.kind` 字段的 JSDoc 同步追加第 4 行枚举说明：
     ```
     - "plugin-marketplace"  treat <path> as a directory of plugin
                              containers; each child dir with
                              `.claude-plugin/plugin.json` is expanded
                              into an implicit triple: <plugin>/skills,
                              <plugin>/commands, <plugin>/agents.
                              Skill `name` is namespaced as `<plugin>/<inner>`.
     ```
   - `DEFAULT_SCAN_CONFIG`（`domain.ts:202-207`）**不变**（保护其他三个示例 seed）。
   - `BUILTIN_SEED_URLS`（`domain.ts:216-220`）**不变**（本迭代不预置 marketplace seed，见 §2.1 决策 1）。

2. `packages/shared/src/schemas/common.ts`：**【已完成】**
   - `ScanConfigSchema` 当前用 `z.literal(...).or(...)` 还是 `z.enum(...)` 写枚举？grep 验证后扩相同 shape；如果是基于 `ScanRootKind` 常量对象的 `z.enum(Object.values(ScanRootKind) as [string, ...string[]])`，则**零改动**（自动跟随 const 对象）。这一条要在 PR1 第一行 grep 验证后落实写法（R1）。
   - **实施备注：** 现有写法是 `z.enum([SkillDirs, CommandFiles, AgentFiles])` 显式枚举，本迭代追加 `ScanRootKind.PluginMarketplace` 一行使新成员被 schema 接受。

**后端 — Scanner 派发新增 case**

3. `packages/server/src/scanner/index.ts::scanRepo`：**【已完成】**
   - `switch (root.kind)` 增加第 4 case：
     ```ts
     case ScanRootKind.PluginMarketplace:
       scanPluginMarketplace(repoPath, root.path, skills, warnings);
       break;
     ```
   - 跟现有三 case 同形，不动其它 case，不动 `seen`/`deduped`/`blacklist` 后段（自动覆盖新 case 产出的 skills）。

4. `packages/server/src/scanner/plugin-marketplace.ts`（新文件）：**【已完成】**
   ```ts
   /**
    * Scan a root path as a "Claude Code plugin marketplace": each
    * first-level subdirectory is a plugin container, identified by the
    * presence of `.claude-plugin/plugin.json` (whitelist principle, same
    * spirit as SKILL.md for skill-dirs).
    *
    * For each valid plugin <plugin>:
    *   <root>/<plugin>/skills/   → scanSkillDirs (resultType=skill)
    *   <root>/<plugin>/commands/ → scanFlatFiles (resultType=command)
    *   <root>/<plugin>/agents/   → scanFlatFiles (resultType=agent)
    *
    * Resulting `ScannedSkill.name` is namespaced as `<plugin>/<inner>`
    * to avoid cross-plugin collision under the (type, name) dedup key
    * (skills table UNIQUE(repo_id, type, name); see schema.ts:96).
    *
    * Non-recursive past depth 2; never descends into nested plugins.
    *
    * Warnings (not failures):
    *   - subdir without `.claude-plugin/plugin.json` → skipped silently
    *     (could be `.git`, `LICENSE`, `external_plugins/playwright/`
    *     placeholder, etc.); only emit warning when subdir name passes
    *     NAME_REGEX but lacks the manifest, to surface "almost-a-plugin"
    *     authoring mistakes.
    *   - plugin with neither skills/ nor commands/ nor agents/ → no
    *     warning, no skill emitted (e.g. pure-MCP plugin = `.mcp.json`
    *     only is a legal Claude plugin shape).
    */
   ```
   - **强制复用** `scanSkillDirs` 和 `scanFlatFiles`（PR1 §A1 契约）。先把它们改成 "把 `relPath` 与 `name` 的拼接逻辑外置"，让 plugin-marketplace 能**注入命名空间前缀**。具体改造见 §A1。
   - 计算 `relPath` = `<root>/<plugin>/<sub>/<inner-relpath>`（保留完整磁盘路径，给 SubscriptionService.workingPath 走 `canonicalWorkingRelPath` 时不依赖该字段，但前端 / debug 日志需要）。
   - 计算 `name` = `<plugin>/<innerName>`（`<plugin>` 单独通过 `NAME_REGEX`、`<innerName>` 单独通过 `NAME_REGEX`，拼接处用 `/` —— `/` 不在 `NAME_REGEX` 字符集里，天然作为唯一分隔符）。

5. `packages/server/src/scanner/skill-dirs.ts`：**【已完成】**
   - `scanSkillDirs` 签名扩第 5 个**可选**参数 `namePrefix?: string`（缺省 `""`），用于 plugin-marketplace 模式下把 plugin slug 拼进 `name`。其它三 case 调用零改动。
   - `out.push({ ..., name: namePrefix ? `${namePrefix}/${entry.name}` : entry.name, relPath: ... })`。
   - JSDoc 同步增 namePrefix 段说明。

6. `packages/server/src/scanner/flat-files.ts`：**【已完成】**
   - `scanFlatFiles` 同步加第 6 个可选 `namePrefix?: string`，逻辑对称（`name = namePrefix ? `${namePrefix}/${base}` : base`）。
   - frontmatter 校验段（`if (fm.data.name && fm.data.name !== base)`）保持只比对**裸 base**，不比对带前缀的 name —— 因为 plugin 内部作者写 SKILL.md 时不会知道 plugin slug。同步加 JSDoc 注释这一点。

**后端 — fs 路径兼容（已自然成立，本节仅声明保留）**

7. `packages/server/src/services/sync.ts::canonicalWorkingRelPath` (sync.ts:1281-1294)：**【已完成 — 声明保留，无代码改动】**
   - **不动**。当 `skill.name = "code-review/code-review"` 时返回 `commands/code-review/code-review.md`，是 plugin-namespaced 子目录布局，恰好与 Claude Code Plugin 的运行期惯例一致（用户在 IDE 调用 slash 命令时会按 `/<plugin>:<command>` 区分来源）。
   - 写入端 `copyFile (fs-util.ts:120-127)` 已经 `mkdirSync(dirname, recursive)` 兜底；`mirrorDir (fs-util.ts:178-181)` 内部递归 mkdir 子层。**grep 验证完毕**：本迭代不需要任何 fs-util 改动（R1 锚点：`fs-util.ts:122` 与 `fs-util.ts:178`）。

8. `packages/server/src/services/subscription.ts` 创建 working file 路径（`subscription.ts:574-578`）：**【已完成 — 声明保留，无代码改动】**
   - 同上，`name = "<plugin>/<inner>"` 自然展开为子目录，**不动**。

**后端 — DB / API 不变（声明保留）**

9. `packages/server/src/db/schema.ts`：**【已完成 — 声明保留，无代码改动】**
   - `skills` 表 `UNIQUE(repo_id, type, name)`（`schema.ts:96`）**不动**：plugin-namespaced `name` 已经把 plugin slug 编进 key，跨 plugin 同名不冲突。
   - `local_skills` 表 `UNIQUE(project_id, type, name)`（`schema.ts:185`）**不动**：同理。
   - 不写 migration（项目无 migration framework，遵 v0.11 R1 沉淀）。

10. `packages/shared/src/schemas/repos.ts::RegisterRepoRequestSchema` (`repos.ts:26-42`)：**【已完成 — 声明保留，无代码改动】**
    - **不动**：`scan_config: ScanConfigSchema.nullish()` 已经能透传任意 ScanConfig，包括含 `plugin-marketplace` 成员的；ScanConfigSchema 通过 `ScanRootKind` enum 驱动会自动接受新成员。

**CLI — 暴露 `--scan-config-json`（修方案 A "必须打 curl" 的 UX 缺口）**

11. `packages/cli/src/commands/repos.ts::runReposRegister`：**【已完成】**
    - opts 类型扩 `scanConfigJson?: string`。
    - 函数体首部新增解析 + 校验：
      ```ts
      let scanConfig: ScanConfig | undefined = undefined;
      if (opts.scanConfigJson) {
        let parsed: unknown;
        try { parsed = JSON.parse(opts.scanConfigJson); }
        catch (err) { throw new AstackError(ErrorCode.VALIDATION_FAILED,
          "--scan-config-json: invalid JSON", { detail: String(err) }); }
        scanConfig = ScanConfigSchema.parse(parsed);  // 让 Zod 报字段级错误
      }
      const { repo, ... } = await client.registerRepo({
        git_url: gitUrl, name: opts.name, kind, scan_config: scanConfig
      });
      ```
    - 不在这一步做"如果 `--scan-config-json` 与 git_url 不匹配"等启发式校验（保守原则：CLI 透传，合法性由 server scanner 在 first scan 时通过 warnings 报告）。

12. `packages/cli/src/bin.ts` reposCmd register 子命令：**【已完成】**
    - 加 `.option("--scan-config-json <json>", "override scan layout (raw JSON; e.g. '{\"roots\":[{\"path\":\"plugins\",\"kind\":\"plugin-marketplace\"}]}')")`
    - `.action` 透传 `scanConfigJson: opts.scanConfigJson`。

**测试**

13. `packages/server/test/scanner.test.ts`：**【已完成】**
    - T1：`scanRepo` with `roots: [{ path: "plugins", kind: "plugin-marketplace" }]` on a fixture mimicking `claude-plugins-official` 截短版（3 个插件：1 个 commands-only、1 个 agents+commands、1 个 skills-only）应产出正确的 plugin-namespaced 条目。
    - T2：plugin 容器**无** `.claude-plugin/plugin.json` → 该 plugin 完全跳过 + warning（仅当目录名通过 NAME_REGEX）。
    - T3：plugin 容器有 plugin.json 但**无** skills/commands/agents 子目录 → 0 skills, 0 warnings。
    - T4：跨 plugin 内部存在同名 inner（两个插件都叫 `commands/code-review.md`）→ 两条都进 skills 数组（`name` 不同：`"plugin-a/code-review"` vs `"plugin-b/code-review"`），**dedup 不触发**。
    - T5：plugin 容器内的 SKILL.md 名带 frontmatter `name:` 与 dir name 一致时无 warning；与 dir name 不一致时按现有契约 warn（**不**比对 plugin 前缀部分）。
    - T6：`NAME_REGEX` 校验：plugin slug `bad..name` 触发 `skipped skill with invalid name: plugins/bad..name` warning，整个容器不展开。
    - T7：dotdir（如 `.claude-plugin/`、`.github/`）一律跳过且不 warn（复用现有 `entry.name.startsWith(".")` skip 路径）。

14. `packages/server/test/scanner-system-skill-filter.test.ts`：**【已完成】**
    - T8：systemSkillIds 黑名单只比对 **plain name**（v0.4 语义），不比对带前缀。即：黑名单含 `harness-init` 时，plugin-marketplace 产出的 `<plugin>/harness-init` **不**被过滤掉（v0.4 黑名单是为了避免和 `<project>/.claude/skills/harness-init/` 系统 seed 冲突；plugin-namespaced 的会落在 `<project>/.claude/skills/<plugin>/harness-init/`，不冲突）。这条断言要写进测试**并**在 `scanRepo` blacklist 段（`index.ts:119-132`）加注释解释为什么不剥前缀比对。

15. `packages/cli/test/repos.test.ts`（如该文件存在；不存在则 skip）：**【已完成 — 文件原本不存在，已新建】**
    - **实施备注：** 测试通过依赖注入 `client` 选项绕过 `ensureDaemonOnline`，避免真 daemon。`runReposRegister` 新增 `client?: AstackClient` 测试 seam（仅在传入时跳过 health check），生产代码路径完全不变。同时抽出 `parseScanConfigJson` 纯函数便于直接断言解析失败场景。
    - T9：`runReposRegister` with `scanConfigJson` 解析合法 JSON → 透传到 client.registerRepo。
    - T10：非法 JSON → 抛 `VALIDATION_FAILED`，不调用 client。
    - T11：合法 JSON 但 schema 不通过（`{roots: "x"}`）→ 抛 ZodError 派生的 `VALIDATION_FAILED`。

**文档 / 沉淀**

16. `AGENTS.md` 第 5 节"当前活跃迭代"加一行 v0.12，把 v0.11 移到"历史完成"。**【已完成】**
17. `docs/version/INDEX.md` 加 v0.12 行（物理序号 11）。**【已完成 — 行已加，状态翻 IMPLEMENTED】**
18. `docs/version/BOUNDARIES.md` 加 v0.12 章节。**【已完成】**
19. retro 沉淀：本迭代结束时 `/retro` 走查时**候选黄金法则 R9**："Scanner kind 抽象的扩张必须以新 helper 文件落地，禁止在现有 helper 内 inline 增加分支" —— 视实施过程是否真触发再决定是否纳入活跃规则（R9 保留预定）。**【实施备注：本迭代 PR1 严格按 R9 候选规则落地（`scanPluginMarketplace` 独立文件 + `namePrefix` 参数下沉到 helper），未在 `index.ts` 内 inline 多 case 实现。`/retro` 走查正式纳入活跃规则的动作留待合并后单独执行】**

### Out of scope（本迭代不做）

1. **不预置 `claude-plugins-official` 为 builtin seed**：`seeds.ts:1-25` 注释明确指出每个 seed 都是"opinionated 决策 + 分发风险接受"。Marketplace 仓库内含 50 个第三方 plugin，**法律 / 维护风险都非零**，强行内置等于让 astack 替每个用户分发 50 个第三方代码包。用户用 `astack repos register --scan-config-json '...'` 自己接入即可。如果未来要内置，应走独立 spec + 用户调研。
2. **不为 marketplace 加 Web UI 选择器**：用户当前看到 `empty · No skills scanned` 后能用 CLI register 替换即可。前端的 "Edit scan layout" UX 单独一个迭代，会牵涉 RepoCard 展开区改造、ScanConfig editor 组件、保存校验、SSE 通知重 scan 等一连串 UX 决策，blast radius 远超 layout 本身。
3. **不引入 `recurse_depth` / `glob` 等通用递归参数**：方案 C（在 `ScanRoot` 加 `recurse_depth`）让 scan 行为参数化但语义模糊，下次再遇到下一种 layout（例如 `awesome-claude/<category>/<plugin>/skills/`）会继续抽不出明确语义，只是把问题推给配置。**显式 marketplace kind 是有意设计**，不要为了"通用"折损可读性。
4. **不改 `name` 的字符集校验为允许单 `/`**：scanner 内部生成的 namespaced name 已经"出厂合规"（两段都通过 `NAME_REGEX`，中间一个 `/`），消费端没有任何 `NAME_REGEX` 校验拦它。**用户手填 / API 传入** 一个含 `/` 的 skill name 仍然不符合"裸 skill"语义（`subscribeRequest.skill_name` 之类），那条路径不归 plugin-marketplace 管。
5. **不做 plugin-level `version`/`description`**：plugin.json 里通常带 `version` / `description` 字段，本迭代仅把它当作"plugin 容器存在"的白名单凭证读，不解析其内容。后续若 UI 要展示"这条 skill 来自 plugin X v1.2"再开新迭代。
6. **不做 marketplace 模式下的 `.mcp.json` 解析**：MCP 配置是 plugin 的一种独立 artifact，astack v0.12 之前对 MCP 0 支持，留给独立的 MCP-tracking 迭代。
7. **不做 web UI 在 plugin-marketplace 仓库下的"按 plugin 分组展示 skills"** —— `<plugin>/<inner>` 的命名前端可以隐式展示为 `inner (plugin)`，但这是 UX 增强，先保持 raw name 直显，等用户反馈再做。
8. **不为 v0.2 三 kind 加迁移**：现存的 `anthropic-skills` / `gstack` / `everything-claude-code` 全部不变，零回归。
9. **不允许 namePrefix 嵌套** —— `scanPluginMarketplace` 调 `scanSkillDirs` / `scanFlatFiles` 时 namePrefix 永远是单段 plugin slug，不允许递归再展开成 `<a>/<b>/<c>`（避免未来 marketplace-of-marketplace 出现时悄悄过去的多级前缀）。namePrefix 一旦含 `/` 直接 invariant assert（PR1 §A2）。
10. **不复用 `BOOTSTRAP_SCAN_CONFIG`**（v0.5 §"BOOTSTRAP_SCAN_CONFIG"）：bootstrap 是扫**项目本地** `<project>/.claude/`，与 marketplace 扫**远端 mirror** 的 `~/.astack/repos/<name>/` 是两条独立路径，本迭代只动后者。

## 2. 架构决策

### 2.1 命名空间策略：把 plugin slug 拼进 `name` 而不是新增 DB 列

**决策：** `ScannedSkill.name` 在 plugin-marketplace 模式下携带 `<plugin>/<inner>` 复合形式，DB / 订阅 / LocalSkill 全链路把它当不透明字符串处理。

**否定的备选：**
- (B) 给 `skills` 表加 `plugin TEXT` 列 + `UNIQUE(repo_id, type, plugin, name)` —— 牵涉 schema migration（项目无 migration framework）+ 全部 DAO 改造 + 全部 API shape 改造 + 全部前端类型改造。代价远超收益；本迭代被 R3 原子绑定原则会爆炸成跨多个 PR。
- (C) 给 `ScanRoot` 加 `name_prefix?: string` 让用户配置时手填 —— 把 50 个 plugin slug 暴露给用户填，比 (A) 还差。

**采纳 (A) 的理由：**
- v0.2 三 kind 都把 name 视作不透明 NonEmptyString（`SkillSchema` `common.ts:182`），grep 全部消费点（`skill.name` 26 处全部）都是 string 拼接 / 显示，无字符集断言；
- `canonicalWorkingRelPath` (`sync.ts:1281`) 把 name 直接 `path.posix.join` 到 `skills/<n>/` / `commands/<n>.md`，含 `/` 自然展开为子目录，与 Claude Code Plugin 运行期目录习惯一致；
- `copyFile` / `mirrorDir` 已有 `mkdirSync(recursive: true)` 兜底（`fs-util.ts:122` / `fs-util.ts:178`）；
- 唯一要小心的是 NAME_REGEX —— 但它只在 scanner 内部用，外部没有第二个 NAME_REGEX 拦截点（grep 全 repo 11 处全部在 scanner / docs，0 处在 subscription / sync / api）。

**风险接受：**
- 同一仓库下不同来源（plugin-marketplace vs 标准 skill-dirs）的同名 skill 仍会命中 `(repo_id, type, name)` 唯一约束，但 marketplace 仓库**几乎不会**同时配置两种 kind（user 写 scan_config 时会自然选一种）。如果真需要混合，用户负责 `name` 不撞。

### 2.2 Plugin 容器白名单：`.claude-plugin/plugin.json`

**决策：** 把 `<plugin>/.claude-plugin/plugin.json` 文件存在作为"该子目录是合法 plugin 容器"的白名单凭证。无此文件，整个目录直接 skip。

**理由：**
- 完全对称于 `scanSkillDirs` 用 `SKILL.md` 做白名单（`skill-dirs.ts:50-51`），保持 scanner 行为模型一致；
- `claude-plugins-official` 仓库根含若干非 plugin 目录（`.github/` / `.claude-plugin/` 等），白名单天然过滤；
- 不读 plugin.json 内容（与 SKILL.md frontmatter 可读性策略一致 — 内容用来增强 description，缺失或损坏时仍按"存在 = 合法"处理，本迭代直接 skip 内容解析，仅靠存在性）；
- 子目录名不通过 `NAME_REGEX` 时不需要 plugin.json 也直接 skip + warn（与 `scanSkillDirs` 现有行为一致）。

**接受的边角：**
- 用户自建仓库放了一个 `tmp-foo/` 目录里没有 `.claude-plugin/plugin.json` 但碰巧里面有 `commands/test.md`，**不会**被 marketplace 模式扫到。这是有意设计 —— 那种结构应该走 v0.2 三 kind 标准模式（`commands/test.md` 直接挂在仓库根），不该掺进 marketplace 仓库。

### 2.3 Scanner helper 复用契约（R6 复用护栏精神延伸）

**决策：** `scanPluginMarketplace` 强制调用 `scanSkillDirs` / `scanFlatFiles`；不允许内部重写 `safeReaddir` / `parseFrontmatter` / `NAME_REGEX` 逻辑。namePrefix 通过 helper 新增可选参数下沉。

**机制（R3 原子）：**
- PR1 同时改三个文件（`plugin-marketplace.ts` 新建 + `skill-dirs.ts` namePrefix 参数 + `flat-files.ts` namePrefix 参数）。
- code review checklist：grep `parseFrontmatter` / `safeReaddir` / `NAME_REGEX` 在新文件里**必须 0 命中**（只允许 import）。

**与 R6 关联：** R6 是 "git 操作护栏复用"，这里是 "scanner helper 复用"，本质同型 —— 跨 case 同类操作集中走一份实现，避免行为漂移。R6 沉淀于 v0.6，本迭代视作其推广至 scanner 域。

### 2.4 namePrefix 注入而不是返回后再加工

**决策：** namePrefix 作为参数下沉到 helper 内部，而不是在 `scanPluginMarketplace` 里"先调 helper 拿 ScannedSkill[]，再 map 加前缀"。

**理由：**
- helper 内部还会走 `out.push({ ... relPath: posixJoin(rootPath, ...)})`，`relPath` 计算依赖**完整**子路径（`plugins/<plugin>/skills/<inner>`），而不是 `<inner>`。在外层 map 加前缀只能改 `name` 不能改 `relPath`，需要分别在两处维护拼接 —— 容易漂移。
- helper 内部已经知道 `rootPath`，只需多一个 `namePrefix` 参数即可在 push 时一次性拼对两个字段。
- helper signature 加可选参数对原 3 个调用方零影响（默认 `""`）。

### 2.5 Warning 噪声控制

**决策：** plugin 容器**没有** `.claude-plugin/plugin.json` 时只对**通过 NAME_REGEX**（即"看起来像合法 plugin 名"）的目录 emit warning；对 `.git` / `.github` / `LICENSE`（NAME_REGEX 不通过 / dotfile）静默 skip。

**理由：**
- `claude-plugins-official` 在 `plugins/` 下未来可能放纯文档目录（`__archived__/` 等），warn-on-everything 会刷屏 daemon.log；
- 通过 NAME_REGEX 但缺 plugin.json 的目录是**真正的 authoring mistake**（用户想做 plugin 但忘了写 manifest），值得 warn 提示。

### 2.6 `name` 不参与 systemSkillIds 前缀剥离

**决策：** v0.4 的 `systemSkillIds` 黑名单（`scanner/index.ts:119-132`）按裸字符串等值比对，不剥 plugin 前缀。

**理由：**
- v0.4 黑名单的目的是 "防止 repo skill 与 `<project>/.claude/skills/<id>/` 系统 seed 撞目录"，而 plugin-namespaced skill 会落到 `<project>/.claude/skills/<plugin>/<id>/`，**不撞**目录。
- 如果剥前缀比对，会误杀 `code-review/harness-init` 这种合法插件结构。

## 3. 数据流

### 3.1 `astack repos register` with marketplace config

```
user shell:
  astack repos register git@github.com:anthropics/claude-plugins-official.git \
    --readonly \
    --scan-config-json '{"roots":[
      {"path":"plugins","kind":"plugin-marketplace"},
      {"path":"external_plugins","kind":"plugin-marketplace"}]}'

CLI runReposRegister:
  - JSON.parse + ScanConfigSchema.parse → 校验通过
  - client.registerRepo({ git_url, kind:"open-source", scan_config: <parsed> })

HTTP POST /api/repos:
  - RegisterRepoRequestSchema 校验（zod 自动接受新 plugin-marketplace 枚举）
  - RepoService.register → SeedService 风格的 git clone → scanAndUpsert(scanConfig)
  - scanRepo → switch 命中 4th case → scanPluginMarketplace
    └─ readdir plugins/ → 35 个子目录
       └─ 每个有 .claude-plugin/plugin.json 的 → scanSkillDirs("plugins/<P>/skills", namePrefix=P)
          └─ scanFlatFiles("plugins/<P>/commands", namePrefix=P, type=command)
          └─ scanFlatFiles("plugins/<P>/agents",   namePrefix=P, type=agent)
    └─ readdir external_plugins/ → 同上
  - 产出大约 30+ 条 skills（exact 数取决于 mirror 当时 HEAD），name 全部 namespaced
  - skills 表批 upsert，UNIQUE(repo_id, type, name) 不冲突
  - HTTP 200 返回 RegisterRepoResponse

dashboard：
  - SSE repo.refreshed → ReposPage 重读 → 卡片 "1a2f18b · synced now · 30 skill(s)"
```

### 3.2 后续订阅 / sync 路径

- `subscribe(projectId, repoName, "code-review/code-review", type=command)` —— skillName 透传带 `/`，subscription.ts:163-191 按 `s.name === skillName` 等值比对，命中。
- working file 落到 `<project>/.claude/commands/code-review/code-review.md`（`canonicalWorkingRelPath` 自然展开）。
- copy 时 `fs-util.ts::copyFile` 自动 `mkdirSync(commands/code-review, recursive)`。
- `.astack.json` manifest 写 `subscriptions[i].name = "code-review/code-review"`（manifest schema 的 name 字段也是无字符集约束的 NonEmptyString —— 已 grep 验证 `manifest.ts` 无新增校验需求）。
- `LocalSkillService.snapshotSubscribed` (`local-skill.ts:585`) `out.add(`${skill.type}/${skill.name}`)` → key `command/code-review/code-review`，与本地 fs scan 对齐（本地 fs 也产出同名带 `/` 的 ScannedSkill，前提 BOOTSTRAP_SCAN_CONFIG 不需要支持 marketplace —— 项目 `.claude/` 下不会有 marketplace 结构）。

## 4. 接口契约

### 4.1 ScanRootKind enum (扩)

```ts
// packages/shared/src/domain.ts
export const ScanRootKind = {
  SkillDirs: "skill-dirs",
  CommandFiles: "command-files",
  AgentFiles: "agent-files",
  PluginMarketplace: "plugin-marketplace"   // ← 新增
} as const;
```

### 4.2 scanPluginMarketplace（新文件）

```ts
// packages/server/src/scanner/plugin-marketplace.ts
export function scanPluginMarketplace(
  repoRoot: string,
  rootPath: string,
  out: ScannedSkill[],
  warnings: string[]
): void;
```

行为契约见 §1.4 JSDoc。

### 4.3 scanSkillDirs / scanFlatFiles（扩 namePrefix）

```ts
// packages/server/src/scanner/skill-dirs.ts
export function scanSkillDirs(
  repoRoot: string,
  rootPath: string,
  out: ScannedSkill[],
  warnings: string[],
  namePrefix?: string   // ← 新增；缺省 ""
): void;

// packages/server/src/scanner/flat-files.ts
export function scanFlatFiles(
  repoRoot: string,
  rootPath: string,
  out: ScannedSkill[],
  warnings: string[],
  resultType: SkillTypeT,
  namePrefix?: string   // ← 新增；缺省 ""
): void;
```

约束：`namePrefix` 实参必须满足 `NAME_REGEX.test(namePrefix)` 或为空字符串；实现内部 invariant assert，违反即 throw（保护未来调用方不传 marketplace 之外的多段前缀）。

### 4.4 CLI `repos register --scan-config-json`

```
astack repos register <git_url>
  [-n <name>]
  [--readonly]
  [--scan-config-json <json>]
  [--daemon-url <url>]
```

`<json>` 是一段 raw JSON，被 `ScanConfigSchema.parse` 校验。失败按 §1.11 通过 AstackError 抛出。

## 5. 测试

见 §1.13–§1.15。单测优先，E2E 在用户反馈后再补；本迭代**不**强行写 E2E（marketplace 仓库的 happy path 已经 mockable，且本迭代不动 UI）。

## 6. PR 切分

| PR | 内容 | R3 原子点 |
|----|------|----------|
| PR1 | shared 域：ScanRootKind 加成员 + JSDoc + ScanConfigSchema 验证；scanner 三文件原子（plugin-marketplace.ts 新增 + skill-dirs.ts/flat-files.ts namePrefix 参数）；server 单测 T1–T8。 | `ScanRootKind` 与所有 4 个写入点（switch case + scanPluginMarketplace + scanSkillDirs + scanFlatFiles）同 PR |
| PR2 | CLI `--scan-config-json` 透传（`commands/repos.ts` + `bin.ts`）+ 单测 T9–T11。 | CLI option 与解析逻辑同 PR |
| PR3 | 文档：AGENTS.md "当前活跃迭代" 切换 + INDEX.md 加行 + BOUNDARIES.md 加章节 + 本 spec 标 SHIPPED + retro `/retro` 走查决定 R9 是否落 active rules。 | 文档原子 |

可串行也可 PR1 / PR2 并行（依赖：PR2 仅依赖 PR1 的 ScanConfigSchema 接受新成员，但 Schema 是从 `ScanRootKind` 常量对象派生，PR1 落地后 PR2 不再有依赖窗口；保守按顺序合并）。

## 7. 兼容性 / 回滚

- 现存 3 个 builtin seeds（`anthropic-skills` / `gstack` / `everything-claude-code`）的 scan_config 完全不动，零回归。
- `DEFAULT_SCAN_CONFIG` 不动，从未给 scan_config 的旧 repo 行为不变。
- 新增的 `PluginMarketplace` 枚举值是**纯 additive** —— 旧 daemon（不识别该值）+ 新 web 客户端的混合场景在本项目里不存在（daemon 与 client 总是同版本部署）。
- 回滚：把 PR1 / PR2 revert 即可；DB 内已 upsert 的 plugin-namespaced skill 行不会主动 cleanup，但下次旧版 daemon scan 时会被 `deleteMissing (repo.ts:649)` 清掉（旧版 scanner 产出的 (type,name) 集合不含这些条目）。

## 8. 风险与未决

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Plugin slug 在 upstream 改名导致 plugin-namespaced skill 的稳定性丢失（subscribe 持有的 `name=A/x`，repo 里 `A` 改成 `A2`） | 中 | 订阅变 missing | 等同 v0.6 已有 missing 处理路径；用户用 unsubscribe + re-subscribe 即可 |
| marketplace 仓库内某个 plugin 的 plugin.json 损坏 | 低 | 该 plugin 仍被白名单识别（只看存在性） | 接受；不解析内容是有意决策（§2.2）|
| `<plugin>/<inner>` 中 `<plugin>` 本身意外含 `/`（理论不可能因为通过 NAME_REGEX）| 极低 | namePrefix invariant assert 拦住 | §4.3 invariant |
| 用户对 `external_plugins/` 安全性敏感 | 低 | 不在 builtin seed，本迭代用户主动 register 才会克隆 | §1 Out of scope #1 决策保留 |
| 用户期望 Web UI 直接选 marketplace 模式 | 中 | UX 缺口，需 CLI | §1 Out of scope #2，独立迭代 |

## 9. 验收

- [ ] PR1 合并后，对 `claude-plugins-official` mirror 的 register（带 `--scan-config-json`）产出 ≥ 30 个 skills，且 dashboard 卡片不再显示 `empty`。
- [ ] T1–T8 单测全绿。
- [ ] T9–T11 CLI 单测全绿（如 cli/test/repos.test.ts 不存在则在本 PR 创建）。
- [ ] grep 验证 R1：所有引用的现有锚点（`fs-util.ts:122` / `fs-util.ts:178` / `sync.ts:1281` / `subscription.ts:574` / `scanner/common.ts:8` / `schema.ts:96` / `local-skill.ts:585` / `repo.ts:614-617` / `scanner/index.ts:75-134` / `seeds.ts:1-25`）在合并前 grep 一次确认行号未漂移；漂移则更新 spec 而不是改代码。
- [ ] 现存 3 个 builtin seeds 的回归扫描数零变化（PR1 测试快照对比 `anthropic-skills` / `gstack` / `everything-claude-code` 的 skills 数）。
- [ ] AGENTS.md / INDEX.md / BOUNDARIES.md 三文件原子更新（PR3）。
