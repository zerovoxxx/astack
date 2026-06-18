---
name: ship
description: Use when local code or documentation changes are ready for final verification, commit, push, or handoff.
---

# Ship

Ship the current change with fresh verification evidence and safe git handling.

## Preflight

Stop if:

- There are no local changes.
- A merge, rebase, or cherry-pick is in progress.
- The requested destination is unclear.

## Verification

Run fresh verification after the final code or documentation change. Prefer:

- SPEC `验证计划` commands if a matching SPEC exists.
- Project-specific build / test commands for touched packages.
- `git diff --check` for docs / prompt / skill-only changes.

Record command, exit code, date, and coverage in the SPEC `验证记录` when a matching SPEC exists.

## SPEC And INDEX Flow

After verification passes:

1. Match changed files to relevant `docs/version/Iteration*_SPEC.md`.
2. Set matching SPEC status to `已完成`.
3. Update the corresponding `docs/version/INDEX.md` status.
4. Append one concise changelog row to `INDEX.md`.

Do not create review or retro sidecars by default.

## Git Safety

- Commit only after verification passes.
- Inspect `git status --short --branch` and `git diff --stat` before staging.
- Stage only the intended files.
- Pull with rebase before push when the branch tracks an upstream.
- If rebase conflicts, analyze and ask before editing conflict markers.
- Never force-push.
- If push is rejected, retry rebase + verification at most twice.
- Create a PR only when the user asks or the repository workflow requires one.

## Output

Report:

- Verification commands and results.
- SPEC / INDEX updates.
- Commit hash.
- Push target or PR link if available.
