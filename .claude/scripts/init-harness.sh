#!/bin/bash
# init-harness.sh — Harness 研发流程初始化
#
# 在项目根目录运行，自动检测项目状态并初始化 harness 基础设施：
#   - 全新项目：创建 AGENTS.md + 治理文档 + 知识库
#   - 已有 AGENTS.md：瘦身迁移，拆分膨胀章节到独立文档
#
# 用法:
#   bash .claude/scripts/init-harness.sh [选项]
#
# 选项:
#   --name <项目名>     项目名称（不提供则交互式询问）
#   --desc <描述>       一句话项目描述
#   --dry-run           只输出计划，不实际修改
#   --force             覆盖已存在的治理文档
#   --help              显示帮助

set -euo pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── 参数解析 ──
PROJECT_NAME=""
PROJECT_DESC=""
DRY_RUN=false
FORCE=false
CREATED_FILES=()
MIGRATED_SECTIONS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --name) PROJECT_NAME="$2"; shift 2 ;;
        --desc) PROJECT_DESC="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --force) FORCE=true; shift ;;
        --help)
            head -16 "$0" | tail -14
            exit 0
            ;;
        *) echo "未知参数: $1 (运行 --help 查看用法)"; exit 1 ;;
    esac
done

# ── 工具函数 ──

info() { echo -e "${CYAN}▸${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
action() { echo -e "${BOLD}→${NC} $1"; }

create_file() {
    local filepath="$1"
    local content="$2"

    if [ -f "$filepath" ] && [ "$FORCE" != true ]; then
        warn "$filepath 已存在，跳过（使用 --force 覆盖）"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将创建 $filepath"
        return 0
    fi

    mkdir -p "$(dirname "$filepath")"
    echo "$content" > "$filepath"
    CREATED_FILES+=("$filepath")
    success "创建 $filepath"
}

# ── 状态检测 ──

echo ""
echo -e "${BOLD}🏗️  Harness 初始化${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

HAS_AGENTS_MD=false
HAS_INDEX_MD=false
HAS_BOUNDARIES_MD=false
HAS_GOLDEN_RULES=false
HAS_PATTERNS=false
HAS_DOCS_DIR=false

[ -f "AGENTS.md" ] && HAS_AGENTS_MD=true
[ -f "docs/version/INDEX.md" ] && HAS_INDEX_MD=true
[ -f "docs/version/BOUNDARIES.md" ] && HAS_BOUNDARIES_MD=true
[ -f "docs/retro/golden-rules.md" ] && HAS_GOLDEN_RULES=true
[ -f "docs/retro/patterns.md" ] && HAS_PATTERNS=true
[ -d "docs" ] && HAS_DOCS_DIR=true

info "项目目录: $(pwd)"
info "AGENTS.md: $( [ "$HAS_AGENTS_MD" = true ] && echo '已存在' || echo '不存在' )"
info "docs/version/INDEX.md: $( [ "$HAS_INDEX_MD" = true ] && echo '已存在' || echo '不存在' )"
info "docs/version/BOUNDARIES.md: $( [ "$HAS_BOUNDARIES_MD" = true ] && echo '已存在' || echo '不存在' )"
info "docs/retro/golden-rules.md: $( [ "$HAS_GOLDEN_RULES" = true ] && echo '已存在' || echo '不存在' )"
info "docs/retro/patterns.md: $( [ "$HAS_PATTERNS" = true ] && echo '已存在' || echo '不存在' )"
echo ""

# ── 判断模式 ──

if [ "$HAS_AGENTS_MD" = true ] && [ "$HAS_INDEX_MD" = true ]; then
    info "检测到已完成 harness 初始化，将检查并补全缺失文件"
    MODE="patch"
elif [ "$HAS_AGENTS_MD" = true ]; then
    info "检测到已有 AGENTS.md，将执行迁移瘦身"
    MODE="migrate"
else
    info "全新项目，将从零初始化"
    MODE="fresh"
fi

echo ""

# ── 收集项目信息（全新模式需要） ──

if [ "$MODE" = "fresh" ]; then
    if [ -z "$PROJECT_NAME" ]; then
        # 从目录名推断默认值
        DEFAULT_NAME=$(basename "$(pwd)")
        read -p "项目名称 [$DEFAULT_NAME]: " INPUT_NAME
        PROJECT_NAME="${INPUT_NAME:-$DEFAULT_NAME}"
    fi

    if [ -z "$PROJECT_DESC" ]; then
        read -p "一句话项目描述: " PROJECT_DESC
        PROJECT_DESC="${PROJECT_DESC:-待补充}"
    fi
fi

# ── 1. 创建目录结构 ──

action "创建目录结构"

if [ "$DRY_RUN" = true ]; then
    info "[dry-run] mkdir -p docs/version docs/retro"
else
    mkdir -p docs/version docs/retro
    success "docs/version/"
    success "docs/retro/"
fi

echo ""

# ── 2. 创建/迁移 AGENTS.md ──

if [ "$MODE" = "fresh" ]; then
    action "创建 AGENTS.md"

    AGENTS_CONTENT="# ${PROJECT_NAME}

> 本文件是项目的导航地图，详细内容通过链接指向对应文档。

## 1. 项目定位

${PROJECT_DESC}

## 2. 核心开发原则

1. Spec 驱动：先设计后编码，所有功能变更必须有对应 Spec
2. 文档即权威：Spec 文档是开发和评审的唯一权威依据
3. 最小改动：只修改方案涉及的文件和模块，不扩散重构
4. 机械校验优于人工约定：能用 lint 检查的规则不靠自觉遵守
5. 知识回流：评审和 CR 中的发现自动沉淀为团队知识

## 3. 权威文档

- \`docs/version/\` — 版本设计文档（Spec）
- \`docs/retro/golden-rules.md\` — 黄金法则（评审自动沉淀）

## 4. 导航索引

| 文档 | 内容 | 维护方式 |
|------|------|---------|
| [\`docs/version/INDEX.md\`](docs/version/INDEX.md) | 迭代状态表 | \`/spec\`、\`/mr\` 自动维护 |
| [\`docs/version/BOUNDARIES.md\`](docs/version/BOUNDARIES.md) | 迭代边界规则 | \`/spec\` 自动维护 |
| [\`docs/retro/golden-rules.md\`](docs/retro/golden-rules.md) | 黄金法则（活跃规则） | \`/spec_review\`、\`/code_review\` 自动沉淀 |
| [\`docs/retro/patterns.md\`](docs/retro/patterns.md) | 反模式库 | 同上 |

## 5. 当前活跃迭代

（无活跃迭代）"

    create_file "AGENTS.md" "$AGENTS_CONTENT"

elif [ "$MODE" = "migrate" ]; then
    action "迁移 AGENTS.md"

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将备份 AGENTS.md → AGENTS.md.bak"
        info "[dry-run] AGENTS.md 迁移需要 AI 辅助执行，请运行 /init_harness 命令"
    else
        cp AGENTS.md AGENTS.md.bak
        success "备份 AGENTS.md → AGENTS.md.bak"
        warn "AGENTS.md 的内容迁移（章节识别、拆分、重写）需要 AI 辅助"
        warn "请在 AI 会话中运行 /init_harness 命令完成迁移"
        echo ""
    fi
fi

echo ""

# ── 3. 创建 INDEX.md ──

if [ "$HAS_INDEX_MD" = false ]; then
    action "创建 docs/version/INDEX.md"

    INDEX_CONTENT="# 迭代状态总表

> 所有迭代的状态追踪。由 \`/spec\` 和 \`/mr\` 命令自动维护。

| 迭代 | 标题 | 状态 | 文档 | 创建日期 |
|------|------|------|------|---------|"

    create_file "docs/version/INDEX.md" "$INDEX_CONTENT"
fi

# ── 4. 创建 BOUNDARIES.md ──

if [ "$HAS_BOUNDARIES_MD" = false ]; then
    action "创建 docs/version/BOUNDARIES.md"

    BOUNDARIES_CONTENT="# 迭代边界规则

> 每个迭代的范围边界，防止跨迭代的范围蔓延。由 \`/spec\` 命令自动维护。
> spec_review 评审时作为迭代边界遵守（A3）的评审基准。"

    create_file "docs/version/BOUNDARIES.md" "$BOUNDARIES_CONTENT"
fi

# ── 5. 创建 golden-rules.md ──

if [ "$HAS_GOLDEN_RULES" = false ]; then
    action "创建 docs/retro/golden-rules.md"

    GOLDEN_RULES_CONTENT="# 黄金法则

> 从历次评审和开发中提炼的正面规则。
> spec_review / code_review **仅加载「活跃规则」区域**，归档区域不加载。
> 活跃规则上限 15 条，超出时应将低频规则移入归档。
> 编号全局唯一递增（R1, R2, ...），归档后编号不回收。

## 活跃规则

> ⚡ 以下规则在每次评审/CR 时自动加载。保持精简。

### Spec 设计规则

（待积累）

### 代码实现规则

（待积累）

### 跨层契约规则

（待积累）

---

## 归档规则

> 📦 已归档的规则不参与评审加载，但保留供查阅和检索。
> 归档原因通常为：连续 5 个迭代未被触发 / 相关模块已重构 / 被更精确的新规则替代。

（待积累）"

    create_file "docs/retro/golden-rules.md" "$GOLDEN_RULES_CONTENT"
fi

# ── 6. 创建 patterns.md ──

if [ "$HAS_PATTERNS" = false ]; then
    action "创建 docs/retro/patterns.md"

    PATTERNS_CONTENT="# 反模式库

> 从历次评审和开发中识别的反模式，每条关联对应的黄金法则。
> 编号全局唯一递增（P1, P2, ...）。

## 设计类反模式

（待积累）

## 实现类反模式

（待积累）

## 流程类反模式

（待积累）"

    create_file "docs/retro/patterns.md" "$PATTERNS_CONTENT"
fi

echo ""

# ── 7. 检查 .claude/commands ──

action "检查命令配置"

REQUIRED_COMMANDS=("spec.md" "spec_review.md" "dev.md" "code_review.md" "mr.md" "retro.md")
MISSING_COMMANDS=()

for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if [ ! -f ".claude/commands/$cmd" ]; then
        MISSING_COMMANDS+=("$cmd")
    fi
done

if [ ${#MISSING_COMMANDS[@]} -eq 0 ]; then
    success "所有核心命令已就绪: ${REQUIRED_COMMANDS[*]}"
else
    warn "缺少以下命令: ${MISSING_COMMANDS[*]}"
    warn "请将 harness 命令集复制到 .claude/commands/"
fi

# 检查 spec-lint
if [ -f ".claude/scripts/spec-lint.sh" ]; then
    success "spec-lint.sh 已就绪"
    chmod +x .claude/scripts/spec-lint.sh 2>/dev/null || true
else
    warn "缺少 .claude/scripts/spec-lint.sh"
fi

echo ""

# ── 汇报 ──

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}📋 初始化完成${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[dry-run 模式] 未实际修改任何文件${NC}"
    echo ""
fi

echo "模式: $MODE"

if [ ${#CREATED_FILES[@]} -gt 0 ]; then
    echo ""
    echo "创建的文件:"
    for f in "${CREATED_FILES[@]}"; do
        echo "  + $f"
    done
fi

if [ ${#MISSING_COMMANDS[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}待处理:${NC}"
    echo "  - 复制缺失的命令到 .claude/commands/"
fi

if [ "$MODE" = "migrate" ] && [ "$DRY_RUN" != true ]; then
    echo ""
    echo -e "${YELLOW}待处理:${NC}"
    echo "  - 运行 /init_harness 完成 AGENTS.md 内容迁移"
    echo "  - 迁移完成后可删除 AGENTS.md.bak"
fi

echo ""
echo "项目结构:"
echo "  ."
[ -f "AGENTS.md" ] && echo "  ├── AGENTS.md"
echo "  └── docs/"
echo "      ├── version/"
[ -f "docs/version/INDEX.md" ] && echo "      │   ├── INDEX.md"
[ -f "docs/version/BOUNDARIES.md" ] && echo "      │   └── BOUNDARIES.md"
echo "      └── retro/"
[ -f "docs/retro/golden-rules.md" ] && echo "          ├── golden-rules.md"
[ -f "docs/retro/patterns.md" ] && echo "          └── patterns.md"

echo ""
echo -e "下一步: 运行 ${CYAN}/spec${NC} 创建第一个迭代"
echo ""
