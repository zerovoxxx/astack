from __future__ import annotations

import io
import runpy
import stat
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from typing import Optional


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "plugins"
    / "astack-workflow"
    / "skills"
    / "ship"
    / "scripts"
    / "archive_specs.py"
)


class ArchiveSpecsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.astack = self.root / "docs" / "astack"
        self.version = self.astack / "version"
        self.plan = self.astack / "plan"
        self.version.mkdir(parents=True)
        self.plan.mkdir(parents=True)

        self._git("init", "-q")
        self._git("config", "user.email", "archive-test@example.com")
        self._git("config", "user.name", "Archive Test")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(self.root), *args],
            check=True,
            capture_output=True,
            text=True,
        )

    def _write_fixture(
        self,
        count: int,
        *,
        pending: Optional[set[int]] = None,
        spec_label_style: bool = False,
        archive_collision: Optional[int] = None,
    ) -> None:
        pending = pending or set()
        rows: list[str] = []
        for number in range(count, 0, -1):
            filename = f"Iteration{number}_Item{number}_SPEC.md"
            (self.version / filename).write_text(
                f"# Iteration{number}\n", encoding="utf-8"
            )
            status = "待实施" if number in pending else "✅ 已完成"
            iteration = f"Iteration{number}" if spec_label_style else f"v0.{number}"
            link = (
                f"[SPEC](version/{filename})"
                if spec_label_style
                else f"[{filename}](./version/{filename})"
            )
            if number == 1:
                plan_name = "Iteration1_Item1_PLAN.md"
                (self.plan / plan_name).write_text("# Plan\n", encoding="utf-8")
                plan_link = (
                    f" · [PLAN](plan/{plan_name})"
                    if spec_label_style
                    else f" · [PLAN](./plan/{plan_name})"
                )
            else:
                plan_link = ""
            rows.append(
                f"| {iteration} | Item{number} | {status} | {link}{plan_link} | 2026-01-{number:02d} |\n"
            )

        self.astack.joinpath("INDEX.md").write_text(
            "# 迭代状态总表\n\n"
            "| 迭代 | 标题 | 状态 | 文档 | 创建日期 |\n"
            "|------|------|------|------|---------|\n"
            + "".join(rows)
            + "\n## 变更记录\n\n"
            "| 日期 | 版本 | 作者 | 摘要 |\n"
            "|------|------|------|------|\n"
            "| 2026-01-31 | - | Test | 保持在主 INDEX |\n",
            encoding="utf-8",
        )

        if archive_collision is not None:
            archive = self.version / "archive"
            archive.mkdir()
            filename = f"Iteration{archive_collision}_Item{archive_collision}_SPEC.md"
            (archive / filename).write_text("collision\n", encoding="utf-8")

        self._git("add", ".")
        self._git("commit", "-qm", "fixture")

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *args],
            capture_output=True,
            text=True,
        )

    def test_archives_old_completed_specs_and_preserves_active(self) -> None:
        self._write_fixture(12, pending={11})
        index_mode = stat.S_IMODE(self.astack.joinpath("INDEX.md").stat().st_mode)

        result = self._run()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            {path.name for path in self.version.glob("Iteration*_SPEC.md")},
            {
                "Iteration9_Item9_SPEC.md",
                "Iteration10_Item10_SPEC.md",
                "Iteration11_Item11_SPEC.md",
                "Iteration12_Item12_SPEC.md",
            },
        )
        archive = self.version / "archive"
        self.assertEqual(len(list(archive.glob("Iteration*_SPEC.md"))), 8)

        main_index = self.astack.joinpath("INDEX.md").read_text(encoding="utf-8")
        archive_index = archive.joinpath("INDEX.md").read_text(encoding="utf-8")
        self.assertEqual(
            stat.S_IMODE(self.astack.joinpath("INDEX.md").stat().st_mode), index_mode
        )
        self.assertIn("version/archive/INDEX.md", main_index)
        self.assertIn("保持在主 INDEX", main_index)
        self.assertNotIn("./version/Iteration1_Item1_SPEC.md", main_index)
        self.assertIn("(Iteration1_Item1_SPEC.md)", archive_index)
        self.assertIn("(../../plan/Iteration1_Item1_PLAN.md)", archive_index)

        second = self._run()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(archive_index, archive.joinpath("INDEX.md").read_text(encoding="utf-8"))

    def test_dry_run_does_not_change_repository(self) -> None:
        self._write_fixture(12)
        before = self._git("status", "--short").stdout

        result = self._run("--dry-run")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("归档 9 个", result.stdout)
        self.assertEqual(before, self._git("status", "--short").stdout)
        self.assertFalse((self.version / "archive").exists())

    def test_force_supports_spec_label_index_shape_below_threshold(self) -> None:
        self._write_fixture(6, spec_label_style=True)

        result = self._run("--force")

        self.assertEqual(result.returncode, 0, result.stderr)
        archive_index = (self.version / "archive" / "INDEX.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("| Iteration1 |", archive_index)
        self.assertIn("[SPEC](Iteration1_Item1_SPEC.md)", archive_index)
        self.assertIn("[PLAN](../../plan/Iteration1_Item1_PLAN.md)", archive_index)
        self.assertEqual(len(list(self.version.glob("Iteration*_SPEC.md"))), 3)

    def test_existing_archive_table_receives_rows_before_changelog(self) -> None:
        self._write_fixture(12)
        archive = self.version / "archive"
        archive.mkdir()
        archive.joinpath("INDEX.md").write_text(
            "# 已归档迭代索引\n\n"
            "| 迭代 | 标题 | 状态 | 文档 | 创建日期 |\n"
            "|------|------|------|------|---------|\n"
            "| v0.0 | Legacy | 已完成 | [Legacy](Iteration0_Legacy_SPEC.md) | 2025-01-01 |\n"
            "\n## 变更记录（归档）\n\n"
            "保留这段历史。\n",
            encoding="utf-8",
        )
        self._git("add", ".")
        self._git("commit", "-qm", "add archive index")

        result = self._run()

        self.assertEqual(result.returncode, 0, result.stderr)
        content = archive.joinpath("INDEX.md").read_text(encoding="utf-8")
        self.assertLess(
            content.index("Iteration9_Item9_SPEC.md"),
            content.index("## 变更记录（归档）"),
        )
        self.assertTrue(content.endswith("保留这段历史。\n"))

    def test_destination_collision_aborts_without_partial_moves(self) -> None:
        self._write_fixture(12, archive_collision=1)
        index_before = self.astack.joinpath("INDEX.md").read_text(encoding="utf-8")

        result = self._run()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("已存在", result.stderr)
        self.assertTrue((self.version / "Iteration1_Item1_SPEC.md").exists())
        self.assertEqual(
            index_before,
            self.astack.joinpath("INDEX.md").read_text(encoding="utf-8"),
        )

    def test_write_failure_rolls_back_moves_and_index(self) -> None:
        self._write_fixture(12)
        index_before = self.astack.joinpath("INDEX.md").read_text(encoding="utf-8")
        namespace = runpy.run_path(str(SCRIPT))
        original_write = namespace["_write_atomic"]
        calls = 0

        def fail_once(path: Path, content: str) -> None:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise OSError("injected write failure")
            original_write(path, content)

        namespace["archive"].__globals__["_write_atomic"] = fail_once

        with redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(OSError, "injected write failure"):
                namespace["archive"](self.root, dry_run=False, force=False)

        self.assertEqual(len(list(self.version.glob("Iteration*_SPEC.md"))), 12)
        self.assertFalse((self.version / "archive").exists())
        self.assertEqual(
            index_before,
            self.astack.joinpath("INDEX.md").read_text(encoding="utf-8"),
        )
        self.assertEqual(self._git("status", "--short").stdout, "")


if __name__ == "__main__":
    unittest.main()
