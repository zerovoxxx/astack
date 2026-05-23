#!/usr/bin/env python3
"""
Upgrade dependencies in pyproject.toml safely.

This script:
1. Reads pyproject.toml
2. Fetches latest version info from PyPI for each dependency
3. Checks Python version compatibility
4. Updates only the dependencies section
5. Preserves all other content and formatting
"""

import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import toml
except ImportError:
    print("Error: toml package not found. Install with: pip install toml")
    sys.exit(1)


async def fetch_package_info(package_name: str, script_dir: Path) -> dict[str, Any]:
    """Fetch package info using the fetch_pypi_info.py script."""
    script_path = script_dir / "fetch_pypi_info.py"

    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            str(script_path),
            package_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            return {"package": package_name, "error": stderr.decode()}

        return json.loads(stdout.decode())
    except Exception as e:
        return {"package": package_name, "error": str(e)}


def parse_dependency_line(line: str) -> tuple[str, str]:
    """
    Parse a dependency line to extract package name and version constraint.

    Examples:
        "pandas>=2.3.3,<3.0.0" -> ("pandas", ">=2.3.3,<3.0.0")
        "numpy>=2.4.2" -> ("numpy", ">=2.4.2")
        "yfinance>=1.1.0" -> ("yfinance", ">=1.1.0")
    """
    # Remove quotes and whitespace
    line = line.strip().strip('"').strip("'")

    # Split on version operators
    match = re.match(r'^([a-zA-Z0-9_-]+)(.*)$', line)
    if match:
        package_name = match.group(1)
        version_constraint = match.group(2)
        return package_name, version_constraint

    return line, ""


def extract_python_version_requirement(pyproject_data: dict) -> tuple[str, str] | None:
    """
    Extract Python version requirement from pyproject.toml.

    Returns:
        Tuple of (min_version, max_version) or None if not found
        Example: ("3.14", "3.15") for ">=3.14,<3.15"
    """
    requires_python = pyproject_data.get("project", {}).get("requires-python", "")

    if not requires_python:
        return None

    # Parse version constraints like ">=3.14,<3.15"
    min_version = None
    max_version = None

    parts = requires_python.split(",")
    for part in parts:
        part = part.strip()
        if part.startswith(">="):
            min_version = part[2:].strip()
        elif part.startswith("<"):
            max_version = part[1:].strip()

    return (min_version, max_version) if min_version else None


def is_compatible_with_python_version(
    package_info: dict[str, Any], required_python: tuple[str, str] | None
) -> bool:
    """
    Check if package supports the required Python version.

    Args:
        package_info: Package info from PyPI
        required_python: Tuple of (min_version, max_version)

    Returns:
        True if compatible, False otherwise
    """
    if not required_python:
        return True  # No Python version requirement

    if "error" in package_info:
        return False

    supported_versions = package_info.get("supports_python_versions", [])
    if not supported_versions:
        # If no version info available, assume compatible
        return True

    min_required, max_required = required_python

    # Check if any supported version is within the required range
    for version in supported_versions:
        if version >= min_required and version < max_required:
            return True

    return False


def build_new_version_constraint(latest_version: str, old_constraint: str) -> str:
    """
    Build new version constraint based on latest version.

    Strategy:
    - Keep the same constraint style as the old one
    - Update to latest version
    - For >=X.Y.Z,<N.0.0 style, keep the upper bound pattern

    Examples:
        latest="2.5.0", old=">=2.3.3,<3.0.0" -> ">=2.5.0,<3.0.0"
        latest="2.5.0", old=">=2.3.3" -> ">=2.5.0"
    """
    if not old_constraint:
        return f">={latest_version}"

    # Check if there's an upper bound
    if "<" in old_constraint:
        # Extract upper bound
        parts = old_constraint.split(",")
        upper_bound = None
        for part in parts:
            if "<" in part:
                upper_bound = part.strip()
                break

        if upper_bound:
            return f">={latest_version},{upper_bound}"

    # No upper bound, just use >=
    return f">={latest_version}"


async def upgrade_dependencies(
    pyproject_path: Path, dry_run: bool = False
) -> dict[str, Any]:
    """
    Upgrade dependencies in pyproject.toml.

    Args:
        pyproject_path: Path to pyproject.toml
        dry_run: If True, only show what would be changed

    Returns:
        Dictionary with upgrade results
    """
    if not pyproject_path.exists():
        return {"error": f"File not found: {pyproject_path}"}

    # Read pyproject.toml
    try:
        with open(pyproject_path, "r", encoding="utf-8") as f:
            pyproject_data = toml.load(f)
    except Exception as e:
        return {"error": f"Failed to read pyproject.toml: {e}"}

    # Extract Python version requirement
    python_version_req = extract_python_version_requirement(pyproject_data)

    # Get dependencies
    dependencies = pyproject_data.get("project", {}).get("dependencies", [])
    if not dependencies:
        return {"error": "No dependencies found in pyproject.toml"}

    print(f"Found {len(dependencies)} dependencies to check")
    if python_version_req:
        print(f"Python version requirement: >={python_version_req[0]},<{python_version_req[1]}")

    # Get script directory
    script_dir = Path(__file__).parent

    # Fetch package info for all dependencies
    results = []
    for dep in dependencies:
        package_name, old_constraint = parse_dependency_line(dep)

        # Skip special packages (e.g., with extras like "python-jose[cryptography]")
        if "[" in package_name:
            base_package = package_name.split("[")[0]
            print(f"Checking {package_name}...")
            package_info = await fetch_package_info(base_package, script_dir)
        else:
            print(f"Checking {package_name}...")
            package_info = await fetch_package_info(package_name, script_dir)

        if "error" in package_info:
            results.append({
                "package": package_name,
                "status": "error",
                "error": package_info["error"],
            })
            continue

        # Check Python version compatibility
        if not is_compatible_with_python_version(package_info, python_version_req):
            results.append({
                "package": package_name,
                "status": "incompatible",
                "current": old_constraint,
                "latest": package_info["version"],
                "reason": f"Not compatible with Python {python_version_req}",
            })
            continue

        # Build new version constraint
        latest_version = package_info["version"]
        new_constraint = build_new_version_constraint(latest_version, old_constraint)

        # Check if update is needed
        if old_constraint == new_constraint:
            results.append({
                "package": package_name,
                "status": "up-to-date",
                "version": latest_version,
            })
        else:
            results.append({
                "package": package_name,
                "status": "updated",
                "old": old_constraint,
                "new": new_constraint,
            })

    # Update pyproject.toml if not dry run
    if not dry_run:
        updated_count = sum(1 for r in results if r["status"] == "updated")
        if updated_count > 0:
            # Read original file content to preserve formatting
            with open(pyproject_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Update each dependency line
            for result in results:
                if result["status"] == "updated":
                    package = result["package"]
                    old = result["old"]
                    new = result["new"]

                    # Build old and new dependency strings
                    old_dep = f'"{package}{old}"'
                    new_dep = f'"{package}{new}"'

                    # Replace in content
                    content = content.replace(old_dep, new_dep)

            # Write back
            with open(pyproject_path, "w", encoding="utf-8") as f:
                f.write(content)

            print(f"\n✓ Updated {updated_count} dependencies in {pyproject_path}")

    return {"results": results, "dry_run": dry_run}


async def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Upgrade dependencies in pyproject.toml safely"
    )
    parser.add_argument(
        "pyproject_path",
        nargs="?",
        default="pyproject.toml",
        help="Path to pyproject.toml (default: pyproject.toml)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without modifying files",
    )

    args = parser.parse_args()

    pyproject_path = Path(args.pyproject_path)
    result = await upgrade_dependencies(pyproject_path, dry_run=args.dry_run)

    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)

    # Print summary
    print("\n" + "=" * 60)
    print("Dependency Upgrade Summary")
    print("=" * 60)

    results = result["results"]
    updated = [r for r in results if r["status"] == "updated"]
    up_to_date = [r for r in results if r["status"] == "up-to-date"]
    incompatible = [r for r in results if r["status"] == "incompatible"]
    errors = [r for r in results if r["status"] == "error"]

    if updated:
        print(f"\n✓ Updated ({len(updated)}):")
        for r in updated:
            print(f"  - {r['package']}: {r['old']} → {r['new']}")

    if up_to_date:
        print(f"\n✓ Up-to-date ({len(up_to_date)}):")
        for r in up_to_date:
            print(f"  - {r['package']}: {r['version']}")

    if incompatible:
        print(f"\n⚠ Incompatible ({len(incompatible)}):")
        for r in incompatible:
            print(f"  - {r['package']}: {r['reason']}")

    if errors:
        print(f"\n✗ Errors ({len(errors)}):")
        for r in errors:
            print(f"  - {r['package']}: {r['error']}")

    if args.dry_run:
        print("\n(Dry run - no changes made)")


if __name__ == "__main__":
    asyncio.run(main())
