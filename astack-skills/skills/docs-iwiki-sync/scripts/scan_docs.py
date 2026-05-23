#!/usr/bin/env python3
"""
Scan documentation files and output JSON for iWiki sync.

This script scans the docs directory, extracts metadata and content hash,
but DOES NOT return document body content to avoid context explosion.

Use case: Check which documents need syncing before actual sync.

Usage:
    python scan_docs.py                    # 扫描所有文档
    python scan_docs.py --path <file.md>   # 扫描单个文件
    python scan_docs.py --path <dir>       # 扫描指定目录
    
For actual syncing, use sync_docs.py instead.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# 导入历史记录管理模块
from history_manager import parse_history_markdown
from intelligent_guard import intelligent_history_guard


def compute_content_hash(content: str) -> str:
    """计算内容的 MD5 哈希值，用于检测本地文件变化。"""
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def check_content_size(content: str, max_size: int = 500000) -> dict[str, Any]:
    """
    检查内容大小是否需要分块处理。

    Args:
        content: 文档内容
        max_size: 最大字节数限制 (默认 500KB)

    Returns:
        {
            "needs_chunking": bool,
            "size": int,
            "estimated_chunks": int
        }
    """
    content_bytes = content.encode("utf-8")
    size = len(content_bytes)

    if size <= max_size:
        return {"needs_chunking": False, "size": size, "estimated_chunks": 1}

    # 估算需要的分块数 (保守估计，每块 400KB 以留缓冲)
    chunk_size = 400000
    estimated_chunks = (size + chunk_size - 1) // chunk_size

    return {"needs_chunking": True, "size": size, "estimated_chunks": estimated_chunks}


def load_config(config_path: Path) -> dict[str, Any]:
    """Load configuration from iwiki_config.json."""
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path, encoding="utf-8") as f:
        return json.load(f)


def get_doc_info(doc_mapping: dict[str, Any], rel_path: str) -> dict[str, Any] | None:
    """
    从 document_mapping 中获取文档信息
    
    结构：document_mapping[dir_name][file_name]
    
    Args:
        doc_mapping: document_mapping 配置
        rel_path: 文档相对路径，如 "06_experience-doc/05.xxx.md"
        
    Returns:
        文档信息字典，如果不存在返回 None
    """
    if "/" not in rel_path:
        # 单个文件必须关联到目录，不支持根目录下的单独文件
        return None
    
    dir_name, file_name = rel_path.split("/", 1)
    if dir_name in doc_mapping and isinstance(doc_mapping[dir_name], dict):
        return doc_mapping[dir_name].get(file_name)
    
    return None


def scan_docs(workspace_root: Path, target_path: str | None = None) -> dict[str, Any]:
    """
    Scan docs directory and return JSON structure for sync check.
    
    ⚠️ IMPORTANT: This function does NOT return document body content.
    Only metadata (title, path, hash, status) is returned to avoid context explosion.

    Args:
        workspace_root: 工作区根目录
        target_path: 可选的目标路径 (相对于 docs/ 目录)
                    - None: 扫描所有文档
                    - "file.md": 扫描单个文件
                    - "subdir": 扫描指定子目录

    Returns:
        JSON-serializable dict with space info, files list (no body), and summary
    """
    config_path = workspace_root / ".codebuddy/skills/docs-iwiki-sync/iwiki_config.json"
    config = load_config(config_path)

    docs_dir = workspace_root / config.get("paths", {}).get("docs_dir", "docs")
    dir_mapping = config.get("directory_mapping", {})
    
    # 🔧 FIX: 从 iwiki_history.md 读取历史记录，而不是从 JSON 配置读取
    history_file = workspace_root / ".codebuddy/skills/docs-iwiki-sync" / config.get("paths", {}).get("history_file", "iwiki_history.md")
    doc_mapping = parse_history_markdown(history_file)

    result: dict[str, Any] = {
        "space": {
            "space_id": config["iwiki_space"]["space_id"],
            "space_key": config["iwiki_space"]["space_key"],
        },
        "files": [],
        "summary": {
            "total": 0,
            "new": 0,
            "update": 0,
            "skipped": 0,
            "version_check_needed": 0,
            "large_files": 0,  # 需要分块处理的文件数
        },
    }

    # 确定扫描范围
    if target_path:
        target_full_path = docs_dir / target_path
        if target_full_path.is_file() and target_full_path.suffix == ".md":
            # 单个文件
            md_files = [target_full_path]
        elif target_full_path.is_dir():
            # 指定目录
            md_files = list(target_full_path.rglob("*.md"))
        else:
            raise ValueError(f"Invalid target path: {target_path}")
    else:
        # 全量扫描
        md_files = []
        for subdir_name, dir_config in dir_mapping.items():
            if not dir_config.get("enabled", True):
                continue
            subdir_path = docs_dir / subdir_name
            if subdir_path.exists() and subdir_path.is_dir():
                md_files.extend(subdir_path.rglob("*.md"))
    
    # 🛡️ 智能防御：检测历史记录丢失，自动从远端重建
    doc_mapping = intelligent_history_guard(
        config, doc_mapping, workspace_root, len(md_files)
    )

    # 处理文件
    for md_file in sorted(md_files):
        rel_path = str(md_file.relative_to(docs_dir)).replace("\\", "/")

        # 获取对应的 parent_id
        subdir_name = rel_path.split("/")[0]
        dir_config = dir_mapping.get(subdir_name)
        if not dir_config or not dir_config.get("enabled", True):
            continue

        parent_id = dir_config.get("parent_id")
        if not parent_id:
            continue

        try:
            # Force read from disk without any caching
            with open(md_file, encoding="utf-8", buffering=1) as f:
                content = f.read()

            if not content:
                print(f"Warning: Empty content from {md_file}", file=sys.stderr)
                result["summary"]["skipped"] += 1
                continue

        except Exception as e:
            print(f"Warning: Cannot read {md_file}: {e}", file=sys.stderr)
            continue

        # Skip empty files
        if not content.strip():
            result["summary"]["skipped"] += 1
            continue

        # 使用文件名（去除扩展名）作为标题
        title = Path(md_file.name).stem

        # Compute content hash for change detection
        current_hash = compute_content_hash(content)

        # Check content size
        size_info = check_content_size(content)

        # Determine status
        existing = get_doc_info(doc_mapping, rel_path)
        if existing and existing.get("docid"):
            docid = existing["docid"]
            synced_version = existing.get("synced_version")
            synced_hash = existing.get("content_hash")

            # Check if local content has changed since last sync
            content_changed = (synced_hash is None) or (synced_hash != current_hash)

            if content_changed:
                # Local content changed - need to sync
                status = "UPDATE"
                result["summary"]["update"] += 1
            elif synced_version is not None:
                # Content unchanged + has version - skip (already synced)
                status = "SKIPPED"
                result["summary"]["skipped"] += 1
            else:
                # Content unchanged but no version - need version check
                status = "VERSION_CHECK"
                result["summary"]["version_check_needed"] += 1
        else:
            status = "NEW"
            docid = None
            synced_version = None
            synced_hash = None
            result["summary"]["new"] += 1

        file_info = {
            "path": rel_path,
            "title": title,
            "parent_id": parent_id,
            "status": status,
            "docid": docid,
            "content_hash": current_hash,
            "size_info": size_info,
        }
        
        # ⚠️ IMPORTANT: Do NOT include body field to avoid context explosion
        # Document content is only read by sync_docs.py during actual sync

        # Track large files
        if size_info["needs_chunking"]:
            result["summary"]["large_files"] += 1

        # Include synced version for reference
        if synced_version is not None:
            file_info["synced_version"] = synced_version

        result["files"].append(file_info)
        result["summary"]["total"] += 1

    return result


def main():
    """Main entry point."""
    # Disable Python bytecode caching to ensure fresh reads
    sys.dont_write_bytecode = True

    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="Scan documentation files for sync check (metadata only, no body content)"
    )
    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="Target path (relative to docs/): file.md, subdir, or omit for all",
    )
    args = parser.parse_args()

    # Get workspace root (4 levels up from this script)
    workspace_root = Path(__file__).resolve().parents[4]

    # Clear any potential file system cache hints (best effort)
    if hasattr(os, "sync"):
        try:
            os.sync()  # Sync filesystem writes (Linux/Unix)
        except (AttributeError, OSError):
            pass

    try:
        result = scan_docs(workspace_root, args.path)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        error_result = {"error": str(e)}
        print(json.dumps(error_result, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
