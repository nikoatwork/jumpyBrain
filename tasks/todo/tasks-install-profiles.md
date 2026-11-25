# Install only what each person needs

Priority: proposed, to confirm. Status: planned 2026-11-25, nothing started. Sibling list: [web viewer access](tasks-web-viewer-access.md).

## Goal

Make installation match what someone wants to do. The installer offers a few clear profiles with good defaults: keyword search with no model download, CLI-only unless the person wants the Mac app. Smart (semantic) search is an add-on someone can choose at install time or add later. Each choice is explained by what the person gets, with the technical detail (download size, disk use, what runs, what leaves the machine) underneath.

## Decisions

- 2026-11-25, owner: **QMD stays a required dependency.** It also powers keyword search, so no QMD-free backend is planned. "Lighter" means skipping the semantic model, not removing the engine.
- 2026-11-25, owner: **the drawing editor stays built in.** The 2026-11-10 "build it in" choice was revisited and kept. It costs about 4 MB of the 8.9 MB `dist` and about 1.7 MB of the compressed package. On the server it adds about 4 MB to the image, plus up to about 4 MB of RAM once a drawing is opened. Hiding the UI would not make the package leaner, and a full extension refactor is not worth the spread-out code it would touch.

## Today (investigated 2026-11-25)

- **Keyword-only search is already the default.** A brain indexes in `lexical` mode (QMD's SQLite full-text search) unless a semantic model is set up. The model (EmbeddingGemma 300M, about 334 MB) is opt-in, needs explicit consent, and is never downloaded silently. [memory-root/index.ts:91,106](../../src/core/memory-root/index.ts#L91), [model-setup.ts:8-53](../../src/adapters/qmd/model-setup.ts#L8-L53).
- The installer always builds the keyword index and prints "Local text search is ready. A semantic model is optional." There is no model choice at install time. [public-install.mjs:877](../../scripts/public-install.mjs#L877), [install.md:45,434-442](../../docs/install.md).
- The QMD engine (about 204 MiB, native packages) installs separately into `~/.jumpybrain/engines/qmd-…`. [install-support.mjs:130-188](../../scripts/install-support.mjs#L130-L188), [build-footprint.md:37-95](../../docs/build-footprint.md).
- Installer modes are separate flags: `--with-app`, `--remote-only` (fixed per install), `--integrations`, `--scope`, read-only options. `--skip-qmd-install` and `--skip-initial-index` exist but are hidden from `usage()`. There are no interactive prompts (`--yes` is reserved for them). [public-install.mjs:449-512](../../scripts/public-install.mjs#L449-L512).
- A plain agent request ("install on my Mac") means `--with-app --integrations auto`. [install-for-agents.md:16-21](../../docs/install-for-agents.md).
- The repo already uses "Lexical" for the editor library. Call the mode **keyword search** in user-facing copy.

## Proposed profiles (to confirm in 1.0)

| Profile | Who it is for | Installs |
| --- | --- | --- |
| Browse only | Reads a team brain in the browser | Nothing; see [web viewer access](tasks-web-viewer-access.md) |
| Connect my agents to a team brain | Agents use a shared brain | CLI only, remote-only (exists today) |
| Personal memory for my agents (**default CLI**) | Notes and recall on this machine | CLI + QMD with keyword search |
| Mac app | Writing and browsing on a Mac | Above + Mac app |
| Add-on: smart search | Finds paraphrases, not only matching words | About 334 MB model, local only |

## Relevant files

- `scripts/public-install.mjs`, `install-support.mjs`, `install-compatibility.mjs`, `setup-desktop.mjs`, `install.sh`, `integrations/electron/setup.mjs`
- `src/adapters/qmd/model-setup.ts`, `src/app/semantic-setup.ts`, `src/cli/memory-commands.ts`, `src/cli/usage.ts`, `src/cli/doctor.ts`
- `docs/install.md`, `docs/install-for-agents.md`, `docs/faq.md`, `docs/cli-commands.md`, `skills/` (jumpybrain-memory install guidance)

## Tasks

- [ ] 1.0 Confirm profiles and defaults
  - [ ] 1.1 **Clarify:** are the profiles in the table right? Should the Mac app offer smart search during setup, or stay keyword-only until the person turns it on?
  - [ ] 1.2 **Clarify:** should a plain agent request still mean CLI + Mac app as in `install-for-agents.md`, or the CLI-only default?
- [ ] 2.0 Smart search as a clear add-on
  - [ ] 2.1 Reuse the existing consent flow (`index --setup-semantic --download-model`) behind an installer choice and one discoverable later command. Align naming with `cli-commands.md`, and keep the old flags working.
  - [ ] 2.2 Add a matching command to switch back to keyword search and free the model's disk space.
  - [ ] 2.3 Mac app: a Settings row "Smart search: off/on" with the same explanation and a download progress state.
  - [ ] 2.4 Doctor and status say which search is active ("keyword search" or "smart search") in plain words.
- [ ] 3.0 Installer choices with good defaults
  - [ ] 3.1 Add a `--profile` option (names from 1.0) and an add-on flag (`--smart-search`). Existing flags keep working and map onto profiles. Document or retire the hidden `--skip-*` flags.
  - [ ] 3.2 Interactive mode, only when stdin is a terminal: a short menu with the default preselected, so Enter accepts. Non-interactive runs (agents, `--json`, `--yes`) use the defaults without prompting.
  - [ ] 3.3 Write outcome-first copy for each choice, with details underneath. Example: "**Smart search** — also finds notes that say the same thing in other words. Downloads a 334 MB language model once. It runs only on this computer and can be added later." Cover disk use, network use, and whether anything leaves the machine. Follow the privacy wording in `install-for-agents.md` and `faq.md`.
  - [ ] 3.4 Show the chosen plan before installing and in `--dry-run --json`. Store the profile and add-ons in the install record so updates keep them.
  - [ ] 3.5 Updates and reinstalls keep the recorded profile, offer to add or remove add-ons, and give a clear message for remote-only installs, which cannot switch mode today.
- [ ] 4.0 Verify, document, finish
  - [ ] 4.1 Tests: profile → flag mapping, stored record, non-TTY never prompts, add-on add/remove, doctor wording.
  - [ ] 4.2 Clean-machine install run for each profile on macOS, plus Linux for CLI-only. Record time, disk use and downloads in this list.
  - [ ] 4.3 Update `docs/install.md`, `install-for-agents.md`, `faq.md`, `cli-commands.md`, the jumpybrain-memory skill install section, and `docs/release-testing.md` gates. Add notes to `release-next.md`.
  - [ ] 4.4 Reread the full installer diff against this list before finalizing. Use `jumpy-loop` if install-record migration or update handling changes more than mechanically.
