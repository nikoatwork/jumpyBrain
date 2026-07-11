# Open-Source Security and Documentation Must-Fixes

## Completion summary

Completed the `0.1.0` release-readiness audit: revoked and verified the exposed credential, validated replacement production authentication, made uninstall ownership fail closed, replaced misleading onboarding with tested progressive documentation, corrected source architecture references, and replaced the public repository with one Gitleaks-clean snapshot. The rewritten remote was verified from a fresh clone with installer safety tests, package/audit/link checks, and historical-credential invalidation. The offline pre-rewrite bundle remains the rollback record; unrelated clones, forks, caches, and third-party archives cannot be recalled.

## Goal

Remove the release-blocking security risk and correct documentation that currently misleads users or contributors. Keep onboarding concise, runnable, and aligned with the current implementation.

## Notes

- Audit scope: current tree plus recent commits `1bab92e..HEAD`.
- Release status: **do not declare the repository/security posture clean until the historically published demo bearer credential is revoked and verified invalid**.
- The credential published in commit `0528678` still authenticated successfully during this audit; a bogus credential returned `401`. Never copy the credential into this task or another tracked file.
- After revocation, replace the public Git history with one reviewed clean snapshot. This reduces continued exposure but cannot erase existing clones, forks, caches, archives, or previously copied credentials.
- Baseline checks were otherwise clean: `npm audit` reported zero vulnerabilities, `npm pack --dry-run` excluded local memory/config and task files, all 175 tests passed, relative Markdown links resolved, and no other high-confidence tracked secrets or private artifacts were found.
- Preserve the user's staged `README.md` wording changes while editing documentation.
- This list intentionally excludes nice-to-have security hardening and editorial polish.

## Relevant Files

- `tasks/todo/tasks-public-sandbox-hardening.md` - Contains the currently deferred credential-revocation item; de-duplicate it after immediate rotation.
- `scripts/public-uninstall.mjs` - Currently infers ownership and deletes app/bin paths when no installer manifest exists.
- `test/install-scripts.test.js` - Installer/uninstaller safety coverage.
- `docs/install.md` - Install prerequisites, custom-root update/uninstall, and ownership claims.
- `README.md` - Main onboarding and shared-hosting entry point; currently has staged user edits.
- `docs/cloud-shared-memory.md` - Current 607-line onboarding/protocol document.
- `docs/shared-memory-protocol.md` - Detailed protocol/API reference split out of onboarding.
- `.gitignore` - Excludes the repo-root machine-local `jumpybrain.json` discovered during the audit.
- `src/architecture.docs.md` - Governing source dependency and ownership documentation.
- `src/core/canonical/canonical.docs.md` - Canonical link parsing/resolution ownership.
- `src/runtime/runtime.docs.md` - Public runtime surface.
- `src/cli/cli.docs.md` - Remote API-key source.
- `src/adapters/http-client/http-client.docs.md` - Remote transport responsibilities.
- `src/adapters/http-client/index.ts` - Actual idempotency and overview behavior.

## Tasks

- [x] 1.0 Revoke the exposed demo credential immediately
  - [x] 1.1 Rotate/revoke the bearer credential published in README history by commit `0528678`; create any replacement only in deployment-secret storage, never Git or shell examples.
  - [x] 1.2 Verify the historical credential now returns `401` on an authenticated endpoint while the intended deployment authentication still works. Historical and bogus credentials both returned `401`; after the validation deployment, the machine-configured global remote passed authenticated CLI status/tree/recall with an initialized 20-document index.
  - [x] 1.3 Remove or mark complete the deferred duplicate at `tasks/todo/tasks-public-sandbox-hardening.md` task 6.4 so the active task lists retain one source of truth.
  - [x] 1.4 Before rewriting history, create an offline backup, inventory all remote branches/tags, and coordinate the destructive force-push so contributors know existing clones and commit/PR links will be invalidated. A verified permission-restricted offline bundle is stored outside the repository; the user explicitly approved the destructive rewrite after deployment validation.
  - [x] 1.5 Build a new orphan public branch containing one reviewed clean snapshot of the intended tracked files; exclude local config, memory, indexes, logs, generated artifacts, and credentials.
  - [x] 1.6 Replace the remote default branch with the clean snapshot and remove every obsolete remote branch and tag that still retains the old object graph.
  - [~] 1.7 Ask the hosting provider to purge cached sensitive commits or unreachable objects where supported, while documenting that forks, clones, and third-party archives cannot be recalled. Skipped provider request: [GitHub's current sensitive-data-removal policy](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) says Support generally will not purge when credential rotation already mitigates the risk. All repository refs were cleaned; external copies and caches remain outside repository control.
  - [x] 1.8 Clone the rewritten repository into a fresh directory and run a full-history secret scan with Gitleaks (or an equivalent dedicated scanner); review every finding and block release on any credential, private key, or unintended private artifact.

- [x] 2.0 Make uninstall ownership checks fail closed
  - [x] 2.1 Change `scripts/public-uninstall.mjs` to refuse destructive uninstall when `install-manifest.json` is absent, malformed, unsupported, or inconsistent with the selected install root; do not synthesize ownership of `app`, `bin`, or the CLI.
  - [x] 2.2 Validate manifest-owned removal paths before deleting them, reusing the hardened installer manifest invariants where possible while explicitly allowing only recorded integration paths outside the install root.
  - [x] 2.3 Add regression tests for missing/corrupt/mismatched manifests, arbitrary manifest file paths, custom install roots, dry runs, default memory preservation, and guarded `--delete-memory` behavior.
  - [x] 2.4 Update `docs/install.md` so the ownership guarantee matches the fail-closed behavior and every uninstall example for a custom installation includes the matching `--install-root`, including `--dry-run` and `--delete-memory` examples.

- [x] 3.0 Make installation and shared-server quickstarts runnable
  - [x] 3.1 Put the required macOS/Linux shell, Node.js 22+, npm, Git, and curl/wget prerequisites immediately before the copy-paste installer command in `docs/install.md`.
  - [x] 3.2 Replace the unauthenticated `jumpybrain serve` primary example in `docs/cloud-shared-memory.md` with a self-contained API-key environment example; keep production secrets out of command-line arguments and committed files.
  - [x] 3.3 Correct the idempotency section: the CLI creates one key per command invocation but has no automatic retry loop and cannot deduplicate a separate manual retry. Remove the unsupported retry-reuse guarantee unless bounded same-key retries are actually implemented and tested.
  - [x] 3.4 Smoke-test the documented local install, update, custom-root uninstall dry run, server startup, and remote recall commands in clean temporary environments.

- [x] 4.0 Replace the bloated shared-memory entry point with progressive documentation
  - [x] 4.1 Turn the README's “Run your own shared brain” destination into a short operator quickstart that leads with prerequisites, deployment choice, API-key setup, startup, health check, and first remote recall.
  - [x] 4.2 Move the detailed HTTP schemas, route contracts, idempotency internals, error shapes, and deferred-V1 notes out of the onboarding path into a clearly named protocol/API reference; preserve durable technical content rather than deleting it.
  - [x] 4.3 Update README and deployment-guide links so new users reach the quickstart first and implementers can deliberately open the protocol reference.
  - [x] 4.4 Re-run relative-link validation and verify every copy-paste command against current CLI help and behavior.

- [x] 5.0 Bring source architecture docs up to date
  - [x] 5.1 Update `src/architecture.docs.md` with the current graph ownership chain: core canonical link extraction/resolution → app local overview/graph assembly → runtime `graphMemory` → server-memory remote packet → HTTP graph shell/JSON protocol.
  - [x] 5.2 Update `src/core/canonical/canonical.docs.md` to state its ownership of Markdown/wiki-link extraction, normalization, lookup construction, and target resolution.
  - [x] 5.3 Add `graphMemory` to the public local surface documented by `src/runtime/runtime.docs.md`, and add a runtime-boundary assertion so this exported API cannot silently drift.
  - [x] 5.4 Correct `src/cli/cli.docs.md`: remote API keys currently come only from `JUMPYBRAIN_API_KEY` in the CLI environment; no local-config fallback exists.
  - [x] 5.5 Add remote overview/tree transport and query options to `src/adapters/http-client/http-client.docs.md`.

- [x] 6.0 Run the release-readiness gate
  - [x] 6.1 Run `npm test`, `npm audit`, `npm pack --dry-run`, `git diff --check`, the full-history secret scan, and the documentation link/command checks. Final results: 195 tests pass, zero audit vulnerabilities, pack dry run excludes forbidden state, diff/link/command checks pass, and the rewritten one-commit history has zero Gitleaks findings.
  - [x] 6.2 Inspect the final tracked snapshot and package manifest for credentials, personal paths, local memory, generated indexes, logs, databases, and build artifacts.
  - [x] 6.3 From a fresh clone of the rewritten remote, confirm only the clean public history is reachable, the old demo credential is invalid, all installer safety tests pass, and the README/install/shared-memory paths work before calling the repository safe to share.
  - [x] 6.4 On completion, update `tasks/CHANGELOG.md` with the completed security/documentation result and archive this list under `tasks/done/` with a date prefix.
