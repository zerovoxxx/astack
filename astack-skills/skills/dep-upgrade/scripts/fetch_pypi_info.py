#!/usr/bin/env python3
"""
Fetch package information from PyPI using Playwright.

This script retrieves the latest version and Python version compatibility
information for a given package from PyPI.org.
"""

import asyncio
import json
import sys
from typing import Any

from playwright.async_api import async_playwright


async def get_package_info(package_name: str) -> dict[str, Any]:
    """
    Fetch package information from PyPI.

    Args:
        package_name: Name of the package to fetch info for

    Returns:
        Dictionary containing:
        - package: Package name
        - version: Latest version
        - supports_python_versions: List of supported Python versions (e.g., ["3.10", "3.11", "3.12"])
        - error: Error message if fetch failed
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()

        try:
            url = f"https://pypi.org/project/{package_name}/"
            await page.goto(url, wait_until="networkidle", timeout=60000)

            # Get latest version
            version = "Unknown"
            version_element = await page.query_selector(".package-header__version")
            if version_element:
                version = (await version_element.inner_text()).strip()
            else:
                # Fallback: parse from h1
                header_name = await page.query_selector("h1.package-header__name")
                if header_name:
                    full_text = await header_name.inner_text()
                    parts = full_text.split()
                    if len(parts) >= 2:
                        version = parts[-1]

            # Get supported Python versions
            supported_versions = []
            classifier_elements = await page.query_selector_all(
                ".sidebar-section__classifiers li"
            )
            for el in classifier_elements:
                text = await el.inner_text()
                clean_text = " ".join(text.split())
                # Match "Python :: 3.X" patterns
                if "Python :: 3." in clean_text:
                    # Extract version number (e.g., "3.10", "3.11")
                    parts = clean_text.split("Python :: ")
                    if len(parts) > 1:
                        version_str = parts[1].strip()
                        # Only keep 3.X format
                        if version_str.startswith("3."):
                            supported_versions.append(version_str)

            # Fallback: check page content
            if not supported_versions:
                content = await page.content()
                for minor in range(8, 20):  # Check Python 3.8 to 3.19
                    if f"Python :: 3.{minor}" in content or f"Python+::+3.{minor}" in content:
                        supported_versions.append(f"3.{minor}")

            return {
                "package": package_name,
                "version": version,
                "supports_python_versions": sorted(set(supported_versions)),
            }

        except Exception as e:
            return {"package": package_name, "error": str(e)}

        finally:
            await browser.close()


async def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python fetch_pypi_info.py <package_name>", file=sys.stderr)
        sys.exit(1)

    package_name = sys.argv[1]
    result = await get_package_info(package_name)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
