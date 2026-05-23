---
description: "📝 写 Changelog - 根据 Git 提交记录生成技术和产品 Changelog"
---

根据版本号 `$ARGUMENTS` 生成技术 Changelog 和产品 Changelog。无参数则基于当前最新版本号自动 patch 自增。

## 版本号规范

版本号格式为 `x.y.z`（三段式语义化版本号，不带 `v` 前缀），每段为非负整数：

1. **格式校验**：用户指定具体版本号时，必须匹配 `^\d+\.\d+\.\d+$`，不符合则**立即终止**：`❌ 版本号格式非法，必须为 x.y.z（如 1.2.3）`
2. **进位规则**：版本号各段无上限，进位由人为决定，不自动进位（如 `1.1.9` → `1.1.10`，`1.1.99` → `1.1.100` 均合法）
3. **自动自增**（无参数时）：
   - 取 `finclaw/package.json` 版本与 Dashboard JSON `latest.version` 中较大者作为基线
   - 默认 patch 自增：z + 1

## 当前状态

!`echo "current version: $(node -p \"require('./finclaw/package.json').version\")" && echo "branch: $(git branch --show-current)" && echo "latest tag: $(git tag --sort=-v:refname | head -1 2>/dev/null || echo '(无 tag)')"`

## 变更信息来源

基于当前分支 HEAD 与最近一个 tag 之间的差异对比。若无 tag 则回退到最近 50 条提交。

### 提交记录（tag..HEAD，含完整 body）

!`TAG=$(git tag --sort=-v:refname | head -1 2>/dev/null); if [ -n "$TAG" ]; then echo "对比范围: $TAG..HEAD" && git log "$TAG"..HEAD --format="--- %h %s%n%b" --no-merges | head -200; else echo "对比范围: HEAD~50..HEAD (无 tag)" && git log --format="--- %h %s%n%b" --no-merges -50 | head -200; fi`

### 文件变更统计（tag..HEAD）

!`TAG=$(git tag --sort=-v:refname | head -1 2>/dev/null); if [ -n "$TAG" ]; then git diff --stat "$TAG"..HEAD | tail -20; else git diff --stat HEAD~50..HEAD 2>/dev/null | tail -20; fi`

### 上游合并提交详情

对比范围内如果存在上游合并提交（`同步.*上游`），读取其完整 commit body 和配套的 `docs/change/*upstream*` 文档以获取具体功能改动明细。

!`TAG=$(git tag --sort=-v:refname | head -1 2>/dev/null); RANGE="${TAG:+$TAG..HEAD}"; RANGE="${RANGE:-HEAD~50..HEAD}"; HASHES=$(git log $RANGE --oneline --no-merges --grep="同步" --grep="上游" --all-match --format="%h" 2>/dev/null); if [ -n "$HASHES" ]; then echo "发现上游合并提交:"; for h in $HASHES; do echo ""; echo "========== $h =========="; git log $h -1 --format="%B"; done; else echo "(无上游合并提交)"; fi`

!`ls -1 docs/change/*upstream* 2>/dev/null | head -5 || echo "(无上游合并文档)"`

## 前置校验

1. 若 `CHANGELOG.md` 中已存在 `## [<version>]` 段落，**终止并提示**版本已存在
2. 若 Dashboard JSON 的 `latest.version` 已等于目标版本，**终止并提示**版本已存在
3. 若对比范围内无有效提交（过滤后为空），**终止并提示**无可用变更

## 品牌过滤规则（严格执行）

### 源头过滤（提交级）

- 包含"网易""NetEase""netease""163.com"的提交**整体跳过**（标题和 body 均不采用）
- 忽略纯文档/CI 提交（如 `chore: update CHANGELOG`）避免自引用

### 上游合并提交特殊处理

匹配 `chore(openclaw): 同步 LobsterAI 上游 *` 或类似模式的提交**不能整体跳过**，必须：

1. **展开分析 commit body**：提取其中每一条功能改动（`-` 开头的条目）
2. **逐条拆分为独立 changelog 条目**，按内容归类到 Features / Bug Fixes / Refactor / Chores
3. **如有配套文档**（`docs/change/*upstream*`），读取「变更摘要」「已实施的变更」「已局部合并的变更」章节作为补充信息源，提取实际落地的功能描述
4. 跳过 commit body 中「已跳过」段落里列出的内容

### 输出净化（所有 changelog 文本）

以下关键词**禁止出现**在任何输出文本中（技术 Changelog、产品 Changelog 均适用）：

| 禁止词 | 替换方案 |
|--------|---------|
| `LobsterAI` | 删除或改写为 FinClaw 自身能力描述 |
| `Lobster` | 删除或改写 |
| `网易` / `NetEase` / `netease` | 删除 |
| `163.com` / `youdao` / `有道` | 删除 |
| `POPO` | 删除 |
| `同步上游` / `上游合并` / `upstream merge` | 不出现在条目描述中 |

**改写策略**：将"同步上游 XX 功能"改写为 FinClaw 自身的功能描述。例如：
- ❌ `同步 LobsterAI 上游防休眠功能`
- ✅ `新增防止休眠开关，会话执行期间阻止系统休眠`
- ❌ `同步上游 OpenClaw assistant/tool card 交替显示修复`
- ✅ `修复 AI 助手文本与工具卡片交替显示错位问题`

## 任务 1：技术 Changelog → `CHANGELOG.md`

读取 `CHANGELOG.md` 现有内容，在文件头部追加新版本条目。格式遵循 [Keep a Changelog](https://keepachangelog.com/) + Conventional Commits 分类：

```markdown
# Changelog

## [<version>] - <YYYY-MM-DD>

### Features
- 描述 (`commit-hash`)

### Bug Fixes
- 描述 (`commit-hash`)

### Refactor
- 描述 (`commit-hash`)

### Chores
- 描述 (`commit-hash`)

### Docs
- 描述 (`commit-hash`)
```

规则：
1. 根据 commit message 的 `type(scope): desc` 格式自动分类到对应分组
2. **上游合并提交展开处理**：不作为单条 chore 输出，而是将 body 中每条功能改动拆分后按实际类型归类（feat → Features，fix → Bug Fixes，等等），hash 统一引用该合并提交的 hash
3. 不符合 Conventional Commits 格式的提交（如 `fix typo`、`Initial commit`）归入 **Other** 分组
4. 空分组不输出
5. **不输出 scope 前缀**：不要写 `**scope**:` 加粗前缀，直接写描述文本
6. **不输出迭代编号**：不要写"迭代 N""iteration-N"等内部迭代标识，直接写功能描述
7. 每条保留 7 位短 hash 引用
8. 描述使用中文（如原始提交为英文则翻译为中文）
9. **品牌净化**：所有条目文本必须通过「品牌过滤规则 > 输出净化」检查
10. **首次创建**（文件为空或不存在）：写入完整内容（含 `# Changelog` 标题头）
11. **追加**（文件已有内容）：在 `# Changelog` 标题行之后、第一个 `## [` 之前插入新版本段落，不重复写标题头

## 任务 2：产品 Changelog → Dashboard JSON

更新以下两个文件，两者内容保持一致：
- `dashboard/backend/data/update.json`
- `dashboard/backend/data/update-manual.json`

### 更新逻辑

1. 将当前 `latest` 整体移入 `history` 数组头部（保留原有 history 条目）
2. 构造新的 `latest` 对象：

> **版本号占位符约定**：
> - `<version>` — 不带 `v` 前缀的纯语义化版本号，如 `1.2.3`，用于 version 字段、安装包文件名、CDN 目录路径等
> - 需要 `v` 前缀的场景（Git Tag）显式写 `v<version>`，如 `v1.2.3`

```json
{
  "version": "<version>",
  "date": "<YYYY-M-DD>",
  "changeLog": {
    "ch": {
      "title": "<中文版本标题>",
      "content": ["用户可感知的功能点1", "功能点2", "..."]
    },
    "en": {
      "title": "<English version title>",
      "content": ["User-facing feature 1", "Feature 2", "..."]
    }
  },
  "windowsX64": {
    "url": "https://res-cdn.tencentwm.com/finclaw/releases/<version>/FinClaw-win-x64-<version>-<gitHash>-<randomHash>.exe"
  },
  "macIntel": {
    "url": "https://res-cdn.tencentwm.com/finclaw/releases/<version>/FinClaw-mac-x64-<version>-<gitHash>-<randomHash>.dmg"
  },
  "macArm": {
    "url": "https://res-cdn.tencentwm.com/finclaw/releases/<version>/FinClaw-mac-arm64-<version>-<gitHash>-<randomHash>.dmg"
  }
}
```

### 产品 Changelog 写作要求

1. **面向用户**：只写用户可感知的功能变化，不含技术细节（如"重构 XX 模块""迁移 XX 依赖"不写）
2. **中英双语**：`ch` 中文、`en` 英文，内容对应
3. **title**：概括本版本最大亮点，一句话
4. **content**：3~8 条，每条一句话，动词开头（如"新增…""优化…""修复…" / "Added…""Improved…""Fixed…"）
5. **date 格式**：`YYYY-M-DD`（月份不补零，与现有格式一致）
6. **品牌净化**：所有文案必须通过「品牌过滤规则 > 输出净化」检查，禁止出现任何禁止词
7. **产品化表达**：优先写体验收益和结果，不写实现过程、根因分析或修复手段；例如写"提升连接稳定性"，不要写"消除死锁""禁用广播""修复竞态"
8. **禁用内部术语**：产品 Changelog 不得出现 `Gateway`、`IPC`、`MCP`、`死锁`、`竞态`、`重载`、`广播`、`进程`、`崩溃循环`、模块名、函数名、配置项名等研发术语
9. **Bug 修复收敛**：多个零散修复、底层修复、稳定性修复默认合并表达为"修复若干 bug，以提升系统稳定性" / "Fixed several bugs to improve overall stability"，除非该问题本身是明确、重要且用户可直接感知的功能问题
10. **不透出修复细节**：对于 bug fix，不写问题根因、实现细节、内部组件名；最多保留"修复 X 场景问题""优化 X 稳定性"这一层级
11. **去技术化标题**：title 避免使用并列技术名词堆砌，优先写成"XX 体验优化与稳定性提升"这类产品语言

## 执行顺序

1. 确定版本号：有参数 → 按「版本号规范」校验 `x.y.z` 格式；无参数 → 基于当前最新版本 patch 自增（输出 `x.y.z` 格式）
2. 确定对比范围：最近 tag → 当前分支 HEAD（无 tag 则 HEAD~50）
3. **前置校验**：版本重复检查、有效提交检查
4. 收集范围内的提交记录和文件变更
5. **识别上游合并提交**：检测 `chore(openclaw): 同步.*上游` 模式，读取完整 commit body + 配套 `docs/change/*upstream*` 文档，展开为独立功能条目
6. 应用品牌过滤规则（源头过滤 + 输出净化）
7. 生成技术 Changelog，写入 `CHANGELOG.md`
8. 生成产品 Changelog，更新两个 Dashboard JSON
9. **最终检查**：对所有生成内容做一次品牌禁止词全文扫描，发现则立即修正
10. 输出摘要

## 输出摘要

```
═══════════════════════════════════════
  📝 Changelog <version> 已生成
═══════════════════════════════════════
  🏷️ 基线:     <tag> → HEAD（<N> 提交，含 <M> 个上游合并展开为 <K> 条）
  📄 技术:     CHANGELOG.md （+<N> 条）
  🌐 产品(ch): <title>（<N> 条）
  🌐 产品(en): <title>（<N> 条）
  📦 JSON:     update.json ✓ update-manual.json ✓
  🔒 品牌检查: ✓ 无禁止词残留
═══════════════════════════════════════
```

## 约束

1. **不修改** `finclaw/package.json` 版本号（版本 bump 由 release 命令负责）
2. **不推送** Git（不执行 git add/commit/push）
3. **品牌净化**：所有输出文本必须通过品牌过滤规则，禁止词零容忍
4. 产品 Changelog 条目**不含**代码术语（模块名、函数名、配置项名等）
5. `update.json` 和 `update-manual.json` 必须保持完全一致
6. 上游合并提交中标记为「已跳过」的功能**不写入** changelog
