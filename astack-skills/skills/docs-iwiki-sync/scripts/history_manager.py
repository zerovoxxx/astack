#!/usr/bin/env python3
"""
iWiki 文档历史记录管理模块

提供 Markdown 表格格式的历史记录读写功能
"""

import re
from pathlib import Path
from typing import Any


def parse_history_markdown(history_path: Path) -> dict[str, Any]:
    """
    解析 iwiki_history.md 文件，返回 document_mapping 格式的字典
    
    Args:
        history_path: iwiki_history.md 文件路径
        
    Returns:
        document_mapping 格式的字典: {
            "dir_name": {
                "file_name": {
                    "docid": int,
                    "title": str,
                    "parent_id": int,
                    "last_synced": str,
                    "synced_version": int,
                    "content_hash": str,
                    "status": str
                }
            }
        }
    """
    if not history_path.exists():
        return {}
    
    doc_mapping: dict[str, Any] = {}
    
    with open(history_path, encoding="utf-8") as f:
        content = f.read()
    
    # 按章节分割（## 目录名）
    sections = re.split(r"^## (.+)$", content, flags=re.MULTILINE)
    
    # sections 格式: ['', 'dir1', 'table1', 'dir2', 'table2', ...]
    for i in range(1, len(sections), 2):
        if i + 1 >= len(sections):
            break
            
        dir_name = sections[i].strip()
        table_content = sections[i + 1]
        
        # 解析表格行（跳过表头和分隔线）
        lines = table_content.strip().split("\n")
        data_lines = [line for line in lines if line.startswith("|") and not line.startswith("|---")]
        
        # 跳过表头
        if len(data_lines) <= 1:
            continue
            
        dir_mapping: dict[str, Any] = {}
        
        for line in data_lines[1:]:  # 跳过第一行表头
            # 解析表格行: | path | title | docid | parent_id | time | version | hash | status |
            cells = [cell.strip() for cell in line.split("|")[1:-1]]  # 去掉首尾空单元格
            
            if len(cells) < 8:
                continue
            
            path, title, docid_str, parent_id_str, last_synced, version_str, content_hash, status = cells
            
            # 提取文件名（去除目录前缀）
            if "/" in path:
                _, file_name = path.split("/", 1)
            else:
                file_name = path
            
            # 转换类型
            try:
                docid = int(docid_str)
                parent_id = int(parent_id_str)
                synced_version = int(version_str) if version_str.isdigit() else None
            except ValueError:
                continue
            
            dir_mapping[file_name] = {
                "docid": docid,
                "title": title,
                "parent_id": parent_id,
                "last_synced": last_synced,
                "synced_version": synced_version,
                "content_hash": content_hash,
                "status": status,
            }
        
        if dir_mapping:
            doc_mapping[dir_name] = dir_mapping
    
    return doc_mapping


def write_history_markdown(
    history_path: Path,
    doc_mapping: dict[str, Any],
    config: dict[str, Any]
) -> None:
    """
    将 document_mapping 写入 iwiki_history.md（Markdown 表格格式）
    
    Args:
        history_path: iwiki_history.md 文件路径
        doc_mapping: document_mapping 格式的字典
        config: iwiki_config.json 配置（用于获取目录描述）
    """
    dir_descriptions = {
        dir_name: dir_config.get("description", "")
        for dir_name, dir_config in config.get("directory_mapping", {}).items()
    }
    
    lines = [
        "# iWiki 文档同步历史记录",
        "",
        "本文件记录所有已同步到 iWiki 的文档历史信息，用于增量同步检测。",
        "",
    ]
    
    # 按目录名排序
    for dir_name in sorted(doc_mapping.keys()):
        files = doc_mapping[dir_name]
        if not files:
            continue
        
        # 目录标题
        description = dir_descriptions.get(dir_name, "")
        if description:
            lines.append(f"## {dir_name}")
        else:
            lines.append(f"## {dir_name}")
        lines.append("")
        
        # 表格头
        lines.append("| 文档路径 | 标题 | iWiki DocID | 父节点ID | 最后同步时间 | 同步版本 | 内容哈希 | 状态 |")
        lines.append("|---------|------|------------|---------|-------------|---------|---------|------|")
        
        # 表格数据（按文件名排序）
        for file_name in sorted(files.keys()):
            info = files[file_name]
            path = f"{dir_name}/{file_name}"
            
            lines.append(
                f"| {path} | {info['title']} | {info['docid']} | {info['parent_id']} | "
                f"{info['last_synced']} | {info.get('synced_version', '')} | "
                f"{info['content_hash']} | {info['status']} |"
            )
        
        lines.append("")
    
    # 文件末尾说明
    lines.extend([
        "---",
        "",
        "**说明:**",
        "- 本文件由 `sync_docs.py` 脚本自动维护,请勿手动编辑",
        "- 使用 Markdown 表格格式便于人工查看和版本控制",
        "- 通过内容哈希(MD5)实现增量同步检测",
    ])
    
    with open(history_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
