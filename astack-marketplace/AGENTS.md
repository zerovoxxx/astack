# astack-marketplace

> Claude Code and Codex plugin marketplace for the Astack lightweight Spec workflow.

## 1. Repository Role

This directory is a dual Claude Code / Codex marketplace root. It follows both marketplace protocols:

- `.agents/plugins/marketplace.json` is the Codex marketplace catalog.
- `.claude-plugin/marketplace.json` is the marketplace catalog.
- `plugins/<plugin>/` contains installable plugins.
- Each plugin owns its own `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and component directories.

The default shipped plugin is `astack-workflow`.

## 2. Protocol Layout

```text
.
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── astack-workflow/
│       ├── .codex-plugin/
│       │   └── plugin.json
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/
│       │   ├── harness-init/
│       │   ├── spec/
│       │   ├── plan/
│       │   ├── dev/
│       │   ├── mr/
│       │   └── spec-declutter/
│       └── scripts/
│           └── spec-lint.sh
├── CHANGELOG.md
└── README.md
```

Component directories must live at the plugin root, not inside `.claude-plugin/` or `.codex-plugin/`.

## 3. Workflow Policy

Keep one best-practice Spec workflow:

```text
/astack-workflow:harness-init -> /astack-workflow:spec -> /astack-workflow:dev -> /astack-workflow:mr
```

- `harness-init`: initialize or migrate project governance files.
- `spec`: create or update a lightweight iteration SPEC.
- `plan`: split a large SPEC into executable tasks.
- `dev`: implement from a SPEC or PLAN and record verification evidence.
- `mr`: prepare merge-request state with fresh verification.
- `spec-declutter`: archive completed SPEC files when the active view is crowded.

Do not reintroduce default slash-command files. Claude Code and the Astack scanner support `commands/`, but this marketplace uses `skills/` for new workflow components.

## 4. Maintenance Rules

1. Every plugin must have `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`.
2. Every marketplace entry in `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` must point at an existing plugin source.
3. Plugin skills must not reference files outside their plugin directory; marketplace installs are copied into host-specific plugin caches.
4. Keep `scripts/` inside the plugin that uses those scripts.
5. Record asset additions, removals, and protocol changes in `CHANGELOG.md`.

## 5. Verification

Before publishing changes, run:

```bash
python -m json.tool astack-marketplace/.claude-plugin/marketplace.json >/dev/null
python -m json.tool astack-marketplace/.agents/plugins/marketplace.json >/dev/null
python -m json.tool astack-marketplace/plugins/astack-workflow/.claude-plugin/plugin.json >/dev/null
python -m json.tool astack-marketplace/plugins/astack-workflow/.codex-plugin/plugin.json >/dev/null
bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh
bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run
git diff --check
```

If Codex `plugin-creator` is available, also run:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py astack-marketplace/plugins/astack-workflow
```

If Claude Code is available, also run:

```bash
claude plugin validate astack-marketplace/plugins/astack-workflow
```
