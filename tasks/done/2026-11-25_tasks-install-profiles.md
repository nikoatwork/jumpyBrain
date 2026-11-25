# Install only what each person needs

Priority: done. Status: completed 2026-11-25 on branch `t3/installer-profiles` (unattended). Sibling list: [web viewer access](2026-11-25_tasks-web-viewer-access.md).

## Outcome

- The installer has four profiles: `personal` (default: CLI, keyword search, agent skills), `mac-app` (= `--with-app`), `remote` (= `--remote-only`) and `browse` (nothing to install; explains how to open a team brain). The older flags keep working and imply their profile; contradictions stop before any write.
- Smart search is an add-on (`--smart-search`, `--no-smart-search`), off by default, also for the Mac app. Later: `jumpybrain smart-search status|on|off [--remove-model]`, which reuses the `index --setup-semantic` consent flow and `index --lexical`. Both older spellings keep working.
- A terminal run without choice options shows a short menu (Enter accepts `personal`, smart search off). A rerun in a terminal asks once whether to keep or add smart search. `--json`, `--yes`, `--dry-run`, pipes (including `curl | bash`), agents, `jumpybrain update` and `npm run desktop:setup` never ask.
- Every run prints the chosen plan first: what you get, then installs, what runs and network use. `--dry-run --json` reports it as `plan`, and the filesystem report lists the model file and `huggingface.co`. `install-manifest.json` records `profile` and `addOns.smartSearch`. Reruns, `jumpybrain update` and the Mac GUI updater keep them. The brain's own policy stays the source of truth.
- `status` and `doctor` print `Search: keyword search` or `Search: smart search …`, and their JSON gains `search: "keyword" | "smart"`.
- Docs: install, install-for-agents, FAQ, CLI reference, glossary, release-testing gate, build footprint, module docs, README and the jumpybrain-memory setup topic. `release-next.md` has user notes.

## Goal

Make installation match what someone wants to do. The installer offers a few clear profiles with good defaults: keyword search with no model download, CLI-only unless the person wants the Mac app. Smart (semantic) search is an add-on someone can choose at install time or add later. Each choice is explained by what the person gets, with the technical detail (download size, disk use, what runs, what leaves the machine) underneath.

## Decisions

- 2026-11-25, owner: **QMD stays a required dependency.** It also powers keyword search, so no QMD-free backend is planned. "Lighter" means skipping the semantic model, not removing the engine.
- 2026-11-25, owner: **the drawing editor stays built in.** The 2026-11-10 "build it in" choice was revisited and kept. It costs about 4 MB of the 8.9 MB `dist` and about 1.7 MB of the compressed package. On the server it adds about 4 MB to the image, plus up to about 4 MB of RAM once a drawing is opened. Hiding the UI would not make the package leaner, and a full extension refactor is not worth the spread-out code it would touch.

## Decisions made on the owner's behalf (unattended, 2026-11-25)

- Profile names: `personal`, `mac-app`, `remote`, `browse`. Menu labels use the outcome wording from the table.
- `browse` installs and downloads nothing. `install.sh --profile browse` answers in the shell before fetching helpers or Node; JSON state is `not_needed`.
- Menu only on a TTY, and never for `--dry-run`. A `curl | bash` run therefore never shows it, because stdin is the script; the docs say to download and run `bash jumpybrain-install.sh` to get the menu. The menu is skipped when any choice option (`--profile`, `--with-app`, `--remote-only`, `--smart-search`, `--no-smart-search`) is given.
- `jumpybrain update` passes `--yes`: updates never ask and keep the add-on as it is. The hint says how to change it.
- A plain rerun of a `mac-app` install keeps the record but does not rebuild the app (unchanged behavior; the app updates itself, or pass `--with-app`). `--profile personal` on a `mac-app` install records `personal` and leaves the app in place, with a note.
- CLI `smart-search off` keeps the model file by default, because another brain on the computer may use it. `--remove-model` frees it. The installer's `--no-smart-search` removes the brain's own managed model file, never a custom `--semantic-model` path.
- The installer switches smart search with `index --setup-semantic --download-model` and `index --lexical`, so older release runtimes (v0.3.27) work too. A failed download or index never fails the install. A saved semantic policy whose index failed goes back to keyword search, and the retry is a remaining action (`pending_user_action`).
- On a first install, smart search is applied before `ready`, so an interrupted download is retried by a plain rerun. An interrupted `mac-app` install resumes with the app step.
- Package file budget raised from 788 to 796 for the five new files (measured 789; byte budgets unchanged).
- **Mac app Settings row deferred** (task 2.3). The Settings window could host a row, but turning smart search on from the app needs a new gateway control route. It also needs a policy-carrying index call through the backend host (index policy flags are server-local and not in the HTTP protocol), a progress channel and native verification. That is more than reasonable effort for this list. The model download now reports progress (`onProgress`, printed by the CLI) for later reuse. Follow-up: [Mac smart search setting](../todo/tasks-mac-smart-search-setting.md).

## Today (investigated 2026-11-25)

- **Keyword-only search is already the default.** A brain indexes in `lexical` mode (QMD's SQLite full-text search) unless a semantic model is set up. The model (EmbeddingGemma 300M, about 334 MB) is opt-in, needs explicit consent, and is never downloaded silently. [memory-root/index.ts:91,106](../../src/core/memory-root/index.ts#L91), [model-setup.ts:8-53](../../src/adapters/qmd/model-setup.ts#L8-L53).
- The installer always builds the keyword index and prints "Local text search is ready. A semantic model is optional." There is no model choice at install time. [public-install.mjs:877](../../scripts/public-install.mjs#L877), [install.md:45,434-442](../../docs/install.md).
- The QMD engine (about 204 MiB, native packages) installs separately into `~/.jumpybrain/engines/qmd-…`. [install-support.mjs:130-188](../../scripts/install-support.mjs#L130-L188), [build-footprint.md:37-95](../../docs/build-footprint.md).
- Installer modes are separate flags: `--with-app`, `--remote-only` (fixed per install), `--integrations`, `--scope`, read-only options. `--skip-qmd-install` and `--skip-initial-index` exist but are hidden from `usage()`. There are no interactive prompts (`--yes` is reserved for them). [public-install.mjs:449-512](../../scripts/public-install.mjs#L449-L512).
- A plain agent request ("install on my Mac") means `--with-app --integrations auto`. [install-for-agents.md:16-21](../../docs/install-for-agents.md).
- The repo already uses "Lexical" for the editor library. Call the mode **keyword search** in user-facing copy.

## Profiles (confirmed by the owner 2026-11-25)

| Profile | Who it is for | Installs |
| --- | --- | --- |
| Browse only | Reads a team brain in the browser | Nothing; see [web viewer access](2026-11-25_tasks-web-viewer-access.md) |
| Connect my agents to a team brain | Agents use a shared brain | CLI only, remote-only (exists today) |
| Personal memory for my agents (**default CLI**) | Notes and recall on this machine | CLI + QMD with keyword search |
| Mac app | Writing and browsing on a Mac | Above + Mac app |
| Add-on: smart search | Finds paraphrases, not only matching words | About 334 MB model, local only |

## Relevant files

Changed:

- Installer: `scripts/public-install.mjs`, new `scripts/install-profiles.mjs`, `scripts/install-support.mjs` (plan entry and network), `scripts/setup-desktop.mjs` (`--yes`), `install.sh` (helper list, `--profile` handling, browse fast path), `package.json` and `scripts/local-pack-manifest.mjs` (ship the new helper), `scripts/package-budget.mjs`, `scripts/onboarding-install-smoke.mjs`
- CLI and runtime: new `src/cli/smart-search.ts` and `src/cli/search-mode.ts`, `src/cli/{args,commands,doctor,memory-commands,remote-access-policy,update,usage,instructions}.ts`, `src/adapters/qmd/{model-setup,index}.ts`, `src/app/semantic-setup.ts`, `src/runtime/index.ts`
- Tests: new `test/installer-profiles.test.js` and `test/cli-smart-search.test.js`; `test/onboarding-install.test.js`, `test/package-footprint.test.js`
- Docs: `docs/{install,install-for-agents,faq,cli-commands,glossary,release-testing,build-footprint}.md`, `README.md`, `skills/jumpybrain-memory/SKILL.md`, `src/cli/cli.docs.md`, `src/adapters/qmd/qmd.docs.md`, `src/app/app.docs.md`, `src/runtime/runtime.docs.md`, `tasks/todo/release-next.md`
- Unchanged on purpose: `install-compatibility.mjs` (extra manifest fields are accepted as is), `integrations/electron/setup.mjs`, the GUI updater (`update-transaction.py` and `update-worker.mjs` merge into the existing manifest, so `profile` and `addOns` survive)

## Tasks

- [x] 1.0 Confirm profiles and defaults
  - Proof: owner decisions of 2026-11-25 recorded in the brief: the table as written; the Mac app setup offers smart search, off by default; a plain agent request stays CLI + Mac app.
  - [x] 1.1 Profiles as in the table. The `mac-app` menu path asks about smart search with default No.
  - [x] 1.2 A plain agent request ("install jumpyBrain on my Mac") still means `--with-app --integrations auto`. `install-for-agents.md` names it the `mac-app` profile.
- [x] 2.0 Smart search as a clear add-on
  - Proof: `node --test test/cli-smart-search.test.js` (6 pass). It covers status, consent without download, `off` keeping the model, `off --remove-model`, the old `index --lexical`/`--setup-semantic` flags, flag validation, refusing remote targets, read-only command mode, and not following a linked model directory. A manual run in a temp HOME shows the explanation and "Nothing was downloaded".
  - [x] 2.1 `jumpybrain smart-search on [--download-model | --model-file] [--rebuild]` uses the same consent flow (download progress on stderr), and so does the installer's `--smart-search`. Old flags still work; help and `cli-commands.md` are aligned.
  - [x] 2.2 `jumpybrain smart-search off [--remove-model]`. It removes only the managed SHA-named file and refuses a linked model directory.
  - [~] 2.3 Mac app Settings row: deferred. See the decision above and the [follow-up list](../todo/tasks-mac-smart-search-setting.md).
  - [x] 2.4 `status`/`doctor` print `Search: keyword search` or `Search: smart search …`; JSON has `search`.
- [x] 3.0 Installer choices with good defaults
  - Proof: `node --test test/installer-profiles.test.js` (12 pass). It covers profile mapping and conflicts, recorded and derived profiles, `shouldPrompt` and the menu through an injected terminal, no prompt over a pipe, the dry-run plan with model and network, browse (Node and shell), add/keep/remove on reruns, failed download, a failed index put back to keyword search, a killed install resumed with its request, an opt-out on resume, remote-only refusals, and `jumpybrain update` args run end to end. The menu was also checked through a real pty (`script -q /dev/null …`): Enter, Enter installed `personal` with `{"smartSearch":false}`, and a rerun asked `Add smart search? [y/N]`.
  - [x] 3.1 `--profile personal|mac-app|remote|browse`, `--smart-search`, `--no-smart-search`. The `--skip-*` flags are documented under "Advanced" in `usage()` and `install.md`. `--yes` now means "never ask".
  - [x] 3.2 Terminal-only menu with the default preselected; non-interactive runs never ask.
  - [x] 3.3 Outcome-first copy with installs / runs / network / privacy details in `install-profiles.mjs`, the CLI explanation and the docs. It follows the FAQ boundary: no notes are sent, and a cloud assistant can still send recalled excerpts.
  - [x] 3.4 The plan is printed before installing and returned as `plan` / `profile` in JSON (dry runs too). `profile` and `addOns.smartSearch` go in the manifest.
  - [x] 3.5 Reruns and updates keep the profile. A terminal rerun offers to keep or add smart search; `--smart-search`/`--no-smart-search` change it. Remote-only installs explain that the mode is fixed, and refuse other profiles or smart search with "Nothing was changed".
- [x] 4.0 Verify, document, finish
  - Proof: see Verification below.
  - [x] 4.1 Tests written and passing (see 2.0 and 3.0).
  - [/] 4.2 Clean-machine runs on macOS done (see Verification). Linux CLI-only is untested: Docker is not available locally.
  - [x] 4.3 Docs, the skill setup topic, the release-testing gate and `release-next.md` are updated.
  - [x] 4.4 Full diff reread. `jumpy-loop` ran because the install record and update handling changed (see Review).

## Verification

Tested snapshot: branch `t3/installer-profiles`, final commit reported in the parent handoff. macOS arm64 (Darwin 24.6), Node v26.7.0, QMD 2.8.3.

- `npm run build`: pass.
- Focused suite: `node --test test/install-scripts.test.js test/installer-remote-only.test.js test/installer-recovery.test.js test/installer-legacy-migration.test.js test/installer-profiles.test.js test/onboarding-install.test.js test/cli-smart-search.test.js test/semantic-model-setup.test.js test/cli-doctor-followup.test.js test/cli-help-validation.test.js test/read-only-command-mode.test.js test/remote-access-policy.test.js test/desktop-updater.test.js test/desktop-updater-readiness.test.js test/electron-setup.test.js test/package-entrypoints.test.js test/package-footprint.test.js test/uninstall-shell.test.js test/instructions-topics.test.js test/feedback-cli.test.js test/local-pack-scripts.test.js test/macos-companion-update.test.js test/architecture-boundaries.test.js`: 240/240 pass. Also `test/local-pack-properties.test.js` and `test/macos-companion-menu.test.js` passed earlier in the session.
- First-run fixes: the package file budget (789 > 788) was raised with a measured note; the onboarding expectation now reads "Keyword search is ready"; the skill stays under its 5,500-byte budget.
- Clean-machine runs (temp HOME; PATH limited to node/npm/npx/python3/git plus `/usr/bin:/bin`, no QMD on PATH; npm cache warm, so times are lower bounds):
  - `personal`, published release v0.3.27: 10.9 s, `ready`, doctor + recall verified. 226 MB on disk (runtime 21 MB, private engine 205 MB, brain 152 KB). Downloads from api.github.com, github.com and registry.npmjs.org (dependencies and engine).
  - `personal` from this branch as `--source` (npm ci + build): 20.7 s, `ready`, 241 MB (source-built runtime 36 MB). The installed CLI's `doctor` and `smart-search` say "keyword search".
  - `remote`, release: 1.6 s, `ready`, 11 MB, dependencies omitted. Downloads from api.github.com and github.com only.
  - `mac-app --smart-search`: `--dry-run --json` only: `planned`, with `mac-app` and `smart-search-model` creates and huggingface.co in `network`. Nothing was written.
  - `personal --smart-search`: `--dry-run --json` only, as above. The 334 MB model was not downloaded (allowed by the brief).
  - `browse`: `install.sh --profile browse --json` returns `not_needed` without contacting anything (tested with an unreachable raw base).
- Interactive menu checked through a real pty, as described under 3.0.

## Review

`jumpy-loop`: 4 rounds with one read-only reviewer from another provider (high effort). Round 1 found 11 findings, round 3 found 2 more, and round 4 found 1 more; the last finding (report labels for an already absent or kept model) was fixed without a fifth round because it changes only report output. Fixed: resuming an interrupted install keeps its choices; the add-on state is recorded only after it is applied; compatible index flags for older runtimes; removal never follows a linked directory and removes only the brain's managed model; `smart-search on --rebuild`; `desktop:setup` passes `--yes`; the last `--profile` wins in `install.sh` and browse JSON matches the installer's plan; an opt-out on resume runs before the initial index; the plan names the brain's own model file; skipped cleanup is reported in text; the update test now runs the real update plan. Declined findings are listed below.

## Remaining limits and follow-ups

- Mac app Settings row "Smart search: off/on" with progress: not built ([follow-up](../todo/tasks-mac-smart-search-setting.md)).
- Linux CLI-only clean install: untested (no local Docker).
- A real model download, semantic indexing and `scripts/semantic-index-smoke.mjs` were not run. `smart-search on --download-model` reuses the existing provisioning and index code; only the consent, `off` and removal paths were exercised.
- A full `mac-app` install (app build) was not run in a temp HOME, to avoid touching the running app and system services. Dry run only.
- Declined review findings (follow-ups):
  - `jumpybrain update` paired Mac path rejecting a default release install with an absent ref. This predates the change; the reviewer confirmed.
  - An installer `--no-smart-search` rerun on a brain whose semantic model is missing can fail the existing read-only candidate verification before switching. `jumpybrain smart-search off` is the repair.
  - A TTY run of a downloaded script on a machine without Node 22.12+ provisions private Node before the menu, so choosing Browse leaves that runtime.
- `curl | bash` never shows the menu (stdin is the script); documented.
- Uninstall leaves `~/.jumpybrain/models`; documented.
