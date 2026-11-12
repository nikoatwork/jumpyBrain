# Manage app brain connections and resolve CLI targets clearly

Priority: P1. Status: completed and verified in the isolated implementation lane. Parent retains integration/combined footprint review.

## Goal

Let an agent register/list an existing local brain for the Mac app without hand-editing application state or quitting it. Make the CLI's effective destination and its selection source explicit, with a consistent resolution contract.

## Evidence and coordination

- [Second-brain setup report, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=53419d9b-2c42-4686-b20d-d226e2f8dc8a) reports no supported CLI profile management and revision conflicts after external file edits while the app runs.
- [Review part 1](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=93c68f07-038e-4d2a-8247-f565481d0361) and [part 5](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=454167e2-14ab-4627-b257-9eb7d8b56448) propose named brains and report doctor ignoring a configured nondefault root. Their suggested precedence is a proposal, not the accepted contract.
- Coordinate target precedence/project trust with task 3 of [portable installation](../todo/tasks-portable-installation-project-integration.md); do not implement competing resolvers or a second credential registry. That list continues to own project discovery/trust.
- Existing glossary behavior: app connection switching does not retarget the CLI. Preserve that unless an explicit, documented design change is accepted. Naming a destination never grants remote/team write permission.

## Relevant files

- `src/cli/cli.docs.md`, `src/cli/targets.ts`, `src/cli/memory-target.ts`, `src/cli/doctor.ts`, `src/cli/companion.ts` — target and private companion seams.
- `integrations/macos-companion/connections.docs.md`, `integrations/macos-companion/connections.mjs` — validated revisioned store.
- `integrations/electron/electron.docs.md`, `integrations/macos-companion/gateway.docs.md`, `glossary.md` — lifecycle, switch barrier and connection meaning.

## Tasks

- [x] 1.0 Specify the smallest supported contract.
  - [x] 1.1 Choose one namespace for connection list/add/remove and explicit selection; distinguish app-active connection, CLI selection and configured default. Decide whether named CLI lookup is necessary for the first increment.
  - [x] 1.2 Record precedence for explicit root/URL, any explicit name, environment/configuration, trusted project discovery, install manifest and personal fallback. Reject incompatible explicit selectors and malformed existing configuration; print the chosen source in doctor/status.
  - [x] 1.3 Define running-app ownership and app-absent/platform behavior. Prefer a narrow authenticated companion operation using its single ConnectionStore, with revision checks; never silently overwrite connections.json or expose Keychain secrets.
- [x] 2.0 Deliver agent-accessible local connection management.
  - [x] 2.1 Reuse schema validation, canonical path/duplicate checks, atomic persistence and destination identities. Adding a connection must not initialize/index the brain or change its content implicitly.
  - [x] 2.2 Route active-profile changes/removal through existing save/switch barriers. Handle concurrent changes with fresh state and explicit retry guidance, without losing saved profiles.
  - [~] 2.3 Named remote targeting deferred: app Keychain credentials have no CLI lookup contract; direct URLs/environment keys retain their existing policy. If named remote targeting is included, retain per-origin write policy, credential boundaries and cross-brain fencing. Do not make GUI selection silently redirect agent writes.
- [x] 3.0 Align root diagnostics and direct/recipe behavior.
  - [x] 3.1 Reuse the agreed resolver for doctor/status and applicable memory commands. Keep server root selection and installation-only commands explicitly scoped.
  - [x] 3.2 Explain missing configuration and the next action instead of reporting a nonexistent default root when a valid intended root is configured.
- [x] 4.0 Verify and finalize.
  - [x] 4.1 Test app running/closed, stale revisions, unsafe files, duplicate paths, root aliases, active removal, unsaved drafts and unavailable companions. Verify behavior without Electron for CLI-only installs.
  - [x] 4.2 Test selector precedence, direct/recipe parity, read-only denial before secrets/input/transport and unchanged app-to-CLI selection isolation.
  - [x] 4.3 Update configuration/install/CLI docs, glossary only for changed terms, and relevant release notes; record platform/build limits and archive/commit under [task completion](../../docs/task-workflow.md).

## Implemented contract and rationale — 2026-11-02

- One namespace: `connections list|add|remove|select`. `select` is explicitly **app** selection, never a CLI read/write target. Names are labels, IDs identify destinations. Named local CLI lookup adds little over `--root`; remote lookup would require a new credential-store contract, so both remain out of this increment.
- The running gateway owns one ConnectionStore. Native-only `/companion/connections` returns safe metadata without probes; mutations require the caller's listed revision. Local additions reuse canonicalization, duplicate/unsafe-marker rejection and atomic persistence without initialization/indexing. First registration uses the save barrier before becoming active. Active removal is refused; switching requires all-tab acknowledgement/drain. No new Electron capability, registry, offline store owner, automatic retries or JSON editing.
- Explicit root/URL selectors are mutually exclusive and highest. Then nonempty `JUMPYBRAIN_MEMORY_ROOT`, then this CLI's owning managed `app/../install-manifest.json`. Existing malformed defaults fail instead of falling through; explicit flags override them. The read-only per-origin config remains separate and unchanged. A remote-only install manifest supplies no local default.
- For compatibility, only `run memory:*` retains legacy root-marker discovery after configured defaults; direct commands still require a destination rather than gaining arbitrary-repository write targeting. Doctor alone has a diagnostic personal fallback. Direct/recipe behavior matches for explicit/configured targets. New trusted project selection/approval and installed instructions stay with portable-install task 3, whose coordination note now points to this resolver. `init` remains explicit; serve/install configuration is independently scoped.
- Doctor adds `memoryRoot.source`; status adds `target.kind/source/root|url` and text source information. Missing selected roots receive same-root initialization guidance. App-closed, missing-companion and CLI-only/platform-without-app cases fail actionably without support-file mutation. `--directory` permits an explicitly selected companion support directory, without reading or changing brain configuration.

## Verification history

- Built with repository-local locked dependencies. Initial focused suite: 56/57 passed; the one failure was the macOS `/var` alias in a new test fixture, corrected by canonicalizing its temporary directory. Subsequent 36 gateway/target/package/architecture checks passed; 46 memory/desktop/connection/resolver checks passed after fixing an older target-shape assertion for additive `source` metadata.
- First full suite: 1,804 passed / 2 failed / 1 existing opt-in real-QMD skip. Failures: older target assertion (updated) and absent `integrations/electron/node_modules/esbuild` fixture prerequisite (resolved by the locked, scripts-disabled local development dependency install). Final full run passed as recorded below. No app installation, semantic-model setup, personal/remote memory or host service was modified.
- Real running gateway/CLI HTTP fixtures cover stale revisions, unsafe private controls, symlink marker rejection, aliases/duplicates, absent/unreachable host, active removal, first activation, remote metadata redaction/local-only control, draft rejection/acknowledged activation and app/CLI target isolation. Existing store and gateway suites retain external-write conflicts, hardlinks, credential fencing and target drain checks. New target fixtures cover owned manifests, malformed defaults, environment/explicit priority, doctor fallback, legacy discovery and direct/recipe parity. Help sentinels discover all new namespace paths automatically.

## Final outcome and verification — 2026-11-02

Tested snapshot: base `e7116bb` plus this task's scoped implementation in `t3/connections-targeting`, Node 26.7.0 on macOS arm64. No rebase or adoption of the independent guidance/lint lane at `d42f414`; parent must preserve its instructions topic flags/process preview and resolve shared metadata additively.

- `npm run build`: passed. Editor 665,016 minified bytes / 219,947 gzip; optional desktop UI 15,513 / 5,669. No semantic-model setup changed.
- Final `node --test`: **1,806 passed, 0 failed, 1 existing opt-in real-QMD skip** (1,807 total, 82.2 s). First-run failures were corrected/rechecked, not skipped or weakened. New target `source` fields required updating the existing exact-shape assertion; doctor validation remains strict through the shared token parser.
- Focused recheck `node --test test/memory-cli.test.js test/desktop-lifecycle.test.js test/cli-connections.test.js test/cli-target-resolution.test.js`: **46/46 passed**. Separate gateway/target/package/architecture selection: **36/36 passed**.
- `npx --yes --package=playwright node scripts/companion-gateway-smoke.mjs`: **15/15 passed**, 36.9 s, production gateway/shell and disposable local/loopback remote roots. Added real CLI control to the existing conflicted-draft case and positive delayed-draft activation case. The first smoke attempt passed CLI control but exposed a fixture needing to reopen its note after the new extra switch cycle; the fixture now respects the existing scoped-home transition and the complete smoke passed.
- `node scripts/check-package-size.mjs`: **passed**, unchanged ceilings: **1,441,212 archive / 4,599,789 unpacked / 3,099,818 dist bytes / 630 files**. `git diff --check`: passed.

### Retained cost and integration decision

Against supplied `e7116bb` measurements, this increment retains **+2,126 archive / +8,431 unpacked / +5,040 dist bytes / +2 files**. Doctor's duplicate argument parser was consolidated into the existing strict parser; selector-array fallback and duplicate target object construction were removed; CLI reference duplication/presentation prose was tightened. No ceiling, assertion, public command, runtime asset or credential policy was removed to obtain the result.

Exact per-file emitted JS deltas (TypeScript transpilation confirmed byte-identical to the tested build): targets +1,697; doctor +180; memory-commands +197; memory-target −26; commands +443; companion +27; usage +717; args −271; new connections +1,816. The new connections declaration adds 124 bytes; other declaration additions account for the remaining 136 bytes. Native gateway/store control is packaged outside `dist` and included in the unpacked measurement.

Parent reported independent `d42f414` at 3,098,875 runtime bytes, with 1,125 headroom. Adding this lane's retained delta arithmetically projects **3,103,915 runtime bytes (3,915 over cap)**, before actual merge interactions. This is not a combined build result. Parent owns final package/complexity review: consolidate shared help/parser representation across both lanes, or explicitly defer a capability. The connections module alone is 1,940 bytes including declarations, so removing only that module cannot cover the projected overage and would also require removing its dispatch/help/control wiring. This branch keeps the complete, independently passing capability for concrete review; budgets remain unchanged.

### Remaining limits

- CLI management is local-profile-only, requires a running companion with this control route, and does not manage remote credentials or imply remote/team write permission. Older running app versions require upgrading/restarting to provide the route; no offline repair/retry is attempted.
- Registered dirty/conflicted drafts and positive save/drain are proven through real production Chromium; packaged Electron/native-window/physical Keychain prompts, Intel Mac and Linux execution were not rerun for this increment. No new Electron/Keychain implementation is introduced. CLI-only/no-companion behavior is covered without importing Electron; temporary support-directory control tests are platform-independent code paths, not a Linux hardware claim.
- Trusted project discovery/approval, instruction retargeting, semantic engine/model behavior and final combined package gates remain with their named owners. Direct and recipe defaults deliberately retain their documented compatibility difference when no destination is configured. Parent owns local integration and source-thread settlement.
