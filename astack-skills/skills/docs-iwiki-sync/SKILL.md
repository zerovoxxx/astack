---
name: docs-iwiki-sync
description: Synchronize documentation files from the local docs/ directory to iWiki space. This skill should be used when the user requests to sync docs to iWiki, upload documentation to iWiki, or update iWiki documentation from the docs directory. Supports incremental sync (create or update) with content hash change detection and maintains document ID mappings in iwiki_config.json.
allowed-tools: 
disable: false
---

# Docs to iWiki Sync

**Fully automated documentation sync tool** that prevents AI from reading document content to avoid context explosion.

## 📋 Four-Step Workflow

When a user requests document synchronization, AI must follow this **four-step workflow**:

### Step 1: Understand User Intent (AI Analysis)

Parse the user's request to determine the sync scope:
- **Full sync**: All enabled document directories
- **Directory sync**: All documents in a specific directory
- **Single file sync**: A single specified document
- **Multiple files sync**: Multiple specified documents

### Step 2: Scan Changes (`scan_docs.py`)

Use `scan_docs.py` to scan documents and compare with `iwiki_config.json` to find files that need syncing.

**Function**: Scan documents and detect changes by comparing with config
**Output**: Only metadata (path, title, hash, status) - **NO body content**
**Advantage**: AI can safely read scan results without context explosion risk

**Usage**:
```bash
# Scan all documents
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/scan_docs.py

# Scan specific directory
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/scan_docs.py --path "02_system_design"

# Scan single file
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/scan_docs.py --path "02_system_design/01.技术方案总体设计.md"
```

**Output Example** (no body field):
```json
{
  "summary": {
    "total": 5,
    "new": 1,
    "update": 2,
    "skipped": 2,
    "large_files": 1
  },
  "files": [
    {
      "path": "02_system_design/01.技术方案.md",
      "title": "技术方案总体设计",
      "status": "UPDATE",
      "docid": 4017028385,
      "content_hash": "a1b2c3d4...",
      "size_info": {"needs_chunking": false, "size": 12066}
    }
  ]
}
```

**AI Responsibilities**:
1. Read the `summary` field from scan results
2. Report to user: how many docs need sync (NEW + UPDATE), how many skipped (SKIPPED)
3. Warn if there are large files (large_files > 0) requiring chunking
4. Ask user for confirmation before proceeding to sync

### Step 3: Execute Sync (`sync_docs.py`)

Use `sync_docs.py` to synchronize the documents.

**Function**:
1. Internally calls `scan_docs()` to get file list
2. **Only reads content for files that need syncing** (SKIPPED files not read)
3. Calls iWiki MCP tools to create/update documents
4. Outputs sync result summary table

**Advantage**: Document content is only processed within the script, AI never touches it

**Usage**:
```bash
# Sync all documents
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/sync_docs.py

# Sync specific directory
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/sync_docs.py --path "02_system_design"

# Sync single file
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/sync_docs.py --path "02_system_design/01.技术方案总体设计.md"

# Force update all documents (even if content unchanged - useful for fixing metadata like titles)
cd /data/workspace/fullm-eva-agent && uv run python .codebuddy/skills/docs-iwiki-sync/scripts/sync_docs.py --force
```

### Step 4: Auto-Update History (Script Handles Automatically)

After successful sync, `sync_docs.py` automatically updates `.codebuddy/skills/docs-iwiki-sync/iwiki_history.md`.

**Updated Fields** (in Markdown table format):
- `docid`: iWiki document ID
- `synced_version`: Current synced version number
- `content_hash`: Document content hash (for next incremental detection)
- `last_synced`: Sync timestamp
- `status`: Sync status (success/failed)

**History File Structure**:
```markdown
## directory_name

| 文档路径 | 标题 | iWiki DocID | 父节点ID | 最后同步时间 | 同步版本 | 内容哈希 | 状态 |
|---------|------|------------|---------|-------------|---------|---------|------|
| path/to/file.md | Document Title | 4017028385 | 4017026654 | 2026-01-24T10:30:45Z | 7 | 82fb9515... | success |
```

**Advantage**: 
- Next scan will use this history for incremental detection, only syncing changed documents.
- Human-readable format with better version control diff.
- Clean separation between config (iwiki_config.json) and history data (iwiki_history.md).

---

## 🔧 Technical Details

### Change Detection Mechanism

Uses content hash (MD5) to determine if a document needs syncing:
- **NEW**: New document (no docid in config)
- **UPDATE**: Content changed (hash doesn't match last sync)
- **SKIPPED**: Content unchanged (hash matches) → **Does NOT read document content**

### Document Title Strategy

**Uses filename as iWiki document title** (not extracted from content):
- Removes file extension (`.md`)
- **Preserves all content including numeric prefixes**
- Example: `01.产品方案总体设计.md` → `01.产品方案总体设计`

**Document body**: Full markdown content (including any `# heading` in the file)

### Large Document Handling

For documents > 500KB, automatically uses chunking strategy:
- **Creation**: Create placeholder document first, then append full content
- **Update**: Use `saveDocumentParts` for chunked updates

### Configuration File

All settings in `.codebuddy/skills/docs-iwiki-sync/iwiki_config.json`:
- `iwiki_space`: Space ID, key, name
- `mcp_server`: MCP server URL and authentication headers
- `directory_mapping`: Local directory → iWiki parent document ID mapping
- `paths`: Paths configuration (docs_dir, history_file)

Sync history in `.codebuddy/skills/docs-iwiki-sync/iwiki_history.md`:
- Markdown table format for better readability
- Records synced document metadata (docid, version, hash)
- Used for incremental sync detection

---

## ⚠️ Critical Guidelines

### DO

1. ✅ **Always follow the 4-step workflow** above
2. ✅ **Read scan results** from `scan_docs.py` and report summary to user
3. ✅ **Use `--path` parameter** to filter specific files/directories
4. ✅ **Use `--force` parameter** to force update all documents (for fixing metadata)
5. ✅ **Trust the scripts** to handle config updates automatically

### DON'T

1. ❌ **NEVER read document content directly** - let scripts handle it
2. ❌ **NEVER manually edit `iwiki_config.json` or `iwiki_history.md`** - scripts update them automatically
3. ❌ **NEVER skip Step 2** (scan) - always check what needs syncing first
4. ❌ **NEVER proceed to sync without user confirmation** after showing scan results
5. ❌ **NEVER read document body from scan results** - it doesn't exist in output

---

## 🛠️ Requirements

- Python 3.12+
- `codebuddy` CLI tool (must be in PATH)
- iWiki MCP server configured and available

---

## 📖 Advanced Usage (Manual MCP Calls)

If you need manual control over sync flow, refer to `sync_docs.py` implementation. Key MCP tools:

- `createDocument`: Create new document
- `saveDocument`: Update document (standard size)
- `saveDocumentParts`: Update document (supports large document chunking)
- `metadata`: Get document metadata (including version number)

See script source: `.codebuddy/skills/docs-iwiki-sync/scripts/sync_docs.py`
