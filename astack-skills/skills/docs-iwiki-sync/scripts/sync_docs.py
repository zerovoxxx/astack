#!/usr/bin/env python3
"""
自动同步文档到 iWiki 的脚本

完全自动化流程：
1. 调用 scan_docs() 检查哪些文档需要同步（仅元数据，不含文档内容）
2. 读取需要同步的文档内容
3. 调用 iWiki MCP 工具创建/更新文档
4. 更新配置文件记录同步状态

避免 AI 读取文档内容，防止上下文爆炸

Usage:
    python sync_docs.py                    # 同步所有文档
    python sync_docs.py --path <file.md>   # 同步单个文件
    python sync_docs.py --path <dir>       # 同步指定目录
    python sync_docs.py --force            # 强制同步所有文档
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from scan_docs import (
    load_config,
    scan_docs,
)
from history_manager import parse_history_markdown, write_history_markdown
from intelligent_guard import intelligent_history_guard


async def call_mcp_tool(
    session: ClientSession, tool_name: str, arguments: dict[str, Any]
) -> Any:
    """
    调用 MCP 工具
    
    Args:
        session: MCP 客户端会话
        tool_name: 工具名称 (如 "createDocument")
        arguments: 工具参数
        
    Returns:
        工具执行结果
        
    Raises:
        RuntimeError: 调用失败时抛出
    
    已知返回格式:
        - createDocument: "创建成功:{"docid":123,"id":123}"
        - saveDocument: "保存成功" (纯文本)
        - saveDocumentParts: "保存成功" (纯文本)
    """
    try:
        result = await session.call_tool(tool_name, arguments)
        
        # 检查结果
        if hasattr(result, "isError") and result.isError:
            error_content = result.content[0].text if result.content else "Unknown error"
            raise RuntimeError(f"MCP tool error: {error_content}")
        
        # 提取内容
        if hasattr(result, "content") and result.content:
            content = result.content[0]
            if hasattr(content, "text"):
                text = content.text
                if not text or text.strip() == "":
                    raise RuntimeError(f"MCP returned empty response for tool '{tool_name}'")
                
                # iWiki MCP 返回格式处理:
                # 1. "创建成功:{...json...}" - 提取 JSON 部分
                if ":" in text and "{" in text:
                    json_start = text.index("{")
                    json_str = text[json_start:]
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass
                
                # 2. 尝试直接解析为 JSON
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass
                
                # 3. 纯文本响应（如 "保存成功"）
                return {"success": True, "message": text}
        
        return result
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"MCP call failed: {e}") from e


async def create_document(
    session: ClientSession, space_id: int, parent_id: int, title: str, body: str
) -> dict[str, Any]:
    """创建新文档"""
    return await call_mcp_tool(
        session,
        "createDocument",
        {
            "spaceid": space_id,
            "parentid": parent_id,
            "title": title,
            "body": body,
            "contenttype": "MD",
        },
    )


async def update_document(
    session: ClientSession, docid: int, title: str, body: str
) -> dict[str, Any]:
    """更新已存在的文档（标准大小）"""
    return await call_mcp_tool(
        session,
        "saveDocument",
        {
            "docid": docid,
            "title": title,
            "body": body,
        },
    )


async def update_document_parts(
    session: ClientSession, docid: int, content: str, position: str = "prepend"
) -> dict[str, Any]:
    """使用 saveDocumentParts 更新文档（支持大文档）"""
    return await call_mcp_tool(
        session,
        "saveDocumentParts",
        {
            "docid": docid,
            "parts": [{"position": position, "content": content}],
            "contenttype": "MD",
        },
    )


async def get_document_metadata(session: ClientSession, docid: int) -> dict[str, Any]:
    """获取文档元数据（包括版本号）
    
    注意: iWiki MCP 的 metadata 工具要求 docid 参数为字符串类型
    """
    return await call_mcp_tool(session, "metadata", {"docid": str(docid)})


async def sync_file(
    session: ClientSession,
    file_info: dict[str, Any],
    space_id: int,
    workspace_root: Path,
) -> dict[str, Any]:
    """
    同步单个文件到 iWiki
    
    Args:
        session: MCP 客户端会话
        file_info: scan_docs() 返回的文件元数据（不含 body）
        space_id: iWiki 空间 ID
        workspace_root: 工作区根目录（用于读取文档内容）
        
    Returns:
        同步结果: {
            "success": bool,
            "action": "create" | "update" | "skip",
            "docid": int | None,
            "version": int | None,
            "error": str | None
        }
    """
    status = file_info["status"]
    path = file_info["path"]
    title = file_info["title"]
    parent_id = file_info["parent_id"]
    docid = file_info.get("docid")
    size_info = file_info.get("size_info", {})
    needs_chunking = size_info.get("needs_chunking", False)

    result = {
        "success": False,
        "action": "skip",
        "docid": docid,
        "version": None,
        "error": None,
    }

    try:
        if status == "SKIPPED":
            # 内容未变化，跳过
            result["success"] = True
            result["action"] = "skip"
            result["version"] = file_info.get("synced_version")
            return result

        # 读取文档内容（仅在需要同步时读取）
        config = load_config(
            workspace_root / ".codebuddy/skills/docs-iwiki-sync/iwiki_config.json"
        )
        docs_dir = workspace_root / config.get("paths", {}).get("docs_dir", "docs")
        doc_path = docs_dir / path

        with open(doc_path, encoding="utf-8") as f:
            content = f.read()

        # 使用文件名（去除扩展名）作为标题，完整内容作为正文
        title = Path(doc_path.name).stem
        body = content.strip()

        # 实际同步操作
        if status == "NEW":
            # 创建新文档
            if needs_chunking:
                # 大文档：先创建壳，再追加内容
                create_resp = await create_document(
                    session,
                    space_id,
                    parent_id,
                    title,
                    f"# {title}\n\n文档内容正在同步中...",
                )
                # createDocument 返回: {"docid": 123, "id": 123}
                docid = create_resp.get("docid") or create_resp.get("id")
                if not docid:
                    raise RuntimeError(f"创建文档失败：未返回 docid，响应：{create_resp}")

                # 追加实际内容
                await update_document_parts(session, docid, body, position="append")
            else:
                # 标准文档：直接创建
                create_resp = await create_document(
                    session, space_id, parent_id, title, body
                )
                # createDocument 返回: {"docid": 123, "id": 123}
                docid = create_resp.get("docid") or create_resp.get("id")
                if not docid:
                    raise RuntimeError(f"创建文档失败：未返回 docid，响应：{create_resp}")

            result["action"] = "create"
            result["docid"] = docid

        elif status in ("UPDATE", "VERSION_CHECK"):
            # 更新现有文档
            if not docid:
                raise RuntimeError(f"文档 {path} 缺少 docid，无法更新")

            if needs_chunking:
                # 🔧 大文档更新：先清空再插入，避免内容重复
                # 方案：使用 saveDocument 覆盖标题 + 使用 append 重新追加完整内容
                # 注意：iWiki 的 saveDocumentParts 没有 "replace" 模式，只能用此方法
                await update_document(session, docid, title, "")  # 先清空内容
                update_resp = await update_document_parts(session, docid, body, position="append")
            else:
                # 标准文档：使用 saveDocument
                update_resp = await update_document(session, docid, title, body)
            
            # saveDocument 返回: {"success": True, "message": "保存成功"}
            if not update_resp.get("success"):
                raise RuntimeError(f"更新文档失败：{update_resp}")

            result["action"] = "update"

        # 获取最新版本号
        if not docid:
            raise RuntimeError(f"缺少 docid，无法获取文档版本")
        
        metadata = await get_document_metadata(session, docid)
        result["version"] = metadata.get("version")
        result["success"] = True

    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    return result


def update_config(
    config_path: Path,
    file_info: dict[str, Any],
    sync_result: dict[str, Any],
) -> None:
    """
    更新历史记录文件（iwiki_history.md）中的文档映射
    
    新设计：配置文件(iwiki_config.json)保持纯配置，
    历史记录(iwiki_history.md)使用 Markdown 表格维护
    
    Args:
        config_path: iwiki_config.json 配置文件路径
        file_info: 文件信息
        sync_result: 同步结果
    """
    config = load_config(config_path)
    
    # 读取历史记录
    history_file = config.get("paths", {}).get("history_file", "iwiki_history.md")
    history_path = config_path.parent / history_file
    doc_mapping = parse_history_markdown(history_path)

    path = file_info["path"]
    
    # 解析路径：dir_name/file_name
    if "/" not in path:
        raise ValueError(f"Invalid path format (expected 'dir/file.md'): {path}")
    
    dir_name, file_name = path.split("/", 1)
    
    # 确保目录存在
    if dir_name not in doc_mapping:
        doc_mapping[dir_name] = {}
    elif not isinstance(doc_mapping[dir_name], dict):
        # 兼容旧结构：如果是单个文档而不是目录，转换为目录
        doc_mapping[dir_name] = {}

    if sync_result["success"]:
        doc_mapping[dir_name][file_name] = {
            "docid": sync_result["docid"],
            "title": file_info["title"],
            "parent_id": file_info["parent_id"],
            "last_synced": datetime.now().isoformat() + "Z",
            "synced_version": sync_result["version"],
            "content_hash": file_info["content_hash"],
            "status": "success",
        }
        # ✅ 仅在成功时写回历史记录
        write_history_markdown(history_path, doc_mapping, config)
    else:
        # ❌ 同步失败：不更新历史记录，避免污染数据
        print(f"⚠️  同步失败，不更新历史记录: {file_info['path']}", file=sys.stderr)


def print_summary_table(results: list[tuple[dict[str, Any], dict[str, Any]]]) -> None:
    """打印同步结果摘要表"""
    print("\n" + "=" * 100)
    print("同步结果摘要")
    print("=" * 100)
    print(f"{'文档路径':<50} {'状态':<10} {'操作':<10} {'版本':<8} {'备注'}")
    print("-" * 100)

    for file_info, sync_result in results:
        path = file_info["path"]
        status = "✅ 成功" if sync_result["success"] else "❌ 失败"
        action_map = {
            "create": "新增",
            "update": "更新",
            "skip": "跳过",
        }
        action = action_map.get(sync_result["action"], "-")
        version = f"v{sync_result['version']}" if sync_result["version"] else "-"

        remark = ""
        if not sync_result["success"]:
            remark = f"错误: {sync_result['error']}"
        elif sync_result["action"] == "skip":
            remark = "内容未变更"
        elif file_info.get("size_info", {}).get("needs_chunking"):
            remark = "大文档（分块处理）"

        print(f"{path:<50} {status:<10} {action:<10} {version:<8} {remark}")

    print("-" * 100)

    # 统计信息
    total = len(results)
    success_count = sum(1 for _, r in results if r["success"])
    fail_count = total - success_count
    create_count = sum(1 for _, r in results if r["action"] == "create")
    update_count = sum(1 for _, r in results if r["action"] == "update")
    skip_count = sum(1 for _, r in results if r["action"] == "skip")

    print(f"\n总计: {total} 个文档")
    print(f"  - 成功: {success_count}")
    print(f"  - 失败: {fail_count}")
    print(f"  - 新增: {create_count}")
    print(f"  - 更新: {update_count}")
    print(f"  - 跳过: {skip_count}")
    print("=" * 100 + "\n")


async def main_async(args):
    """异步主逻辑"""
    # 获取工作区根目录（脚本在 .codebuddy/skills/docs-iwiki-sync/scripts/ 目录下，往上4层）
    workspace_root = Path(__file__).resolve().parents[4]
    config_path = (
        workspace_root / ".codebuddy/skills/docs-iwiki-sync/iwiki_config.json"
    )

    # 步骤1：扫描文档（仅获取元数据，不含文档内容）
    print("📁 扫描文档...")
    scan_result = scan_docs(workspace_root, args.path)

    space_id = scan_result["space"]["space_id"]
    files = scan_result["files"]
    summary = scan_result["summary"]
    
    # 🛡️ 智能防御：检测异常并自动修复历史记录
    config = load_config(config_path)
    history_file = workspace_root / ".codebuddy/skills/docs-iwiki-sync" / config.get("paths", {}).get("history_file", "iwiki_history.md")
    doc_mapping = parse_history_markdown(history_file)
    
    # 触发智能防御
    doc_mapping = intelligent_history_guard(
        config, doc_mapping, workspace_root, len(files)
    )
    
    # 如果智能防御重建了历史记录，需要重新扫描
    if len(doc_mapping) > 0 and summary["new"] > 10:
        print("🔄 检测到历史记录已修复，重新扫描...")
        scan_result = scan_docs(workspace_root, args.path)
        files = scan_result["files"]
        summary = scan_result["summary"]
    
    # 如果启用 --force，将所有 SKIPPED 改为 UPDATE
    if args.force:
        for file_info in files:
            if file_info["status"] == "SKIPPED":
                file_info["status"] = "UPDATE"
        # 更新摘要统计
        summary["update"] += summary["skipped"]
        summary["skipped"] = 0

    print("✅ 扫描完成:")
    print(f"  - 总计: {summary['total']} 个文档")
    print(f"  - 新增: {summary['new']}")
    print(f"  - 更新: {summary['update']}")
    print(f"  - 跳过: {summary['skipped']}")
    print(f"  - 大文档: {summary['large_files']}")
    
    if args.force:
        print("  ⚠️  强制更新模式：将同步所有文档（包括未变化的文档）")

    if not files:
        print("\n✨ 没有需要同步的文档")
        return

    # 步骤2：创建 MCP 客户端连接
    print("\n🔗 连接 iWiki MCP 服务器...")
    
    # 从 iwiki_config.json 读取 MCP 配置
    config = load_config(config_path)
    mcp_config = config.get("mcp_server")
    if not mcp_config:
        raise RuntimeError("mcp_server not configured in iwiki_config.json")
    
    url = mcp_config.get("url")
    headers = mcp_config.get("headers", {})
    
    if not url:
        raise RuntimeError("iWiki MCP server URL not configured in iwiki_config.json")
    
    print(f"  - URL: {url}")
    print(f"  - Headers: {list(headers.keys())}")

    # 步骤3：同步每个文件（仅在需要时读取文档内容）
    try:
        print("  - 正在建立 HTTP 连接...")
        async with streamablehttp_client(url, headers=headers) as (read, write, _):
            print("  - HTTP 连接已建立，正在初始化会话...")
            async with ClientSession(read, write) as session:
                await session.initialize()
                print("✅ MCP 连接成功")
                
                print(f"\n🚀 开始同步 {len(files)} 个文档...")
                results = []

                for i, file_info in enumerate(files, 1):
                    path = file_info["path"]
                    status = file_info["status"]

                    # 跳过不需要同步的文件
                    if status == "SKIPPED":
                        sync_result = {
                            "success": True,
                            "action": "skip",
                            "docid": file_info.get("docid"),
                            "version": file_info.get("synced_version"),
                            "error": None,
                        }
                        results.append((file_info, sync_result))
                        print(f"[{i}/{len(files)}] ⏭️  跳过: {path} (内容未变更)")
                        continue

                    action_text = "新增" if status == "NEW" else "更新"
                    print(f"[{i}/{len(files)}] 🔄 {action_text}: {path}...", end=" ")

                    try:
                        sync_result = await sync_file(
                            session, file_info, space_id, workspace_root
                        )
                        results.append((file_info, sync_result))

                        if sync_result["success"]:
                            print("✅")
                            # 更新配置文件
                            update_config(config_path, file_info, sync_result)
                        else:
                            print(f"❌ {sync_result['error']}")
                    except Exception as e:
                        sync_result = {
                            "success": False,
                            "action": (
                                "update"
                                if status in ("UPDATE", "VERSION_CHECK")
                                else "create"
                            ),
                            "docid": file_info.get("docid"),
                            "version": None,
                            "error": str(e),
                        }
                        results.append((file_info, sync_result))
                        print(f"❌ {e}")

                # 打印摘要表
                print_summary_table(results)
                print("✅ 同步完成！历史记录文件已更新。")
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        raise


def main():
    """主入口"""
    parser = argparse.ArgumentParser(
        description="自动同步文档到 iWiki（避免 AI 上下文爆炸）"
    )
    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="目标路径（相对于 docs/）：file.md、subdir 或省略表示全部",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="强制更新：即使内容未变化也重新同步（用于修复标题等元数据）",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断操作")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 执行失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
