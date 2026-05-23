---
description: "📦 构建打包 - 无参数打当前平台，`all` 打全平台，或指定平台（mac/win/linux）"
---

# 📦 FinClaw 构建打包

## 📊 当前状态

### 代码仓库
!`cd finclaw && echo "branch: $(git branch --show-current)" && echo "--- status ---" && git status --short | head -10`

### 构建产物
!`ls -lh finclaw/release/*.dmg finclaw/release/*.exe finclaw/release/*.AppImage 2>/dev/null || echo "(暂无产物)"`

## 🎯 用户输入

$ARGUMENTS

## 参数解析

**平台检测**：无参数时自动检测当前运行平台：
- `uname -s` = `Darwin` + `uname -m` = `arm64` → `mac-arm64`
- `uname -s` = `Darwin` + `uname -m` = `x86_64` → `mac-x64`
- `uname -s` = `Linux` → `linux`
- 其他（含 MINGW/MSYS/CYGWIN） → `win`

| 用户输入 | 平台 | 架构 |
|---------|------|------|
| `mac` 或 `mac-arm64` | macOS | Apple Silicon (arm64) |
| `mac-intel` 或 `mac-x64` | macOS | Intel (x64) |
| `mac-universal` | macOS | 通用二进制 |
| `win` 或 `windows` | Windows | x64 |
| `linux` | Linux | x64 |
| `all` | 全部 | mac-arm64 + mac-x64 + win |
| 无参数 | 当前平台 | 按上述平台检测规则自动确定 |

多平台可空格分隔，如 `mac win`。

若包含 `--skip-build` 则跳过 Step 1-3，但需检查 `dist/` 和 `dist-electron/` 目录存在。

## 📋 执行流程

**工作目录**：`finclaw/`（所有命令均在此目录下执行）

**环境变量**：`.env` 位于仓库根目录（`finclaw/` 的上一级），通过 `DOTENV_CONFIG_PATH=../.env` 指定路径加载。

### Step 0 — 签名环境预检与自动配置（仅 Mac 目标需要）

若目标平台包含 macOS（mac / mac-arm64 / mac-x64 / mac-universal），**必须**在打包前执行以下检查。若目标不含 Mac，跳过此步。

**检查 1: 仓库根 `.env` 文件存在且包含 Apple 公证变量**

```bash
ENV_FILE="../.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 缺少仓库根 .env 文件，请参考 .env.example 创建"
  exit 1
fi
for var in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  if ! grep -q "^${var}=" "$ENV_FILE" || grep -q "^${var}=$" "$ENV_FILE"; then
    echo "❌ .env 中缺少或为空: ${var}"
    exit 1
  fi
done
echo "✅ Apple 公证配置完整"
```

**检查 2: codesign 签名身份 — 缺失则自动导入内置证书**

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

若有输出（找到签名身份），检查通过，继续后续步骤。

若无输出（未找到签名身份），自动从仓库内置 P12 证书导入：

```bash
# 内置证书位于 finclaw/resources/DevID_tengfu_app.p12，密码 keystore
P12_FILE="resources/DevID_tengfu_app.p12"
if [ ! -f "$P12_FILE" ]; then
  echo "❌ 内置 P12 证书不存在: $P12_FILE"
  exit 1
fi

echo "⚠️ 未找到签名身份，正在自动导入内置证书..."
bash scripts/setup-mac-signing.sh \
  --p12 "$P12_FILE" \
  --p12-password "keystore" \
  --apple-id "$(grep '^APPLE_ID=' "$ENV_FILE" | cut -d= -f2-)" \
  --app-password "$(grep '^APPLE_APP_SPECIFIC_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)" \
  --team-id "$(grep '^APPLE_TEAM_ID=' "$ENV_FILE" | cut -d= -f2-)" \
  --skip-env
```

> 脚本执行过程中可能需要输入 macOS 登录密码（钥匙串分区列表授权），这是正常行为。

导入完成后再次验证：

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

若仍无输出，**立即停止**并提示：
> ❌ 证书导入后仍未找到 Developer ID Application 签名身份，请检查 P12 证书是否有效。

两项检查均通过后，继续后续步骤。

### Step 1 — 前置资源准备（仅 Windows 目标需要）

```bash
npm run setup:mingit
npm run setup:python-runtime
```

若目标不含 Windows，跳过此步。

### Step 1.5 — 清理旧产物

```bash
rm -rf release/
```

### Step 2 — 前端构建 + Electron 主进程编译

```bash
npm run build              # tsc && vite build
npm run compile:electron   # tsc --project electron-tsconfig.json
```

### Step 3 — Skills 构建

```bash
npm run build:skills
```

> Step 2 和 Step 3 只需执行**一次**，不论打几个平台。

### Step 4 — 逐平台打包

根据解析的目标平台，**依次**执行对应命令。Mac 打包通过 `DOTENV_CONFIG_PATH` 指向仓库根 `.env` 加载 Apple 签名凭据：

- **mac-arm64**:
  ```bash
  DOTENV_CONFIG_PATH=../.env node -r dotenv/config node_modules/.bin/electron-builder --mac --arm64 --config electron-builder.json
  ```

- **mac-x64 (Intel)**:
  ```bash
  DOTENV_CONFIG_PATH=../.env node -r dotenv/config node_modules/.bin/electron-builder --mac --x64 --config electron-builder.json
  ```

- **mac-universal**:
  ```bash
  DOTENV_CONFIG_PATH=../.env node -r dotenv/config node_modules/.bin/electron-builder --mac --universal --config electron-builder.json
  ```

- **win**:
  ```bash
  npx electron-builder --win --x64 --config electron-builder.json
  ```

- **linux**:
  ```bash
  npx electron-builder --linux --config electron-builder.json
  ```

### Step 5 — 验证产物

```bash
ls -lh release/*.dmg release/*.exe release/*.AppImage 2>/dev/null
```

列出所有生成的安装包及大小。

## ⚠️ 注意事项

1. **失败即停**：任一 Step 失败，立即停止并报告错误，不继续后续平台。
2. **产物目录**：所有产物输出在 `finclaw/release/` 目录。
3. **签名配置**：Mac 打包 Step 0 会自动检测签名身份，若缺失则从仓库内置证书 `resources/DevID_tengfu_app.p12` 自动导入。Apple 公证凭据配置在仓库根 `.env`。
4. **跨平台限制**：Windows 打包通常需要在 Windows 环境下执行（或使用 Wine），Linux 同理。

## 🏁 完成后输出

1. 打包的目标平台列表
2. 每个平台的打包结果（成功/失败）
3. 产物文件列表（路径 + 大小）
4. 总耗时

---
**开始构建打包...**
