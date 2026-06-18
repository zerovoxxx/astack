---
name: dev
description: Use when implementing code or documentation changes from a SPEC or PLAN while keeping progress and verification evidence synchronized.
---

# Development From SPEC Or PLAN

Implement the requested change from a SPEC or PLAN with minimal scope and fresh verification evidence.

## Core Rule

No fresh verification, no completion claim. A task, phase, or SPEC is not done until its relevant command has run and the result is recorded.

## PLAN Mode

When a `_PLAN.md` exists:

1. Read the current task and referenced files.
2. Execute steps in order.
3. Check off each completed step immediately.
4. Run that task’s verification commands.
5. Add PASS / FAIL evidence to the corresponding SPEC `验证记录`.

## SPEC Mode

When working directly from `_SPEC.md`:

1. Set document status to `开发中`.
2. Read the relevant section and source files.
3. Make the smallest code change that satisfies the current goal.
4. Run the SPEC `验证计划` command that covers the change.
5. Write a verification record row:

```markdown
| YYYY-MM-DD | `actual command` | PASS / FAIL | coverage or failure reason |
```

If verification fails, stop, leave status as `验证中`, and record the failing command.

## Scope Discipline

- Use existing project patterns.
- Do not refactor unrelated code.
- Do not mark work complete based on intent, visual inspection, or old test output.
- When implementation diverges from the SPEC, update the SPEC or ask before continuing if the divergence changes scope.
