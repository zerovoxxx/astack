---
name: mr
description: Use when preparing local changes for merge request or pull request submission, including verification, status flow, changelog/index updates, commit, rebase, and push.
---

# Merge Request Preparation

Prepare the current branch for merge with evidence-based verification and safe git handling.

## Preflight

Stop if:

- There are no local changes.
- A merge, rebase, or cherry-pick is in progress.
- The branch has no upstream and the user did not ask to create one.

## Verification

Run the smallest sufficient verification set for the actual changed files. Prefer:

- SPEC `验证计划` commands if a matching SPEC exists.
- Project-specific build / test commands for touched packages.
- `git diff --check` for docs / prompt / skill-only changes.

Record command, exit code, and coverage in the SPEC `验证记录` when a matching SPEC exists.

## SPEC And INDEX Flow

After verification passes:

1. Match changed files to relevant `docs/version/Iteration*_SPEC.md`.
2. Set matching SPEC status to `已完成`.
3. Update the corresponding `docs/version/INDEX.md` status.
4. Append one concise changelog row to `INDEX.md`.
5. Archive old completed SPEC files only when the active root exceeds the configured threshold.

Do not create review or retro sidecars by default.

## Git Safety

- Commit only after verification passes.
- Pull with rebase before push.
- If rebase conflicts, analyze and ask before editing conflict markers.
- Never force-push.
- If push is rejected, retry rebase + verification at most twice.

## Output

Report:

- Verification commands and results.
- SPEC / INDEX updates.
- Commit hash.
- Push or MR link if available.
