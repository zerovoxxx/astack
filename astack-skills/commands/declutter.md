---
description: "📦 文档归档 - 将已完成 Spec 归档，保持 docs/version/ 精简"
---

# 📦 文档归档

将 ✅已完成 的 Spec 归档到 `archive/`，保持 `docs/version/` 根目录只保留活跃迭代。

## 📊 当前状态

### docs/version/ 概览
!`echo "=== 根目录 SPEC ===" && ls docs/version/Iteration*_SPEC.md 2>/dev/null | wc -l | tr -d ' ' && echo "个" && echo "=== 已归档 SPEC ===" && ls docs/version/archive/Iteration*_SPEC.md 2>/dev/null | wc -l | tr -d ' ' && echo "个"`

### 已完成但未归档的迭代
!`grep '✅ 已完成' docs/version/INDEX.md | grep -v 'archive/' | head -20`

### 活跃迭代（不归档）
!`grep -E '🔜|🔄|⏸️|📝' docs/version/INDEX.md | head -10`

## 🎯 用户输入

$ARGUMENTS

- 若指定迭代编号（如 `56`、`64 65`），只归档指定迭代
- 若无参数，扫描所有 ✅已完成 且未归档的迭代，批量执行

## 📋 执行清单

### 第 1 步：确定归档范围

1. 读取 `docs/version/INDEX.md`，提取所有状态为 `✅ 已完成` 的迭代条目
2. 过滤已归档：排除 INDEX.md 链接已指向 `archive/` 的迭代
3. 过滤活跃依赖：读取所有非完成态 SPEC 的 `前置依赖` 字段，排除被引用的已完成迭代
4. 若指定了迭代编号，进一步过滤到指定范围
5. 输出待归档清单（编号 + 标题 + 行数），确认后继续

### 第 2 步：归档 SPEC 文件

```bash
mkdir -p docs/version/archive/
mv docs/version/Iteration{N}_{Title}_SPEC.md docs/version/archive/
```

### 第 3 步：更新 INDEX.md 链接

将 INDEX.md 中该迭代行的 Spec 文件列更新为归档链接格式：

**更新前**：
```
| {N} | [Iteration{N}_{Title}_SPEC.md](./Iteration{N}_{Title}_SPEC.md) | {标题} | ✅ 已完成 |
```

**更新后**：
```
| {N} | [Spec](./archive/Iteration{N}_{Title}_SPEC.md) | {标题} | ✅ 已完成 |
```

### 第 4 步：汇报

输出：
1. 已归档迭代列表（编号 + 标题 + 行数）
2. 根目录剩余文件数
3. 跳过的迭代及原因（活跃依赖 / 已归档 / 非完成态）

## ⚠️ 安全约束

1. **不归档非完成态**：只处理 `✅ 已完成` 的迭代，跳过 🔜/🔄/⏸️/🗑️ 及其他非完成态
2. **不归档活跃依赖**：若某已完成 SPEC 被活跃迭代的 `前置依赖` 引用，跳过并报告
3. **不覆盖**：若 `archive/` 中已有同名文件，跳过并报告
4. **不修改 BOUNDARIES.md**：边界记录保持不变，归档后仍可检索
5. **幂等安全**：重复执行不产生副作用（已归档的自动跳过）
6. **废弃迭代特殊处理**：🗑️ 已废弃 的迭代直接归档 SPEC，INDEX.md 链接改为 `[Spec](./archive/...)`
7. **REVIEW 不受影响**：评审报告存放于 `docs/version/review/`，归档操作不涉及 REVIEW 文件

---
**开始文档归档...**
