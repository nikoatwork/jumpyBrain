# Installation

## Fast path: installer script

jumpyBrain is not published to npm yet. The current public install path is a shell installer that clones/builds the app locally, initializes memory, verifies QMD, and installs detected agent integrations.

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/main/install.sh | bash
```

Default behavior:

- installs the app under `~/.jumpybrain/app`
- creates a CLI shim at `~/.jumpybrain/bin/jumpybrain`
- initializes machine-global Markdown memory at `~/.jumpybrain/memory`
- verifies or installs QMD for local indexing/recall
- installs all detected integrations:
  - Codex: `~/.agents/skills/jumpybrain-memory/SKILL.md`
  - Claude Code: `~/.claude/skills/jumpybrain-memory/SKILL.md`
  - Pi: `~/.pi/agent/extensions/jumpybrain-memory.ts`

Add the bin directory to your shell if you want `jumpybrain` everywhere:

```bash
export PATH="$HOME/.jumpybrain/bin:$PATH"
```

Then verify:

```bash
~/.jumpybrain/bin/jumpybrain doctor
~/.jumpybrain/bin/jumpybrain recall --root ~/.jumpybrain/memory --topic "what should I remember?" --limit 5
```

### Project-local install

Use project scope when you want memory and skills in the current repository instead of global locations:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/main/install.sh | bash -s -- --scope project --integrations all
```

Project scope creates `./memory` and installs project-local integrations:

- Codex/Pi portable skill: `.agents/skills/jumpybrain-memory/SKILL.md`
- Claude Code skill: `.claude/skills/jumpybrain-memory/SKILL.md`
- Pi extension: `.pi/extensions/jumpybrain-memory.ts`

### Installer options

```text
--scope global|project       Default: global
--memory-root <path>         Override the memory root
--integrations auto|all|none Default: auto; auto installs detected harnesses
--ref <git-ref>              Install from a branch/tag/commit ref
--source <path-or-git-url>   Install from a local checkout or alternate git URL
--install-root <path>        Default: ~/.jumpybrain
--dry-run                    Print planned actions
```

Use `--integrations all` to install every integration regardless of detection. Use `--integrations none` for CLI-only setup.

## Uninstall

Uninstall removes installer-owned app, shim, manifest, and integration files. It preserves Markdown memory by default.

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/main/uninstall.sh | bash
```

To intentionally remove the configured jumpyBrain memory root as well:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/main/uninstall.sh | bash -s -- --delete-memory
```

`--delete-memory` refuses broad/unowned paths and requires a `jumpybrain.json` memory config.

## Prerequisites and QMD behavior

jumpyBrain is intentionally QMD-first. The installer verifies `qmd --version`; if QMD is missing it tries:

```bash
npm install -g @tobilu/qmd
```

If your npm global install location is not writable or not on `PATH`, install QMD manually or set:

```bash
export JUMPYBRAIN_QMD_BIN=/path/to/qmd
```

Resolution order for local/server runtime use:

1. `JUMPYBRAIN_QMD_BIN`
2. bundled/package-local `node_modules/.bin/qmd` when present
3. `qmd` on `PATH`

QMD-derived files live under `<memory-root>/.jumpybrain/` and can be rebuilt from canonical Markdown.

## Basic use

Remember writes memory; recall reads memory:

```bash
~/.jumpybrain/bin/jumpybrain recall --root ~/.jumpybrain/memory --topic "current task" --limit 5
printf '%s\n' "Markdown remains canonical; indexes are rebuildable." \
  | ~/.jumpybrain/bin/jumpybrain remember --root ~/.jumpybrain/memory --type decision --title "Memory storage rule"
~/.jumpybrain/bin/jumpybrain recall --root ~/.jumpybrain/memory --query "Where is the memory storage rule?" --limit 5 --json
```

When running inside a repo initialized with `memory/jumpybrain.json`, agents can use recipe shortcuts that discover the root:

```bash
jumpybrain run memory:recall --topic "memory storage" --limit 5
```

If you manually add or edit Markdown memory files, run:

```bash
jumpybrain index --root <memory-root>
```

## Source install for contributors

For development from a checkout:

```bash
npm install
npm run build
npm link
jumpybrain --help
```

For dogfooding in another repo, maintainer local tarball workflows are documented in [`local-cli-builds.md`](local-cli-builds.md).

## Install/deploy paths

jumpyBrain is structured around three paths while keeping one memory system:

1. **Local runtime install:** current installer path; CLI and runtime run on the same machine as a local Markdown memory root.
2. **Hosted client install:** future thin CLI client pointed at a deployed jumpyBrain server. Remote targets are recognized in the CLI but not implemented yet.
3. **Server deploy:** future/self-hosted runtime on a VPS/server against a server-local Markdown memory root.

Markdown remains canonical in all paths; indexes and support state remain derived/rebuildable.
