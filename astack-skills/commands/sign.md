---
description: "🔏 签名环境配置 - 一键导入 P12 证书 + 配置 Apple 公证凭据"
---

# 🔏 macOS 签名环境一键配置

## 📊 当前状态

### 平台检查
!`uname -s`

### 签名身份
!`security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID" || echo "(未找到 Developer ID 签名身份)"`

### .env 配置
!`[ -f .env ] && echo "✅ .env 存在" && grep -c "APPLE_" .env 2>/dev/null | xargs -I{} echo "  Apple 相关变量: {} 个" || echo "❌ .env 不存在"`

### P12 证书
!`ls -lh finclaw/resources/DevID_tengfu_app.p12 2>/dev/null || echo "❌ 未找到内置 P12 证书"`

## 🎯 用户输入

$ARGUMENTS

## 参数解析

支持的参数格式（所有参数均可选）：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--apple-id <邮箱>` | Apple ID | 从项目根 `.env` 的 `APPLE_ID` 读取 |
| `--app-password <密码>` | App 专用密码 | 从项目根 `.env` 的 `APPLE_APP_SPECIFIC_PASSWORD` 读取 |
| `--team-id <ID>` | Apple Team ID | 从项目根 `.env` 的 `APPLE_TEAM_ID` 读取 |
| `--p12-password <密码>` | P12 证书密码 | `keystore` |

无参数时：从项目根 `.env` 读取 Apple 公证凭据。若 `.env` 不存在或缺失字段，**立即停止**并提示用户提供参数。

## 常量

| 名称 | 值 |
|------|------|
| P12 证书路径 | `finclaw/resources/DevID_tengfu_app.p12` |
| P12 默认密码 | `keystore` |
| 签名脚本 | `finclaw/scripts/setup-mac-signing.sh` |
| 环境变量文件 | 项目根 `.env`（与 COS/蓝盾凭据同文件） |

## 📋 执行流程

### Step 0 — 前置检查

1. 确认当前系统为 macOS（`uname -s` == `Darwin`），否则终止：`❌ 此命令仅支持 macOS 系统`
2. 确认 P12 证书文件存在：`finclaw/resources/DevID_tengfu_app.p12`，否则终止
3. 确认 `finclaw/scripts/setup-mac-signing.sh` 脚本存在，否则终止

### Step 1 — 解析签名参数

按以下优先级解析 Apple 公证参数：

1. **命令参数**（`$ARGUMENTS` 中的 `--apple-id`、`--app-password`、`--team-id`）→ 最高优先级
2. **项目根 `.env` 文件** → 读取 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`
3. 若任一必需参数（Apple ID / App 专用密码 / Team ID）仍为空，**立即停止**并提示：

```
❌ 缺少签名参数，请通过以下方式之一提供：

方式 1: 命令参数
  /sign --apple-id your@email.com --app-password xxxx-xxxx-xxxx-xxxx --team-id XXXXXXXXXX

方式 2: 在项目根 .env 文件中添加（参考 .env.example）
  APPLE_ID=your@email.com
  APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
  APPLE_TEAM_ID=XXXXXXXXXX
```

✅ 参数解析完成后打印（密码/密钥脱敏显示）：
```
  Apple ID:      geo***@tencent.com
  Team ID:       5YK***98M
  App Password:  jtdx-****-****-****
  P12 证书:      finclaw/resources/DevID_tengfu_app.p12
  P12 密码:      ********
```

### Step 2 — 执行签名环境配置

调用现有脚本，使用非交互参数模式：

```bash
cd finclaw
bash scripts/setup-mac-signing.sh \
  --p12 "resources/DevID_tengfu_app.p12" \
  --p12-password "<P12_PASSWORD>" \
  --apple-id "<APPLE_ID>" \
  --app-password "<APP_PASSWORD>" \
  --team-id "<TEAM_ID>" \
  --skip-env
```

> ⚠️ 使用 `--skip-env` 跳过在 `finclaw/` 下生成 `.env`，因为 Apple 凭据统一存放在项目根 `.env`。
> 脚本执行过程中可能需要输入 macOS 登录密码（钥匙串分区列表授权），这是正常行为。

若脚本执行失败，打印错误并终止。

### Step 3 — 验证签名环境

```bash
# 1. 验证签名身份
security find-identity -v -p codesigning | grep "Developer ID Application"

# 2. 验证根 .env 中的 Apple 公证配置
for var in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  grep -q "^${var}=.\+" .env || echo "❌ .env 中缺少: ${var}"
done
```

两项验证均通过后继续，否则给出具体失败原因。

### Step 4 — 输出摘要

```
═══════════════════════════════════════
  🔏 macOS 签名环境配置完成
═══════════════════════════════════════
  🔑 证书:       Developer ID Application: xxxxxx
  📋 Apple ID:   geo***@tencent.com
  🏢 Team ID:    5YK***98M
  📄 .env:       ✓ 已配置（项目根）
  ✅ 签名验证:    通过
═══════════════════════════════════════

  下一步:
    /dist mac          # 构建 + 签名 + 公证打包
    /release --local   # 完整发布流程（上传到开发机）
```

## ⚠️ 注意事项

1. **仅 macOS**：此命令仅在 macOS 系统上可用。
2. **钥匙串密码**：首次执行时系统可能弹出钥匙串密码输入框，这是 `security set-key-partition-list` 所需，输入 macOS 登录密码即可。
3. **证书已导入**：若 P12 证书已导入过钥匙串，脚本会提示"证书可能已存在"并继续，不影响最终结果。
4. **敏感凭据**：Apple ID 和 App 专用密码不会硬编码到命令文件中，始终从用户参数或 `.env` 文件读取。
5. **幂等执行**：此命令可重复执行，不会产生副作用。
6. **`.env` 位置**：Apple 公证凭据与 COS/蓝盾凭据统一存放在项目根 `.env`，`notarize.js` 自动从该位置加载。

---
**开始配置签名环境...**
