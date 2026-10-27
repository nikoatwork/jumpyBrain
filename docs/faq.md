# Installation and privacy FAQ

## Is jumpyBrain local first? Is it open source?

Yes. jumpyBrain is [MIT-licensed open source](../LICENSE). A local brain is a folder of Markdown files on your computer. Writing, indexing, and searching that folder run locally. Local use requires no jumpyBrain account, subscription, or remote memory server. Installing the app or CLI does not upload your brain or enable cloud sync.

You can inspect, edit, move, and back up those files yourself. Search indexes and embeddings are derived data that can be rebuilt.

## When can data leave my computer?

Local storage and search stay local. These are the separate ways network services can be involved:

- **Installation and updates:** GitHub, npm, and dependency download hosts supply code and packages. This is software downloading, not a brain-upload step. Optional semantic search needs a separately provisioned model; inference then runs locally.
- **A remote brain you choose:** adding/selecting a remote connection in the app or using the CLI's `--target-url` sends requests to that server. Searches send queries; writes send their content. The server stores that brain. Connecting does not automatically upload or sync your personal brain. Remote writes require explicit authorization.
- **Your AI assistant:** when an agent recalls notes, the results enter its context. If that agent uses a cloud model, those excerpts can go to its provider under the agent's settings and policies. jumpyBrain's local storage does not make a cloud assistant run locally.
- **Feedback you send:** choosing Send shares your message and, when **Include logs** is checked, a sanitized diagnostic attachment with the jumpyBrain support service. The information icon explains the logs; uncheck the box to exclude them. Opening the dialog does not send a report. Do not put private notes into the message unless you intend to share them.
- **Services you choose for your files:** iCloud Drive, Dropbox, Git remotes, backups, or other tools may upload a brain stored in their folders or explicitly shared through them.

For local-only memory use, choose a local folder outside cloud sync and keep the app/CLI pointed at it. For an entirely local AI workflow as well, use an assistant/model that runs locally. There is no need to set up a shared memory server.

## Does the app's “server” mean my notes are online?

No. The Mac app starts local services bound to `127.0.0.1` (also called loopback/localhost) so its editor can work with your files. Those services are on your computer. A deliberately deployed shared server is a separate setup.

Closing the window leaves the app running in the menu bar. **Quit jumpyBrain** saves open editors and stops its owned services. Independently installed CLI commands still work with local files after quitting the app.

## Are the app and CLI two versions of my brain?

They are two ways to work with the **same folder of notes**. The app is a window for writing and browsing. The CLI lets agents remember and recall. Point both at the same folder and there is one canonical set of Markdown files, with no import, copying, or sync needed between them.

There are separate copies of program code: the Mac app bundles a runtime, while the CLI has its own installation. The sidebar update icon coordinates the app and the supported default managed CLI at one published release. Custom/pinned CLI installations retain their policy through the explicit app-only update choice. Settings shows the installed app version; `jumpybrain --version` shows the CLI version. Separate program copies do not duplicate your notes. See the [update instructions](install.md#update).

If you used the default CLI installer, [build the app from the existing installation](install.md#macos-desktop-app-beta), then choose `~/.jumpybrain/memory` in onboarding. Changing the app's selected folder does not automatically change an agent's target.

## What gets installed, and where?

For the default CLI installation:

- `~/.jumpybrain/memory`: your Markdown brain and its derived search state.
- `~/.jumpybrain/app`: jumpyBrain source and compiled CLI/runtime code.
- `~/.jumpybrain/bin/jumpybrain`: the CLI launcher.
- `~/.jumpybrain/install-manifest.json`: install locations and update source.
- Detected agent skill/extension files in their supported directories; see the [full list](install.md#fast-path-installer-script).

The installer also verifies or installs QMD, the local search dependency, through npm's global package location. Desktop setup adds `~/Applications/jumpyBrain.app` and app settings under `~/Library/Application Support/`. It downloads build dependencies and needs the [documented Mac prerequisites](install.md#macos-desktop-app-beta).

“Global” installation means across projects for this user on this computer. It does **not** mean global/team/cloud memory. “CLI policy: not configured” means no optional remote write restrictions have been recorded, not that a remote connection exists.

## Do I need both? Do I need a GitHub account?

Use the CLI for agents; the desktop app is optional. Use the Mac app for a graphical editor; its setup provisions the CLI/search prerequisites, and agent integrations are optional. Neither route needs a jumpyBrain account. The public repository can be cloned over HTTPS without a GitHub account or SSH key.

The Mac beta currently builds from source with developer tools. It is locally ad-hoc signed, not a notarized one-click download. See [installation](install.md) for the supported commands; Linux users can use the CLI.

## Will my agent read all my files or send every note into every prompt?

jumpyBrain searches the selected memory root. Installing its integration gives the agent instructions/tools for recall and capture; it does not import your whole disk or automatically inject the whole brain. The agent can retrieve relevant excerpts and expand evidence when needed. The agent's own filesystem permissions and other tools are separate from jumpyBrain.

Memory writes follow the integration's authorization rules. Installing a skill does not by itself authorize writing global/team/remote memory. See [agent workflows](agent-workflows.md).

## Why does it say “embeddings disabled” or return no matches?

A new brain is empty, so no matches is expected. Text search works immediately without a model or API key. “Embeddings disabled” means optional semantic search is not enabled, not that installation failed. You can [configure a local embedding model](cli-commands.md#indexing-policy-and-recovery) later. Normal recall/status does not download models.

Restart/reload an already-running agent after installing its integration. If it cannot find the command, use the full path printed by the installer, normally `~/.jumpybrain/bin/jumpybrain`.

## My assistant says installation is blocked. What now?

An assistant's tool permissions are separate from jumpyBrain. A tool-policy denial does not establish that the installer is malicious, and reading the script does not prove all downloaded dependencies are safe. The assistant should report the actual denial and which steps completed. If its policy permits a manual installation, use the documented command in your own Terminal. Do not disable security controls or disguise commands to evade a restriction.

An organization's actual device policy still applies. There is no additional company-system integration in the standard local install.

## Can I uninstall without losing my notes?

Yes. The [CLI uninstaller](install.md#uninstall) keeps memory by default; deleting memory requires a separate explicit option. For the Mac app, disable **Start at Login**, quit, and move `~/Applications/jumpyBrain.app` to Trash. Your brain folders and separately installed CLI remain. Keep the Markdown folder if you want to continue using the notes elsewhere.
