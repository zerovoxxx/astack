# Astack

Manage AI coding skills across every project.

Astack is a local CLI, daemon, and web dashboard for people who reuse AI coding
skills, commands, and workflow plugins across many repositories. Keep your best
Claude Code style assets in Git-backed repositories, subscribe projects to the
pieces they need, and sync updates without copying `.claude/` folders by hand.

It is built for individual AI coding power users and teams that want a shared,
auditable way to distribute AI coding workflows.

## Why Astack?

AI coding workflows tend to start as local files:

- a useful Claude Code skill in one project
- a command that only exists in another repo
- team conventions copied into `.claude/` by hand
- Cursor or CodeBuddy directories that drift away from the source of truth

That works for one project. It gets painful when you have ten.

Astack turns those assets into managed subscriptions:

- maintain skills, commands, agents, and workflow plugins in Git-backed repos
- register projects that should consume them
- subscribe each project to only the assets it needs
- sync updates through a CLI, local daemon, and dashboard
- inspect status, diffs, conflicts, and local edits before they spread
- link secondary tool directories such as Cursor or CodeBuddy back to the same
  `.claude/` source

## Who It Is For

- Individual developers who use AI coding tools across multiple repositories.
- Teams that want to standardize prompts, skills, commands, and project
  workflows without relying on manual copy/paste.
- Maintainers building reusable skill or plugin collections for internal or
  open-source use.

## What You Get

| Capability | What it means |
|---|---|
| CLI | `astack init`, `subscribe`, `sync`, `push`, `status`, `diff`, `resolve`, `link`, and `repos` |
| Local daemon | Hono API, SQLite state, git operations, SSE events, and dashboard hosting |
| Web dashboard | Project, repository, subscription, sync, and harness visibility |
| Git-backed repos | Skills and commands stay versioned, reviewable, and portable |
| Multi-tool links | Keep `.claude/` as the source of truth while linking Cursor and CodeBuddy directories |
| Built-in plugins | `astack-workflow` ships the lightweight development loop; `astack-common` ships shared engineering skills such as `db-design` |

## Source Install

Astack is currently intended to be run from source. The npm package is not
published yet.

Requirements:

- Node.js `>=22.13.0`
- pnpm `>=10`
- git

```bash
git clone https://github.com/zerovoxxx/astack.git
cd astack
corepack enable
pnpm install
pnpm build
```

Create a local shell alias for the CLI:

```bash
alias astack="node $(pwd)/packages/cli/dist/bin.js"
```

Start the daemon and dashboard:

```bash
astack server start
```

The daemon serves the API and dashboard at:

```text
http://127.0.0.1:7432
```

Keep that terminal running. In another terminal, reuse the same alias before
running project commands.

## Example Workflow

Register a repository that contains reusable skills or commands:

```bash
astack repos register <git-url>
astack repos list
```

Register one of your projects:

```bash
cd /path/to/your-project
astack init
```

Subscribe that project to selected assets:

```bash
astack subscribe <skill-or-command-name>
astack sync
astack status
```

When you improve a subscribed skill locally, inspect and push it back:

```bash
astack diff <skill-or-command-name>
astack push <skill-or-command-name>
```

If a project also uses Cursor or CodeBuddy, link those tool directories to the
same source:

```bash
astack link add cursor
astack link add codebuddy
astack link list
```

## Core Concepts

- **Skill repository**: a Git repository that contains reusable AI coding
  assets. Astack can scan `skills/`, `commands/`, `agents/`, and plugin
  marketplace layouts.
- **Project**: a local codebase registered with `astack init`.
- **Subscription**: a project-level choice to consume a specific skill, command,
  or agent from a registered repository.
- **Working copy**: the actual files linked or copied into a project's
  `.claude/` directory.
- **Daemon**: the local service that owns git sync, SQLite state, API routes,
  and dashboard events.
- **Harness workflow**: the built-in `astack-workflow` plugin that provides a
  lightweight spec-driven development loop.

## Architecture

```text
Web Dashboard  <== REST + SSE ==>  Backend Daemon  <== git ==>  Git Repos
React + Vite                       Hono + SQLite                 skills/plugins
                                         ^
                                         |
                                        REST
                                         |
                                  CLI (astack)
                                  project .claude/
```

Monorepo packages:

- `@astack/shared`: domain contracts, schemas, and error codes
- `@astack/server`: daemon, SQLite repositories, scanner, git sync, and API
- `@astack/cli`: command-line interface
- `@astack/web`: dashboard

The repository also includes `astack-marketplace/plugins/{astack-workflow,astack-common}`,
providing Claude Code and Codex compatible workflow and shared engineering skills.

## Documentation

- [Documentation index](./docs/README.md)
- [English docs](./docs/en/README.md)
- [Simplified Chinese docs](./docs/zh-CN/README.md)
- [Architecture design notes](./docs/asset/design.md)
- [Harness iteration specs](./docs/astack/INDEX.md)
- [Marketplace plugin README](./astack-marketplace/README.md)

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm dev
```

Useful local refresh commands:

```bash
pnpm dev:refresh
pnpm dev:reload
node scripts/dev-up.mjs
```

## Status

Astack is under active development and is being prepared for open-source use.
The current recommended path is source install. Public package distribution,
contribution guidelines, and broader open-source governance can be added as the
project stabilizes.

## License

MIT, as declared in package metadata.
