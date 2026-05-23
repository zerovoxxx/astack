#!/usr/bin/env python3
"""
智能防御模块：通过 iWiki MCP 查询远端文档，自动修复历史记录

防止历史记录丢失导致的重复创建 BUG
"""

import asyncio
import sys
from pathlib import Path
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def query_remote_documents(
    session: ClientSession, parent_id: int
) -> dict[str, int]:
    """
    查询 iWiki 远端目录下的所有文档
    
    Args:
        session: MCP 客户端会话
        parent_id: 父目录 ID
        
    Returns:
        文档标题 -> docid 的映射字典
        例如: {"01.产品方案总体设计": 4017835602, ...}
    """
    try:
        result = await session.call_tool(
            "getSpacePageTree",
            {"parentid": str(parent_id)}
        )
        
        # 解析返回结果
        if hasattr(result, "content") and result.content:
            import json
            content_text = result.content[0].text
            
            # 尝试解析 JSON
            try:
                data = json.loads(content_text)
            except json.JSONDecodeError:
                # 如果不是标准 JSON，尝试提取 JSON 部分
                if "[" in content_text or "{" in content_text:
                    json_start = content_text.index("[" if "[" in content_text else "{")
                    content_text = content_text[json_start:]
                    data = json.loads(content_text)
                else:
                    return {}
            
            # 构建标题 -> docid 映射
            doc_map = {}
            if isinstance(data, list):
                for item in data:
                    title = item.get("title", "")
                    docid = item.get("docid")  # 修正：使用 "docid" 而非 "id"
                    if title and docid:
                        doc_map[title] = docid
            
            return doc_map
            
    except Exception as e:
        print(f"⚠️  警告：无法查询远端目录 {parent_id}: {e}", file=sys.stderr)
        return {}


async def reconstruct_history_from_remote(
    config: dict[str, Any], workspace_root: Path
) -> dict[str, Any]:
    """
    🛡️ 智能防御：从 iWiki 远端重建历史记录
    
    通过查询远端目录，对比本地文件名，自动识别已同步的文档
    
    Args:
        config: iwiki_config.json 配置
        workspace_root: 工作区根目录
        
    Returns:
        document_mapping 格式的字典
    """
    mcp_config = config.get("mcp_server", {})
    url = mcp_config.get("url")
    headers = mcp_config.get("headers", {})
    
    if not url:
        print("⚠️  MCP 服务器 URL 未配置，无法查询远端", file=sys.stderr)
        return {}
    
    reconstructed_mapping: dict[str, Any] = {}
    
    try:
        # 连接 MCP 服务器
        async with streamablehttp_client(url, headers=headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # 遍历所有启用的目录
                dir_mapping = config.get("directory_mapping", {})
                for dir_name, dir_config in dir_mapping.items():
                    if not dir_config.get("enabled", True):
                        continue
                    
                    parent_id = dir_config.get("parent_id")
                    if not parent_id:
                        continue
                    
                    print(f"🔍 查询远端目录: {dir_name} (parent_id={parent_id})", file=sys.stderr)
                    
                    # 查询远端文档
                    remote_docs = await query_remote_documents(session, parent_id)
                    
                    if not remote_docs:
                        continue
                    
                    print(f"   找到 {len(remote_docs)} 个远端文档", file=sys.stderr)
                    
                    # 对比本地文件
                    docs_dir = workspace_root / config.get("paths", {}).get("docs_dir", "docs")
                    local_dir = docs_dir / dir_name
                    
                    if not local_dir.exists():
                        continue
                    
                    dir_mapping_result: dict[str, Any] = {}
                    matched_count = 0
                    
                    for md_file in local_dir.rglob("*.md"):
                        # 使用文件名（去除扩展名）作为标题
                        title = md_file.stem
                        
                        # 在远端文档中查找匹配的标题
                        if title in remote_docs:
                            docid = remote_docs[title]
                            matched_count += 1
                            
                            # 读取文件内容计算哈希
                            try:
                                with open(md_file, encoding="utf-8") as f:
                                    content = f.read()
                                
                                from scan_docs import compute_content_hash
                                content_hash = compute_content_hash(content)
                                
                                # 添加到重建的映射
                                file_name = md_file.name
                                dir_mapping_result[file_name] = {
                                    "docid": docid,
                                    "title": title,
                                    "parent_id": parent_id,
                                    "last_synced": None,  # 未知同步时间
                                    "synced_version": None,  # 需要后续查询版本
                                    "content_hash": content_hash,
                                    "status": "recovered"  # 标记为恢复的记录
                                }
                            except Exception as e:
                                print(f"   ⚠️  无法读取 {md_file}: {e}", file=sys.stderr)
                    
                    if dir_mapping_result:
                        reconstructed_mapping[dir_name] = dir_mapping_result
                        print(f"   ✅ 匹配 {matched_count} 个文档", file=sys.stderr)
        
        return reconstructed_mapping
        
    except Exception as e:
        print(f"⚠️  远端查询失败: {e}", file=sys.stderr)
        return {}


def intelligent_history_guard(
    config: dict[str, Any], 
    doc_mapping: dict[str, Any],
    workspace_root: Path,
    total_files: int
) -> dict[str, Any]:
    """
    🛡️ 智能历史记录防护
    
    检测历史记录是否丢失，如果丢失则尝试从远端重建
    
    Args:
        config: iwiki_config.json 配置
        doc_mapping: 当前的 document_mapping
        workspace_root: 工作区根目录
        total_files: 本地文档总数
        
    Returns:
        修复后的 document_mapping
    """
    # 检测条件：历史记录为空 且 本地有较多文档（> 5 个）
    if len(doc_mapping) == 0 and total_files > 5:
        print("\n" + "="*80, file=sys.stderr)
        print("🚨 智能防御触发：检测到历史记录丢失！", file=sys.stderr)
        print(f"   本地发现 {total_files} 个文档，但历史记录为空", file=sys.stderr)
        print("   正在尝试从 iWiki 远端重建历史记录...", file=sys.stderr)
        print("="*80 + "\n", file=sys.stderr)
        
        try:
            # 从远端重建历史记录
            reconstructed = asyncio.run(
                reconstruct_history_from_remote(config, workspace_root)
            )
            
            if reconstructed:
                print(f"\n✅ 成功重建 {sum(len(v) for v in reconstructed.values())} 条历史记录", file=sys.stderr)
                print("   正在保存到历史文件...", file=sys.stderr)
                
                # 保存到历史文件
                history_file = (
                    workspace_root / ".codebuddy/skills/docs-iwiki-sync" / 
                    config.get("paths", {}).get("history_file", "iwiki_history.md")
                )
                
                from history_manager import write_history_markdown
                write_history_markdown(history_file, reconstructed, config)
                
                print(f"   ✅ 历史记录已保存: {history_file}\n", file=sys.stderr)
                
                return reconstructed
            else:
                print("\n⚠️  未能从远端重建历史记录", file=sys.stderr)
                print("   可能原因：", file=sys.stderr)
                print("   1. MCP 服务器连接失败", file=sys.stderr)
                print("   2. 远端目录为空（首次同步）", file=sys.stderr)
                print("   3. 文件名不匹配\n", file=sys.stderr)
                
        except Exception as e:
            print(f"\n❌ 历史记录重建失败: {e}\n", file=sys.stderr)
    
    return doc_mapping
