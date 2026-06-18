---
name: spec-declutter
description: Use when archiving completed iteration SPEC files to keep docs/version focused on active work.
---

# Spec Declutter

Archive completed SPEC files from `docs/version/` into `docs/version/archive/` while keeping `INDEX.md` links valid.

## Archive Criteria

Archive only SPECs that are complete and no longer active:

- Status is `已完成` or clearly equivalent.
- The SPEC is not referenced as an active dependency by unfinished work.
- The file is not already under `archive/`.

Never archive `🔜`, `开发中`, `验证中`, `开发完成`, `⏸️`, or unclear statuses.

## Workflow

1. Read `docs/version/INDEX.md`.
2. Identify completed root-level `Iteration*_SPEC.md` files.
3. Exclude active dependencies.
4. Move selected files to `docs/version/archive/`.
5. Update `INDEX.md` links to `./archive/<file>`.
6. Run `git diff --check`.

## Constraints

- Do not rewrite SPEC content.
- Do not touch historical sidecar files if they exist.
- Do not delete archives.
- Report skipped files and reasons.
