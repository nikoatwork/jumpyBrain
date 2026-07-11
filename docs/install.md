# Installation

## Fast path: installer script

jumpyBrain is not published to npm yet. The current public install path is a shell installer that clones/builds the app locally, initializes memory, verifies QMD, and installs detected agent integrations.

Prerequisites:

- macOS or Linux with a POSIX-compatible shell
- Node.js 22+ and npm
- Git
- either `curl` or `wget`

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh | bash
```

Default behavior:

- installs the app under `~/.jumpybrain/app`
- creates a CLI shim at `~/.jumpybrain/bin/jumpybrain`
- initializes machine-global Markdown memory at `~/.jumpybrain/memory`
- verifies or installs QMD for local indexing/recall
- builds an initial memory index so first recall works immediately
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
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh | bash -s -- --scope project --integrations all
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
--read-only-target <url>     Mark a remote target read-only; repeat for multiple targets
--allow-write-target <url>   Remove a read-only target policy; repeat for multiple targets
--dry-run                    Print planned actions
```

Use `--integrations all` to install every integration regardless of detection. Use `--integrations none` for CLI-only setup.

### Read-only remote targets

Use an installer-managed, device-local policy to prevent accidental remote writes from this CLI installation:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh \
  | bash -s -- --read-only-target https://memory.example.com
```

The option is repeatable. Entries are stored in `~/.jumpybrain/cli-config.json`, or `<install-root>/cli-config.json` for a custom install root. The generated shim selects that custom path unless `JUMPYBRAIN_CLI_CONFIG` is explicitly set. Installer reruns and `jumpybrain update` preserve the file unless a policy flag is supplied.

Restore write access through the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh \
  | bash -s -- --allow-write-target https://memory.example.com
```

Origins are normalized by scheme, host, and port; paths, queries, fragments, default ports, and trailing slashes do not create separate identities. Embedded credentials, non-HTTP(S) URLs, contradictory flags, and malformed existing policy files are rejected. DNS aliases, redirects, and proxy URLs remain distinct origins.

This is an advisory client-side guard against accidental writes, not authorization. Anyone who can change the device config, use another client, or call the server directly can bypass it; enforce real permissions on the server or surrounding infrastructure. API keys never belong in `cli-config.json` or `install-manifest.json`.

## Update

Installer-created installs include a manifest at `~/.jumpybrain/install-manifest.json`. Refresh the app and CLI shim from the recorded source/ref while preserving Markdown memory, configuration, derived indexes, and integrations with:

```bash
~/.jumpybrain/bin/jumpybrain update
```

Preview the update without writing files:

```bash
~/.jumpybrain/bin/jumpybrain update --dry-run
```

For nonstandard installs, pass `--install-root <path>`. If no installer manifest exists, this command fails safely; source/development installs should update manually with `git pull && npm install && npm run build`, or rerun `install.sh`.

Re-running the copy-paste `curl ... | bash` installer on a managed installation uses the same app/CLI-only update path. It does not initialize or index memory again and does not rewrite agent integrations. Ambiguous or damaged layouts without a valid installer manifest are refused instead of overwritten.

Managed reruns keep the source and ref recorded in the install manifest. Set `JUMPYBRAIN_INSTALL_REF=<ref>` or pass `--ref <ref>` only when you intentionally want to override that ref.

This MVP update path is installer-based only. jumpyBrain is not published to npm and does not use npm self-update or release channels.

## Uninstall

Uninstall requires a valid, supported `install-manifest.json` whose recorded install root and owned paths match the selected root. It fails closed before deleting anything when that ownership proof is missing, malformed, unsupported, or inconsistent. A valid uninstall removes only the recorded app, shim, CLI policy config, manifest, and integration files. It preserves Markdown memory by default.

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh | bash
```

For a custom installation root, pass the same root on every uninstall operation:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh \
  | bash -s -- --install-root /opt/jumpybrain --dry-run
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh \
  | bash -s -- --install-root /opt/jumpybrain
```

To intentionally remove the configured jumpyBrain memory root as well:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh | bash -s -- --delete-memory
```

For a custom root:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh \
  | bash -s -- --install-root /opt/jumpybrain --delete-memory --dry-run
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/uninstall.sh \
  | bash -s -- --install-root /opt/jumpybrain --delete-memory
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
2. **Hosted client use:** install the CLI and point it at a deployed jumpyBrain server with `--target-url` plus `JUMPYBRAIN_API_KEY`.
3. **Server deploy:** self-host the runtime on a VPS/server against a server-local Markdown memory root. See [`vps-deploy.md`](vps-deploy.md) or [`coolify-deploy.md`](coolify-deploy.md).

Vercel is not a supported production target for the memory server because the current server needs durable local filesystem state; see [`vercel-deploy.md`](vercel-deploy.md).

Markdown remains canonical in all paths; indexes and support state remain derived/rebuildable.
