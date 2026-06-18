# Astack Marketplace

Claude Code and Codex plugin marketplace for a lightweight Spec-driven development workflow.

## Install In Claude Code

From the repository root:

```text
/plugin marketplace add ./astack-marketplace
/plugin install astack-workflow@astack-marketplace
```

## Install In Codex

From the repository root:

```bash
codex plugin marketplace add ./astack-marketplace
```

Then open Codex Plugins and install `astack-workflow` from `Astack Marketplace`.

Installed skills are namespaced by plugin:

```text
/astack-workflow:harness-init
/astack-workflow:spec
/astack-workflow:plan
/astack-workflow:dev
/astack-workflow:ship
```

## Structure

```text
astack-marketplace/
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
└── plugins/
    └── astack-workflow/
        ├── .codex-plugin/plugin.json
        ├── .claude-plugin/plugin.json
        ├── skills/
        └── scripts/
```

`astack-workflow` intentionally ships skills only. No default `commands/` directory is included.
