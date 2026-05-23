---
name: branch-manager
description: Intelligent git branch creation with standardized naming conventions following Git Flow model. Use when the user needs to create a new git branch for feature development, bug fixes, hotfixes, releases, or support. Automatically determines branch type from user intent and creates properly named branches - feature/description for new features, bugfix/description for bug fixes, hotfix/description for production fixes, release/version for releases, support/version for long-term support. Handles git operations including base branch checkout, pulling latest changes, and creating the new branch.
---

# Branch Manager

Automates git branch creation following the Git Flow model with intelligent naming conventions.

## Git Flow Branch Types

Git Flow uses strict prefixes for different branch types:

**feature/** - New features and enhancements
- Base branch: `develop`
- Format: `feature/description`
- Example: `feature/add-login`

**bugfix/** - Bug fixes during development
- Base branch: `develop`
- Format: `bugfix/description`
- Example: `bugfix/fix-validation-error`

**hotfix/** - Critical production fixes
- Base branch: `main`
- Format: `hotfix/description`
- Example: `hotfix/v1.0.1`

**release/** - Release preparation
- Base branch: `develop`
- Format: `release/version`
- Example: `release/v2.0.0`

**support/** - Long-term support branches
- Base branch: `main`
- Format: `support/version`
- Example: `support/v1.x`

## Usage

### Determine Branch Type

Analyze user intent to determine the appropriate Git Flow branch type:

**Feature indicators**:
- "add", "implement", "create", "new feature"
- "enhance", "improve", "update", "develop"
- User mentions adding functionality

**Bugfix indicators**:
- "fix bug", "bug fix", "resolve issue"
- "broken during development", "not working in develop"
- Non-critical fixes during development cycle

**Hotfix indicators**:
- "production bug", "critical fix", "urgent fix"
- "fix in production", "live issue"
- Critical fixes needed immediately in production

**Release indicators**:
- "prepare release", "release version"
- "version X.Y.Z", "release candidate"
- Preparing for a new version release

**Support indicators**:
- "long-term support", "LTS", "maintenance"
- "support version X", "backport"
- Maintaining older versions

### Create Branch

Use the bundled script for reliable branch creation:

```bash
python scripts/create_branch.py <type> <description> [base_branch]
```

**Parameters**:
- `type`: Branch type (feature, bugfix, hotfix, release, support)
- `description`: Brief description (converted to kebab-case)
- `base_branch`: Optional, overrides Git Flow defaults

**Examples**:
```bash
# Feature branch (from develop)
python scripts/create_branch.py feature add-login

# Bugfix branch (from develop)
python scripts/create_branch.py bugfix fix-validation-error

# Hotfix branch (from main)
python scripts/create_branch.py hotfix v1.0.1

# Release branch (from develop)
python scripts/create_branch.py release v2.0.0

# Custom base branch
python scripts/create_branch.py feature new-dashboard main
```

## Script Behavior

The script automatically:
1. Determines base branch based on Git Flow conventions
2. Switches to base branch
3. Pulls latest changes from remote
4. Creates new branch with proper naming
5. Checks out the new branch
6. Reports success or error

## Git Flow Advantages

- **Structured workflow**: Clear separation of feature development, releases, and hotfixes
- **Parallel development**: Multiple features can be developed simultaneously
- **Release management**: Dedicated branches for release preparation
- **Production stability**: Hotfixes don't interfere with ongoing development
- **Enterprise-ready**: Suitable for large teams and complex projects

## Error Handling

If branch creation fails:
- Verify git repository exists
- Check if base branch exists (develop/main)
- Ensure no uncommitted changes block checkout
- Confirm branch name doesn't already exist
- Verify network connection for remote pull
