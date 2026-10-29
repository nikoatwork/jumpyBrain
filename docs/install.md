# Installation

**jumpyBrain is open source and local first.** Your brain is a folder of Markdown files on your computer. Local writing and search need no jumpyBrain account, subscription, or remote memory server. Installing the CLI or Mac app does not upload your brain or set up cloud sync.

**The app and CLI work with the same brain folder.** The app gives you a window to write and browse; the CLI lets your agents use those files. You can use either or both. There is no note migration or second copy of your brain when both point at the same folder.

Choose your starting point:

- **Agents, or app + agents:** use the CLI installer below, then add the Mac app from that existing installation.
- **Mac app only:** follow [desktop setup](#macos-desktop-app-beta). It provisions the CLI/search dependencies it needs; agent integrations are optional.
- **CLI already installed:** go straight to [add the Mac app](#macos-desktop-app-beta). No second clone is needed for the default installation.

Software installation/updates download code and dependencies. A remote brain requires an explicitly selected server; it does not sync your personal brain. Notes recalled into a cloud AI assistant are handled by that assistant, and sending feedback or choosing a cloud-synced folder can also send data outside your computer. See the [privacy and installation FAQ](faq.md#when-can-data-leave-my-computer). Agents helping with setup should follow the [agent installation guide](install-for-agents.md).

The Mac app also supports explicitly installed [local executable extensions](extensions.md) for optional commands, panels and themes. Extension packages are trusted code and use a separate local configuration directory; installing the CLI or opening a brain does not automatically install extensions.

## Fast path: installer script

Install the CLI first, then optionally add the [macOS desktop app (beta)](#macos-desktop-app-beta). The installer builds jumpyBrain locally and sets up memory, search, and detected agent integrations. jumpyBrain is not published to npm.

Prerequisites:

- macOS or Linux with a POSIX-compatible shell
- Node.js 22+ and npm
- Git
- either `curl` or `wget`

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh | bash
```

Default behavior:

- installs the CLI source/runtime under `~/.jumpybrain/app` (this is not a second desktop app or a notes folder)
- creates a CLI shim at `~/.jumpybrain/bin/jumpybrain`
- initializes machine-global Markdown memory at `~/.jumpybrain/memory`
- verifies or installs exact `@tobilu/qmd@2.8.3` (CLI and SDK together) for local indexing/recall
- builds an initial lexical index; semantic retrieval requires a separately provisioned local GGUF
- installs all detected integrations:
  - Codex: `~/.agents/skills/jumpybrain-memory/SKILL.md`
  - Claude Code: `~/.claude/skills/jumpybrain-memory/SKILL.md`
  - Pi: `~/.pi/agent/extensions/jumpybrain-memory.ts`

Here, **global** means available across projects on this computer, not uploaded to a global/team service. `CLI policy: not configured` means no optional remote write restrictions are recorded; it does not mean a remote server is connected.

The installer downloads source from GitHub and dependencies from npm. To inspect the bootstrap before running it, download it to a file:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh -o jumpybrain-install.sh
less jumpybrain-install.sh
bash jumpybrain-install.sh
```

The bootstrap also downloads installer helpers and dependencies; inspecting that file alone is not a full dependency audit. The source for the main installer is [`scripts/public-install.mjs`](../scripts/public-install.mjs). `bash jumpybrain-install.sh --dry-run` previews planned actions without installing jumpyBrain (the bootstrap still downloads its helpers).

Add the bin directory to your shell if you want `jumpybrain` everywhere:

```bash
export PATH="$HOME/.jumpybrain/bin:$PATH"
```

Then verify:

```bash
~/.jumpybrain/bin/jumpybrain doctor --check
~/.jumpybrain/bin/jumpybrain recall --root ~/.jumpybrain/memory --topic "what should I remember?" --limit 5
```

An empty result is expected for a new brain. Restart/reload an assistant that was already running so it can discover its new integration. Text search is ready immediately; local semantic search is an optional later step.

The installer's completion summary includes that restart reminder and natural-language remember/recall prompts. It does not save sample notes. A dry run labels integrations as planned and prints verification for after installation; it does not report an installed brain. Printed shell commands preserve literal paths, including spaces and quotes.

### macOS desktop app (beta)

Requires macOS 13+, Node 22.12+, npm, Git, Python 3.9+, and Xcode command-line tools. Check with `node --version`, `npm --version`, `git --version`, `python3 --version`, and `xcrun --find swiftc`. If Xcode command-line tools are missing, run `xcode-select --install` and finish Apple's installer first.

From your existing installation or source checkout, `npm run desktop:setup -- --check` checks these requirements together without installing or changing settings. Setup also runs this preflight before making changes, reports missing tools together, and checks the minimum Python and macOS versions.

**Already installed the CLI with the default installer?** Reuse its source directory. Quit any running jumpyBrain app, then:

```sh
cd "$HOME/.jumpybrain/app"
npm run desktop:setup
open "$HOME/Applications/jumpyBrain.app"
```

On first launch, check the suggested folder, normally `~/.jumpybrain/memory`, and choose **Open my notes** (or **Start writing** for a new brain). Use **Use a different folder…** if your installer printed a different root; **⌘⇧G** in the chooser lets you enter a hidden path. **Connect to a remote brain** is also available for a server you or your team already set up. Desktop selection does not change the CLI/agent target; matching the folder is what makes both use the same notes.

**Starting with the Mac app and no CLI install?** Clone the public repository once, then build:

```sh
git clone https://github.com/nikoatwork/jumpyBrain.git
cd jumpyBrain
npm run desktop:setup
open "$HOME/Applications/jumpyBrain.app"
```

No GitHub account or SSH key is required for this public HTTPS clone. Fresh desktop setup provisions the managed CLI/search dependencies without agent integrations; choose a new or existing brain in onboarding. For app + agents, use the CLI-first route above.

Setup builds one app containing the editor, menu bar, internal native helper, and compiled memory runtime. It preserves existing CLI targets. The app bundles runtime code, not a duplicate of your notes; GUI updates coordinate the app and a supported default managed CLI. Setup downloads dependencies even when reusing the source directory. Custom CLI install locations need individual checking: desktop setup currently provisions/checks the default `~/.jumpybrain` managed installation.

Close the window to keep the brain live in the menu bar; **Quit jumpyBrain** waits for open editors to save before stopping owned services. The beta builds locally and is ad-hoc signed, with no notarized download installer yet. If macOS blocks opening it, report the exact message; do not disable system security. The [Mac app guide](../integrations/electron/README.md) covers migration, Keychain repair, updates, and recovery.

### Project-local install

Use project scope when you want memory and skills in the current repository instead of global locations:

```bash
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh | bash -s -- --scope project --integrations all
```

Project scope creates `./memory` and installs project-local integrations:

- Codex/Pi portable skill: `.agents/skills/jumpybrain-memory/SKILL.md`
- Claude Code skill: `.claude/skills/jumpybrain-memory/SKILL.md`
- Pi extension: `.pi/extensions/jumpybrain-memory.ts`

### Optional how-to-dream skill

The [how-to-dream skill](../skills/how-to-dream/SKILL.md) is included under `skills/` in the source checkout, managed runtime, and local package tarball. The installer still installs only the existing memory skill/extension; it does **not** silently enable dreaming or install this optional skill.

To opt in, choose a source checkout (or extracted package) as `SOURCE`, and the skill directory supported by your agent as `DEST`. For example, from a checkout, install project-local for Codex:

```bash
SOURCE="$PWD"
DEST="$PWD/.agents/skills"
mkdir -p "$DEST/how-to-dream"
cp -i "$SOURCE/skills/how-to-dream/SKILL.md" "$DEST/how-to-dream/SKILL.md"
```

For the default managed runtime, use `SOURCE="$HOME/.jumpybrain/app"` (custom installs: `<install-root>/app`). For global Codex use `DEST="$HOME/.agents/skills"`; Claude Code uses project `.claude/skills` or global `$HOME/.claude/skills`. For other agents, use their documented skill directory or load the shipped file explicitly. Restart/reload the agent after copying. No template substitution is needed: the skill discovers the CLI/root from PATH, environment, or confirmed integration configuration.

This is an explicit manual copy, not installer-managed ownership. Review before replacing an existing file; refresh the copy manually after updates, and remove only your copied `how-to-dream/SKILL.md` when uninstalling it. The regular updater/uninstaller does not manage that copy. Installation grants no memory-write permission: global/team/remote writes still require explicit authorization.

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

The Mac app checks for releases at startup and once an hour while running, including with its window closed. The sidebar update button stays visible: click it to check manually when up to date, or use its **Download update** action when a release is available. Keep editing while it prepares; the icon becomes **Relaunch to apply update** when ready. Preparation is not installation: leaving it ready defers replacement, and all registered editor tabs must confirm their saves before relaunch. **Check for updates…** in the native menu checks manually without opening a popup. The icon tooltip explains progress, exceptions and available recovery actions; verified success follows actual installation and startup.

GUI updates download one published GitHub release (including 0.x beta releases), verify its SHA-256 digest, and build the app locally. They update the bundled runtime and the default managed CLI together. A custom, pinned, missing, or unowned CLI receives an explicit **Update app only** choice. Its source/ref and files remain unchanged. GUI updates never downgrade a newer managed CLI, change targets, rewrite agent integrations, index memory, or update hosted servers.

This supports `~/Applications/jumpyBrain.app` on macOS 13+, with Node 22.12+, npm, Python 3.9+, Xcode Command Line Tools, working external QMD, and at least 3 GB free. It needs no checkout or GitHub login after initial setup. Builds are locally signed, not publicly signed/notarized. Older apps without the shared updater need one source setup (`npm run desktop:setup`, after quitting the app) to obtain this capability. This bootstrap is separate from normal future updates. The next release must contain the desktop updater resources; incomplete releases fail before installation.

Failures show a shared notification and remain available in the icon tooltip with retry guidance. An interrupted replacement opens a dedicated **Recover previous installation** surface with **Show update log**, then a safe restart. Previous components and journals remain under `~/Library/Application Support/jumpyBrain Updates`; keep them until the update is verified. Unknown installer locks require repair rather than automatic deletion. See the [Mac app guide](../integrations/electron/README.md#gui-updates-and-recovery).

The CLI uses the same paired operation for an existing standard Mac installation:

```bash
~/.jumpybrain/bin/jumpybrain update
```

Preview the update without writing files:

```bash
~/.jumpybrain/bin/jumpybrain update --dry-run
```

With the Mac app running (including window-closed/menu-bar mode), the CLI prepares through that app and reports **Prepared; restart needed**, never installed success. Use **Relaunch to apply update** in the app when ready. With the app quit, the CLI prepares and installs both components, reopens the app, and waits for verified startup and matching versions. Both entry points select the same immutable published release asset and digest.

CLI-only installations retain the source/ref recorded in `~/.jumpybrain/install-manifest.json`—normally GitHub `master`—and remain CLI-only. The CLI detects custom install locations; use `--install-root <path>` to select another. A paired Mac installation with a custom/pinned/unowned CLI or explicit source/ref override stops with guidance; use the app’s explicit **Update app only** exception to preserve that policy, or keep developer CLI work in a separate CLI-only installation. Rerunning the public installer remains the source-based installer workflow; use `jumpybrain update` for coordinated unified Mac updates.

**Older standalone companion installs:** their CLI updater retains legacy shared-runtime support. Migrate to the unified Mac app with `npm run desktop:setup` after quitting the old apps; see the [migration guide](../integrations/electron/README.md#migration-from-the-two-app-beta).

For intentional CLI-only version changes, pass `--ref <ref>` or set `JUMPYBRAIN_INSTALL_REF`. The downloaded bootstrap uses current `master` independently; `JUMPYBRAIN_INSTALLER_REF` overrides its version. Source/development checkouts instead use `git pull && npm install && npm run build`.

## Uninstall

The unified Mac app has its own bundled runtime and can remain installed when removing the CLI. To remove it, disable **Start at Login**, quit, and move `~/Applications/jumpyBrain.app` to Trash. Its connections/support directory, Keychain items, and Markdown remain. An older standalone companion still depends on the managed CLI runtime and must be [removed first](../integrations/macos-companion/README.md#remove).

Uninstall requires a valid, supported `install-manifest.json` whose recorded install root and owned paths match the selected root. It fails closed before deleting anything when that ownership proof is missing, malformed, unsupported, or inconsistent. A valid uninstall removes only the recorded app, shim, CLI policy config, manifest, and integration files. It preserves Markdown memory by default.

An uninstall dry run labels removals and optional memory deletion as planned, reports that no changes were made, and leaves the installation and notes in place.

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

jumpyBrain requires exact **@tobilu/qmd@2.8.3**, including its CLI and SDK from the same package. The installer checks package identity/version, SDK files, and CLI version without importing model code. If PATH QMD is missing/incompatible it installs:

```bash
npm install -g @tobilu/qmd@2.8.3
```

If your npm global install location is not writable or not on `PATH`, install QMD manually or set:

```bash
export JUMPYBRAIN_QMD_BIN=/path/to/qmd
```

Resolution order for local/server runtime use:

1. `JUMPYBRAIN_QMD_BIN`
2. bundled/package-local `node_modules/.bin/qmd` when present
3. `qmd` on `PATH`

An incompatible explicit `JUMPYBRAIN_QMD_BIN` or package-local QMD is rejected rather than silently bypassed. A copied executable without its SDK is insufficient. `--skip-qmd-install` leaves missing/incompatible QMD uninstalled and skips the initial index; remote-only clients do not need local QMD. Updates recheck the dependency but do not rebuild memory automatically.

Indexing defaults to lexical; [explicit semantic setup](cli-commands.md#indexing-policy-and-recovery) persists policy in root `jumpybrain.json`. No model is downloaded by recall/status. QMD-derived files live under `<memory-root>/.jumpybrain/`; deleting them retains canonical Markdown and policy. Stop operations before deletion and follow [recovery limits](technical.md#readiness-and-recovery).

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
npm install -g @tobilu/qmd@2.8.3
node scripts/qmd-install-check.mjs qmd
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
