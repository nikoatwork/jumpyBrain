# CLI Installer Update Command

## Goal

Add a lightweight short-term update path for MVP users who installed jumpyBrain through the existing installer. Users should be able to run `jumpybrain update` to refresh the installed app from the configured Git source/ref while preserving their Markdown memory and integrations. The work should stay installer-based and avoid npm publishing or long-term release-channel complexity.

## Notes

- This is the short-term MVP variant only: no npm publish workflow, no global package-manager self-update, no hosted release service.
- The current manual update path is re-running `install.sh`; `jumpybrain update` should formalize that path and make it discoverable.
- Markdown memory must remain canonical and preserved. Updating the CLI/app must not rewrite or migrate memory content except through existing compatible `init` behavior.
- Keep the implementation at the CLI/installer edge. Do not add update logic to `src/core/`, app memory use cases, QMD adapter code, runtime memory operations, or server memory semantics.
- Avoid noisy network behavior. Any update-available notice should be low-frequency, best-effort, disableable, and must not corrupt JSON command output.
- Preserve the stable CLI contract and keep `src/cli.ts` as a shim; new command behavior belongs in focused `src/cli/` modules.

## Relevant Files

- `src/cli/commands.ts`, `src/cli/usage.ts` - Add the user-facing `update` command/help and, if included, a lightweight update-available notice hook.
- `scripts/public-install.mjs` - Existing installer implementation that replaces the app, rebuilds the CLI, rewrites integrations, initializes memory idempotently, and writes the install manifest.
- `install.sh` - Existing shell bootstrapper used by public docs and likely by the update command.
- `docs/install.md` - Document manual update fallback and the new `jumpybrain update` command.
- `docs/technical.md` - Mention the installer-owned update boundary if architecture docs need a short note.
- `test/install-scripts.test.js` - Extend installer/update coverage around manifest fields and preservation behavior.
- `test/` - Add CLI help/contract coverage for the new command if not already covered by the architecture cleanup smoke tests.
- `package.json` - Keep `private: true`; do not add npm publishing scripts for this ticket.

## Decisions

- Use the installer as the update mechanism for MVP.
- `jumpybrain update` should preserve the install root, memory root, scope, source/ref, and integration choices from the installer manifest when available.
- If the CLI was not installed by the public installer, `jumpybrain update` should fail safely with a clear manual instruction rather than guessing.
- Update checks/notices, if implemented in this ticket, should be advisory only and never block normal CLI commands.
- Do not introduce npm package publishing as part of this ticket.

## Tasks

- [x] 1.0 Define the installer update contract
  - [x] 1.1 Inspect the current `install-manifest.json` shape and identify the minimum extra metadata needed for safe updates: installed version, source, ref, scope, memory root, install root, integration mode, and created/updated timestamps.
  - [x] 1.2 Decide how `jumpybrain update` locates the manifest, defaulting to `~/.jumpybrain/install-manifest.json` with an escape hatch such as `--install-root` for tests/nonstandard installs.
  - [x] 1.3 Define safe failure behavior for source/dev/npm-linked installs where no installer manifest exists.

- [x] 2.0 Extend installer manifest metadata without changing memory semantics
  - [x] 2.1 Update `scripts/public-install.mjs` to persist update-relevant metadata in the manifest.
  - [x] 2.2 Preserve compatibility with older manifests by applying sensible defaults during update.
  - [x] 2.3 Ensure rerunning the installer continues to preserve existing memory roots and integration paths.

- [x] 3.0 Add `jumpybrain update`
  - [x] 3.1 Add `update` to CLI command parsing and help text in the focused `src/cli/` modules.
  - [x] 3.2 Implement the command as a thin installer-edge operation that re-invokes the public installer with the manifest-derived options.
  - [x] 3.3 Support `--dry-run` so users and tests can see the planned update without replacing the app.
  - [x] 3.4 Print clear success/failure output, including the preserved memory root and the command used or equivalent update source.
  - [x] 3.5 Avoid importing update logic into `core`, app memory use cases, `runtime`, `server`, or QMD adapter modules.

- [x] 4.0 Add lightweight update-available notice if it stays simple
  - [x] 4.1 Add a best-effort check that compares installed version/ref with the configured GitHub branch or installer source.
  - [x] 4.2 Cache update-check results under installer-owned support state, e.g. `~/.jumpybrain/update-check.json`, with a conservative interval such as 24 hours.
  - [x] 4.3 Never print notices during `--json` commands; use stderr for human commands only.
  - [x] 4.4 Add `JUMPYBRAIN_NO_UPDATE_CHECK=1` or equivalent to disable checks.
  - [x] 4.5 If this becomes more than a small helper, defer the notice and ship only `jumpybrain update` first.

- [x] 5.0 Test the update path
  - [x] 5.1 Add tests that install into a temporary root, create/preserve a memory root, then run the update path against a local source checkout.
  - [x] 5.2 Verify older/minimal manifests either update safely or produce a clear actionable error.
  - [x] 5.3 Verify `jumpybrain update --dry-run` does not mutate the install root or memory root.
  - [x] 5.4 Verify CLI help includes `update` and JSON command output is not polluted by update notices.
  - [x] 5.5 Run the normal validation suite and any packaging/install smoke checks used by the architecture cleanup story.

- [x] 6.0 Document the MVP update workflow
  - [x] 6.1 Update `docs/install.md` with `jumpybrain update` and the manual fallback of re-running the installer.
  - [x] 6.2 Note that npm publishing/self-update is intentionally out of scope for the MVP.
  - [x] 6.3 Add a short troubleshooting note for non-installer/source installs.

## Completion Note

Completed on 2026-07-04. `jumpybrain update` now reads the installer manifest, supports `--dry-run` and `--install-root`, reruns the public installer with preserved install root, memory root, source/ref, scope, integrations, and installer options, and fails safely for source/dev installs without a manifest. Docs and deterministic install/CLI tests were updated.

## Non-Tasks

- Do not publish to npm.
- Do not add release channels, hosted update APIs, accounts, or package-manager detection beyond what is needed for the installer path.
- Do not migrate or rewrite Markdown memory as part of updating the app.
- Do not add server-side update behavior for hosted memory deployments.
- Do not update `tasks/CHANGELOG.md` until the implementation is completed/finalized.
