# 通用 BUG 模式检查清单

Layer 2 扫描时逐项过检。每个模式给出"检查什么"和"怎么搜"。

## 1. 边界与过滤

### 1.1 输入/输出边界未过滤
- **检查**：IPC handler 的参数是否做了类型/范围校验；外部数据（Gateway 事件、API 响应）进入内部 Store 前是否有过滤/转换。
- **搜索**：IPC handler 入口 → 参数直接使用 vs 有 validate/sanitize/filter 调用。
- **关联反模式**：P5（R5）—— 跨层数据传递必须显式过滤。

### 1.2 跨层标识符格式不一致
- **检查**：同一实体的 ID/key 在写入端和读取端是否经过相同的 normalize 处理（大小写、前缀剥离、编码）。
- **搜索**：grep `normalize`/`toLowerCase`/`toUpperCase` + 实体名，对比写入路径和读取路径。
- **关联反模式**：P12（实现类）—— 跨层标识符格式不一致。

### 1.3 YAML/JSON 重复 key 静默覆盖
- **检查**：配置文件（SKILL.md frontmatter、JSON config）中是否存在重复 key。
- **搜索**：对 YAML 文件做 key 计数；对 JSON 文件 lint。
- **关联反模式**：P8 —— 分类语义复用展示字段。

## 2. 异步流与状态收敛

### 2.1 异步流缺少 complete/error/timeout 收敛
- **检查**：每个 async 流程（SSE、WebSocket、IPC 长操作）是否在所有路径上最终到达终态（complete/error）；是否有超时兜底。
- **搜索**：找 `emit('complete')` / `emit('error')` 的调用点，检查是否存在不触发任何终态的代码路径。
- **关联反模式**：P16 —— 上游隐式事件契约。

### 2.2 Promise 未处理 rejection
- **检查**：`.then()` 链是否有 `.catch()`；`async` 函数调用点是否有 `try/catch` 或 `.catch()`。
- **搜索**：grep 无 `.catch` 的 `.then(`，或无 `try` 包裹的 `await`（仅关注关键路径）。

### 2.3 事件监听器泄漏
- **检查**：`addEventListener` / `on()` 是否在组件卸载 / 对象销毁时有对应的 `removeEventListener` / `off()`。
- **搜索**：对比 `on(` 和 `off(` / `removeListener` 的数量和位置。

### 2.4 竞态条件
- **检查**：多个异步操作修改同一状态时是否有排他保护（锁、队列、取消前次请求）。
- **搜索**：在 `useEffect` / IPC handler 中查找对同一 state/store 字段的并发写入。

## 3. 引用与生命周期

### 3.1 对象替换后下游仍持有旧引用
- **检查**：当核心对象（DB 连接、Engine 实例）被重建/替换时，所有持有旧引用的消费者是否被通知刷新。
- **搜索**：找 `this.xxx = new ...` 或 `this.xxx = await ...`（重新赋值），然后检查谁在构造时缓存了 `this.xxx`。
- **关联反模式**：P14 —— 共享引用替换盲区。

### 3.2 React useEffect 依赖遗漏/过多
- **检查**：`useEffect` 的依赖数组是否与 effect body 中实际引用的外部变量一致。
- **搜索**：eslint `react-hooks/exhaustive-deps` 警告；或手动对比 effect body 中的引用和依赖数组。

### 3.3 组件卸载后仍更新状态
- **检查**：异步回调（fetch、setTimeout、事件监听）中的 `setState` 是否在组件已卸载时被调用。
- **搜索**：在含 `useEffect` + async 操作的组件中，查看 cleanup 函数是否设置了取消标记。

## 4. 迁移与配置

### 4.1 运行时迁移与编译期常量不原子
- **检查**：如果代码中存在"先改常量再做运行时迁移"的模式，迁移失败时是否有回退路径。
- **搜索**：grep `renameSync` / `cpSync` / `mkdirSync`，检查 catch 块是否跳过了后续依赖迁移结果的步骤。
- **关联反模式**：P13 —— 编译期常量变更 + 运行时迁移不原子。

### 4.2 模板文件 re-apply 不区分持久/临时
- **检查**：模板部署（`applyTemplate` / copy）的 additive 模式是否会恢复"已被有意删除"的文件。
- **搜索**：找 `applyTemplate` / `copyFileSync` + 条件判断，检查是否有 ephemeral 标记。
- **关联反模式**：P15 —— Additive Re-apply 不区分持久文件与临时文件。

### 4.3 环境/路径硬编码
- **检查**：是否有 `localhost`、绝对路径、平台特定路径分隔符被硬编码在业务逻辑中。
- **搜索**：grep `localhost:` / `127.0.0.1` / `C:\\` / `/Users/`（排除测试文件和注释）。

## 5. 安全

### 5.1 敏感信息泄漏
- **检查**：API Key、Token、密码是否出现在日志、错误消息、IPC 返回值中。
- **搜索**：grep `console.log` / `log.info` / `log.warn` + 变量名含 `key` / `token` / `secret` / `password`。

### 5.2 用户输入拼接到命令/SQL
- **检查**：用户输入是否被直接拼接到 shell 命令（`exec`/`spawn`）或 SQL 语句中。
- **搜索**：grep `exec(` / `execSync(` / `spawn(` + 字符串模板；grep SQL 字符串中的 `${`。

### 5.3 XSS 风险
- **检查**：`dangerouslySetInnerHTML` 的输入是否经过 sanitize；Markdown 渲染是否限制了 HTML 标签。
- **搜索**：grep `dangerouslySetInnerHTML` / `innerHTML`。

## 6. 错误处理

### 6.1 catch 块静默吞错
- **检查**：catch 块是否仅 `console.warn` / `log.warn` 然后继续执行，而实际应该中断或降级。
- **搜索**：grep `catch` + 只有 `warn` / `debug` 级别日志的块。

### 6.2 错误信息丢失上下文
- **检查**：错误传播时是否保留了原始错误（`cause` 或 `stack`），还是仅传递了字符串消息。
- **搜索**：grep `throw new Error(` + 无 `{ cause: }` 的调用。

## 7. 返回值与分支完整性

### 7.1 返回值假成功（语义与操作不一致）
- **检查**：函数返回 `true` / `success` / 无错误，但实际未执行核心操作（如未实现的分支、default case、空 catch 后 return true）。上游据此推进流程，形成静默失败。
- **搜索**：在 switch/if 的 default 或 else 分支中查找 `return true` / `return { success: true }`；在 `not yet supported` / `not implemented` 注释附近查找返回值。
- **高产模式**：2026-04-02 扫描中命中 6 条（CA-01, CA-04, CB-12 等），涵盖 IM 发送、Agent 删除、配置同步。

### 7.2 多平台分支遗漏
- **检查**：对平台/渠道做 if/switch 分发的函数，是否覆盖了所有已支持的平台枚举值。新增平台后是否同步更新了所有分发点。
- **搜索**：找含 `dingtalk` / `telegram` / `discord` / `feishu` / `qq` / `wecom` / `weixin` 等平台标识的 switch/if 链，检查每个分发点是否覆盖完整。用一个平台名做 grep，对比各分发函数的分支数是否一致。
- **高产模式**：2026-04-02 扫描中命中 4 条（CB-01, CB-02, weixin isConfigured/startAllEnabled），均为平台扩展后漏补分支。

### 7.3 Promise/缓存中毒（失败后未重置）
- **检查**：用变量缓存 Promise 结果时（如 `cachedXxxPromise`），如果 Promise reject，缓存是否被清除？后续调用是否会永久拿到 rejected Promise？
- **搜索**：grep 赋值给模块级/实例级变量的 Promise（`xxxPromise =`、`cached` + `Promise`），检查是否有 `.catch` 中重置缓存的逻辑。
- **高产模式**：2026-04-02 扫描中命中 CA-02（cachedKeyPromise 中毒导致加解密全线锁死），3/4 报告共识。

## 8. 类型与契约

### 8.1 IPC 返回值类型与声明不符
- **检查**：`electron.d.ts` 中声明的 IPC 方法返回类型是否与主进程实际返回值一致。
- **搜索**：对比 `electron.d.ts` 中的方法签名和 `main.ts` / handler 中的 `return` 语句。

### 8.2 可选字段未做空值防御
- **检查**：类型声明中标记为 `?` 的字段，在消费侧是否有 null/undefined 防御。
- **搜索**：找接口中 `xxx?:` 字段，然后在消费侧 grep `xxx.` 看是否有 `?.` 或前置判断。

### 8.3 as 类型断言掩盖真实类型
- **检查**：`as` 断言是否用于绕过类型检查而非合法收窄。
- **搜索**：grep ` as ` 断言，检查断言前后类型是否兼容。
