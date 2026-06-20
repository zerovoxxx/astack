# v0.14 — Spec skill external reference guidance

> **文档信息**
>
> | 字段 | 值 |
> |---|---|
> | 文档类型 | SPEC |
> | 文档状态 | 已完成 |
> | 创建日期 | 2026-06-20 |
> | 最后更新 | 2026-06-20 |
> | 作者 | zerovoxxx |
> | 关联文档 | 无 |
> | 一句话目标 | 让 `spec` skill 在复杂方案设计时要求 AI 参考成熟做法并记录设计取舍，同时保持 Harness 工作流轻量。 |

## 1. 背景

当前 `astack-workflow:spec` skill 主要约束 SPEC 的位置、状态、章节和验证门槛。它能保证文档格式稳定，但对方案设计阶段的外部参照要求不足。

用户希望 AI 在设计方案时能充分考虑行业内相同特性或功能的成熟做法，借鉴最佳实践，提升架构先进性。但该要求不应把轻量 SPEC 变成通用调研报告，也不应为局部小变更引入额外负担。

## 2. 目标

1. `spec` skill 在复杂方案设计时要求执行 `外部参照与设计取舍` 检查。
2. 复杂方案设计的判断标准保持泛化，不枚举具体业务域。
3. 外部参照必须落到设计边界、方案选择、验收标准或验证计划，避免空泛写法。
4. 小变更可以说明无需外部参照的原因。
5. 同步更新 marketplace 源 skill 和本仓库 `.claude` 安装副本。

## 3. 非目标

- 不修改 `spec-lint.sh`，本次不引入机械强制检查。
- 不新增 sidecar 调研、评审或复盘文档。
- 不要求所有 SPEC 都联网调研。
- 不改变 SPEC / PLAN 的状态枚举和文档信息表。

## 4. 变更范围

| 文件 | 操作 | 说明 |
|---|---|---|
| `astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md` | MODIFY | 增加复杂方案设计和外部参照规则 |
| `.claude/skills/spec/SKILL.md` | MODIFY | 同步本地安装副本 |
| `docs/astack/INDEX.md` | MODIFY | 新增 v0.14 索引与变更记录 |
| `docs/astack/version/Iteration13_SpecDesignReference_SPEC.md` | NEW | 记录本次轻量增强 |

## 5. 实现说明

- 在 `spec` skill frontmatter 触发词中补充 `方案设计` 和 `设计取舍`，让该 skill 更容易覆盖方案设计类请求。
- 将原有“较大变更可补充”扩展为：复杂方案设计必须补充 `外部参照与设计取舍`。
- 使用 `复杂方案设计` 作为用户确认后的术语，不使用 `非平凡方案设计`。
- 复杂方案设计定义保持领域无关：从影响范围、新结构或约定、既有契约变化、多方案取舍四个维度判断。
- 执行要求先读本仓库现有实现和历史 SPEC，再参考相同问题域的成熟做法、主流项目、官方文档或通用工程实践。
- 如果信息可能过期或用户明确要求行业调研，要求先联网确认。
- 小变更允许写明无需外部参照的原因。

## 6. 验证计划

1. `uv run --with pyyaml python /home/alexk/.codex/skills/.system/skill-creator/scripts/quick_validate.py astack-marketplace/plugins/astack-workflow/skills/spec`
2. `diff -u astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md`
3. `rg -n "复杂方案设计|外部参照与设计取舍|方案设计|设计取舍" astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md`
4. `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration13_SpecDesignReference_SPEC.md`
5. `git diff --check`

## 7. 验收标准

- `spec` skill 使用 `复杂方案设计` 作为触发术语。
- `spec` skill 不列举具体业务域作为复杂设计范围。
- `spec` skill 要求复杂方案设计补充 `外部参照与设计取舍`。
- `spec` skill 要求外部参照落到具体设计取舍、验收或验证，不允许停留在口号。
- 小变更可以说明不需要外部参照的原因。
- marketplace 源 skill 与 `.claude` 安装副本保持一致。

## 8. 验证记录

| 日期 | 命令 | 结果 | 覆盖范围或失败原因 |
|---|---|---|---|
| 2026-06-20 | `uv run --with pyyaml python /home/alexk/.codex/skills/.system/skill-creator/scripts/quick_validate.py astack-marketplace/plugins/astack-workflow/skills/spec` | PASS | skill frontmatter 和基础结构校验通过。 |
| 2026-06-20 | `diff -u astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md` | PASS | marketplace 源 skill 与本地安装副本一致，diff 无输出。 |
| 2026-06-20 | `rg -n "复杂方案设计|外部参照与设计取舍|方案设计|设计取舍" astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md` | PASS | 两份 `spec` skill 均包含新触发词和复杂方案设计规则。 |
| 2026-06-20 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration13_SpecDesignReference_SPEC.md` | PASS | v0.14 SPEC 0 errors / 0 warnings。 |
| 2026-06-20 | `git diff --check` | PASS | whitespace 检查通过。 |
| 2026-06-20 | `uv run --with pyyaml python /home/alexk/.codex/skills/.system/skill-creator/scripts/quick_validate.py astack-marketplace/plugins/astack-workflow/skills/spec` | PASS | ship 前新鲜验证：skill frontmatter 和基础结构校验通过。 |
| 2026-06-20 | `diff -u astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md` | PASS | ship 前新鲜验证：marketplace 源 skill 与本地安装副本一致，diff 无输出。 |
| 2026-06-20 | `rg -n "复杂方案设计|外部参照与设计取舍|方案设计|设计取舍" astack-marketplace/plugins/astack-workflow/skills/spec/SKILL.md .claude/skills/spec/SKILL.md` | PASS | ship 前新鲜验证：两份 `spec` skill 均包含新触发词和复杂方案设计规则。 |
| 2026-06-20 | `bash astack-marketplace/plugins/astack-workflow/scripts/spec-lint.sh docs/astack/version/Iteration13_SpecDesignReference_SPEC.md` | PASS | ship 前新鲜验证：v0.14 SPEC 0 errors / 0 warnings。 |
| 2026-06-20 | `git diff --check` | PASS | ship 前新鲜验证：whitespace 检查通过。 |

## 9. 变更记录

| 日期 | 作者 | 摘要 |
|---|---|---|
| 2026-06-20 | zerovoxxx | 创建 v0.14 SPEC，并按轻量增强方案更新 `spec` skill 的复杂方案设计规则。 |
| 2026-06-20 | zerovoxxx | 完成 ship 前验证，将 v0.14 SPEC 标记为已完成。 |
