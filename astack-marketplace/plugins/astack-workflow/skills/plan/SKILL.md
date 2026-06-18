---
name: plan
description: Use when turning an approved SPEC into an executable implementation plan with file map, task steps, and verification commands.
---

# Spec To Implementation Plan

Use this skill only when a SPEC is too large or risky to execute directly. The plan translates design intent into small tasks with concrete verification.

## Inputs

Read:

- The full SPEC.
- `AGENTS.md`.
- Existing source files referenced by the SPEC.
- Any前置 SPEC explicitly referenced by the current SPEC.

## Output

Create `docs/version/Iteration<N>_<Slug>_PLAN.md` next to the SPEC.

Include:

- SPEC source link and version.
- File map: file, operation, responsibility.
- Ordered tasks with semantic anchors, not brittle line numbers.
- Concrete steps.
- Verification commands per task.
- Review points for cross-file contracts.
- Final checklist requiring SPEC verification record updates.

## Verification Rules

Each task must have at least one command with an expected signal, for example:

```text
pnpm -C packages/server test repo-service.test.ts -> exit 0
pnpm -C packages/shared typecheck -> exit 0
```

Avoid vague checks such as “build passes” unless the exact command is named. Do not introduce design decisions not present in the SPEC; mark unclear requirements as `Spec 待明确`.

## Constraints

- Do not edit production code while planning.
- Do not run git commit / push.
- Keep each task small enough to verify independently.
