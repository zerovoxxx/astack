---
description: "🚀 发布 / 回退 - 签名配置、版本 Bump、Git Tag、构建、上传（CDN / 开发机）、Dashboard 同步"
---

根据 $ARGUMENTS 执行发布或回退。以 `rollback` 开头 → 回退模式；否则 → 正常发布。无参数则基于当前版本自动 patch 自增。

## 当前状态

!`echo "version: $(node -p \"require('./finclaw/package.json').version\")" && echo "branch: $(git branch --show-current)" && git status --short | head -5`
!`ls -lh finclaw/release/*.dmg finclaw/release/*.exe 2>/dev/null || echo "(暂无产物)"`
!`security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID" || echo "(未找到 Developer ID 签名身份)"`

## 参数

**发布**：`[patch|minor|major|x.y.z] [--local] [--upload-only]`

| 参数 | 含义 | 默认 |
|------|------|------|
| `--local` | 产物上传到开发机（SCP），下载链接使用开发机地址 | 不带 = CDN 上传 |
| `--upload-only` | 跳过版本 Bump / Commit / Tag / Dashboard / 合入 main，仅重新构建 + 上传 | 不带 = 完整发布 |

**回退**：`rollback x.y.z`

## 版本号规范

版本号格式为 `x.y.z`（三段式语义化版本号，不带 `v` 前缀），每段为非负整数：

1. **格式校验**：用户指定具体版本号时，必须匹配 `^\d+\.\d+\.\d+$`，不符合则**立即终止**：`❌ 版本号格式非法，必须为 x.y.z（如 1.2.3）`
2. **进位规则**：版本号各段无上限，进位由人为决定，不自动进位（如 `1.1.9` → `1.1.10`，`1.1.99` → `1.1.100` 均合法）
3. **自动自增**（无具体版本号参数时）：
   - 读取 `finclaw/package.json` 当前版本（或 Dashboard JSON `latest.version`，取较大者）
   - `patch`（默认）：z + 1（如 `1.1.9` → `1.1.10`）
   - `minor`：y + 1、z 归零（如 `1.1.9` → `1.2.0`）
   - `major`：x + 1、y/z 归零（如 `1.1.9` → `2.0.0`）

> **占位符约定**（本文件及 changelog 命令通用）：
> - `<version>` — 不带 `v` 前缀的纯语义化版本号，如 `1.2.3`，用于 version 字段、安装包文件名、CDN 目录路径等
> - 需要 `v` 前缀的场景（Git Tag、commit message）显式写 `v<version>`，如 `v1.2.3`

## 常量

| 名称 | 值 |
|------|------|
| 蓝盾项目 | `lct-hippy-app`（ID `p-2089af7c88fe43ad9b3028919379a72f`） |
| 蓝盾流水线 | `Dashboard Backend 部署`，通过 `devops-pipeline` skill 触发 |
| CDN 前缀 | `https://res-cdn.tencentwm.com/finclaw/releases/`（CDN 模式） |
| 构建机 | `$BUILD_SERVER_USER@$BUILD_SERVER_HOST`，SSH 端口 `$BUILD_SERVER_PORT`（`--local` 模式） |
| 构建机产物目录 | `$BUILD_SERVER_RELEASE_DIR`（`--local` 模式） |
| Dashboard JSON | `dashboard/backend/data/update.json` + `update-manual.json` |
| P12 证书 | `finclaw/resources/DevID_tengfu_app.p12`（密码 `keystore`） |
| Dashboard 验证 URL | `https://api-finclaw.woa.com/api/base/update` + `update-manual` |
| 环境变量（通用） | 从项目根 `.env` 读取：`BK_CI_ACCESS_TOKEN`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |
| 环境变量（CDN 模式） | `COS_SECRET_ID`、`COS_SECRET_KEY` |
| 环境变量（`--local`） | `BUILD_SERVER_HOST`、`BUILD_SERVER_PORT`、`BUILD_SERVER_USER`、`BUILD_SERVER_RELEASE_DIR`、`BUILD_SERVER_PASSWORD` |

---

## 正常发布流程

> 失败即停。
>
> **设计原则**：不可逆操作（commit/tag/push）必须在所有可验证步骤（构建/上传）成功之后执行。
> 构建失败时可直接 `git checkout .` 撤销文件修改，零副作用重试。

### Step 1 — 预检查

> `--upload-only` 时仅执行 1~2，从 `finclaw/package.json` 读取当前版本 `<version>`，跳过 Step 3、Step 6~8。

1. 记录当前分支 `<branch>` = `$(git branch --show-current)`，确认工作区干净
2. 从项目根目录 `.env` 文件加载环境变量，缺失任一则终止：
   - **通用**：`BK_CI_ACCESS_TOKEN`
   - **Apple 公证**：`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`
   - **CDN 模式**（默认）：`COS_SECRET_ID`、`COS_SECRET_KEY`
   - **`--local` 模式**：`BUILD_SERVER_HOST`、`BUILD_SERVER_PORT`、`BUILD_SERVER_USER`、`BUILD_SERVER_RELEASE_DIR`、`BUILD_SERVER_PASSWORD`

> 以下 3~6 仅正常发布模式执行（`--upload-only` 跳过）：

3. `git pull --rebase origin <branch>`（若远程无对应分支则跳过）
4. `git fetch origin main && git merge origin/main --no-edit`（冲突阻断）
5. 按「版本号规范」解析并确定目标版本 `<version>`（校验格式、自增或直接使用指定版本号）
6. **版本号预校验**（两项全部通过方可继续）：
   - **唯一性**：`git tag -l "v<version>"` 为空（tag 不存在），否则终止：`❌ <version> 已发布，禁止重复使用`
   - **递增性**：目标版本必须严格大于以下三者中的最大值（语义化比较 major→minor→patch），否则终止：`❌ <version> ≤ <max>，版本号禁止回退`
     - `finclaw/package.json` 的 `version`
     - Dashboard JSON（`update.json`）的 `latest.version`
     - 所有已有 tag 中的最高版本：`git tag -l "v*" | sort -V | tail -1 | sed 's/^v//'`（去掉 `v` 前缀后再比较）

✅ `📌 目标版本: <current> → <version>（已通过唯一性+递增性校验）`

### Step 2 — 签名环境预检 & 自动配置

> 确保 macOS 代码签名和 Apple 公证环境就绪。

**检查 1: codesign 签名身份**

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

若**未找到** Developer ID Application 签名身份，自动执行签名环境配置：

```bash
cd finclaw

# 安装 Apple 中间证书
curl -sSL -o /tmp/DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
curl -sSL -o /tmp/DeveloperIDCA.cer https://www.apple.com/certificateauthority/DeveloperIDCA.cer
curl -sSL -o /tmp/AppleIncRootCertificate.cer https://www.apple.com/appleca/AppleIncRootCertificate.cer
security add-certificates -k ~/Library/Keychains/login.keychain-db /tmp/DeveloperIDG2CA.cer 2>&1 || true
security add-certificates -k ~/Library/Keychains/login.keychain-db /tmp/DeveloperIDCA.cer 2>&1 || true
security add-certificates -k ~/Library/Keychains/login.keychain-db /tmp/AppleIncRootCertificate.cer 2>&1 || true

# 导入 P12 证书
security import resources/DevID_tengfu_app.p12 \
  -k ~/Library/Keychains/login.keychain-db \
  -P "keystore" \
  -T /usr/bin/codesign \
  -T /usr/bin/security 2>&1 || true
```

导入后再次验证：

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

仍未找到则**终止**：`❌ Developer ID Application 证书导入失败，请手动运行 /sign 命令配置`

**检查 2: Apple 公证变量**（已在 Step 1 预检中完成）

✅ `🔏 签名环境就绪: Developer ID Application: SHANGHAI TENGFU...`

### Step 3 — 版本 Bump & Changelog（仅改文件，不提交）

> `--upload-only` 跳过。

1. 更新 `finclaw/package.json` version 为 `<version>`（不带 `v` 前缀，如 `1.2.3`，与 `update.json` 版本字段保持一致）
2. **按 `changelog` command 规范**（`.claude/commands/changelog.md`）生成技术 Changelog 和产品 Changelog：
   - 技术 Changelog → 写入 `CHANGELOG.md`（Keep a Changelog + Conventional Commits 分类）
   - 产品 Changelog → 更新 `dashboard/backend/data/update.json` 和 `update-manual.json`（旧 latest → history，新版本 → latest）
   - 过滤规则、格式、写作要求等细节以 changelog command 为准
3. **下载链接生成**（按上传模式）：
   - **CDN 模式**（默认）：使用 changelog 模板默认的 CDN 地址（`https://res-cdn.tencentwm.com/finclaw/releases/<version>/`），链接中含 `<gitHash>` 和 `<randomHash>` 占位符
   - **`--local` 模式**：将 `latest` 中的下载链接替换为开发机地址格式。包名含 hash（由 `generate-build-meta.cjs` 生成），格式为 `FinClaw-{os}-{arch}-{version}-{gitHash}-{randomHash}.{ext}`：
     - `windowsX64.url` → `https://api-finclaw.woa.com/downloads/FinClaw-win-x64-<version>-<gitHash>-<randomHash>.exe`
     - `macIntel.url` → `https://api-finclaw.woa.com/downloads/FinClaw-mac-x64-<version>-<gitHash>-<randomHash>.dmg`
     - `macArm.url` → `https://api-finclaw.woa.com/downloads/FinClaw-mac-arm64-<version>-<gitHash>-<randomHash>.dmg`
     - 仅替换 `latest` 的链接，`history` 中的历史链接保持不变

⚠️ **此步骤只修改文件，不执行 `git add/commit/tag/push`。** 若后续构建失败可 `git checkout .` 撤销。

> 注：下载链接中的 `<gitHash>` 和 `<randomHash>` 占位符，在 Step 4 构建完成后，从实际产物文件名（`ls finclaw/release/FinClaw-*.dmg`）中提取 hash 值，回填到 `update.json` 和 `update-manual.json` 的下载链接中。

### Step 4 — 构建打包（含签名 + 公证）

```bash
cd finclaw
rm -rf node_modules release dist dist-electron
npm install
npm run build
npm run compile:electron
npm run build:skills
npm run openclaw:runtime:mac-arm64
node -r dotenv/config node_modules/.bin/electron-builder --mac --arm64 --config electron-builder.json
```

> ⚠️ `node -r dotenv/config` 会加载 `finclaw/.env`（若存在），但 Apple 公证凭据由 `scripts/notarize.js` 自动从项目根 `.env` 加载，无需在 `finclaw/` 下配置。
>
> electron-builder 执行顺序：编译打包 → 代码签名（Developer ID） → afterSign 公证（notarize.js） → 生成 DMG。

验证 `finclaw/release/` 产物完整：

```bash
ls -lh finclaw/release/FinClaw-*.dmg
codesign --verify --verbose finclaw/release/mac-arm64/FinClaw.app
```

> **构建失败恢复**：
> 1. `git checkout .` — 还原 Step 3 的所有文件修改（package.json、CHANGELOG.md、Dashboard JSON）
> 2. 修复编译问题，`git add && git commit` 提交 fix
> 3. 重新执行 release 命令（Step 3 会重新生成 changelog，包含 fix commit）

### Step 5 — 上传产物

#### CDN 模式（默认）

`node scripts/release/upload.mjs --version <version>`

> 上传失败时：终止流程，产物已构建无需回退代码，修复上传问题后可从本步骤恢复。

#### `--local` 模式

使用 `sshpass` + `scp` 将 DMG 产物上传到开发机：

```bash
sshpass -p "$BUILD_SERVER_PASSWORD" scp -o StrictHostKeyChecking=no -P $BUILD_SERVER_PORT finclaw/release/FinClaw-mac-arm64-<version>-*.dmg $BUILD_SERVER_USER@$BUILD_SERVER_HOST:$BUILD_SERVER_RELEASE_DIR
```

验证上传成功：

```bash
sshpass -p "$BUILD_SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no -p $BUILD_SERVER_PORT $BUILD_SERVER_USER@$BUILD_SERVER_HOST "ls -lh ${BUILD_SERVER_RELEASE_DIR}FinClaw-mac-arm64-<version>-*.dmg"
```

清理构建机旧安装包，只保留最近 10 个版本（按版本号降序）：

```bash
sshpass -p "$BUILD_SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no -p $BUILD_SERVER_PORT $BUILD_SERVER_USER@$BUILD_SERVER_HOST "cd $BUILD_SERVER_RELEASE_DIR && ls FinClaw-*.dmg FinClaw-*.exe 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | sort -t. -k1,1n -k2,2n -k3,3n | uniq | head -n -10 | while read ver; do rm -v FinClaw-*\"\${ver}\"* 2>/dev/null; done"
```

> **上传失败恢复**：终止流程，产物已构建无需回退代码，修复上传问题后可从本步骤恢复。
>
> **sshpass 依赖**：本地需安装 `sshpass`（`brew install hudochenkov/sshpass/sshpass`）。

### Step 6 — Commit & Tag & Push

> `--upload-only` 跳过。构建 + 上传全部成功后方可执行。

```bash
git add .
git commit -m "release: v<version>"
git tag -a v<version> -m "Release v<version>"
git push origin <branch> --follow-tags
```

### Step 7 — Dashboard 同步 & 验证

> `--upload-only` 跳过。

触发蓝盾流水线（`tag` = `v<version>`），超时 10 分钟阻断。验证两个 HTTP 接口均返回目标版本：
- `https://api-finclaw.woa.com/api/base/update`
- `https://api-finclaw.woa.com/api/base/update-manual`

> **失败恢复**：tag 已推送，数据文件已在仓库中。直接手动重新触发蓝盾流水线即可，无需重跑完整发布。

### Step 8 — 合入 main

> `--upload-only` 跳过。Step 4~7 全部成功后执行，冲突阻断。**若 `<branch>` 就是 `main`，跳过本步骤。**

```bash
git checkout main && git pull --rebase origin main
git merge --no-ff v<version> -m "release: v<version>"
git push origin main
git checkout <branch>
```

> **失败恢复**：tag 和 Dashboard 已就绪。手动执行上述 merge 命令即可，无需重跑完整发布。

### Step 9 — 发布摘要

**CDN 模式**：

```
═══════════════════════════════════════
  🚀 FinClaw <version> 发布完成
═══════════════════════════════════════
  📌 版本:    <current> → <version>
  🔀 分支:    <branch>
  🏷️ Tag:     v<version>
  🔀 合入:    ✓ main
  🔏 签名:    ✓ Developer ID + Apple 公证
  📦 产物:    <文件名+大小>
  ☁️ CDN:     <URL>
  🌐 Dashboard: ✓ 已同步
═══════════════════════════════════════
```

**`--local` 模式**：

```
═══════════════════════════════════════
  🚀 FinClaw <version> 本地发布完成
═══════════════════════════════════════
  📌 版本:    <current> → <version>
  🔀 分支:    <branch>
  🏷️ Tag:     v<version>
  🔀 合入:    ✓ main
  🔏 签名:    ✓ Developer ID + Apple 公证
  📦 产物:    <文件名+大小>
  🖥️ 开发机:   ✓ 已上传（$BUILD_SERVER_RELEASE_DIR）
  🌐 Dashboard: ✓ 已同步
═══════════════════════════════════════
```

---

## 回退流程

> 先 Dashboard 验证再代码回退。不涉及构建/上传。

### Step 1 — 预检查

1. tag `v<version>` 存在
2. main 上存在对应的 release commit（commit message 包含 `release: v<version>`，可能是 merge commit 或普通 commit）
3. 目标版本在 Dashboard JSON 的 history 中
4. 未通过则列出可用 tag 和 history 版本，阻断

### Step 2 — Dashboard 同步 & 验证

触发蓝盾流水线（`tag` = `v<version>`），超时 10 分钟阻断。验证两个 HTTP 接口均返回目标版本：
- `https://api-finclaw.woa.com/api/base/update`
- `https://api-finclaw.woa.com/api/base/update-manual`

### Step 3 — main 代码回退

> Step 2 通过后执行。revert release commit。

```bash
git checkout main && git pull --rebase origin main
RELEASE_COMMIT=$(git log --format="%H %s" | grep "release: v<version>" | head -1 | awk '{print $1}')
[ -z "$RELEASE_COMMIT" ] && echo "❌ 未找到 release commit，请手动指定" && exit 1
# merge commit 用 -m 1，普通 commit 直接 revert
if git rev-parse --verify "$RELEASE_COMMIT^2" >/dev/null 2>&1; then
  git revert -m 1 $RELEASE_COMMIT --no-edit
else
  git revert $RELEASE_COMMIT --no-edit
fi
git push origin main
git checkout <branch>
```

### Step 4 — 回退摘要

```
═══════════════════════════════════════
  🔄 FinClaw 版本回退完成
═══════════════════════════════════════
  📌 回退:     <current> → <version>
  🔀 main:     ✓ revert release commit
  🌐 Dashboard: ✓ 已同步
  💡 恢复:     /release <current>
═══════════════════════════════════════
```

---

## 约束

1. **失败即停**：任何步骤失败立即停止。
2. **版本号递增**：发布时目标版本须大于当前版本。
3. **签名**：Mac 构建需项目根 `.env` 中 Apple 公证凭据 + 钥匙串中 Developer ID 证书。
4. **回退前提**：tag `v<version>` 和对应 release commit 必须存在，目标版本须在 history 中。
5. **sshpass 依赖**（`--local` 模式）：本地需安装 `sshpass`（`brew install hudochenkov/sshpass/sshpass`）。
