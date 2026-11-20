# Headless remote-only installation and read-only command mode

Completed 2026-11-20. Child of [remote feedback implementation](../todo/tasks-remote-feedback-implementation.md), task 3. Source: the Nov 19, 17:50 UTC headless shared-VM report.

## Goal

Keep the single package. Make a remote-only CLI smaller and its installation side effects exact and inspectable, and add an explicit read-only command mode. No standalone binary, second package, runtime rewrite or stable HTTP API.

## Decisions

- Remote-only already selected integrations `none` and skipped QMD and the brain. That is now proven by tests and preserved, not reimplemented.
- A remote-only release install does not install runtime dependencies: the compiled CLI bundles `ws`, and `esbuild` serves only desktop extensions. Source builds keep their build step.
- The filesystem report is one structure for dry runs and real runs. A dry run never writes.
- Read-only command mode reuses the device-local policy file (`cli-config.json`, optional `commands: "read-only"`) plus a tighten-only environment variable. It is defense in depth: a reader key is the server's authority.
- Conflicting modes stop before preflight, locks or writes.
- Self-`update` is blocked in read-only command mode (its `--dry-run` is not); the installer is the operator's path. `feedback` stays allowed: it sends only the typed message and touches no memory.
- The package is not pruned after extraction. `jumpybrain update`, uninstall and the Mac updater read files from it, so trimming it would risk updater compatibility for about 9 MB.
- Showing the mode in `status`/`doctor` belongs to the parent's later access diagnostic.

## Tasks

- [x] 1. CLI guard: read-only command mode rejects state-changing commands for every target before credentials, input, network or backend work.
  - `enforceReadOnlyCommandMode` is the first step of `dispatchCli`. `isObservationalInvocation` is an explicit allowlist over every command family. Error `JUMPYBRAIN_READ_ONLY_COMMANDS`, JSON code `read_only_commands`.
- [x] 2. Installer: `--read-only-commands` / `--allow-write-commands`, early mode-conflict guards, remote-only release install without npm or `node_modules`, matching preflight.
  - Found and closed: `--remote-only` on an existing local installation used to rewrite the launcher and manifest without the recorded engine while keeping the brain. It is now refused before any change.
  - Preflight asks for npm only when it will be run, and for 256 MB instead of 1 GB for a compiled remote-only install.
- [x] 3. Installer: exact filesystem plan and outcome in JSON (`filesystem`, `commandMode`) and text; bootstrap skips engine and Mac app helpers for `--remote-only`.
- [x] 4. Focused tests and a disposable-home consumer check without QMD or Electron.
- [x] 5. Installation, CLI and module docs.
- [x] 6. Record checks and limits, archive, commit.

## Contract

- **Installer flags:** `--read-only-commands`, `--allow-write-commands`. Refused before any write: `--remote-only` with `--with-app`, `--integrations auto|all` or (fresh) `--memory-root`; `--remote-only` on a local installation; `--with-app` on a remote-only installation; both command-mode flags together.
- **JSON result, additive:** `commandMode` (`read-only` | `read-write`) and `filesystem` `{ mode: plan|applied|interrupted, node, runtimeDependencies, changes[{role,path,action,note?,present?}], retained[], untouched[{path,reason}], temporary[], network[{host,purpose}], notes[] }`. Existing fields are unchanged.
- **Policy file:** `cli-config.json` stays schema version 1. `commands: "read-only"` is written only while the mode is on, so existing files keep their bytes. Policy stays out of `install-manifest.json`; the manifest shape and launcher bytes are unchanged.
- **CLI:** `JUMPYBRAIN_READ_ONLY_COMMANDS=1|true` adds the mode for one process and cannot lift a configured one. An unreadable policy or invalid value fails closed for state-changing commands only. Observational commands do not read the policy in the new guard.
- **Bootstrap:** `install.sh` passes `JUMPYBRAIN_BOOTSTRAP_DIR` to the installer for honest reporting of its temporary directory.

## Shared files touched outside the installer

Kept minimal for the integration owner: `src/cli/commands.ts` (one import, one call at the top of dispatch), `src/cli/remote-access-policy.ts` (new guard beside the per-origin policy; `validateRemoteAccessPolicyConfig` accepts the optional key), `src/cli/update.ts` (remote-only previews print no memory root), `src/cli/cli.docs.md`, `docs/cli-commands.md`, `docs/cloud-shared-memory.md` (one sentence). `test/install-scripts.test.js`: one assertion follows the bootstrap's helper list form. `scripts/public-uninstall.mjs`: a remote-only uninstall no longer lists a brain that never existed as preserved. Gateway, connections, access-control and browser permission files are untouched.

## Verification

Tested tree: this commit, on base `94b77fc5`, macOS 15 arm64 (Darwin 24.6.0), Node 26.7.0, Python 3.14.7. One `npm ci` and `npm run build` preceded the checks; the last build followed the last source change.

- `node --test` on the files below: 275 tests, 275 passed, 0 skipped. After a final uninstall assertion and report wording change, `installer-remote-only`, `install-scripts`, `installer-recovery`, `uninstall-shell`, `installer-legacy-migration` and `package-footprint` were rerun: 64 passed.
  `read-only-command-mode`, `installer-remote-only`, `remote-access-policy`, `install-scripts`, `installer-recovery`, `installer-legacy-migration`, `onboarding-install`, `cli-help-validation`, `package-footprint`, `package-entrypoints`, `architecture-boundaries`, `access-keys`, `drawings-cli`, `boards-cli`, `attention-cli`, `installation-storage`, `uninstall-shell`, `cli-error-contracts`, `cli-baseline-contracts`, `sync-cli`, `cli-target-resolution`, `memory-cli`, `collaboration-cli`, `extensions-cli`, `project-targeting`, `cli-connections`, `feedback-cli`, `client-identity`, `local-pack-scripts`, `runtime-hygiene`, `dream-skill-distribution`, `desktop-updater`.
- An earlier run of the tree before the final report-wording changes also passed `creation-outcomes`, `logseq-migration-cli`, `obsidian-migration`, `automatic-index-cli`, `instructions-topics`, `backend-control`, `dream-handoff-cli` (part of 122 passed). Those files do not import the installer scripts changed afterwards.
- `npx tsc -p tsconfig.json --noEmit`, `git diff --check`: clean.
- New coverage in `test/installer-remote-only.test.js`:
  - consumer: remote-only install of this checkout's compiled package into a disposable home with `npm`, `qmd` and `git` replaced by recorders that were never invoked; no `node_modules`, engine, brain or agent files; the home's existing `.claude` files byte-identical; every entry left in the install root matches the report. The installed launcher then reads a real in-process server with a reader key (`status`, `tree`, `show`), the server refuses that key's write, and after `--read-only-commands` the installation refuses writes and key issuance itself even with the operator key while reads still work. `update --dry-run` from the installed CLI works without dependencies and changes nothing.
  - release path through a deterministic fetch fixture: `runtimeDependencies: omitted`, npm never run, on first install and on rerun.
  - dry runs (remote-only, local with every integration, update of an existing install): home tree hashes identical before and after.
  - mode conflicts: refused with trees unchanged.
  - policy flags: reversible, exact earlier bytes restored, per-target options independent.
  - `install.sh --remote-only --dry-run` against a helper mirror lacking the engine recipe and Mac app helper succeeds; the same mirror fails a local install.
- New coverage in `test/read-only-command-mode.test.js`: classification table; 34 local and remote mutations blocked with no root, backend or device state created; a counting HTTP server receives zero requests from blocked commands with a usable key and at least one from `status`; environment and unreadable-policy behavior.
- Manual, disposable home: `JUMPYBRAIN_RAW_BASE=file://<checkout> sh install.sh --remote-only --read-only-commands --source <checkout> --skip-build --home <scratch>` completed and printed the filesystem report; the real `~/.claude` and `~/.jumpybrain` modification times were unchanged; uninstall removed the package, launcher, policy and manifest (also asserted in the consumer test).
- Measured: `npm pack --dry-run` 3,244,614 bytes packed, 8,986,849 unpacked, 780 files (within the unchanged budgets). `node_modules/esbuild` plus `ws` in this checkout: about 10.7 MiB by `du`. Bootstrap helpers skipped for remote-only: 94,738 bytes.

## Limits

- Not run: a published GitHub release, a clean OS, Linux, Intel, the private Node download path, `npm run smoke:install`, any Mac app or paired-updater flow. The release path is proven only against the fetch fixture, and `--with-app` report entries only by reading the code.
- The `network` list is derived from the code paths taken, not from observing connections. With `JUMPYBRAIN_RAW_BASE` set it still names GitHub.
- The exact-coverage check (every created path is reported) ran for remote-only installs. For local installs the report was checked for planned integration and brain paths in a dry run, not by a full tree comparison with a real engine. The Mac app's own support state is outside the report by design.
- Read-only command mode is advisory. It does not bind the installer, the Mac app, another client, or anyone who can change the environment or policy file. A CLI older than this change does not block local writes when it meets the new key; it refuses remote commands.
- In that mode ordinary local `recall`/`search` may still repair a local brain's derived index and start its backend. `--read-only` avoids that. Remote-only installations have no local brain.
- Import previews (`migrate obsidian|logseq` without `--apply`), `delete` previews and `process --preview` are blocked along with their mutations; the allowlist follows the existing per-origin classification.
- A changed unreadable policy file now also stops local state-changing commands (previously only remote commands failed closed).
- The package is unsplit: a remote-only install still stores about 9 MB that includes docs and unused Mac app sources. Helper trimming saves transient download only.
- Uninstall keeps `software-retention.json`, its lock file, rollback copies (`app.previous-*`) and any private Node runtime; that behavior is unchanged and now documented.
- Observed, not changed: five quick reruns in a disposable home left four `app.previous-*` copies, with `storage.lastCleanup.deferred` counting them. The installer at base `94b77fc5` behaves the same, so this is the retention ledger's existing behavior in that setup, not this change. Whether it should retire them sooner was not investigated.
- The mode is not shown by `status` or `doctor` yet; the parent's access diagnostic owns that.
- Not edited, by instruction: the parent task list, feedback index and follow-ups, changelog, `release-next.md`.

## Relevant files

- `install.sh`, `scripts/public-install.mjs`, `scripts/install-support.mjs`, `scripts/public-uninstall.mjs`
- `src/cli/remote-access-policy.ts`, `src/cli/commands.ts`, `src/cli/update.ts`
- `test/read-only-command-mode.test.js`, `test/installer-remote-only.test.js`
- `docs/install.md`, `docs/install-for-agents.md`, `docs/cli-commands.md`, `docs/cloud-shared-memory.md`, `src/cli/cli.docs.md`
