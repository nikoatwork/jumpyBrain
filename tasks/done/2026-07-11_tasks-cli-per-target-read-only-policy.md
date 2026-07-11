# CLI Per-Target Read-Only Policy

## Completion Summary

Implemented installer-managed, device-local read-only policy keyed by normalized remote HTTP(S) origin. Protected targets retain explicit retrieval operations while all canonical, derived-index, and dream support-state mutations fail before credentials, input, preflight work, idempotency, or HTTP transport. Reversible installer flags, strict fail-closed config validation, custom-root shim behavior, uninstall cleanup, regression/property/integration coverage, user/maintainer documentation, and a two-target installed-device E2E are complete. This remains an advisory CLI safety control; server-side authorization is explicitly deferred.

## Goal

Add an installer-configured, device-local CLI policy that marks selected remote brain targets as read-only. For a matching target, the installed CLI must allow retrieval but reject every state-changing operation before reading stdin/files, resolving credentials, or sending HTTP requests; other remote targets and local roots remain writable.

## Notes

- This is an accidental-write safety control at the CLI layer, **not** a server authorization or security boundary. Users with server credentials can bypass it by changing local config, using another CLI installation, or calling HTTP directly.
- Read-only is opt-in and configured per remote target during installation. Existing installs and targets remain read/write by default.
- The current CLI identifies remote targets by `--target-url` / `--remote-url`; named target registries are explicitly deferred. Prefer URL/origin-keyed policy rather than introducing target names for this feature.
- “Read-only” blocks all remote state changes, not only canonical Markdown edits. This includes canonical writes, derived-index rebuilds, and dream support-state transitions.
- Markdown memory files remain canonical. The policy config is device/install configuration and must not live in a brain's `jumpybrain.json` or memory Markdown.
- Missing policy config preserves current behavior. A present but malformed/unsupported config should fail closed for remote commands so corruption cannot silently disable an expected guard.
- Keep API keys out of policy config and installer manifests.

## Architecture Fit

- Add the policy under `src/cli/`, where target selection and command semantics already live. Do not add policy checks to core, app, runtime, HTTP client, or server modules.
- Store policy in a dedicated installer-owned file such as `<install-root>/cli-config.json`. Resolve `JUMPYBRAIN_CLI_CONFIG` first, then the normal global default `~/.jumpybrain/cli-config.json`; the generated shim should set the custom-install-root path without overriding an explicitly supplied environment value.
- Key entries by a canonical HTTP(S) target origin, not by a new named-target registry. The current HTTP client uses absolute `/memories/all/...` paths, so origin is the effective server identity. Normalize scheme/host/default port/trailing slash consistently and reject credentials, query/hash identity, and non-HTTP(S) URLs. Document that DNS aliases, redirects, and proxies are distinct because this is advisory client policy.
- Enforce centrally during CLI dispatch after argument parsing and target/policy classification, but before `commandMemoryTarget()` creates an HTTP transport. This ensures rejection occurs before `JUMPYBRAIN_API_KEY` validation, stdin reads, wrapup recall preflight, dream manifest reads, idempotency-key creation, or network traffic.
- Use an explicit read allowlist for configured read-only targets so future target-aware commands fail closed until classified. Current allowed operations are `status`, `tree`/`overview`, `search`, `recall`, `show`, and `dream --status`. All other target-aware operations are rejected.
- Apply the same classifier to top-level commands and `run memory:*` recipes so aliases cannot bypass the policy.

## Proposed Config Contract

```json
{
  "schemaVersion": 1,
  "remoteTargets": [
    {
      "origin": "https://memory.example.com",
      "access": "read-only"
    }
  ]
}
```

- Omission means read/write; do not persist a redundant writable entry unless implementation evidence shows it simplifies safe updates.
- Recommended installer flags:
  - `--read-only-target <url>` — repeatable; normalize and add/upsert the target.
  - `--allow-write-target <url>` — repeatable; remove an existing read-only policy so the change is reversible through the installer.
- Reject the same normalized target appearing in both flag sets in one invocation.
- Managed installer reruns and `jumpybrain update` preserve the config unless an explicit policy flag changes it.

## Relevant Files

- `src/architecture.docs.md` - Layer direction and core/app/adapter constraints.
- `src/cli/cli.docs.md` - CLI target ownership and current named-target deferral.
- `src/cli/commands.ts` - Central top-level command dispatch and overloaded installer/document `update` handling.
- `src/cli/recipes.ts` - `run memory:*` aliases that must share enforcement.
- `src/cli/targets.ts` - `--target-url` / `--remote-url` target selection and target normalization seam.
- `src/cli/memory-target.ts` - Remote transport/API-key creation; policy rejection must happen before this boundary.
- `src/cli/memory-commands.ts` - Read and mutation command behavior, including wrapup preflight.
- `src/cli/dream.ts` - Dream status/create/complete/abandon/apply precedence and state changes.
- `src/adapters/http-client/index.ts` - Evidence for effective origin identity and remote HTTP methods; should not own policy.
- `scripts/public-install.mjs` - Installer options, managed-rerun behavior, generated CLI shim, and install manifest.
- `scripts/public-uninstall.mjs` - Installer-owned file cleanup.
- `src/cli/update.ts` - Installer-backed update preservation behavior.
- `scripts/local-pack-manifest.mjs` - Packed CLI file inventory to update for a new CLI policy module.
- `test/install-scripts.test.js` - Installer/rerun/update/uninstall test patterns.
- `test/memory-cli.test.js` and `test/document-edit-smoke.test.js` - Spawned remote server and remote command smoke patterns.
- `test/cli-target-properties.test.js` - Target equivalence/property test patterns.
- `test/architecture-boundaries.test.js` - Layer guardrails.
- `docs/install.md`, `docs/cli-commands.md`, `docs/cloud-shared-memory.md`, `docs/technical.md`, `docs/agent-workflows.md` - User and architecture documentation to update.

## Tasks

- [x] 1.0 Define and document the CLI policy contract
  - [x] 1.1 Before changing each source module, read `src/architecture.docs.md` and its nearest co-located `*docs.md`.
  - [x] 1.2 Confirm the config schema/version, default path, `JUMPYBRAIN_CLI_CONFIG` override, and installer ownership lifecycle.
  - [x] 1.3 Define one canonical target-origin normalizer shared by installer/config handling and CLI matching; cover case normalization, default ports, trailing slashes, path/query/hash aliases, invalid protocols, and embedded credentials.
  - [x] 1.4 Define the semantic operation classifier. Reads: `status`, `tree`, `overview`, `search`, `recall`, `show`, and only `dream --status`. Mutations: `index`, `remember`, `wrapup`, document `update`, remote `process` if later supported, default dream create/resume, dream `--complete`, `--abandon`, and `--apply-manifest`.
  - [x] 1.5 State explicitly in errors and docs that the guard is local/advisory and server-side authorization is required for a real security boundary.

- [x] 2.0 Implement device-local target policy at the CLI boundary
  - [x] 2.1 Add a focused module such as `src/cli/remote-access-policy.ts` to validate/load config, normalize remote origins, classify invocations, and return a stable read-only-policy error.
  - [x] 2.2 Keep config parsing strict: accept only the supported schema and access values, reject duplicate normalized origins or ambiguous records, and fail closed for remote operations when an existing config is invalid.
  - [x] 2.3 Enforce policy centrally in `src/cli/commands.ts` before API-key lookup, stdin/file reads, preflight recall, or HTTP transport creation.
  - [x] 2.4 Cover both `--target-url` and `--remote-url`, top-level commands, `run memory:*` recipes, `tree`/`overview`, and the overloaded top-level `update` command without blocking installer maintenance `jumpybrain update`.
  - [x] 2.5 Make dream classification follow actual flag precedence. Any invocation containing `--apply-manifest`, `--complete`, or `--abandon` must remain blocked even if `--status` is also present; default dream create/resume is blocked.
  - [x] 2.6 Ensure local `--root` workflows and unlisted remote targets keep their existing read/write behavior.
  - [x] 2.7 Update `src/cli/cli.docs.md` and architecture/package guards for the new CLI-only module; do not import it from core, app, runtime, HTTP adapters, or server code.

- [x] 3.0 Add reversible installer configuration
  - [x] 3.1 Add repeatable `--read-only-target <url>` and `--allow-write-target <url>` options to `scripts/public-install.mjs`, installer usage, dry-run plan, and final summary.
  - [x] 3.2 On first install, atomically create `<install-root>/cli-config.json` when policy is supplied. Do not create a read-only default when no flag is supplied.
  - [x] 3.3 On managed reruns, preserve existing target policy by default; only explicit policy flags may add/remove entries. Refuse contradictory normalized flags and never replace valid existing entries accidentally.
  - [x] 3.4 Update the generated CLI shim so custom install roots resolve their own config path while an explicit `JUMPYBRAIN_CLI_CONFIG` can still override it.
  - [x] 3.5 Record the config path as installer-owned metadata without embedding policy contents or API keys in `install-manifest.json`; ensure `jumpybrain update` preserves it.
  - [x] 3.6 Define and test uninstall behavior. Recommendation: remove the installer-owned CLI config on uninstall, list it in the summary, and continue preserving canonical memory unless `--delete-memory` is passed.
  - [x] 3.7 Update `scripts/local-pack-manifest.mjs` so packed installations include the new compiled CLI policy module.

- [x] 4.0 Add deterministic regression coverage
  - [x] 4.1 Add focused config/policy tests for missing config, supported schema, malformed JSON, unsupported schema, duplicate origins, URL normalization, env-path override, and custom-install shim behavior.
  - [x] 4.2 Add a table-driven command matrix proving all allowed reads and blocked mutations for both direct commands and `run memory:*` aliases.
  - [x] 4.3 Prove read-only rejection occurs before missing-API-key errors, stdin consumption, wrapup recall preflight, dream manifest parsing/content reads, idempotency creation, and any HTTP request.
  - [x] 4.4 Add remote integration tests against a loopback server: reads succeed; blocked operations generate no server request and leave canonical Markdown, index state, idempotency state, and dream state unchanged (exclude normal server logs from filesystem snapshots, but assert no blocked-request access log appears).
  - [x] 4.5 Add installer tests for first-install creation, multiple read-only targets, explicit removal/re-enable, conflicting flags, dry-run, malformed existing config, managed-rerun/update preservation, custom install roots, and uninstall cleanup.
  - [x] 4.6 Add property coverage that equivalent URL spellings map to the same origin and unrelated origins never inherit each other's policy.
  - [x] 4.7 Extend architecture/package tests so the policy remains in `src/cli/` and ships in the local CLI package.

- [x] 5.0 Validate the real installed flow on this development device end to end
  - [x] 5.1 Build and run the public installer from this checkout into a fresh isolated install/home on this device using `install.sh --source <checkout> --read-only-target <loopback-url>`; execute the generated installed shim, not `dist/cli.js` directly.
  - [x] 5.2 Start two real loopback jumpyBrain servers with separate temporary Markdown roots and the same test API-key environment: mark one target read-only and leave the second target unlisted/read-write.
  - [x] 5.3 Through the installed shim, prove `status`, `tree`/`overview`, `search`, `recall`, `show`, and `dream --status` work against the read-only target.
  - [x] 5.4 Through the installed shim, attempt representative mutations covering every state class against the read-only target: `remember`/`wrapup`, document `update`, `index`, dream create, `--complete`/`--abandon`, and `--apply-manifest`. Confirm each fails with the policy error before network activity and leaves canonical, derived, idempotency, and dream state unchanged.
  - [x] 5.5 Prove per-target isolation by successfully writing and editing through the same installed shim against the second, unlisted target, then index and recall the change.
  - [x] 5.6 Rerun the installer/update and verify the read-only policy remains active; rerun with `--allow-write-target` and prove the formerly protected target becomes writable.
  - [x] 5.7 Clean up temporary servers/install roots, record the exact commands and results in this task's progress log, and ensure no test API keys or temporary paths enter committed docs.
  - [x] 5.8 Run `npm test`, `npm run cli:pack`, and `git diff --check` after the device smoke test.

- [x] 6.0 Update user and maintainer documentation
  - [x] 6.1 Update `docs/install.md` with copy-paste installer examples, repeatable flags, config location, custom install behavior, update/rerun preservation, reversal, and uninstall behavior.
  - [x] 6.2 Update `docs/cli-commands.md` with a concise allowed/blocked command table, including recipes, aliases, index, and all dream modes.
  - [x] 6.3 Update `docs/cloud-shared-memory.md` to distinguish local CLI safety policy from server authentication/authorization and explain URL alias/proxy limitations.
  - [x] 6.4 Update `docs/technical.md` and `src/cli/cli.docs.md` with policy ownership, early-enforcement flow, config validation, and canonical/derived/support-state mutation classification.
  - [x] 6.5 Update `docs/agent-workflows.md` so generated/integrated agents understand that read-only-target write failures are intentional and must not be bypassed automatically.
  - [x] 6.6 Update README only if a public install/onboarding example needs to advertise the option; do not expand the top-level README unnecessarily.

- [x] 7.0 Finalize and archive
  - [x] 7.1 Confirm acceptance criteria and document any deferred server-side role/permission work separately rather than implying this ticket provides authorization.
  - [x] 7.2 Update `tasks/CHANGELOG.md` with the completed behavior, architecture decision, validation commands, and local-device E2E result.
  - [x] 7.3 Archive this task list under `tasks/done/` with the completion date.

## Progress Log

### 2026-07-11 installed-device E2E

- Built the checkout, created two isolated Markdown roots, and started two real loopback servers on separate ports with one ephemeral test-key environment.
- Installed through the public shell entrypoint with `HOME="$E2E/home" sh install.sh --source "$CHECKOUT" --install-root "$E2E/install" --integrations none --skip-build --skip-qmd-install --skip-initial-index --read-only-target "$READ_ONLY_URL"`.
- Used only `"$E2E/install/bin/jumpybrain"` for client checks. Protected reads passed for `status`, `tree`, `overview`, `search`, `recall`, `show`, and `dream --status`; search and recall each returned the seeded marker.
- Protected mutation commands were `remember`, `wrapup --topic`, document `update`, `index`, default `dream`, `dream --complete`, `dream --abandon`, and `dream --apply-manifest`. All 8/8 returned `JUMPYBRAIN_REMOTE_TARGET_READ_ONLY`; the server access-log request count stayed at 7 and the canonical/derived/idempotency/dream filesystem snapshot stayed byte-identical.
- Against the second unlisted URL, the same installed shim completed `remember`, `show`, `update`, `index`, and `recall`; recall returned the edited marker.
- Ran `"$E2E/install/bin/jumpybrain" update --install-root "$E2E/install"`; a protected write remained blocked. Reran `install.sh` with `--allow-write-target "$READ_ONLY_URL"`; a subsequent write to the formerly protected target succeeded.
- Stopped both servers and removed the isolated home, install, memory roots, snapshots, and captured output. No real credentials or generated temporary paths were retained.

## Acceptance Criteria

- A user can opt in during installation and mark one or more remote brain URLs read-only.
- The same CLI installation can read from a protected target while retaining full read/write behavior for an unlisted target and local roots.
- Every current state-changing operation is rejected locally for a protected target, including canonical writes/edits, index rebuilds, and dream state transitions/apply.
- Rejection happens before credentials, stdin/files, preflight work, idempotency creation, or HTTP requests are touched.
- Direct commands, aliases, recipes, and equivalent URL spellings cannot bypass the guard.
- Installer reruns and CLI updates preserve policy; an explicit installer option can restore write access.
- Invalid existing policy config cannot silently turn protection off.
- Tests and a real isolated installed-CLI smoke on this development device prove read-only and read/write targets coexist end to end.
- Documentation clearly states that this is advisory CLI safety, not server-side security.

## Decisions

- Scope is CLI-only; do not change server/API authorization for this ticket.
- Policy is opt-in and per remote target, not a global default.
- URL/origin-keyed policy is preferred over named targets because the current architecture intentionally uses URL-only target selection.
- All modifications are blocked, including derived/support-state changes.
- A dedicated device-local CLI config is preferred over memory-root config or the install manifest.
- Future remote commands default to blocked on read-only targets until explicitly classified as reads.

## Changelog

- Update `tasks/CHANGELOG.md` only when this task is completed and archived.
