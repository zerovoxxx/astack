#!/usr/bin/env python3
"""
iWiki 简化客户端 — 通过 MCP API 读取和搜索 iWiki 文档

使用方法:
  export TAI_PAT_TOKEN="your_token"
  python iwiki.py get <docid>          # 获取文档内容
  python iwiki.py search <query>       # 搜索文档
  python iwiki.py tree <docid>         # 获取目录树
  python iwiki.py meta <docid>         # 获取文档元数据
"""

import os
import sys
import json
import io
import requests

# 确保 stdout/stderr 使用 UTF-8 编码
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

MCP_URL = "https://prod.mcp.it.woa.com/app_iwiki_mcp/mcp3"

USAGE = """\
用法: python iwiki.py <command> <arg>

命令:
  get <docid>      获取文档内容
  search <query>   搜索文档
  tree <docid>     获取目录树
  meta <docid>     获取文档元数据

环境变量:
  TAI_PAT_TOKEN    太湖个人令牌 (必须设置)
"""


class MCPClient:
    """精简版 MCP 客户端"""

    def __init__(self, token: str):
        self.token = token
        self.request_id = 0
        self.initialized = False

    def _next_id(self) -> int:
        self.request_id += 1
        return self.request_id

    def _send(self, method: str, params: dict = None) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json, text/event-stream",
        }
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params or {},
        }

        resp = requests.post(MCP_URL, headers=headers, json=payload, timeout=60)

        if resp.status_code != 200:
            return {"error": {"code": resp.status_code, "message": f"HTTP {resp.status_code}: {resp.text[:500]}"}}

        # 处理 SSE 格式响应
        content_type = resp.headers.get("Content-Type", "")
        text = resp.text

        if "text/event-stream" in content_type or text.lstrip().startswith(("event:", "data:")):
            last_parsed = None
            for event in text.split("\n\n"):
                data_parts = []
                for line in event.split("\n"):
                    if line.startswith("data:"):
                        data_parts.append(line[5:].strip())
                if data_parts:
                    json_str = "".join(data_parts)
                    if json_str:
                        try:
                            parsed = json.loads(json_str)
                            last_parsed = parsed
                            if isinstance(parsed, dict) and ("result" in parsed or "error" in parsed):
                                return parsed
                        except json.JSONDecodeError:
                            continue
            if last_parsed is not None:
                return last_parsed

        return resp.json()

    def _ensure_init(self):
        if self.initialized:
            return
        result = self._send("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "iwiki-simple-client", "version": "1.0.0"},
        })
        if "error" in result:
            print(f"错误: MCP 初始化失败: {result['error']}", file=sys.stderr)
            sys.exit(1)
        self.initialized = True

    def call_tool(self, tool_name: str, arguments: dict) -> dict:
        self._ensure_init()
        return self._send("tools/call", {"name": tool_name, "arguments": arguments})


def extract_text(result: dict) -> str:
    """从 MCP 响应中提取文本内容"""
    if "error" in result:
        return f"错误: {json.dumps(result['error'], ensure_ascii=False)}"
    if "result" in result:
        res = result["result"]
        if "content" in res and isinstance(res["content"], list):
            parts = []
            for item in res["content"]:
                if item.get("type") == "text":
                    text = item.get("text", "")
                    # 尝试美化 JSON
                    try:
                        data = json.loads(text)
                        parts.append(json.dumps(data, indent=2, ensure_ascii=False))
                    except json.JSONDecodeError:
                        parts.append(text)
            return "\n".join(parts)
        return json.dumps(res, indent=2, ensure_ascii=False)
    return json.dumps(result, indent=2, ensure_ascii=False)


def main():
    if len(sys.argv) < 3:
        print(USAGE)
        sys.exit(1)

    command = sys.argv[1].lower()
    arg = " ".join(sys.argv[2:])

    # 读取 token
    token = os.environ.get("TAI_PAT_TOKEN")
    if not token:
        print("错误: 未设置 TAI_PAT_TOKEN 环境变量", file=sys.stderr)
        print("请执行: export TAI_PAT_TOKEN=\"your_token\"", file=sys.stderr)
        print("获取地址: https://tai.it.woa.com/user/pat", file=sys.stderr)
        sys.exit(1)

    client = MCPClient(token)

    if command == "get":
        result = client.call_tool("getDocument", {"docid": arg})
    elif command == "search":
        result = client.call_tool("searchDocument", {"query": arg})
    elif command == "tree":
        result = client.call_tool("getSpacePageTree", {"parentid": int(arg)})
    elif command == "meta":
        result = client.call_tool("metadata", {"docid": arg})
    else:
        print(f"未知命令: {command}")
        print(USAGE)
        sys.exit(1)

    print(extract_text(result))


if __name__ == "__main__":
    main()
