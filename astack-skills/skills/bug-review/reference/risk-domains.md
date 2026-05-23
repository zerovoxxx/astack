# FinClaw 风险域与扫描优先级

全仓扫描时按 Tier 1 → Tier 2 → Tier 3 顺序全量覆盖。Tier 决定扫描顺序和审查深度，不决定是否跳过。

## 运行时度量指引

本文件中的文件体积为编写时的参考值。**每次全仓扫描开始前**，对 Tier 1 和 Tier 2 文件执行快速度量更新：

```bash
# 在 finclaw/ 目录下执行，获取关键文件的当前行数，用于验证风险排序是否仍然准确
wc -l src/main/main.ts src/main/coworkStore.ts src/main/skillManager.ts \
      src/main/libs/agentEngine/openclawRuntimeAdapter.ts \
      src/main/libs/coworkRunner.ts src/main/im/imGatewayManager.ts \
      src/renderer/components/Settings.tsx \
      src/renderer/components/cowork/CoworkSessionDetail.tsx
```

如果发现新的 >500 行文件未在风险域列表中，在报告的"观察项"中标注"建议纳入风险域"。
如果某 Tier 1 文件体积大幅下降（拆分重构），在报告中标注"风险域需更新"。

---

## Tier 1 — 高风险（每次必扫）

### 1.1 主进程核心：IPC + 持久化 + 迁移

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/main/main.ts` | 主入口 | IPC Handler 注册完整性、初始化顺序 |
| `src/main/sqliteStore.ts` | 底层 Store | Schema 迁移、连接生命周期、错误恢复 |
| `src/main/coworkStore.ts` | ~48KB | CRUD 一致性、事务原子性、查询边界 |
| `src/main/skillManager.ts` | ~64KB | 技能加载/卸载生命周期、配置一致性 |

### 1.2 引擎适配层

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/main/libs/agentEngine/openclawRuntimeAdapter.ts` | ~130KB | 事件契约、状态收敛、超时/异常路径 |
| `src/main/libs/agentEngine/coworkEngineRouter.ts` | 路由 | 引擎切换边界条件、fallback |
| `src/main/libs/agentEngine/claudeRuntimeAdapter.ts` | 适配器 | SDK 调用契约、错误映射 |
| `src/main/libs/coworkRunner.ts` | ~121KB | 执行流完整性、权限超时、流式事件 |

### 1.3 IM 网关

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/main/im/imGatewayManager.ts` | ~64KB | 多平台连接生命周期、重连、状态同步 |
| `src/main/im/imCoworkHandler.ts` | ~33KB | Agent 消息处理、投递路由、标识符格式 |
| `src/main/im/imStore.ts` | ~23KB | IM 配置持久化、配对状态一致性 |
| `src/main/im/imDeliveryRoute.ts` | 投递路由 | 跨层标识符格式、错误投递风险 |

## Tier 2 — 中风险（深扫覆盖）

### 2.1 渲染层服务与状态

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/renderer/services/api.ts` | SSE 流式 | 流式中断处理、超时、重试 |
| `src/renderer/services/i18n.ts` | ~92KB | 键值完整性、fallback、动态插值 |
| `src/renderer/services/encryption.ts` | 加密 | 密钥管理、加解密对称性 |
| `src/renderer/store/slices/coworkSlice.ts` | 状态 | 状态更新原子性、selector 边界 |

### 2.2 大型 UI 组件

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/renderer/components/Settings.tsx` | ~144KB | 8 Tab 条件分支、异步副作用、状态联动 |
| `src/renderer/components/cowork/CoworkSessionDetail.tsx` | ~77KB | 会话状态机、流式渲染、权限弹窗 |
| `src/renderer/components/MarkdownContent.tsx` | ~876 行 | 预处理兼容性、XSS 防护、渲染异常 |
| `src/renderer/components/cowork/CoworkPromptInput.tsx` | ~30KB | 输入校验、快捷键冲突、文件附件 |

### 2.3 OpenClaw 配置与引擎管理

| 文件 | 体积 | 关注点 |
|------|------|--------|
| `src/main/libs/openclawEngineManager.ts` | ~38KB | 引擎安装/启动/停止生命周期 |
| `src/main/libs/openclawConfigSync.ts` | ~40KB | 配置同步一致性、冲突覆盖 |
| `src/main/libs/openclawMemoryFile.ts` | 记忆 | MEMORY.md 读写竞争、迁移完整性 |

### 2.4 MCP 与定时任务

| 文件 | 关注点 |
|------|--------|
| `src/main/libs/mcpServerManager.ts` | Server 生命周期、传输类型切换 |
| `src/main/libs/mcpBridgeServer.ts` | HTTP Bridge 安全、端口冲突 |
| `src/main/libs/cronJobService.ts` | Cron 表达式解析、任务重叠、时区 |

## Tier 3 — 低风险（按需抽查）

- `src/renderer/components/im/` — IM 设置 UI
- `src/renderer/components/mcp/` — MCP 管理 UI
- `src/renderer/components/scheduledTasks/` — 定时任务 UI
- `src/renderer/components/skills/` — 技能管理 UI
- `src/renderer/components/update/` — 应用更新 UI
- `src/renderer/data/mcpRegistry.json` — MCP 市场注册表
- `SKILLs/` — 技能定义与配置
- `scripts/` — 构建/部署脚本
