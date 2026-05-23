---
name: iwiki
description: 通过 iWiki MCP API 读取和搜索腾讯内部 iWiki 文档。支持获取文档内容、搜索文档、获取目录树和文档元数据。当 Prompt 涉及 iwiki.woa.com 域名或 iWiki 关键词时自动触发。
version: 0.0.1
author: jurluo
---
# iWiki 文档读取工具

通过 iWiki MCP API 读取和搜索腾讯内部 iWiki 文档。

## 前置条件

需要设置 `TAI_PAT_TOKEN` 环境变量（太湖个人令牌）：
- 获取地址: https://tai.it.woa.com/user/pat
- 创建 Token 时选择 **iWiki官方MCP** 或 **全部应用**

## 使用方式

通过 `python ~/.claude/skills/iwiki/scripts/iwiki.py <command> [args]` 调用：

### 获取文档内容
```bash
python ~/.claude/skills/iwiki/scripts/iwiki.py get <docid>
```

### 搜索文档
```bash
python ~/.claude/skills/iwiki/scripts/iwiki.py search <query>
```

### 获取目录树
```bash
python ~/.claude/skills/iwiki/scripts/iwiki.py tree <docid>
```

### 获取文档元数据
```bash
python ~/.claude/skills/iwiki/scripts/iwiki.py meta <docid>
```

## URL 解析

当用户提供 iWiki URL 时，从中提取 docid：
- `https://iwiki.woa.com/p/123456` → docid 为 `123456`
- `https://iwiki.woa.com/pages/123456` → docid 为 `123456`

## 注意事项

- Token 仅通过环境变量 `TAI_PAT_TOKEN` 传递，**不要将 token 写入任何文件或输出到对话中**
- 如果用户未设置 `TAI_PAT_TOKEN`，提示用户通过 `export TAI_PAT_TOKEN="xxx"` 设置
- 搜索功能优先使用关键词搜索，如果结果不理想再尝试 AI 语义搜索
