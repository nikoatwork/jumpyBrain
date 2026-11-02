# Installation

**jumpyBrain is open source and local first.** Your brain is a folder of Markdown files on your computer. Local writing and search need no jumpyBrain account, subscription, or remote memory server. Installing the CLI or Mac app does not upload your brain or set up cloud sync.

**The app and CLI work with the same brain folder.** The app gives you a window to write and browse; the CLI lets your agents use those files. You can use either or both. There is no note migration or second copy of your brain when both point at the same folder.

For an additional existing brain, use [`connections`](cli-commands.md#app-connections) while the Mac app runs. App selection never retargets CLI memory commands.

Choose your starting point:

- **Agents:** run the installer below. It installs the CLI, local text search, and detected agent integrations.
- **Mac app + agents:** add `--with-app` to the same command.
- **Remote CLI only:** use `--remote-only`; no local search engine or memory folder is created.

Software installation downloads code and dependencies. Your Markdown remains local. A cloud assistant may send recalled excerpts to its provider; remote brains, explicit feedback and user-chosen file sync have separate data flows. See the [FAQ](faq.md) and [agent installation guide](install-for-agents.md).

## Fast path: installer script

On macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh | bash
```

For **Mac app + agents**, including installation and readiness checks:

```sh
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh \
  | bash -s -- --with-app --json
```

The bootstrap needs a shell, curl or wget, and standard archive/checksum utilities. It reuses Node 22.12+ when available; otherwise it downloads an official Node 24 binary into `~/.jumpybrain/runtimes`, checks its SHA-256 and executable version, and uses it without changing the system Node or shell profile. Private runtime downloads support macOS/Linux arm64 and x64; execution on other platforms or incompatible Linux libraries fails explicitly. A dry run does not download/install Node. Native engine dependencies can still require platform build tools when prebuilt support is unavailable.

Fresh managed installs select one published GitHub release, including published beta releases, and verify its archive size and SHA-256 before extracting. They use compiled CLI/editor assets and the release dependency lock. Releases predating the installer assets fail with guidance; an explicitly selected trusted source remains available. Git is needed for source checkouts, not ordinary compiled CLI installation. jumpyBrain is not published to npm.

Defaults:

- runtime: `~/.jumpybrain/app`
- CLI launcher: `~/.jumpybrain/bin/jumpybrain`
- local Markdown: `~/.jumpybrain/memory`
- missing search engine: pinned CLI + SDK `@tobilu/qmd@2.8.3` under an owned `~/.jumpybrain/engines/` prefix, installed with its shipped dependency lock; no global npm install or sudo
- integrations: detected Codex, Claude Code and Pi hosts; existing unowned/customized integration files are preserved and reported
- initial lexical index, installed `doctor --check`, and bounded recall; an empty new brain is valid

A compatible explicitly selected or existing search engine can be reused. The launcher records the selected Node/QMD paths, so agents do not need to repair PATH to find the engine. Semantic models are optional and are not downloaded during setup. No sample memory is saved.

Repeat-install verification uses read-only lexical recall against the existing index; its expected read-only warnings are reported as `recallMode: verified-read-only-lexical`, while other retrieval failures still fail setup.

`--json` writes one result to stdout and progress to stderr. It reports paths, version, dependency selection, checks, installed/skipped integrations and remaining actions. States distinguish `planned`, `ready`, `pending_user_action`, `blocked` and `failed`. A successful dry run is only a plan. A required verification failure exits nonzero. Integration files do not prove that an already-running host loaded them; restart/reload that host when reported. Verification omits recalled note contents from setup logs.

To inspect the bootstrap first:

```sh
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh -o jumpybrain-install.sh
less jumpybrain-install.sh
bash jumpybrain-install.sh --dry-run --json
bash jumpybrain-install.sh --json
```

All downloaded helpers come from one resolved installer commit. The current working directory never implicitly selects executable installer code. Inspecting the shell file alone is not an audit of downloaded dependencies. For trusted local development, invoke `node scripts/public-install.mjs --source "$PWD"` explicitly.

Repeat the same command after correcting a reported failure. Fresh installs record ownership/progress before publishing program files, so a failed build/index/app setup can be retried without deleting notes or manually removing the app. Unknown layouts/locks and live concurrent installations are refused; do not remove a live lock. A lock with a verifiably dead local owner can be recovered automatically. This is process-failure recovery, not a guarantee against disk corruption or power loss.

### macOS desktop app (beta)

`--with-app` requires macOS 13+, Python 3.9+ and Xcode command-line tools; the installer reports missing requirements together before building the app. Node is handled by the bootstrap. Apple’s command-line tools installation may require user interaction. The current app is locally built and ad-hoc signed; a prebuilt, signed/notarized distribution remains separate work. Do not disable macOS security if it blocks launch.

For an existing default managed CLI, add Desktop with:

```sh
curl -fsSL https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh \
  | bash -s -- --with-app --json
```

This preserves the CLI source/ref and memory root and reuses its installed runtime. Fresh setup verifies the app’s local profile against that same folder and completes redundant folder onboarding. Existing profiles are preserved; if the app uses another brain, setup reports the mismatch rather than silently switching it. Installed versions, native-host readiness and app startup are checked. The app lives at `~/Applications/jumpyBrain.app`; closing its window leaves the menu bar running, while **Quit jumpyBrain** stops its services.

The combined flow currently requires the default `~/.jumpybrain` install location. Custom CLI roots remain supported independently. `--app-port <port>` selects a different unprivileged local helper port on first setup; existing settings are preserved. Quit an older app before replacing it. A matching running app can be verified without replacement when simply adding/rechecking Desktop.

Trusted source builds remain available with `npm run desktop:setup`; `npm run desktop:setup -- --check` only checks prerequisites. App-only setup uses `--with-app --integrations none`. Optional [executable extensions](extensions.md) require separate explicit installation.

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
--with-app                  Install and verify the Mac app with the CLI
--app-port <port>            Local Mac helper port; default 3787
--remote-only               CLI only: no local QMD, memory or integrations
--json                      Structured result on stdout; progress on stderr
--ref <git-ref>              Explicit development/source branch/tag/commit ref
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

CLI-only installations retain their recorded distribution policy: new release-based installs select a verified published release, while older/source installs preserve their source/ref. They remain CLI-only. The CLI detects custom install locations; use `--install-root <path>` to select another. A paired Mac installation with a custom/pinned/unowned CLI or explicit source/ref override stops with guidance; use the app’s explicit **Update app only** exception to preserve that policy, or keep developer CLI work in a separate CLI-only installation. Rerunning the public installer remains the source-based installer workflow; use `jumpybrain update` for coordinated unified Mac updates.

**Older standalone companion installs:** their CLI updater retains legacy shared-runtime support. Migrate to the unified Mac app with `npm run desktop:setup` after quitting the old apps; see the [migration guide](../integrations/electron/README.md#migration-from-the-two-app-beta).

For intentional CLI-only version changes, pass `--ref <ref>` or set `JUMPYBRAIN_INSTALL_REF`. The bootstrap resolves `master` to one installer commit independently; `JUMPYBRAIN_INSTALLER_REF` explicitly overrides its revision. Source/development checkouts instead use `git pull && npm install && npm run build`.

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

Local search requires **@tobilu/qmd@2.8.3**, including CLI and SDK from the same package. The installer validates both and provisions a pinned private engine when needed. It leaves unrelated global npm packages alone. Set `JUMPYBRAIN_QMD_BIN=/absolute/path/to/qmd` only to explicitly select your own supported installation; incompatible explicit selections fail visibly.

The managed launcher exports its recorded QMD path unless overridden. Runtime and doctor use the same discovery and CLI/SDK checks; fresh Desktop configuration uses the same manifest selection. Unmanaged runtime use retains explicit override, package-local QMD, then PATH precedence. Doctor does not perform inference or prove actual retrieval; the installer separately runs recall.

`--remote-only` avoids local engine and brain provisioning. Advanced `--skip-qmd-install` / `--skip-initial-index` paths report incomplete local verification rather than verified search readiness. Updates preserve canonical notes and use read-only recall verification where configured. Uninstall removes an owned private engine only when no installed Desktop depends on it; customized integrations and notes are preserved. Private Node runtime directories are retained for dependent apps and can be removed manually after all users are uninstalled.

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

For unreleased Mac app + CLI builds on your own brain, use the [local candidate workflow](local-dogfooding.md): `npm run dogfood:install`. It installs committed HEAD without a release or version bump and retains the previous software for rollback.

For dogfooding in another repo, maintainer local tarball workflows are documented in [`local-cli-builds.md`](local-cli-builds.md).

## Install/deploy paths

jumpyBrain is structured around three paths while keeping one memory system:

1. **Local runtime install:** current installer path; CLI and runtime run on the same machine as a local Markdown memory root.
2. **Hosted client use:** install the CLI and point it at a deployed jumpyBrain server with `--target-url` plus `JUMPYBRAIN_API_KEY`.
3. **Server deploy:** self-host the runtime on a VPS/server against a server-local Markdown memory root. See [`vps-deploy.md`](vps-deploy.md) or [`coolify-deploy.md`](coolify-deploy.md).

Vercel is not a supported production target for the memory server because the current server needs durable local filesystem state; see [`vercel-deploy.md`](vercel-deploy.md).

Markdown remains canonical in all paths; indexes and support state remain derived/rebuildable.
