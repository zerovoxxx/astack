# Dependency Upgrade Strategy

This document describes the strategy and safety rules for upgrading dependencies.

## Core Principles

### 1. Python Version Compatibility First

**Rule**: Only upgrade to versions that explicitly support the project's required Python version.

**Implementation**:
- Extract `requires-python` from `pyproject.toml`
- Check PyPI classifiers for Python version support
- Skip packages that don't support the required Python version

**Example**:
```toml
# pyproject.toml
requires-python = ">=3.14,<3.15"
```

Only upgrade to packages that declare support for Python 3.14.

### 2. Preserve Version Constraint Patterns

**Rule**: Keep the same version constraint style as the original.

**Patterns**:
- `>=X.Y.Z` → `>=NEW.VERSION` (no upper bound)
- `>=X.Y.Z,<N.0.0` → `>=NEW.VERSION,<N.0.0` (preserve upper bound)

**Rationale**: Upper bounds are intentional and protect against breaking changes.

### 3. Only Modify Dependencies Section

**Rule**: Never modify other sections of `pyproject.toml`.

**Protected sections**:
- `[build-system]`
- `[tool.*]`
- `[dependency-groups]`
- `[project]` metadata (name, version, description, etc.)

**Only modify**: `project.dependencies` array

### 4. Preserve File Formatting

**Rule**: Maintain original file formatting and structure.

**Implementation**:
- Use string replacement instead of TOML serialization
- Preserve whitespace, comments, and line breaks
- Only change version numbers in dependency strings

## Upgrade Process

### Step 1: Analyze Current State
1. Read `pyproject.toml`
2. Extract Python version requirement
3. Parse all dependencies

### Step 2: Fetch Latest Versions
1. Use Playwright to scrape PyPI for each package
2. Get latest version number
3. Get supported Python versions from classifiers

### Step 3: Validate Compatibility
1. Check if latest version supports required Python version
2. If incompatible, skip and report

### Step 4: Build New Constraints
1. Extract old version constraint
2. Build new constraint with latest version
3. Preserve upper bound if present

### Step 5: Apply Updates
1. Replace old version strings with new ones
2. Preserve all other content
3. Write back to file

## Safety Checks

### Before Upgrade
- ✓ Verify `pyproject.toml` exists
- ✓ Verify file is readable
- ✓ Verify dependencies section exists

### During Upgrade
- ✓ Check Python version compatibility
- ✓ Validate version string format
- ✓ Handle special cases (extras like `package[extra]`)

### After Upgrade
- ✓ Verify file is still valid TOML
- ✓ Run `uv sync` to test dependency resolution
- ✓ Run tests to verify functionality

## Error Handling

### Network Errors
- Retry failed PyPI requests
- Report packages that couldn't be checked
- Continue with other packages

### Incompatible Versions
- Report incompatibility reason
- Skip upgrade for that package
- Continue with other packages

### Parse Errors
- Report malformed dependency strings
- Skip problematic entries
- Continue with other packages

## Special Cases

### Packages with Extras
```python
"python-jose[cryptography]>=3.5.0"
```
- Extract base package name: `python-jose`
- Check base package on PyPI
- Preserve extras in final string

### Local Path Dependencies
```python
{ path = "libs/package.whl", marker = "..." }
```
- Skip these entirely
- They're not on PyPI

### Git Dependencies
```python
{ git = "https://...", branch = "main" }
```
- Skip these entirely
- They're not on PyPI

## Dry Run Mode

**Purpose**: Preview changes without modifying files

**Usage**:
```bash
python upgrade_dependencies.py --dry-run
```

**Output**: Shows what would be changed without making changes

## Post-Upgrade Steps

After running the upgrade script:

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
