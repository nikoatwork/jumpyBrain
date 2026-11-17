# Synthetic user 2: add Desktop to the same local brain

Date: 2026-10-24. Persona: nontechnical Mac user whose agent already created `~/.jumpybrain/memory`. Goal: add Desktop, select that folder, write/save/find a note, understand app versus CLI targeting. Secondary: app-only creation.

## Result and scope

**PASS for the exercised editor/save/search/CLI round trip and isolated Desktop connection flow. PARTIAL for onboarding: the real sandboxed welcome window opened an existing brain and created a new one, using injected folder-picker/control seams. Native installed-app first launch and installation remain UNTESTED.** No observed data-loss, save, or search bug in these checks. Main findings are discoverability and recovery-copy gaps, below.

Only this report was added to the checkout. No source/docs/tasks changes, build, commit, global install, real app launch, real memory/config changes, feedback submission, release, or model download. Existing unrelated edits were present and changed during the run; they were preserved. Synthetic files, HOME, browser profile, Electron user data and screenshots live under `/tmp/jumpybrain-user2-hxHyvO` (macOS resolves it to `/private/tmp/...`).

## Public discovery and expectations

Read in order: `README.md` → linked `docs/install.md` and `integrations/electron/README.md` → `docs/faq.md`. Also read required `AGENTS.md`, `docs/product-vision.md`, `docs/install-for-agents.md`. For test setup, followed Desktop guide → `docs/release-testing.md` and its disposable smoke workflow. Read `docs/cli-commands.md` and CLI help before running local commands. Implementation inspection came afterward for harness adaptation and explaining the UI findings; consulted `src/architecture.docs.md`, HTTP/browser module docs, Electron boundary docs and gateway docs.

- **PASS, duplicate-install explanation:** README gives `cd "$HOME/.jumpybrain/app"; npm run desktop:setup; open "$HOME/Applications/jumpyBrain.app"` as separate shell lines. It explicitly says no second clone/copy of notes. I would use that route for this persona, not the app-only clone route. These install/open commands were **not executed**.
- **PASS, folder instructions in docs:** installation guide names `~/.jumpybrain/memory`, gives **⌘⇧G** for the hidden path, and says Desktop selection does not change CLI/agent targets. Agent guide explicitly warns against choosing the code directory `~/.jumpybrain/app`.
- **PASS, secondary app-only discoverability:** public HTTPS clone → `npm run desktop:setup` → app launch is linked from README. No GitHub account/SSH key needed. Fresh setup provisions CLI/search dependencies without agent integrations. Actual fresh dependency installation was **not tested**.
- **PASS, privacy explanation in docs:** local Markdown and search need no account; installing does not upload the brain. Cloud-assistant recall, feedback, chosen sync folders and explicit remote brains are separate outbound paths. Local app services are loopback, not a published shared brain. Window close leaves menu bar/services running; Quit stops owned services. These lifecycle/device claims were read, not independently tested here.

## Environment and evidence strength

Base HEAD: `a50598f5f4538fa8ea5cbafa3cb6a3a9f0327fd0`, dirty shared checkout. `sw_vers`: macOS **15.7.7**, build **24G720**. Prerequisite commands observed:

```text
node --version         → v26.7.0
npm --version          → 11.19.0
git --version          → git version 2.43.0
python3 --version      → Python 3.14.7
xcrun --find swiftc    → /Library/Developer/CommandLineTools/usr/bin/swiftc
command -v qmd         → /opt/homebrew/bin/qmd
```

Reused existing `dist`, root/Electron dependencies, QMD 2.8.3 and a cached Playwright package. **This is not fresh-install or clean-source-build evidence.** Other agents were editing concurrently and `dist/cli.js` had a current timestamp; no assertion that source, compiled output and HEAD form an immutable candidate. Final SHA-256 fingerprints: `dist/cli.js` `c7f140475299559b647d454c5bbf47381315267a1f3d5a999149b92cd167c797`; `dist/server/index.js` `e00826aa0e70a6dc9fe2524efbbed6735b535b3af509ed76e66878b318c8ec0d`; `dist/runtime/index.js` `c00b67002f651613a3470630fa2fcd8e4b2ed28fa6839a13a28ca6e38b5d6747`.

## Executed steps and observed output

For commands below, exact repeated environment/root values are abbreviated as:

```sh
T=/tmp/jumpybrain-user2-hxHyvO
H=$T/home
R=$H/.jumpybrain/memory
# Each CLI/server/harness invocation used:
env HOME="$H" JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd ...
```

1. **PASS — help and synthetic existing brain.** `node dist/cli.js help` listed `init`, `doctor`, `serve`, `recall` and explicit `--root` local commands. Created only temporary HOME, then `node dist/cli.js init --root "$R" --json`. Output: `configCreated: true`, `schemaVersion: 1`, six memory directories (`notes,sessions,findings,decisions,preferences,pages`), `gitignoreUpdated: true`. This substitutes for the persona's previous agent-assisted setup; it does not test that installer.

2. **PASS — local readiness.** `node dist/cli.js doctor --root "$R" --json` → `ok: true`, CLI `0.3.8`, `QMD 2.8.3 is available.`, initialized/compatible root, freshness `fresh`, modes `["lexical"]`, embedding `disabled`. All three agent integrations report `not installed` in temporary HOME. No agent integration was installed; a healthy app/search does not prove agents are connected.

3. **PASS — isolated editor service.** `node dist/cli.js serve --root "$R" --host 127.0.0.1 --port 18972 --api-key synthetic-user2-key` → `jumpyBrain server listening on http://127.0.0.1:18972`. This is an explicit test service, not a public onboarding recommendation or installed Desktop gateway.

4. **TOOL LIMIT — T3 preview first.** `preview_status({})` → `available:false`; `preview_open` initially rejected `about:blank` with `Invalid preview URL (parse: https:; input length 11).` Retried HTTP URL; after service start, `preview_navigate` reached title `Notes · jumpyBrain`, URL `http://127.0.0.1:18972/`. Two `preview_snapshot` calls each failed: `Preview automation snapshot timed out after 15000ms.` Fallback `cua.createBrowserTab("iab",...)` → `Browser is not available: iab`. These are automation limits, not product failures.

5. **PASS — first note, save, immediate search, reload.** Used temporary script `$T/browser.mjs`, adapting the documented `scripts/note-lifecycle-smoke.mjs` and repository editor/Playwright helpers. First invocation failed before browser startup: `playwright is not installed. Run: npx playwright install chromium`. Reused an already cached package, without installing:

   ```sh
   env HOME="$H" PATH=/Users/monkey/.npm/_npx/e41f203b7505f1fb/node_modules/.bin:$PATH JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd node "$T/browser.mjs"
   ```

   Fresh browser context → local URL with synthetic API-key fragment. Empty Home visibly said **“What's on your mind?”**, **“New note”**, **“Search your memory”**, **“No notes yet. Create your first note above.”** Clicked `#home-new`, entered title **My first Desktop note**, typed **The synthetic cerulean otter prefers Tuesday walks.** through the real contenteditable helper, then blurred title/editor. Waited for actual **Saved** status. Search `cerulean otter` immediately returned the title, matching body, `Edited Today ... · You`, and relative Markdown path. Reload preserved exact body. Note ID: `mem_d172d667-a617-4b32-9acb-b615b6a2f613`.

6. **PASS — same files searchable by CLI.** `node dist/cli.js recall --root "$R" --query 'cerulean otter' --limit 5 --json` → one result with exact body, title, ID and provenance `notes/2026-10-24-october-24-2026-d172d667.md`, line 16; readiness `fresh`, lexical, embedding `disabled`; retrieval `complete`, warnings `[]`. `cat "$R"/notes/*.md` confirmed canonical Markdown title/body and the same ID. This establishes the browser/CLI same-root round trip; it does not prove app selection retargets an agent (it should not).

7. **PASS — documented disposable Desktop connection smoke.**

   ```sh
   env HOME="$H" JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd JUMPYBRAIN_SMOKE_SCREENSHOT_DIR="$T/screenshots" node scripts/connection-usability-smoke.mjs
   ```

   Exit 0. Exact final summary: `Connection flow: PASS (empty/invalid/duplicate folders, inferred name, save then explicit Switch; rename/test, selector on Home, dirty Work note flushed before switching; real loopback remote, read-only default, blank-key rename and connectivity; cancel/confirm removal keeps notes, returns to single-brain UI, both themes at 1200/480px).` Uses actual production sandboxed Electron window/gateway with disposable roots/profile and test picker/credential storage. No actual Keychain or public server. This runner does not submit feedback.

8. **PASS with seams — actual welcome window, existing brain and secondary app-only creation.** Temporary `$T/welcome.cjs` adapted only the onboarding portion of the documented Electron smoke. Launched:

   ```sh
   env -u ELECTRON_RUN_AS_NODE HOME="$H" integrations/electron/node_modules/.bin/electron "$T/welcome.cjs"
   ```

   Actual `createOnboardingWindow`, sandbox/preload/renderer and `activateLocalBrain`/runtime validation/init; isolated Electron user data. Picker return and control profile persistence/switch were injected, not native OS dialogs/real helper. Initial welcome displayed **“Choose an empty folder to start fresh, or open a jumpyBrain folder you already have.”** Disabled primary button said **Create my local brain**. Selected existing `$R` → exact resolved path, **Open my local brain →**, **“Your existing Markdown stays in place. This folder becomes the active brain in the app.”** Confirmation returned `true` and matching active root. Selected a separate empty `$T/New app brain` → **Create my local brain →** and explanation of folders/config/ignored derived state. Confirmation returned `true`; directory contained `.gitignore,decisions,findings,jumpybrain.json,notes,pages,preferences,sessions`.

   Missing-helper case rendered: **“The local helper is missing. Run npm run desktop:setup from your private Git checkout, then reopen jumpyBrain.”** This is a tested recovery screen, not an actual missing prerequisite encountered during installation. First harness attempt mistakenly required Electron by absolute package path and threw `Cannot read properties of undefined (reading 'setPath')`; stopped that test process, corrected to `require('electron')`, then reran successfully. Harness error, not product bug.

## Ranked improvements

Severity here describes user friction, not a reproduced destructive bug. No P0/P1 finding.

1. **P2 — hidden existing brain is explained in docs but not at the point of choice. Observed UI omission; abandonment/wrong-folder impact is a hypothesis.** Rendered welcome has no `~/.jumpybrain/memory` example, **⌘⇧G** hint, or distinction from `~/.jumpybrain/app`. Persona must remember the installation guide while navigating a hidden directory. Minimal fix: add “Already set up with an agent? Choose the same memory folder, usually ~/.jumpybrain/memory (⌘⇧G in the chooser). The app folder contains software.” Avoid silently assuming a custom CLI root. **Validate:** clean Mac app profile + default existing CLI brain; user follows visible hint through real native chooser, sees known synthetic note without copying; custom CLI root stays explicit; choosing app source gives safe actionable rejection.

2. **P2 — welcome confirmation does not explain CLI target independence. Observed UI omission; accidental split-brain expectation is a hypothesis.** Docs are correct, but selected-folder copy only says it becomes active “in the app.” Minimal fix: add “Your agents keep their existing folder setting. Choose that same folder to share notes.” Optionally make current app path easy to copy in Settings. **Validate:** app and CLI initially share A, switch app to B, show B clearly, CLI recall with unchanged A still finds only A's sentinel; UI/help explains how to intentionally align them. Do not mutate agent config during selection.

3. **P2 — missing-helper recovery says “private Git checkout.” Observed misleading recovery copy.** Public installation requires no private repository/access; user with existing managed CLI may unnecessarily clone or seek credentials. Minimal fix: link/cite the supported install guide and say “existing jumpyBrain installation”; give default `cd ~/.jumpybrain/app` route when appropriate, and public-source fallback when absent. **Validate:** missing-helper welcome in disposable HOME with existing managed CLI, then app-only HOME; follow rendered recovery using public access, preserve existing root and integrations, successfully reopen. No second clone for managed install.

4. **P3 — source build remains a substantial nontechnical barrier. Documented limitation, not an observed failed installation.** Node/npm/Git/Python/Xcode and local signing are required before the friendly welcome appears. Guides do state prerequisites and Xcode recovery; no fresh dependency run was attempted here. Minimal immediate fix: keep a single “Ask your agent to add Desktop to my existing brain” entrypoint with explicit prerequisites and existing-install reuse. Longer-term signed/notarized installer is a separate distribution project. **Validate:** clean supported Mac, no developer tools, one guided prerequisite assessment, complete setup once, actual signed/native first launch, same-root save/search; record download size/time and exact security prompts.

## Terms, permissions, and limits

- **Clear:** visible first-note button, empty-state instruction, Saved status, immediate text search. No missing first-note affordance observed. No model/account/API key required by the local user flow; test server key was synthetic harness authentication.
- **Potentially confusing:** “brain” means the notes root; “app” in `~/.jumpybrain/app` means source/runtime, while `~/Applications/jumpyBrain.app` is the Mac bundle. “Global” means this computer, not a team cloud. “Helper”, QMD, lexical/index and embeddings are implementation terms requiring plain recovery wording. FAQ addresses these distinctions better than the welcome screen.
- **Privacy expectation:** choosing a local folder should grant access to that folder, without import/upload/sync or enabling agent integrations. The welcome's “Nothing is uploaded” is scoped to local creation; docs correctly explain other outbound choices. No network/privacy audit was performed.
- **Native first-launch limits:** did not execute `desktop:setup`, install a bundle, launch the actual installed app, use real folder chooser/⌘⇧G, test Gatekeeper/ad-hoc signing, Keychain authorization/denial, real existing CLI manifest reuse, physical restart/login, menu bar lifecycle or app-only dependency provisioning. Welcome and connection fixtures cannot establish these gates. Native chooser permission/cancellation UX needs a real disposable installation session.
- **Evidence artifacts:** `$T/browser.mjs`, `$T/welcome.cjs`, `empty.png`, `saved.png`, `welcome.png`, and `screenshots/{one-brain,two-brains,remote-read-only,light-1200,light-480,dark-1200,dark-480}.png`. Reviewed the three welcome/empty/saved screenshots. Temporary artifacts are outside version control; the report is the durable evidence record. Test services/windows were stopped after checks; no fixes implemented.
