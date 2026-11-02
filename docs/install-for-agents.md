# Helping a user install jumpyBrain

Use this guide when a user asks you to install jumpyBrain locally or add the Mac app. Follow your host's tool permissions and the user's scope. The [installation guide](install.md) owns commands and prerequisites; the [FAQ](faq.md) owns privacy explanations.

## Explain the outcome first

Use a short explanation appropriate to the request:

> jumpyBrain is open source and local first. Your notes stay in a Markdown folder on your computer, and search runs locally. The app is the window for your brain; the CLI lets your agents use the same folder. No jumpyBrain account or remote memory server is needed.

When discussing privacy, add the relevant boundary: a cloud assistant may send recalled excerpts to its model provider. Remote brains, sending feedback, and user-chosen cloud file sync are separate outbound paths. Installation downloads software. Do not promise “nothing ever leaves your computer” or “data can leave only if you set up a memory server.”

## Inspect once, then use the existing installation

1. Inspect OS/architecture and existing `jumpybrain` / `~/.jumpybrain/bin/jumpybrain`, manifest, root and integration settings without printing credentials.
2. For a fresh local install, use the documented bootstrap with `--json`. A general “install jumpyBrain on my Mac” request means app + agents: include `--with-app --integrations auto` unless the user asks for CLI-only or remote-only use. On Linux, install the CLI and detected integrations. It can provision a private Node runtime and missing private QMD without sudo. Mac app builds still need Python 3.9+, Xcode command-line tools and macOS 13+; report all blockers together. Apple’s tools installer can require a human action.
3. For an existing default CLI, rerun the bootstrap with `--with-app --json` to add the app using the same runtime/root. Preserve pinned/custom source choices. For ordinary app updates use the paired update flow below.
4. Read the structured result, not just exit status: `planned` is a dry run, `pending_user_action` identifies a remaining action, and a failed required check exits nonzero. The installer verifies doctor/recall and requested Desktop readiness; inspect which checks actually ran. No sample memory is necessary.
5. Retry the same command after fixing a reported failure. Do not delete canonical notes or adopt unowned directories to repair installation. The bootstrap never implicitly executes a current-directory installer; trusted development setup requires explicit `--source`.
6. Combined Desktop setup currently requires the default managed installation. Custom CLI roots remain independent. Remote-only users can select `--remote-only`, which creates neither local QMD nor a memory root and installs no local-brain integrations.

Use `doctor --root "<actual-root>" --check --json` on current versions: required-check failures exit nonzero while preserving the report. Default `doctor` retains exit 0 for compatibility; on older versions inspect JSON `ok` and findings. Doctor checks version/root readiness and integration-file presence, not actual retrieval or host activation. A dry-run summary is a plan, not an installation. Do not hand setup back as complete until the actual CLI and local recall work. An empty new brain is a successful search check; do not save a sample memory unless the user asks.

## Name human and agent clients

Mac onboarding offers an optional display name; Settings → Your name can change or clear it. CLI-only setup can use `jumpybrain identity --name 'Alex'` with the user's supplied name. Do not guess it from an OS account. The local preference is shared with the Mac app on that machine, independent of the selected brain.

Configure each agent host with its own `JUMPYBRAIN_CLIENT_NAME` (for example `Codex`), or pass `--actor-name Codex` alongside `--actor agent` on remember/update. With owner Alex, future writes are labeled `Alex · Codex`; unnamed clients can say `Alex · Agent`. Live `collaborate` uses that environment label too. Names are declarations, not verified accounts or permissions. No notes are backfilled or written merely by setup. See [CLI details](cli-commands.md#recognizing-notes-in-search).

## Carry out the authorized request

“Install it” or “go ahead” authorizes the described installation and its necessary routine checks. Continue through that scope without repeatedly asking the same question. Ask only when information or a materially different action needs the user's decision, or when your host actually requires approval. Do not add a generic workplace-IT approval gate without an applicable device policy or user concern.

Describe concrete changes: source/runtime, dependency installation, CLI launcher, memory root, agent integrations, and the optional Mac bundle. Avoid unsupported guarantees such as “the installer only touches its own folder”: QMD and agent integrations have their own locations. Do not call an installation risk-free merely because the source is open.

If a tool blocks execution, quote or accurately summarize the actual error, distinguish it from an installer failure, and say what has and has not completed. Follow that restriction; do not disguise execution or suggest disabling security. If manual installation is permitted, provide the documented command for the user's **Terminal**, then resume verification when they report the result. Do not add an agent-specific `!` prefix to a normal shell command.

## Connect the app to the same brain

With the combined installer, fresh authorized setup verifies the app profile against the CLI root and completes redundant local-folder onboarding. Report the observed shared folder and app location. Existing app profiles are preserved; if a different local/remote brain is active, resolve the explicitly reported mismatch rather than silently retargeting it.

For older or manual source setup that still opens onboarding, check the suggested folder matches the CLI root, then choose **Open my notes** or **Use a different folder…**. Complete all independent installation work before handing back that interactive step. Do not claim the app is connected until the root is verified.

Explain once: there is one set of notes when both use the same folder. The app bundles program code. Ordinary updates coordinate a supported default managed app/CLI pair; CLI-only and custom/pinned installations retain their explicit policies. App folder selection does not retarget the agent. Fresh app-only setup does not install agent integrations; do not claim they are connected merely because the app opened.

If the folder choice needs the user's interaction, complete the authorized build first and give that single remaining step. Do not claim the app is connected until the selected folder has been checked.

## Verify and finish clearly

- Run the installed CLI's `doctor --root "<actual-root>" --check` and bounded `recall --root "<actual-root>" --topic "installation check" --limit 5`. For local verification, omit remote-target flags. A new brain returning no matches is normal. On older versions without `--check`, inspect `doctor --json` instead of treating exit 0 as success.
- Verify the desktop bundle exists and, when available, that it launches and shows the intended folder. Separate verified build/install results from any remaining interactive onboarding.
- Report the app location, actual memory root, and installed/skipped agent integrations from observed output. Restart/reload an already-running agent to load new integrations. Do not write a sample memory merely to test a read-only setup check.
- Explain that text search is ready; optional local semantic search can be configured later. An unrelated npm update notice is not an installation failure and is not a reason to upgrade npm during this task.
- For the app, closing the window leaves the menu bar running; **Quit jumpyBrain** stops its owned services. Link the [update instructions](install.md#update) when relevant.

Do not claim that live installation, app launch, semantic search, or cloud isolation was tested unless you actually verified it. Repository instructions help an agent complete authorized work; they do not override its tool permissions.

## Subsequent Mac updates

Use the installed app’s sidebar **Download update** icon for ordinary Mac updates. It prepares a published release in the background, coordinates a supported managed CLI, and becomes **Relaunch to apply update** when ready. No update popup is needed. `jumpybrain update` uses the same operation for that pair: an open app reports prepared/restart-needed; a closed app installs both and verifies startup. The app waits for all-tab saves before relaunch. Explain its app-only choice for custom/pinned/missing CLIs without changing their source or ref. Inspect the reported app/runtime/CLI versions after completion; do not report success from only one component. Use the documented CLI/source workflows for CLI-only/developer installs or the one-time bootstrap of older apps lacking this flow (`npm run desktop:setup` after quitting). Never infer release publication from a request to update the installed app.
