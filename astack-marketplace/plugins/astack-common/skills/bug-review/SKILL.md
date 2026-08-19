---
name: bug-review
description: |
  Systematically scan code for potential bugs, classify findings by severity and confidence,
  and output structured reports with root cause analysis and fix suggestions.
  Supports daily incremental scanning with trend analysis across reports.
  Use when asked to "review bugs", "scan for bugs", "audit code quality", "find potential issues",
  "do a bug review", "code audit", "全局扫描", "BUG 审查", "代码审计", "查找潜在问题",
  "daily scan", "每日扫描", "incremental scan", "增量扫描",
  or when the user wants a systematic quality check of the codebase or a specific module.
---

# BUG 审查 — 系统化代码缺陷扫描

对目标代码做分层漏斗式审查，产出结构化 BUG 报告（分级 + 根因 + 修复建议）。
每次扫描均为独立全量分析，不依赖历史基线——代码在持续变化，每次都应从当前代码出发重新审视。

## 报告输出约定

报告按日期归档至 `docs/bugreport/YYYYMMdd/` 子目录，文件名格式：

```
docs/bugreport/YYYYMMdd/bug_report_YYYYMMdd_xxxx.md
```

- `YYYYMMdd`：审查日期（如 `20260402`），同时用作子目录名和文件名前缀
- `xxxx`：4 位随机字母数字字符（如 `a3f7`），避免同一天多次审查时文件名冲突

若目标目录不存在，审查开始前先创建（如 `docs/bugreport/20260404/`）。

## 审查流程

```
1. 确定范围与模式 → 2. 风险域排序 → 3. 五层漏斗扫描
→ 4. 交叉验证 → 5. 趋势对比 → 6. 写入报告
```

### Step 1：确定范围与模式

根据用户指令确定扫描模式。**当用户明确指定了模式（如"全仓扫描"、"每日扫描"），直接执行，无需二次确认。**

| 模式 | 适用场景 | 方式 |
|------|----------|------|
| **全仓扫描** | 周期性质量审计（建议每周一次） | 全量覆盖，按 Tier 1→2→3 顺序执行 |
| **每日增量** | 日常持续扫描 | 变更文件全量 + 未变更高风险文件快速检查 |
| **模块定向** | 用户指定目录/文件 | 直接进入该模块 |
| **PR 增量** | 提交/PR 级别 | `git diff` 范围 + 引用链 |

**每日增量模式**的具体扫描策略：

1. `git diff --name-only HEAD~1` 或 `git log --since="yesterday" --name-only --pretty=format:""` 获取变更文件集
2. 变更文件：完整五层扫描
3. 未变更的 Tier 1 文件：Layer 1-2 快速检查（结构概览 + 模式匹配）
4. 未变更的 Tier 2/3 文件：跳过

全仓扫描时，阅读 [reference/risk-domains.md](reference/risk-domains.md) 获取风险域优先级排序。

### Step 2：风险域优先排序

全仓扫描不做无差别逐文件通读。按以下维度排序模块优先级：

- 文件体积与复杂度（>30KB 或 >500 行的文件优先）
- 跨层交互数（IPC/Store/Adapter 密集区优先）
- 历史问题密度（参考 `docs/retro/patterns.md` 中的来源标注）
- 状态机复杂度（含异步流、生命周期管理的模块优先）

每日增量模式下，跳过此步——直接按变更文件集执行。

### Step 3：五层漏斗扫描

对每个目标模块，依次执行以下五层检查。每层只聚焦该层关注的问题类型。

**Layer 1 — 结构概览**
快速建立模块全貌：导出接口、核心状态、关键依赖链、异常/错误路径。
不深入实现细节，目标是识别"哪些区域值得深看"。

**大文件阅读策略**（>500 行或 >30KB 的文件）：
不要尝试全量读取。按以下步骤定向深入：
1. 先用符号概览工具（`get_symbols_overview` 或文件顶部的导出列表）获取函数/类清单
2. 用语义搜索或 grep 定位与当前检查项相关的区域（如搜索 `catch`、`return true`、`emit(` 等）
3. 仅对命中区域及其上下文做定向阅读（通常 ±50 行足够）
4. 对跨函数的数据流，沿调用链逐段追踪，而非一次读完整个文件

**Layer 2 — 通用 BUG 模式匹配**
逐项过 [reference/bug-patterns.md](reference/bug-patterns.md) 中的检查清单。
重点关注：
- 边界未过滤 / 标识符格式不一致
- 异步流缺少 complete/error/timeout 收敛
- 引用替换后下游未刷新
- 事件生成条件的隐式守卫
- 运行时迁移与编译期常量不原子

**Layer 3 — 架构专项审查**
根据模块所属风险域，选择对应专项：
- **IPC 专项**：参数校验、返回值契约、错误传播、超时、幂等性
- **Store/迁移专项**：初始化顺序、旧数据兼容、失败回退
- **Adapter/事件链专项**：上游事件到达保证、隐式守卫条件
- **Renderer 状态专项**：loading/error/empty/retry 闭环、useEffect 依赖
- **配置专项**：默认值、环境差异、路径/URL 来源

**Layer 4 — 归因与证据收敛**
对每个疑点回答以下 5 个问题，缺一不可：
1. 触发条件是什么？
2. 失败路径在哪里断？
3. 为什么现有测试/人工流程不容易发现？
4. 影响范围到哪一层？
5. 最小修复点在哪里？

若无法回答全部 5 题，该问题降为"观察项"，不定为高等级 bug。

**Layer 5 — 报告输出**
按 [reference/report-template.md](reference/report-template.md) 格式组织发现。此步不写文件——先完成 Step 4-5 再写。

### Step 4：交叉验证

扫描完所有目标模块后：
- 检查跨模块问题（A 模块写入 + B 模块读取的格式不一致等）
- 合并同根因的多个表象为一条 BUG
- 按等级降序排列最终报告

### Step 5：趋势对比

如果 `docs/bugreport/` 下的日期子目录中存在上一次的报告文件，读取其审查摘要部分，与本次结果对比：
- 哪些问题在上次报告中也出现过（说明仍未修复）
- 哪些是本次新发现的
- 哪些上次有但本次消失了（可能已修复）
- 整体问题数量和等级分布的变化趋势

无上一次报告时，标注"首次扫描，无历史对比数据"即可。

### Step 6：写入报告

1. 生成文件名：`bug_report_YYYYMMdd_xxxx.md`（当天日期 + 4 位随机字符）
2. 按 [reference/report-template.md](reference/report-template.md) 格式写入 `docs/bugreport/YYYYMMdd/`
3. 向用户输出简要总结：

```
扫描模式：全仓扫描 / 每日增量
扫描范围：X 个模块，Y 个文件
发现总数：P0: a / P1: b / P2: c / P3: d / P4: e
置信度分布：High: x / Medium: y / Low: z
趋势：较上次 +N 新发现 / -M 消失 / K 持续存在
建议优先修复：[列出 P0 + P1 标题]
观察名单：[列出需后续验证的项]
报告文件：docs/bugreport/YYYYMMdd/bug_report_YYYYMMdd_xxxx.md
```

## 并行执行策略

全仓扫描时，如果条件允许（多 Agent 实例或 Task 子任务），按 [reference/parallel-strategy.md](reference/parallel-strategy.md) 拆分为并行子任务：
- 按风险域 Tier 拆分为 3-4 个独立扫描任务
- 每个子任务独立产出子报告
- 最后执行合并去重协议

单 Agent 执行时忽略此策略，按顺序执行即可。

## BUG 分级标准

| 等级 | 定义 | 处置 |
|------|------|------|
| **P0** | 数据丢失、错误投递、不可恢复崩溃、安全风险、主链路完全失效 | 必须立即修复 |
| **P1** | 核心功能明显异常，有稳定复现路径，但存在绕过方式 | 当前迭代修复 |
| **P2** | 特定条件下功能错误、状态不一致、兼容性缺陷 | 排期修复 |
| **P3** | 低频逻辑瑕疵、错误提示不完整、边缘场景缺陷 | 择机修复 |
| **P4** | 代码异味或设计隐患，未形成明确 bug 但高度可能演变 | 观察名单 |

## 置信度标准

| 置信度 | 定义 |
|--------|------|
| **High** | 已找到明确代码路径和失败链条 |
| **Medium** | 代码上能推导出风险，但缺少一段关键运行证据 |
| **Low** | 模式命中或设计异味，需后续验证 |

## 审查准则

- 以"找行为错误"为中心，不以风格问题充数
- 每条问题必须给出根因机制，不接受只有现象没有解释的报告
- 每条 P0/P1 必须给出最小修复建议
- 平衡置信度：只报有较强证据的 BUG 和高风险疑点，接受少量误报但不泛滥
- 参考已有评审知识：`docs/retro/patterns.md`（反模式）和 `docs/retro/golden-rules.md`（黄金法则）

## 参考资料

- 风险域与扫描优先级：[reference/risk-domains.md](reference/risk-domains.md)
- 通用 BUG 模式检查清单：[reference/bug-patterns.md](reference/bug-patterns.md)
- BUG 报告输出模板：[reference/report-template.md](reference/report-template.md)
- 并行执行策略：[reference/parallel-strategy.md](reference/parallel-strategy.md)
- 项目反模式库：`docs/retro/patterns.md`
- 项目黄金法则：`docs/retro/golden-rules.md`
- 架构详述：`docs/asset/architecture-detail.md`
