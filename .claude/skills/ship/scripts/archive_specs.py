#!/usr/bin/env python3
"""Archive completed Astack SPECs while keeping the active index compact."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


THRESHOLD = 10
KEEP_COMPLETED = 3
ARCHIVE_NOTE = (
    "> 已归档迭代见 [version/archive/INDEX.md](version/archive/INDEX.md)。\n"
)
SPEC_NAME = re.compile(r"Iteration(?P<number>\d+)_[A-Za-z][A-Za-z0-9]*_SPEC\.md")
LINK_TARGET = re.compile(r"\((?P<target>[^)\s]+)\)")


class ArchiveError(RuntimeError):
    pass


@dataclass(frozen=True)
class StatusTable:
    header_index: int
    separator_index: int
    first_row: int
    end_row: int
    status_column: int
    document_column: int


@dataclass(frozen=True)
class Candidate:
    number: int
    filename: str
    line_index: int
    row: str


def _cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _find_status_table(lines: list[str], source: Path) -> StatusTable:
    for header_index, line in enumerate(lines):
        if not line.lstrip().startswith("|"):
            continue
        cells = _cells(line)
        if "状态" not in cells or "文档" not in cells:
            continue
        separator_index = header_index + 1
        if separator_index >= len(lines) or "---" not in lines[separator_index]:
            raise ArchiveError(f"{source} 的迭代表缺少 Markdown 分隔行")
        end_row = separator_index + 1
        while end_row < len(lines) and lines[end_row].lstrip().startswith("|"):
            end_row += 1
        return StatusTable(
            header_index=header_index,
            separator_index=separator_index,
            first_row=separator_index + 1,
            end_row=end_row,
            status_column=cells.index("状态"),
            document_column=cells.index("文档"),
        )
    raise ArchiveError(f"{source} 中找不到包含“状态”和“文档”的迭代表")


def _iteration_number(path: Path) -> int:
    match = SPEC_NAME.fullmatch(path.name)
    if not match:
        raise ArchiveError(f"SPEC 文件名不符合约定：{path.name}")
    return int(match.group("number"))


def _completed_candidates(
    lines: list[str], table: StatusTable, version_dir: Path
) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen: set[str] = set()
    required_column = max(table.status_column, table.document_column)
    for line_index in range(table.first_row, table.end_row):
        row = lines[line_index]
        cells = _cells(row)
        if len(cells) <= required_column or "已完成" not in cells[table.status_column]:
            continue
        found = list(
            dict.fromkeys(
                match.group(0)
                for match in SPEC_NAME.finditer(cells[table.document_column])
            )
        )
        if not found:
            continue
        if len(found) != 1:
            raise ArchiveError(f"INDEX 单行引用了多个 SPEC，无法安全归档：{row.strip()}")
        filename = found[0]
        if filename in seen:
            raise ArchiveError(f"INDEX 中重复引用 SPEC：{filename}")
        seen.add(filename)
        spec_path = version_dir / filename
        if not spec_path.exists():
            continue
        candidates.append(
            Candidate(
                number=_iteration_number(spec_path),
                filename=filename,
                line_index=line_index,
                row=row,
            )
        )
    return sorted(candidates, key=lambda candidate: candidate.number)


def _archive_row(row: str, filename: str) -> str:
    def replace(match: re.Match[str]) -> str:
        target = match.group("target")
        spec_targets = {
            f"version/{filename}",
            f"./version/{filename}",
            f"version/archive/{filename}",
            f"./version/archive/{filename}",
        }
        if target in spec_targets:
            return f"({filename})"
        if target.startswith("./plan/"):
            return f"(../../plan/{target.removeprefix('./plan/')})"
        if target.startswith("plan/"):
            return f"(../../plan/{target.removeprefix('plan/')})"
        return match.group(0)

    rewritten = LINK_TARGET.sub(replace, row)
    return rewritten if rewritten.endswith("\n") else rewritten + "\n"


def _main_index_content(
    lines: list[str], table: StatusTable, candidates: list[Candidate]
) -> str:
    removed = {candidate.line_index for candidate in candidates}
    remaining = [line for index, line in enumerate(lines) if index not in removed]
    if not any("version/archive/INDEX.md" in line for line in remaining):
        remaining[table.header_index:table.header_index] = [ARCHIVE_NOTE, "\n"]
    return "".join(remaining)


def _archive_index_content(
    archive_index: Path,
    main_lines: list[str],
    main_table: StatusTable,
    candidates: list[Candidate],
) -> str:
    rows = [_archive_row(candidate.row, candidate.filename) for candidate in candidates]
    if not archive_index.exists():
        return "".join(
            [
                "# 已归档迭代索引\n",
                "\n",
                main_lines[main_table.header_index],
                main_lines[main_table.separator_index],
                *rows,
            ]
        )

    lines = archive_index.read_text(encoding="utf-8").splitlines(keepends=True)
    table = _find_status_table(lines, archive_index)
    content = "".join(lines)
    for candidate in candidates:
        if candidate.filename in content:
            raise ArchiveError(f"归档 INDEX 已存在条目：{candidate.filename}")
    lines[table.end_row:table.end_row] = rows
    return "".join(lines)


def _document_row_count(lines: list[str], table: StatusTable, filename: str) -> int:
    count = 0
    for line_index in range(table.first_row, table.end_row):
        cells = _cells(lines[line_index])
        if len(cells) > table.document_column and filename in cells[table.document_column]:
            count += 1
    return count


def _git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        check=check,
        capture_output=True,
        text=True,
    )


def _is_tracked(root: Path, path: Path) -> bool:
    relative = path.relative_to(root).as_posix()
    return _git(root, "ls-files", "--error-unmatch", "--", relative, check=False).returncode == 0


def _move(root: Path, source: Path, destination: Path) -> bool:
    tracked = _is_tracked(root, source)
    if tracked:
        _git(
            root,
            "mv",
            "--",
            source.relative_to(root).as_posix(),
            destination.relative_to(root).as_posix(),
        )
    else:
        shutil.move(source, destination)
    return tracked


def _write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    temporary: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, delete=False
        ) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _restore_file(path: Path, existed: bool, content: str) -> None:
    if existed:
        _write_atomic(path, content)
    elif path.exists():
        path.unlink()


def _apply(
    root: Path,
    index_path: Path,
    archive_index: Path,
    candidates: list[Candidate],
    main_content: str,
    archive_content: str,
) -> None:
    archive_dir = archive_index.parent
    archive_dir_existed = archive_dir.exists()
    main_original = index_path.read_text(encoding="utf-8")
    archive_existed = archive_index.exists()
    archive_original = (
        archive_index.read_text(encoding="utf-8") if archive_existed else ""
    )
    moved: list[tuple[Path, Path, bool]] = []

    try:
        archive_dir.mkdir(parents=True, exist_ok=True)
        for candidate in candidates:
            source = index_path.parent / "version" / candidate.filename
            destination = archive_dir / candidate.filename
            tracked = _move(root, source, destination)
            moved.append((source, destination, tracked))

        _write_atomic(index_path, main_content)
        _write_atomic(archive_index, archive_content)

        written_main = index_path.read_text(encoding="utf-8").splitlines(
            keepends=True
        )
        written_archive = archive_index.read_text(encoding="utf-8").splitlines(
            keepends=True
        )
        main_table = _find_status_table(written_main, index_path)
        archive_table = _find_status_table(written_archive, archive_index)
        for candidate in candidates:
            source = index_path.parent / "version" / candidate.filename
            destination = archive_dir / candidate.filename
            if source.exists() or not destination.exists():
                raise ArchiveError(f"归档移动校验失败：{candidate.filename}")
            if _document_row_count(written_main, main_table, candidate.filename) != 0:
                raise ArchiveError(f"主 INDEX 仍引用已归档 SPEC：{candidate.filename}")
            if (
                _document_row_count(written_archive, archive_table, candidate.filename)
                != 1
            ):
                raise ArchiveError(f"归档 INDEX 条目数量异常：{candidate.filename}")
    except (ArchiveError, OSError, subprocess.CalledProcessError) as error:
        rollback_errors: list[str] = []
        for path, existed, content in (
            (index_path, True, main_original),
            (archive_index, archive_existed, archive_original),
        ):
            try:
                _restore_file(path, existed, content)
            except OSError as rollback_error:
                rollback_errors.append(f"恢复 {path} 失败：{rollback_error}")
        for source, destination, tracked in reversed(moved):
            if not destination.exists():
                continue
            try:
                if tracked:
                    result = _git(
                        root,
                        "mv",
                        "--",
                        destination.relative_to(root).as_posix(),
                        source.relative_to(root).as_posix(),
                        check=False,
                    )
                    if result.returncode != 0:
                        rollback_errors.append(
                            f"恢复 {destination.name} 失败：{result.stderr.strip()}"
                        )
                else:
                    shutil.move(destination, source)
            except OSError as rollback_error:
                rollback_errors.append(
                    f"恢复 {destination.name} 失败：{rollback_error}"
                )
        try:
            if (
                not archive_dir_existed
                and archive_dir.exists()
                and not any(archive_dir.iterdir())
            ):
                archive_dir.rmdir()
        except OSError as rollback_error:
            rollback_errors.append(f"清理 {archive_dir} 失败：{rollback_error}")
        if rollback_errors:
            raise ArchiveError(
                "归档失败且回滚不完整：" + "; ".join(rollback_errors)
            ) from error
        raise


def archive(root: Path, *, dry_run: bool, force: bool) -> int:
    root = root.resolve()
    git_root = Path(_git(root, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
    if git_root != root:
        raise ArchiveError(f"--root 必须是 git 仓库根目录：{git_root}")

    astack_dir = root / "docs" / "astack"
    version_dir = astack_dir / "version"
    index_path = astack_dir / "INDEX.md"
    archive_index = version_dir / "archive" / "INDEX.md"
    if not index_path.is_file() or not version_dir.is_dir():
        raise ArchiveError("缺少 docs/astack/INDEX.md 或 docs/astack/version/")

    specs = sorted(version_dir.glob("Iteration*_SPEC.md"), key=_iteration_number)
    if len(specs) <= THRESHOLD and not force:
        if dry_run:
            print(f"no-op：version/ 下 {len(specs)} 个 SPEC（阈值 {THRESHOLD}）")
        return 0

    main_lines = index_path.read_text(encoding="utf-8").splitlines(keepends=True)
    main_table = _find_status_table(main_lines, index_path)
    completed = _completed_candidates(main_lines, main_table, version_dir)
    candidates = completed[:-KEEP_COMPLETED] if len(completed) > KEEP_COMPLETED else []
    if not candidates:
        if dry_run:
            print("no-op：已完成 SPEC 不足以触发归档")
        return 0

    archive_dir = archive_index.parent
    for candidate in candidates:
        destination = archive_dir / candidate.filename
        if destination.exists():
            raise ArchiveError(f"归档目标已存在：{destination}")

    main_content = _main_index_content(main_lines, main_table, candidates)
    archive_content = _archive_index_content(
        archive_index, main_lines, main_table, candidates
    )

    print(f"归档 {len(candidates)} 个已完成 SPEC（保留最新 {KEEP_COMPLETED} 个）：")
    for candidate in candidates:
        print(
            f"  version/{candidate.filename} -> version/archive/{candidate.filename}"
        )
    if dry_run:
        return 0

    _apply(
        root,
        index_path,
        archive_index,
        candidates,
        main_content,
        archive_content,
    )
    print(f"完成：主 INDEX 迁移 {len(candidates)} 行至 version/archive/INDEX.md")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="git 仓库根目录")
    parser.add_argument("--dry-run", action="store_true", help="只打印归档计划")
    parser.add_argument("--force", action="store_true", help="跳过数量阈值")
    args = parser.parse_args(argv)
    try:
        return archive(args.root, dry_run=args.dry_run, force=args.force)
    except (ArchiveError, OSError, subprocess.CalledProcessError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
