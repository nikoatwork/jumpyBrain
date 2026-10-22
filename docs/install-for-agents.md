# Helping a user install jumpyBrain

Use this guide when a user asks you to install jumpyBrain locally or add the Mac app. Follow your host's tool permissions and the user's scope. The [installation guide](install.md) owns commands and prerequisites; the [FAQ](faq.md) owns privacy explanations.

## Explain the outcome first

Use a short explanation appropriate to the request:

> jumpyBrain is open source and local first. Your notes stay in a Markdown folder on your computer, and search runs locally. The app is the window for your brain; the CLI lets your agents use the same folder. No jumpyBrain account or remote memory server is needed.

When discussing privacy, add the relevant boundary: a cloud assistant may send recalled excerpts to its model provider. Remote brains, sending feedback, and user-chosen cloud file sync are separate outbound paths. Installation downloads software. Do not promise “nothing ever leaves your computer” or “data can leave only if you set up a memory server.”

## Inspect once, then use the existing installation

1. Check the OS and prerequisite versions with read-only commands. CLI needs Node 22+, npm, Git, and a shell; the Mac app needs macOS 13+, Node 22.12+, Python 3.9+, and Xcode command-line tools as well. Report missing requirements together.
2. Look for the configured CLI, `jumpybrain` on PATH, and the default `~/.jumpybrain/bin/jumpybrain`. Inspect the install manifest and installed integration's memory-root setting if present. Run `doctor` on the existing CLI. Do not print credentials or whole remote connection settings.
3. If the CLI is already installed, retain its root and configuration. For the default managed install, build Desktop from `~/.jumpybrain/app`; do not create a second clone just to add the app. Check that `scripts/setup-desktop.mjs` exists. For an old installation lacking it, use the documented update flow within the user's authorized scope.
4. If nothing is installed, use the standard local installer for agents/app + agents, or the public HTTPS checkout route for app-only. Do not use the public demo installer for private local setup. Do not invent an npm registry installation; jumpyBrain is not currently published there.
5. For custom install locations, inspect before adapting commands: desktop setup currently checks/provisions the default managed installation. Do not promise custom-root reuse that the setup script does not implement.

## Carry out the authorized request

“Install it” or “go ahead” authorizes the described installation and its necessary routine checks. Continue through that scope without repeatedly asking the same question. Ask only when information or a materially different action needs the user's decision, or when your host actually requires approval. Do not add a generic workplace-IT approval gate without an applicable device policy or user concern.

Describe concrete changes: source/runtime, dependency installation, CLI launcher, memory root, agent integrations, and the optional Mac bundle. Avoid unsupported guarantees such as “the installer only touches its own folder”: QMD and agent integrations have their own locations. Do not call an installation risk-free merely because the source is open.

If a tool blocks execution, quote or accurately summarize the actual error, distinguish it from an installer failure, and say what has and has not completed. Follow that restriction; do not disguise execution or suggest disabling security. If manual installation is permitted, provide the documented command for the user's **Terminal**, then resume verification when they report the result. Do not add an agent-specific `!` prefix to a normal shell command.

## Connect the app to the same brain

After successful desktop setup, open `~/Applications/jumpyBrain.app`. For an existing CLI brain, guide the user to **Open my local brain** and its actual memory root. The default is `~/.jumpybrain/memory`; **⌘⇧G** in the folder chooser can navigate there. Do not select the source directory `~/.jumpybrain/app` as the brain.

Explain once: there is one set of notes when both use the same folder. The app bundles program code, and app/CLI versions update separately. App folder selection does not retarget the agent. Fresh app-only setup does not install agent integrations; do not claim they are connected merely because the app opened.

If the folder choice needs the user's interaction, complete the authorized build first and give that single remaining step. Do not claim the app is connected until the selected folder has been checked.

## Verify and finish clearly

- Run the installed CLI's `doctor` and bounded `recall --root "<actual-root>" --topic "installation check" --limit 5`. For local verification, omit remote-target flags. A new brain returning no matches is normal.
- Verify the desktop bundle exists and, when available, that it launches and shows the intended folder. Separate verified build/install results from any remaining interactive onboarding.
- Report the app location, actual memory root, and installed/skipped agent integrations from observed output. Restart/reload an already-running agent to load new integrations. Do not write a sample memory merely to test a read-only setup check.
- Explain that text search is ready; optional local semantic search can be configured later. An unrelated npm update notice is not an installation failure and is not a reason to upgrade npm during this task.
- For the app, closing the window leaves the menu bar running; **Quit jumpyBrain** stops its owned services. Link the [update instructions](install.md#update) when relevant.

Do not claim that live installation, app launch, semantic search, or cloud isolation was tested unless you actually verified it. Repository instructions help an agent complete authorized work; they do not override its tool permissions.
