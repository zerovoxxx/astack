# Astack Marketplace

Claude Code and Codex plugin marketplace for lightweight Spec workflows and shared engineering skills.

## Install In Claude Code

From the repository root:

```text
/plugin marketplace add ./astack-marketplace
/plugin install astack-workflow@astack-marketplace
/plugin install astack-common@astack-marketplace
```

## Install In Codex

From the repository root:

```bash
codex plugin marketplace add ./astack-marketplace
```

Then open Codex Plugins and install `astack-workflow` and/or `astack-common` from `Astack Marketplace`.

Installed skills are namespaced by plugin:

```text
/astack-workflow:harness-init
/astack-workflow:spec
/astack-workflow:plan
/astack-workflow:dev
/astack-workflow:ship
/astack-common:branch-manager
/astack-common:bug-review
/astack-common:dep-upgrade
/astack-common:db-design
```

## Structure

```text
astack-marketplace/
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
└── plugins/
    ├── astack-workflow/
    │   ├── .codex-plugin/plugin.json
    │   ├── .claude-plugin/plugin.json
    │   ├── skills/
    │   └── scripts/
    └── astack-common/
        ├── .codex-plugin/plugin.json
        ├── .claude-plugin/plugin.json
        └── skills/
            ├── branch-manager/
            ├── bug-review/
            ├── dep-upgrade/
            └── db-design/
```

Both plugins intentionally ship skills only. No default `commands/` directory is included.
