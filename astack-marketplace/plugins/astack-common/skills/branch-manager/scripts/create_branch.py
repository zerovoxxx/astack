#!/usr/bin/env python3
"""
Git branch creation script following Git Flow model.

This script helps create properly named git branches based on Git Flow conventions:
- feature/description - New features (from develop)
- bugfix/description - Bug fixes (from develop)
- hotfix/description - Production hotfixes (from main)
- release/version - Release preparation (from develop)
- support/version - Long-term support (from main)
"""

import sys
import subprocess
from datetime import datetime
from typing import Literal


def run_git_command(command: list[str]) -> tuple[bool, str]:
    """Execute a git command and return success status and output."""
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )
        return True, result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return False, e.stderr.strip()


def get_current_branch() -> str:
    """Get the current git branch name."""
    success, output = run_git_command(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if success:
        return output
    return "unknown"


def branch_exists(branch_name: str) -> bool:
    """Check if a branch exists locally."""
    success, output = run_git_command(["git", "rev-parse", "--verify", branch_name])
    return success


def sanitize_description(description: str, branch_type: str = "") -> str:
    """Convert description to kebab-case format.

    For release/support branches, preserve dots in version numbers.
    For other branches, convert to standard kebab-case.
    """
    # For release and support branches, preserve dots for version numbers
    if branch_type in ["release", "support"]:
        # Replace spaces and underscores with hyphens
        sanitized = description.lower().replace(" ", "-").replace("_", "-")
        # Remove special characters except hyphens and dots
        sanitized = "".join(c for c in sanitized if c.isalnum() or c in ["-", "."])
        # Remove consecutive hyphens
        while "--" in sanitized:
            sanitized = sanitized.replace("--", "-")
        # Remove leading/trailing hyphens
        return sanitized.strip("-")
    else:
        # Standard kebab-case for feature/bugfix/hotfix
        # Replace spaces and underscores with hyphens
        sanitized = description.lower().replace(" ", "-").replace("_", "-")
        # Remove special characters except hyphens
        sanitized = "".join(c for c in sanitized if c.isalnum() or c == "-")
        # Remove consecutive hyphens
        while "--" in sanitized:
            sanitized = sanitized.replace("--", "-")
        # Remove leading/trailing hyphens
        return sanitized.strip("-")


def create_branch(branch_type: str, description: str, base_branch: str | None = None) -> tuple[bool, str]:
    """Create a Git Flow branch with proper naming and base branch."""
    # Git Flow default base branches
    gitflow_defaults = {
        "feature": "develop",
        "bugfix": "develop",
        "hotfix": "main",
        "release": "develop",
        "support": "main"
    }

    # Use provided base branch or Git Flow default
    if base_branch is None:
        base_branch = gitflow_defaults.get(branch_type, "develop")

        # Fallback to main if develop doesn't exist
        if base_branch == "develop" and not branch_exists("develop"):
            print(f"Note: 'develop' branch not found, using 'main' instead")
            base_branch = "main"

    # Create branch name
    sanitized_desc = sanitize_description(description, branch_type)
    branch_name = f"{branch_type}/{sanitized_desc}"

    # Ensure we're on the base branch and it's up to date
    print(f"Switching to {base_branch} branch...")
    success, output = run_git_command(["git", "checkout", base_branch])
    if not success:
        return False, f"Failed to checkout {base_branch}: {output}"

    print(f"Pulling latest changes from {base_branch}...")
    success, output = run_git_command(["git", "pull", "origin", base_branch])
    if not success:
        print(f"Warning: Could not pull from origin: {output}")

    # Create and checkout new branch
    print(f"Creating branch: {branch_name}")
    success, output = run_git_command(["git", "checkout", "-b", branch_name])
    if not success:
        return False, f"Failed to create branch: {output}"

    return True, branch_name


def main():
    """Main entry point for the script."""
    if len(sys.argv) < 3:
        print("Git Flow Branch Creator")
        print("\nUsage:")
        print("  python create_branch.py <type> <description> [base_branch]")
        print("\nBranch Types (Git Flow):")
        print("  feature   - New features (default base: develop)")
        print("  bugfix    - Bug fixes (default base: develop)")
        print("  hotfix    - Production hotfixes (default base: main)")
        print("  release   - Release preparation (default base: develop)")
        print("  support   - Long-term support (default base: main)")
        print("\nExamples:")
        print("  python create_branch.py feature add-login")
        print("  python create_branch.py bugfix fix-validation-error")
        print("  python create_branch.py hotfix v1.0.1")
        print("  python create_branch.py release v2.0.0")
        print("  python create_branch.py feature new-dashboard main  # custom base")
        sys.exit(1)

    branch_type = sys.argv[1].lower()
    description = sys.argv[2]
    base_branch = sys.argv[3] if len(sys.argv) > 3 else None

    # Validate branch type
    valid_types = ["feature", "bugfix", "hotfix", "release", "support"]
    if branch_type not in valid_types:
        print(f"✗ Error: Unknown branch type '{branch_type}'")
        print(f"Valid types: {', '.join(valid_types)}")
        sys.exit(1)

    # Create branch
    success, result = create_branch(branch_type, description, base_branch)

    if success:
        print(f"\n✓ Successfully created and switched to branch: {result}")
        print(f"You can now start working on your changes.")
    else:
        print(f"\n✗ Error: {result}")
        sys.exit(1)


if __name__ == "__main__":
    main()
