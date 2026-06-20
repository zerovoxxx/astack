# Astack Documentation

Astack helps developers and teams manage AI coding skills, commands, agents, and
workflow plugins across many projects.

Use this documentation when you want more detail than the root README without
digging through implementation specs.

## Start Here

- [Root README](../../README.md): product overview, source install, and first workflow.
- [Architecture design notes](../asset/design.md): deeper product and system design context.
- [Harness iteration index](../astack/INDEX.md): active project specs and implementation history.
- [Marketplace plugin README](../../astack-marketplace/README.md): how to install the built-in `astack-workflow` plugin.

## What Astack Manages

- **Skill repositories**: Git-backed collections of reusable AI coding assets.
- **Projects**: local codebases registered with `astack init`.
- **Subscriptions**: the selected skills, commands, or agents a project consumes.
- **Working copies**: the files materialized into a project's `.claude/` tree.
- **Linked tool directories**: Cursor and CodeBuddy directories that point back to `.claude/`.

## Source Install Summary

```bash
git clone https://github.com/zerovoxxx/astack.git
cd astack
corepack enable
pnpm install
pnpm build
alias astack="node $(pwd)/packages/cli/dist/bin.js"
astack server start
```

Open the dashboard at `http://127.0.0.1:7432`.

## Common Commands

```bash
astack repos register <git-url>
astack repos list
astack init
astack subscribe <name>
astack sync
astack status
astack diff <name>
astack push <name>
astack resolve <name> --use-remote
astack link add cursor
astack link list
```

## Notes for Teams

Astack is useful when a team wants consistent AI coding workflows without asking
every project to manually copy and maintain `.claude/` assets. Keep team-owned
skills and commands in a reviewed Git repository, then let projects subscribe to
the pieces they need.

## Notes for Contributors

The runtime is a TypeScript monorepo:

- `packages/shared`
- `packages/server`
- `packages/cli`
- `packages/web`

Before changing runtime behavior, check the active specs in
[`docs/astack/INDEX.md`](../astack/INDEX.md).
