#!/bin/bash
# spec-lint.sh — Spec 文档机械化校验
#
# 用法:
#   spec-lint.sh [文件或目录]
#   无参数时默认校验 docs/version/ 下所有 Spec
#
# 退出码: 0 = 通过, 1 = 有 ERROR

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

error() {
    echo -e "${RED}ERROR${NC}: $1"
    echo -e "  ${CYAN}FIX${NC}: $2"
    ((ERRORS++)) || true
}

warn() {
    echo -e "${YELLOW}WARN${NC}: $1"
    ((WARNINGS++)) || true
}

ok() {
    echo -e "${GREEN}OK${NC}: $1"
}

# ── 确定校验目标 ──

TARGET="${1:-docs/version}"

if [ -f "$TARGET" ]; then
    FILES=("$TARGET")
elif [ -d "$TARGET" ]; then
    mapfile -t FILES < <(find "$TARGET" -maxdepth 1 -name "Iteration*_SPEC.md" 2>/dev/null | sort -V)
else
    echo "用法: spec-lint.sh [文件或目录]"
    echo "  文件: 校验单个 Spec"
    echo "  目录: 校验目录下所有 Iteration*_SPEC.md"
    exit 1
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo "未找到 Spec 文件: $TARGET"
    exit 0
fi

echo "=== Spec Lint ==="
echo "校验 ${#FILES[@]} 个文件"
echo ""

for FILE in "${FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    echo "--- $FILENAME ---"

    # ── 1. 命名规范 ──
    if [[ ! "$FILENAME" =~ ^Iteration[0-9]+(\.[0-9]+)?_[A-Za-z_]+_SPEC\.md$ ]]; then
        error "$FILENAME: 文件名不符合规范" \
              "重命名为 Iteration{N}_{EnglishTitle}_SPEC.md，如 Iteration9_File_Management_SPEC.md"
    else
        ok "命名规范"
    fi

    # ── 2. 必要章节 ──
    declare -A SECTIONS=(
        ["## 1. 文档信息"]="版本管理与依赖追溯"
        ["## 2. 背景与目标"]="说明为什么做，动机和目标"
        ["## 3. 方案决策"]="方案对比与选型理由"
        ["## 4. 详细设计"]="具体实现设计"
        ["## 7. 验收标准"]="完成标准定义"
        ["## 8. 风险与缓解"]="风险预判与预案"
        ["## 9. 变更记录"]="文档演化追溯"
    )

    for SECTION in "${!SECTIONS[@]}"; do
        if ! grep -q "$SECTION" "$FILE" 2>/dev/null; then
            error "$FILENAME: 缺少必要章节 '$SECTION'" \
                  "添加 '$SECTION' 章节（作用: ${SECTIONS[$SECTION]}）。参考模板: .claude/commands/spec.md"
        fi
    done

    # ── 3. 文档状态 ──
    if ! grep -q '文档状态' "$FILE" 2>/dev/null; then
        error "$FILENAME: 缺少文档状态行" \
              "在标题下方添加: > **文档状态: 设计中**"
    else
        STATUS=$(grep '文档状态' "$FILE" | head -1 | sed 's/.*文档状态[：: ]*//;s/\*\*//g;s/^[[:space:]]*//;s/[[:space:]]*$//')
        case "$STATUS" in
            设计中|评审中|开发中|CR中|CR完成|已完成)
                ok "文档状态: $STATUS"
                ;;
            *)
                error "$FILENAME: 无效的文档状态 '$STATUS'" \
                      "有效值: 设计中, 评审中, 开发中, CR中, CR完成, 已完成"
                ;;
        esac
    fi

    # ── 4. 非目标章节 ──
    if ! grep -q '非目标' "$FILE" 2>/dev/null; then
        warn "$FILENAME: 未找到 '非目标' 小节。建议添加以防止范围蔓延。"
    fi

    # ── 5. 方案对比 ──
    if grep -q '## 3. 方案决策' "$FILE" 2>/dev/null; then
        DECISION_SECTION=$(sed -n '/## 3\. 方案决策/,/^## [0-9]/p' "$FILE")
        if ! echo "$DECISION_SECTION" | grep -q '|' 2>/dev/null; then
            warn "$FILENAME: 方案决策章节未包含对比表格。建议至少列出 2 个方案的优劣对比。"
        fi
    fi

    # ── 6. 验收标准可操作性 ──
    if grep -q '## 7. 验收标准' "$FILE" 2>/dev/null; then
        ACC_SECTION=$(sed -n '/## 7\. 验收标准/,/^## [0-9]/p' "$FILE")
        if ! echo "$ACC_SECTION" | grep -qE '^\s*[0-9]+\.|^\s*-' 2>/dev/null; then
            warn "$FILENAME: 验收标准章节无编号或列表项。每条标准应可独立验证。"
        fi
    fi

    # ── 7. 变更记录非空 ──
    if grep -q '## 9. 变更记录' "$FILE" 2>/dev/null; then
        CL_ROWS=$(sed -n '/## 9\. 变更记录/,/^## /p' "$FILE" | grep -cE '^\|[^-]' 2>/dev/null || echo "0")
        if [ "$CL_ROWS" -lt 2 ]; then
            warn "$FILENAME: 变更记录章节为空。至少应有初版记录。"
        fi
    fi

    echo ""
done

# ── 9. 跨文件一致性：AGENTS.md / INDEX.md 状态同步 ──
if [ -d "${1:-docs/version}" ]; then
    echo "--- 跨文件一致性 ---"

    for FILE in "${FILES[@]}"; do
        FILENAME=$(basename "$FILE")
        ITER_NUM=$(echo "$FILENAME" | grep -oE 'Iteration[0-9]+(\.[0-9]+)?' | sed 's/Iteration//')

        if [ -n "$ITER_NUM" ]; then
            FILE_STATUS=$(grep '文档状态' "$FILE" 2>/dev/null | head -1 | sed 's/.*文档状态[：: ]*//;s/\*\*//g;s/^[[:space:]]*//;s/[[:space:]]*$//')

            # 检查 INDEX.md
            if [ -f "docs/version/INDEX.md" ]; then
                if ! grep -q "迭代 $ITER_NUM" "docs/version/INDEX.md" 2>/dev/null; then
                    warn "迭代 $ITER_NUM 在 Spec 中存在但未出现在 docs/version/INDEX.md"
                fi
            fi

            # 检查 AGENTS.md
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "迭代 $ITER_NUM" "AGENTS.md" 2>/dev/null; then
                    warn "迭代 $ITER_NUM 在 Spec 中存在但未出现在 AGENTS.md 迭代状态表"
                fi
            fi
        fi
    done
    echo ""
fi

# ── Summary ──
echo "=== 校验结果 ==="
echo -e "文件数: ${#FILES[@]}"
echo -e "错误: ${RED}${ERRORS}${NC}"
echo -e "警告: ${YELLOW}${WARNINGS}${NC}"

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}未通过${NC}: 有 $ERRORS 个错误需要修复。"
    exit 1
else
    echo ""
    echo -e "${GREEN}通过${NC}: 无阻塞性错误。"
    exit 0
fi
