---
name: spec
description: Use when creating or updating lightweight iteration specs, version index entries, or acceptance criteria for a code or workflow change.
---

# Lightweight Spec Workflow

Create or update a single SPEC as the source of truth for a change. Keep the workflow light: SPEC plus `docs/version/INDEX.md`, no default sidecar review or retro files.

## Core Flow

1. Inspect `AGENTS.md`, `docs/version/INDEX.md`, and existing `docs/version/Iteration*_SPEC.md`.
2. Choose the next physical iteration number from the highest existing `Iteration<N>`.
3. Create or update `docs/version/Iteration<N>_<PascalSlug>_SPEC.md`.
4. Update `docs/version/INDEX.md` with a one-line status entry and short changelog row.
5. Suggest `plan` only when the SPEC is too large to execute directly.

## Required SPEC Sections

For small changes, keep the SPEC compact:

- Document info: business version, author, date, one-line goal.
- Goals and non-goals.
- Change scope.
- Implementation notes.
- Verification plan.
- Acceptance criteria.
- Verification record.
- Changelog.

For larger changes, add solution comparison, detailed design, implementation plan, and risk / rollback.

## Verification Gate

Every SPEC must include at least one executable verification command.

Examples:

| Change type | Minimum verification |
|---|---|
| Markdown / prompt / skill docs | `git diff --check` plus targeted `rg` for stale references |
| TypeScript shared contract | package typecheck plus focused tests |
| Server behavior | relevant server test file |
| Web behavior | relevant web unit or e2e test |

Do not use “manual inspection” as the only verification unless the change is purely visual and a screenshot / manual step is explicitly recorded.

## Boundaries

- Do not create `BOUNDARIES.md`, `docs/retro/*`, `*_REVIEW.md`, or `*_CR.md` by default.
- Do not put task-by-task details into `INDEX.md`; keep details in the SPEC.
- If the user asks for an ad hoc report, create it only for that request and keep it outside the default workflow.
