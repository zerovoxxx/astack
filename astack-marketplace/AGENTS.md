# astack-marketplace

> Claude Code and Codex plugin marketplace for the Astack lightweight Spec workflow and shared engineering skills.

## 1. Repository Role

This directory is a dual Claude Code / Codex marketplace root. It follows both marketplace protocols:

- `.agents/plugins/marketplace.json` is the Codex marketplace catalog.
- `.claude-plugin/marketplace.json` is the marketplace catalog.
- `plugins/<plugin>/` contains installable plugins.
- Each plugin owns its own `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and component directories.

The marketplace ships two plugins:

- `astack-workflow` owns the lightweight Spec workflow.
- `astack-common` owns reusable engineering skills that are not workflow phases.

## 2. Protocol Layout

```text
.
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   ├── astack-workflow/
│   │   ├── .codex-plugin/
│   │   │   └── plugin.json
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   ├── skills/
│   │   │   ├── harness-init/
│   │   │   ├── spec/
│   │   │   ├── plan/
│   │   │   ├── dev/
│   │   │   └── ship/
│   │   └── scripts/
│   │       └── spec-lint.sh
│   └── astack-common/
│       ├── .codex-plugin/
│       │   └── plugin.json
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           ├── branch-manager/
│           ├── bug-review/
│           ├── dep-upgrade/
│           └── db-design/
├── CHANGELOG.md
└── README.md
```

Component directories must live at the plugin root, not inside `.claude-plugin/` or `.codex-plugin/`.

## 3. Workflow Policy

Keep exactly four core workflow skills:

```text
/astack-workflow:spec -> /astack-workflow:plan -> /astack-workflow:dev -> /astack-workflow:ship
```

- `spec`: think through what to build.
- `plan`: split complex work into executable tasks.
- `dev`: implement from the request, SPEC, or PLAN and record verification evidence.
- `ship`: run fresh verification, commit, and push.

`harness-init` is kept as an initialization utility for project governance files. It is not a core workflow phase.

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
python -m json.tool astack-marketplace/plugins/astack-common/.claude-plugin/plugin.json >/dev/null
python -m json.tool astack-marketplace/plugins/astack-common/.codex-plugin/plugin.json >/dev/null
bash -n astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh
bash astack-marketplace/plugins/astack-workflow/skills/harness-init/scripts/init-harness.sh --dry-run
git diff --check
```

If Codex `plugin-creator` is available, also run:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py astack-marketplace/plugins/astack-workflow
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py astack-marketplace/plugins/astack-common
```

If Claude Code is available, also run:

```bash
claude plugin validate astack-marketplace/plugins/astack-workflow
claude plugin validate astack-marketplace/plugins/astack-common
```
