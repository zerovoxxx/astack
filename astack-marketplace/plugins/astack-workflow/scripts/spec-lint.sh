#!/bin/bash
# spec-lint.sh — lightweight SPEC document checks
#
# Usage:
#   spec-lint.sh [file-or-directory]
#   Defaults to docs/version/ and checks root-level Iteration*_SPEC.md files.
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

TARGET="${1:-docs/version}"

if [ -f "$TARGET" ]; then
    FILES=("$TARGET")
elif [ -d "$TARGET" ]; then
    mapfile -t FILES < <(find "$TARGET" -maxdepth 1 -name "Iteration*_SPEC.md" 2>/dev/null | sort -V)
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
        error "$FILENAME: filename does not match the lightweight SPEC convention" \
              "Use Iteration<N>_<PascalSlug>_SPEC.md, for example Iteration12_AstackMarketplace_SPEC.md"
    else
        ok "filename"
    fi

    if ! has_pattern '文档状态' "$FILE"; then
        error "$FILENAME: missing document status" \
              "Add a line near the title, for example: > **文档状态: 设计中**"
    else
        STATUS=$(grep '文档状态' "$FILE" | head -1 | sed 's/.*文档状态[：: ]*//;s/\*\*//g;s/^[[:space:]]*//;s/[[:space:]]*$//')
        case "$STATUS" in
            *设计中*|*待实施*|*开发中*|*验证中*|*开发完成*|*已完成*|*阻塞*|*完成*)
                ok "document status: $STATUS"
                ;;
            *)
                warn "$FILENAME: uncommon document status '$STATUS'"
                ;;
        esac
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
        if ! grep -Eq '^\s*([0-9]+\.|-|\*)\s+' "$FILE"; then
            warn "$FILENAME: acceptance criteria section has no list items"
        fi
    else
        warn "$FILENAME: missing acceptance criteria"
    fi

    if has_pattern '验证计划|Verification plan|验证命令' "$FILE"; then
        ok "verification plan"
    else
        warn "$FILENAME: no lightweight verification plan found"
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

if [ -d "$TARGET" ]; then
    echo "--- Cross-file checks ---"
    if [ -f "docs/version/INDEX.md" ]; then
        for FILE in "${FILES[@]}"; do
            FILENAME=$(basename "$FILE")
            ITER_NUM=$(echo "$FILENAME" | grep -oE '^Iteration[0-9]+' | sed 's/Iteration//')
            if [ -n "$ITER_NUM" ] && ! grep -q "Iteration$ITER_NUM" "docs/version/INDEX.md" 2>/dev/null; then
                warn "Iteration$ITER_NUM exists as a SPEC file but is not referenced in docs/version/INDEX.md"
            fi
        done
    else
        warn "docs/version/INDEX.md not found"
    fi
    echo ""
fi

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
