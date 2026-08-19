---
name: dep-upgrade
description: "Safely upgrade Python project dependencies in pyproject.toml with Python version compatibility checking. Use when the user asks to: (1) Upgrade dependencies, (2) Update packages to latest versions, (3) Check for outdated dependencies, (4) Safely update pyproject.toml dependencies. Works with any uv-managed Python project."
---

# Dependency Upgrade

Safely upgrade dependencies in `pyproject.toml` with automatic Python version compatibility checking.

## When to Use

Use this skill when the user requests:
- "Upgrade project dependencies"
- "Update packages to latest versions"
- "Check and update outdated dependencies"
- "Safely upgrade pyproject.toml"

## Core Features

1. **Python Version Compatibility**: Only upgrades to versions that support the project's Python requirement
2. **PyPI Web Scraping**: Uses Playwright to fetch real package information from PyPI.org
3. **Safe Updates**: Only modifies the `dependencies` section, preserves all other content
4. **Format Preservation**: Maintains original file formatting and structure
5. **Universal**: Works with any uv-managed Python project

## Quick Start

### Dry Run (Preview Changes)

```bash
python scripts/upgrade_dependencies.py --dry-run
```

### Apply Upgrades

```bash
python scripts/upgrade_dependencies.py
```

### Custom Path

```bash
python scripts/upgrade_dependencies.py /path/to/pyproject.toml
```

## Workflow

1. **Analyze**: Read `pyproject.toml` and extract Python version requirement
2. **Fetch**: Scrape PyPI for latest version and compatibility info
3. **Validate**: Check Python version compatibility for each package
4. **Update**: Upgrade compatible packages, skip incompatible ones
5. **Report**: Show summary of updates, incompatibilities, and errors

## Output Interpretation

### Status Types

- **✓ Updated**: Package upgraded to latest compatible version
- **✓ Up-to-date**: Package already at latest version
- **⚠ Incompatible**: Latest version doesn't support required Python version
- **✗ Error**: Failed to fetch package information

### Example Output

```
Found 30 dependencies to check
Python version requirement: >=3.14,<3.15

Checking pandas...
Checking numpy...
...

============================================================
Dependency Upgrade Summary
============================================================

✓ Updated (5):
  - pandas: >=2.3.3,<3.0.0 → >=2.5.0,<3.0.0
  - numpy: >=2.4.2 → >=2.6.0
  ...

✓ Up-to-date (20):
  - yfinance: 1.1.0
  ...

⚠ Incompatible (3):
  - some-package: Not compatible with Python ('3.14', '3.15')

✗ Errors (2):
  - unknown-package: Package not found on PyPI
```

## Post-Upgrade Steps

After running the upgrade:

1. **Review changes**:
   ```bash
   git diff pyproject.toml
   ```

2. **Sync dependencies**:
   ```bash
   uv sync
   ```

3. **Run tests**:
   ```bash
   pytest
   ```

4. **Commit if successful**:
   ```bash
   git add pyproject.toml uv.lock
   git commit -m "chore: upgrade dependencies"
   ```

## Safety Guarantees

### What Gets Modified
- ✓ Only `project.dependencies` array
- ✓ Only version numbers in dependency strings

### What Stays Unchanged
- ✓ `[build-system]` section
- ✓ `[tool.*]` sections
- ✓ `[dependency-groups]` section
- ✓ Project metadata (name, version, description)
- ✓ File formatting and comments
- ✓ Upper version bounds (e.g., `<3.0.0`)

## Advanced Usage

### Understanding Version Constraints

The script preserves your version constraint patterns:

- `>=X.Y.Z` → `>=NEW.VERSION` (no upper bound)
- `>=X.Y.Z,<N.0.0` → `>=NEW.VERSION,<N.0.0` (preserves upper bound)

### Handling Special Cases

**Packages with extras**:
```python
"python-jose[cryptography]>=3.5.0"
```
The script extracts the base package name and preserves the extras.

**Local/Git dependencies**: Automatically skipped (not on PyPI)

## Troubleshooting

### "Package not found on PyPI"
- Verify package name spelling
- Check if package exists on PyPI.org

### "Not compatible with Python X.Y"
- Package doesn't declare support for your Python version
- Consider staying on current version or finding alternatives

### "Failed to fetch data"
- Network connectivity issues
- PyPI.org may be temporarily unavailable
- Try again later

## Technical Details

For detailed information about the upgrade strategy and safety rules, see:
- [references/upgrade_strategy.md](references/upgrade_strategy.md)

## Requirements

- Python 3.10+
- playwright (for web scraping)
- toml (for parsing pyproject.toml)

Install requirements:
```bash
pip install playwright toml
playwright install chromium
```
