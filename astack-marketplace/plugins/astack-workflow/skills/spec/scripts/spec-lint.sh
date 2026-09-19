#!/bin/bash
# spec-lint.sh — SPEC document checks
#
# Usage (run from the repository root):
#   spec-lint.sh [file-or-directory]
#   Defaults to docs/astack/version/ and checks root-level Iteration*_SPEC.md files.
#
# Exit codes: 0 = no blocking errors, 1 = blocking errors found.

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

has_pattern() {
    local pattern="$1"
    local file="$2"
    grep -Eq "$pattern" "$file" 2>/dev/null
}

has_document_info_field() {
    local field="$1"
    local file="$2"
    grep -Eq "^[>[:space:]]*\\|[[:space:]]*$field[[:space:]]*\\|" "$file" 2>/dev/null
}

extract_document_status() {
    local file="$1"
    local line
    line=$(grep -m 1 '文档状态' "$file" || true)

    if [[ "$line" == *"|"* ]]; then
        echo "$line" | awk -F'|' '{
            for (i = 1; i <= NF; i++) {
                gsub(/^[ \t>]+|[ \t]+$/, "", $i)
                if ($i == "文档状态" && i < NF) {
                    value = $(i + 1)
                    gsub(/^[ \t]+|[ \t]+$/, "", value)
                    print value
                    exit
                }
            }
        }'
        return
    fi

    echo "$line" | sed 's/.*文档状态[：: ]*//;s/\*\*//g;s/^[[:space:]]*//;s/[[:space:]]*$//'
}

TARGET="${1:-docs/astack/version}"
INDEX_PATH="docs/astack/INDEX.md"

if [ -f "$TARGET" ]; then
    FILES=("$TARGET")
elif [ -d "$TARGET" ]; then
    FILES=()
    while IFS= read -r FILE; do
        [ -n "$FILE" ] && FILES+=("$FILE")
    done < <(find "$TARGET" -maxdepth 1 -name "Iteration*_SPEC.md" 2>/dev/null | LC_ALL=C sort)
else
    echo "Usage: spec-lint.sh [file-or-directory]"
    exit 1
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No SPEC files found: $TARGET"
    exit 0
fi

echo "=== Spec Lint ==="
echo "Checking ${#FILES[@]} file(s)"
echo ""

for FILE in "${FILES[@]}"; do
    FILENAME=$(basename "$FILE")
    echo "--- $FILENAME ---"

    if [[ ! "$FILENAME" =~ ^Iteration[0-9]+_[A-Za-z][A-Za-z0-9]*_SPEC\.md$ ]]; then
        error "$FILENAME: filename does not match the SPEC convention" \
              "Use Iteration<N>_<PascalSlug>_SPEC.md, for example Iteration12_AstackMarketplace_SPEC.md"
    else
        ok "filename"
    fi

    if ! has_pattern '文档状态' "$FILE"; then
        error "$FILENAME: missing document status" \
              "Add a 文档信息 table row, for example: > | 文档状态 | 待实施 |"
    else
        STATUS=$(extract_document_status "$FILE")
        case "$STATUS" in
            待实施|开发中|已完成|阻塞)
                ok "document status: $STATUS"
                ;;
            *)
                warn "$FILENAME: non-standard document status '$STATUS' (expected one of: 待实施, 开发中, 已完成, 阻塞)"
                ;;
        esac
    fi

    for FIELD in 文档类型 文档状态 创建日期 最后更新 作者 关联文档 一句话目标; do
        if ! has_document_info_field "$FIELD" "$FILE"; then
            warn "$FILENAME: missing 文档信息 field '$FIELD'"
        fi
    done

    if has_document_info_field "文档类型" "$FILE" && ! grep -Eq '^[>[:space:]]*\|[[:space:]]*文档类型[[:space:]]*\|[[:space:]]*SPEC[[:space:]]*\|' "$FILE"; then
        warn "$FILENAME: 文档类型 should be SPEC"
    fi

    if has_pattern '目标|背景|缘起|In scope|本次迭代的边界' "$FILE"; then
        ok "goal / background"
    else
        error "$FILENAME: missing goal or background section" \
              "Add goals and non-goals so scope is explicit."
    fi

    if has_pattern '非目标|Out of scope|Out-of-scope' "$FILE"; then
        ok "non-goals"
    else
        warn "$FILENAME: no non-goal / out-of-scope section found"
    fi

    if has_pattern '验收标准|Acceptance' "$FILE"; then
        ok "acceptance criteria"
        if ! grep -Eq '^[[:space:]]*([0-9]+\.|-|\*)[[:space:]]+' "$FILE"; then
            warn "$FILENAME: acceptance criteria section has no list items"
        fi
    else
        warn "$FILENAME: missing acceptance criteria"
    fi

    if has_pattern '验证计划|Verification plan|验证命令' "$FILE"; then
        ok "verification plan"
    else
        warn "$FILENAME: no verification plan found"
    fi

    if has_pattern '验证记录|Verification record|校验结果|test.*pass|typecheck.*pass' "$FILE"; then
        ok "verification record"
    else
        warn "$FILENAME: no verification record found"
    fi

    if has_pattern '变更记录|Changelog|Change log' "$FILE"; then
        ok "changelog"
    else
        warn "$FILENAME: no changelog section found"
    fi

    echo ""
done

echo "--- Cross-file checks ---"
if [ -f "$INDEX_PATH" ]; then
    for FILE in "${FILES[@]}"; do
        FILENAME=$(basename "$FILE")
        if [[ "$FILENAME" =~ ^Iteration([0-9]+)_ ]]; then
            ITER_NUM="${BASH_REMATCH[1]}"
            if ! grep -Fq "$FILENAME" "$INDEX_PATH" 2>/dev/null; then
                warn "Iteration$ITER_NUM exists as a SPEC file but is not referenced in $INDEX_PATH"
            fi
        fi
    done
else
    warn "$INDEX_PATH not found"
fi
echo ""

echo "=== Result ==="
echo -e "files: ${#FILES[@]}"
echo -e "errors: ${RED}${ERRORS}${NC}"
echo -e "warnings: ${YELLOW}${WARNINGS}${NC}"

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}failed${NC}: fix blocking errors."
    exit 1
fi

echo ""
echo -e "${GREEN}passed${NC}: no blocking errors."
