# Harden Installer Reruns and Refresh Demo Docs Followup

## Completion Summary

Hardened managed installer reruns so recorded refs and strict manifest ownership remain authoritative, narrowed the README demo-host guard to exact approved URL occurrences, and kept the live demo auth redesign in its existing task. Validation passed with 175 tests. The previously published credential remains active at the deployment boundary, so revocation and verification were consolidated into `tasks/todo/tasks-public-sandbox-hardening.md` rather than duplicating that work here.

## Goal

Close the installer ownership/ref safety gaps and remove the public demo credential/guard exceptions introduced or exposed by this commit. Keep reruns app/CLI-only without adding another update abstraction.

## Notes

- Review target: `HEAD` (`Harden installer reruns and refresh demo docs`).
- Do not change memory, configuration, indexes, or integrations during managed reruns.
- `tasks/todo/tasks-public-sandbox-hardening.md` already plans anonymous, rate-limited demo access; reuse that work rather than creating a second demo-auth design.
- The working tree already contains unrelated, unstaged README changes that remove the embedded key. Preserve and coordinate with those changes during execution.
- Do not update `tasks/CHANGELOG.md` until this followup is completed/archived.

## Relevant Files

- `install.sh` - Uses the default branch to download the installer without overriding a managed install's recorded ref.
- `scripts/public-install.mjs` - Selects update source/ref and strictly validates manifest ownership before replacing app/CLI files.
- `scripts/precommit-guard.mjs` - Removes only exact approved README demo URL occurrences before scanning for personal deployment hosts.
- `README.md` - Current demo links and examples contain no bearer credential and retain the public-data warning.
- `docs/install.md` - Documents recorded-ref preservation and intentional overrides.
- `test/install-scripts.test.js` - Covers pinned reruns, invalid manifests, and failed-update preservation.
- `test/precommit-guard.test.js` - Covers mixed allowed/disallowed URLs on one README line.
- `tasks/todo/tasks-public-sandbox-hardening.md` - Owns the remaining live credential rotation after no-auth demo mode ships.
- `tasks/CHANGELOG.md` - Records the completed repository hardening in one concise entry.

## Tasks

- [x] 1.0 Preserve pinned refs on copy-paste installer reruns
  - [x] 1.1 Change `install.sh` so its default branch is used to download the installer but is not treated as an explicitly requested update ref; pass `--ref` only when the caller intentionally sets `JUMPYBRAIN_INSTALL_REF` or a CLI ref.
  - [x] 1.2 Keep `scripts/public-install.mjs` manifest-first for existing installs so an install pinned to a tag or commit does not silently move to mutable `master`.
  - [x] 1.3 Add a contract case for a managed install with a non-default recorded ref rerun through the shell-wrapper semantics, and confirm `docs/install.md` accurately describes explicit ref overrides.

- [x] 2.0 Make the manifest a real overwrite-ownership boundary
  - [x] 2.1 In `readInstallManifest`, require the supported manifest version, installer identifier, and all ownership-critical path fields (`installRoot`, `appDir`, `binDir`, and `cliPath`) instead of accepting missing fields.
  - [x] 2.2 Validate required field types before calling `path.resolve`; reject incomplete, malformed, unsupported-version, or path-mismatched manifests without touching app/CLI files.
  - [x] 2.3 Avoid silent coercion of invalid persisted `scope` or `integrationMode`; either validate supported values or preserve a documented migration path explicitly.
  - [x] 2.4 Add focused refusal cases proving a marker-only manifest and an unsupported manifest version cannot authorize replacement of an existing app.

- [x] 3.0 Narrow the precommit demo-host allowance
  - [x] 3.1 Replace the whole-line `isAllowedPublicDemoReference` bypass with exact-match filtering for only the approved demo URL occurrence, or remove the exception once the generic personal-domain rule can express an allowlisted host safely.
  - [x] 3.2 Confirm a README line containing both the allowed demo host and any other personal deployment URL still reports the disallowed URL.
  - [x] 3.3 Keep the implementation data-driven and small; avoid adding another path/host-specific branching layer.

- [x] 4.0 Remove the published writable bearer credential from repository surfaces
  - [x] 4.1 Confirm the current README links and examples do not embed a bearer key; coordinate server/CLI behavior with `tasks-public-sandbox-hardening.md` rather than duplicating that implementation here.
  - [~] 4.2 Rotate/revoke the previously published credential after the no-key route is live. Consolidated into `tasks/todo/tasks-public-sandbox-hardening.md` item 6.4 because the live key still authenticates and deployment changes belong to that existing task.
  - [x] 4.3 Keep the warning that the demo is public, disposable, rate-limited, and unsuitable for private information.

- [x] 5.0 Validate the followup
  - [x] 5.1 Run `npm test`; all 175 tests pass and the canonical installer-documentation contract reflects the supported install command.
  - [x] 5.2 Exercise a failed managed update and confirm the previous app/CLI remains usable and no memory/integration paths are rewritten.
