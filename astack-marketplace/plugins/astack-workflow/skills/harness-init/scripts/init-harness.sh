#!/bin/bash
# init-harness.sh — Harness 研发流程初始化
#
# 在项目根目录运行，自动检测项目状态并初始化轻量 Spec 工作流：
#   - fresh：   全新项目，从 templates/ 渲染 AGENTS.md + INDEX.md
#   - migrate： 已有 AGENTS.md 但无 INDEX.md，备份 AGENTS.md 并创建 INDEX.md，等待 AI 接手语义迁移
#   - patch：   已初始化，补齐缺失的 AGENTS.md / INDEX.md 入口
#
# 模板来源：与本脚本同目录的 ../templates/*.tpl
# 占位符：{{PROJECT_NAME}}、{{PROJECT_DESC}}（仅 AGENTS.md.tpl 使用）
#
# 副作用：创建 AGENTS.md 后，同时建立 CLAUDE.md → AGENTS.md 软链，
#         让 Claude / Cursor / Codebuddy 等工具共享同一份治理入口。
#         三种模式（fresh / migrate / patch）下均会幂等确保该软链存在。
#
# 用法:
#   bash <skill-dir>/scripts/init-harness.sh [选项]
#
# 选项:
#   --name <项目名>     项目名称（不提供则交互式询问，仅 fresh 模式需要）
#   --desc <描述>       一句话项目描述（仅 fresh 模式需要）
#   --dry-run           只输出计划，不实际修改
#   --force             覆盖已存在的入口文件（含 CLAUDE.md 非预期软链）
#   --help              显示帮助

set -euo pipefail

# ── 定位脚本与模板目录 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$SKILL_DIR/templates"

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

while [[ $# -gt 0 ]]; do
    case $1 in
        --name) PROJECT_NAME="$2"; shift 2 ;;
        --desc) PROJECT_DESC="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --force) FORCE=true; shift ;;
        --help)
            head -26 "$0" | tail -24
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

# 从模板渲染到目标路径
# 参数: <template_name> <target_path>
render_template() {
    local tpl_name="$1"
    local target="$2"
    local tpl_path="$TEMPLATES_DIR/$tpl_name"

    if [ ! -f "$tpl_path" ]; then
        warn "模板缺失: $tpl_path"
        return 1
    fi

    if [ -f "$target" ] && [ "$FORCE" != true ]; then
        warn "$target 已存在，跳过（使用 --force 覆盖）"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将从 $tpl_name 渲染 → $target"
        return 0
    fi

    mkdir -p "$(dirname "$target")"

    # 占位符替换：用 awk 以避免 sed 对特殊字符的转义问题
    awk -v name="${PROJECT_NAME:-}" -v desc="${PROJECT_DESC:-}" '
        { gsub(/\{\{PROJECT_NAME\}\}/, name); gsub(/\{\{PROJECT_DESC\}\}/, desc); print }
    ' "$tpl_path" > "$target"

    CREATED_FILES+=("$target")
    success "创建 $target"
}

# 幂等确保 CLAUDE.md → AGENTS.md 软链存在
# 设计要点：
#   - 仅在当前目录已存在 AGENTS.md（或软链）时创建，避免空链
#   - 已是正确软链时静默跳过（idempotent）
#   - 已是其它软链或普通文件时默认跳过；--force 才覆盖
#   - 尊重 --dry-run
ensure_claude_md_symlink() {
    if [ ! -f "AGENTS.md" ] && [ ! -L "AGENTS.md" ]; then
        warn "AGENTS.md 不存在，跳过 CLAUDE.md 软链创建"
        return
    fi

    if [ -L "CLAUDE.md" ]; then
        local current_target
        current_target="$(readlink CLAUDE.md)"
        if [ "$current_target" = "AGENTS.md" ]; then
            info "CLAUDE.md → AGENTS.md 软链已存在，跳过"
            return
        fi
        warn "CLAUDE.md 已是软链但指向 '$current_target'（非 AGENTS.md）"
        if [ "$FORCE" != true ]; then
            warn "  跳过（使用 --force 覆盖）"
            return
        fi
        if [ "$DRY_RUN" = true ]; then
            info "[dry-run] 将删除并重建 CLAUDE.md → AGENTS.md"
            return
        fi
        rm -f "CLAUDE.md"
    elif [ -e "CLAUDE.md" ]; then
        warn "CLAUDE.md 已存在为普通文件（非软链）"
        if [ "$FORCE" != true ]; then
            warn "  跳过（使用 --force 覆盖；请自行备份）"
            return
        fi
        if [ "$DRY_RUN" = true ]; then
            info "[dry-run] 将删除并替换为 CLAUDE.md → AGENTS.md 软链"
            return
        fi
        rm -f "CLAUDE.md"
    fi

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将创建软链 CLAUDE.md → AGENTS.md"
        return
    fi

    ln -s AGENTS.md CLAUDE.md
    CREATED_FILES+=("CLAUDE.md (软链 → AGENTS.md)")
    success "创建软链 CLAUDE.md → AGENTS.md"
}

# 验证轻量 Spec scaffold 是否可用。
validate_lightweight_scaffold() {
    action "验证轻量 Spec scaffold"

    local required_files=("AGENTS.md" "docs/version/INDEX.md")
    local missing=()

    for file in "${required_files[@]}"; do
        if [ "$DRY_RUN" = true ]; then
            info "[dry-run] 将验证 $file 存在"
        elif [ ! -f "$file" ]; then
            missing+=("$file")
        fi
    done

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将验证 CLAUDE.md → AGENTS.md 软链（若适用）"
        return
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}错误${NC}: 轻量 Spec scaffold 缺失: ${missing[*]}"
        exit 1
    fi

    if [ -L "CLAUDE.md" ] && [ "$(readlink CLAUDE.md)" != "AGENTS.md" ]; then
        echo -e "${RED}错误${NC}: CLAUDE.md 软链未指向 AGENTS.md"
        exit 1
    fi

    success "轻量 Spec scaffold 验证通过: ${required_files[*]}"

    local legacy_files=(
        "docs/version/BOUNDARIES.md"
        "docs/retro/golden-rules.md"
        "docs/retro/patterns.md"
    )
    for file in "${legacy_files[@]}"; do
        if [ -f "$file" ]; then
            warn "检测到旧重流程文档 $file；保留历史可以，但不再是 Harness 初始化必需项"
        fi
    done
}

# ── 状态检测 ──

echo ""
echo -e "${BOLD}🏗️  Harness 初始化${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

HAS_AGENTS_MD=false
HAS_INDEX_MD=false

[ -f "AGENTS.md" ] && HAS_AGENTS_MD=true
[ -f "docs/version/INDEX.md" ] && HAS_INDEX_MD=true

info "项目目录: $(pwd)"
info "Skill 目录: $SKILL_DIR"
info "AGENTS.md: $( [ "$HAS_AGENTS_MD" = true ] && echo '已存在' || echo '不存在' )"
info "docs/version/INDEX.md: $( [ "$HAS_INDEX_MD" = true ] && echo '已存在' || echo '不存在' )"
echo ""

# 检查模板目录
if [ ! -d "$TEMPLATES_DIR" ]; then
    echo -e "${RED}错误${NC}: 模板目录不存在: $TEMPLATES_DIR"
    echo "请确认脚本位于 skills/harness-init/scripts/ 下，并且 templates/ 与其同级。"
    exit 1
fi

# ── 判断模式 ──

if [ "$HAS_AGENTS_MD" = true ] && [ "$HAS_INDEX_MD" = true ]; then
    info "检测到已完成 harness 初始化，将检查并补全缺失文件"
    MODE="patch"
elif [ "$HAS_AGENTS_MD" = true ]; then
    info "检测到已有 AGENTS.md，将执行迁移瘦身（备份原文件 + 创建空骨架）"
    MODE="migrate"
else
    info "全新项目，将从零初始化"
    MODE="fresh"
fi

echo ""

# ── 收集项目信息（仅 fresh 模式需要） ──

if [ "$MODE" = "fresh" ]; then
    if [ -z "$PROJECT_NAME" ]; then
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
    info "[dry-run] mkdir -p docs/version"
else
    mkdir -p docs/version
    success "docs/version/"
fi

echo ""

# ── 2. 创建/迁移 AGENTS.md ──

if [ "$MODE" = "fresh" ]; then
    action "创建 AGENTS.md"
    render_template "AGENTS.md.tpl" "AGENTS.md" || true

elif [ "$MODE" = "migrate" ]; then
    action "迁移 AGENTS.md"

    if [ "$DRY_RUN" = true ]; then
        info "[dry-run] 将备份 AGENTS.md → AGENTS.md.bak"
        info "[dry-run] AGENTS.md 迁移需要 AI 辅助执行，请在 Skill 会话中继续"
    else
        cp AGENTS.md AGENTS.md.bak
        success "备份 AGENTS.md → AGENTS.md.bak"
        warn "AGENTS.md 的内容迁移（章节识别、拆分、重写）需要 AI 辅助"
        warn "请返回 Skill 会话，按 SKILL.md 的「第 2 步：AI 接手语义迁移」继续"
        echo ""
    fi
fi

echo ""

# ── 2.5. 创建 CLAUDE.md → AGENTS.md 软链 ──
# 三种模式都执行：fresh 刚渲染完 AGENTS.md，migrate / patch 也补齐老项目缺失的软链。
# 让 Claude / Cursor / Codebuddy 等工具共享同一份治理入口。

action "确保 CLAUDE.md → AGENTS.md 软链"
ensure_claude_md_symlink

echo ""

# ── 3. 从模板渲染轻量治理文档（仅缺失时） ──

[ "$HAS_INDEX_MD" = false ]       && action "创建 docs/version/INDEX.md"       && render_template "INDEX.md.tpl"       "docs/version/INDEX.md"       || true

echo ""

# ── 4. 验证轻量 scaffold ──

validate_lightweight_scaffold

echo ""

# ── 5. 检查插件内核心 Skill 配置 ──

action "检查插件内核心 Skill 配置"

REQUIRED_WORKFLOW_SKILLS=("spec" "dev" "mr")
MISSING_WORKFLOW_SKILLS=()

PLUGIN_SKILLS_DIR="$(cd "$SKILL_DIR/.." && pwd)"

for workflow_skill in "${REQUIRED_WORKFLOW_SKILLS[@]}"; do
    if [ ! -f "$PLUGIN_SKILLS_DIR/$workflow_skill/SKILL.md" ]; then
        MISSING_WORKFLOW_SKILLS+=("$workflow_skill")
    fi
done

if [ ${#MISSING_WORKFLOW_SKILLS[@]} -eq 0 ]; then
    success "插件内核心 skill 已就绪: ${REQUIRED_WORKFLOW_SKILLS[*]}"
else
    warn "插件包缺少以下核心 skill: ${MISSING_WORKFLOW_SKILLS[*]}"
    warn "请检查 astack-marketplace/plugins/astack-workflow/skills/"
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

if [ ${#MISSING_WORKFLOW_SKILLS[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}待处理:${NC}"
    echo "  - 修复 astack-workflow 插件包中的缺失 skill"
fi

if [ "$MODE" = "migrate" ] && [ "$DRY_RUN" != true ]; then
    echo ""
    echo -e "${YELLOW}待处理:${NC}"
    echo "  - 返回 Skill 会话完成 AGENTS.md 的语义迁移（脚本只做了机械备份）"
    echo "  - 迁移完成后可删除 AGENTS.md.bak"
fi

echo ""
echo "项目结构:"
echo "  ."
[ -L "CLAUDE.md" ] && echo "  ├── CLAUDE.md → AGENTS.md"
[ -f "AGENTS.md" ] && echo "  ├── AGENTS.md"
echo "  └── docs/"
echo "      ├── version/"
[ -f "docs/version/INDEX.md" ] && echo "      │   ├── INDEX.md"

echo ""
if [ "$MODE" = "fresh" ]; then
    echo -e "下一步: 使用 ${CYAN}/astack-workflow:spec${NC} 创建第一个迭代"
fi
echo ""
