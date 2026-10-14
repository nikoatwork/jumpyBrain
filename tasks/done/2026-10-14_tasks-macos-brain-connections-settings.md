# macOS brain connections and settings

Completed and archived **2026-10-14** for **v0.3.0**. Named local/remote profiles, Keychain credentials, companion settings/menu integration, and loss-safe all-tab switching are implemented; verification and beta OS limits are recorded below.

## Goal

Add a `/settings` page for named local and remote brain connections, with one active brain shared by the Mac companion's editor tabs and reflected in its menu-bar drawer. Switching must protect pending edits, keep credentials out of the connections file, and leave CLI/agent targets unchanged.

## Confirmed decisions

- Switching affects the Mac companion and its editor only—not CLI defaults, agent integrations, or their credentials.
- One active brain across all companion editor tabs; no independent per-tab targets.
- Add existing local memory folders and remote connections using URL + API key, each with a friendly name.
- Store remote credentials in macOS Keychain; the connections file holds credential references, never API keys.
- Save pending edits before switching; any failed/unconfirmed save blocks the switch. No automatic discard or fallback.
- Remember the last active brain after restart. If unavailable, show it offline rather than choosing another.

## Original baseline and design direction (historical)

- The companion currently starts one local server from bundled `Configuration.json`, reads a private plaintext local key, and opens Chrome with that key in a URL fragment. The browser stores it in localStorage.
- The browser already has connection-key controls and tab-local save/navigation guards, but requests are same-origin and its CSP permits only same-origin connections. This is not just a new settings form.
- Preferred direction, subject to the first spike: a stable, authenticated loopback companion control surface serving settings/editor and routing memory operations to the selected local/remote target. Keep control available even when that target is offline; avoid cross-origin browser credential storage and broad CORS/CSP changes.
- Keep local Markdown/QMD and hosted memory semantics unchanged. Companion connection orchestration is not a second engine, sync service, or public multi-root server API.
- Store mutable profiles outside the app bundle, provisionally `~/Library/Application Support/jumpyBrain Companion/connections.json`. Keep machine/runtime bootstrap configuration separate; settle the versioned schema and ownership in task 1.
- A strict all-tab save barrier must fail closed for an unresponsive/suspended tab; do not claim that browser background delivery or autosave is guaranteed.
- Saving/selecting a remote connection is not authorization to write global/team memory. Preserve existing authorization/read-only constraints and make any editing approval explicit and target-specific; do not weaken CLI policy.

## Relevant files

- `integrations/macos-companion/Companion.swift` — native menu, process lifecycle, health, Chrome launch, and credential integration.
- `integrations/macos-companion/{install.py,update.py,uninstall.py,server-bootstrap.mjs}` — configuration migration, installation/update preservation, bootstrap, and cleanup boundaries.
- `integrations/macos-companion/{README.md,smoke.py,test_update.py}` and `test/macos-companion-*.test.js` — companion contracts and regression coverage.
- `src/adapters/http-server/{graph-page.ts,notes-browser.ts,routes.ts,companion-browser.ts}` — transport, connection/settings controls, guarded history/save flow, shell routes, and CSP.
- `integrations/macos-companion/{connections.mjs,switch-coordinator.mjs,gateway.mjs}` and co-located docs — private metadata, authoritative save barrier, and companion-only loopback routing.
- `test/{macos-companion-connections,macos-companion-gateway,companion-browser}.test.js`, `scripts/companion-{browser,gateway}-smoke.mjs`, and `integrations/macos-companion/test_connections_native.py` — deterministic, Chromium, native RPC/Keychain/menu, and lifecycle regressions.
- `src/adapters/http-server/dream-handoff.ts` — target URLs in generated agent instructions must remain real memory endpoints, not companion-only control URLs.
- `src/adapters/http-client/`, `src/app/server-memory/`, `src/server/` — existing transport and local-engine seams to reuse without exposing control-plane behavior to normal hosted deployments.
- `src/architecture.docs.md`, affected co-located `*docs.md`, `docs/{install,cloud-shared-memory,shared-memory-protocol}.md` — architecture and user/protocol contracts.

## Implementation decisions and verification

Implementation and disposable-fixture verification are complete. The personal installed app was left untouched during implementation; the separately authorized release/local-update step follows below. No fixture tests used production memory or credentials.

- The companion-only integration gateway composes the existing server engine; ordinary `serve`, CLI defaults, agent targets, and canonical memory rules remain unchanged. Local target auto-index scheduling is disabled; explicit menu refresh and normal engine retrieval behavior remain available.
- `connections.json` has a strict private version-1 schema. Destination replacement creates a new profile identity, invalidating old scoped note links; key/permission repairs preserve the destination identity but use the all-tab barrier and a new request generation.
- Missing/suspended tab acknowledgements fail closed. Old requests cannot cross targets. A restarted gateway fences old drafts; reconnecting a clean tab reloads before registration so it cannot leave a ghost tab blocking future switches.
- Remote keys are Swift-owned Keychain items; the private legacy local key is now only a loopback control/bootstrap capability. The browser uses an HttpOnly per-port session cookie and forgets its legacy local-server key.
- Ad-hoc rebuilds can lose access to previous Keychain items. This was observed during the native spike; access now fails promptly without a hidden prompt or plaintext fallback. Guarded key re-entry is the supported beta recovery. Stable signed-release continuity remains future work.
- Independent reviews found and fixed transferred URL write approval, destination-link identity reuse, empty-store activation, local read-only presentation, and restart/reconnect registration leakage. The native lifecycle test also caught and fixed `/var` versus `/private/var` entrypoint detection.

Verification run:

- `npm test`: **896 passed, 1 skipped, 0 failed** (897 tests).
- Production gateway + Chromium: **14 checks passed**, including real local/remote editor writes, two-tab barriers, 412 conflicts, native-triggered switching, active key repair, read-only denial, offline/missing credentials, stale bookmarks, and restart recovery. Only disposable canonical files were written.
- Companion control-UI Chromium smoke passed, including uncertain creation and serialized polling; ordinary Lexical smoke passed at **1280px and 390px**.
- Native regression: real temporary Keychain CRUD/cleanup, menu/offline/permission state, and **13 malformed/EOF pipe cases** passed. All temporary credentials were removed.
- A disposable ad-hoc `.app` built and passed native startup, authenticated indexed search, duplicate/busy-port refusal, graceful shutdown, crash watchdog, and unchanged canonical Markdown checks.
- Python installer/updater suite: **31 passed**, including connection-file/reference preservation. Package dry-run: **140 required files, 0 stale**; whitespace checks passed.

Platform QA not claimed: physical sleeping-tab scheduling, interactive folder-picker/assistive-technology behavior, actual logout/login, and locking/denying access to the user's real Keychain. These were not simulated as proven OS behavior; deterministic failure paths are covered. No production remote brain, real user memory, personal app, or login state was modified during implementation verification.

## Release finalization

- Archived with explicit user approval on 2026-10-14 and bumped the minor version to **0.3.0** in package/lock metadata. The release tag is `v0.3.0`; [release notes](../../docs/releases/v0.3.0.md) describe changes since 0.2.0 and update/compatibility limits.
- Release verification used an isolated committed worktree, excluding unrelated in-progress recall edits and tests: **863 passed, 1 skipped, 0 failed** (864 tests). This is intentionally a different count from the earlier implementation working-tree run above.
- Repeated all 14 production-gateway Chromium checks, companion UI smoke, ordinary 1280px/390px Lexical smoke, disposable native build/lifecycle, Keychain/menu/13 malformed-pipe checks, and 31 updater tests on that release tree. The packaged runtime verified all 140 required files with no stale paths.
- The user separately authorized pushing this version and updating the managed local CLI/app. Installation preservation was baselined privately before deployment; live credentials and personal memory are not release artifacts.

## Tasks

- [x] 1.0 Validate and specify the companion-only control boundary
  - [x] 1.1 Read affected architecture/module docs; trace browser transport, autosave/conflict handling, note creation/retry, history, process shutdown, updater configuration checks, and current credential handling.
  - [x] 1.2 Spike the stable loopback shell/control plane with one disposable local root and a fixture remote server. Verify authenticated read/edit/index flows without exposing remote keys to the browser or changing ordinary `serve` behavior. Assign explicit app/adapter/native ownership before implementation.
  - [x] 1.3 Spike Swift-owned Keychain access and narrow authenticated runtime IPC. Exercise missing/denied capability paths and native login/menu state fixtures; inspect access after ad-hoc rebuild/update and document OS-only validation limits above. Never silently fall back to plaintext storage.
  - [x] 1.4 Specify the versioned profile schema: stable ID, friendly name, local root or normalized remote base URL, credential reference, and active profile ID. Define duplicate destinations, validation, corruption recovery, and persistence ownership. Keep transient health/switch state separate.
  - [x] 1.5 Specify one serialized switch state machine, tab registration/acknowledgements, target generations, request fencing, timeout behavior, crash recovery, and remote editing authorization. Resolve feasibility gaps from the spikes here before wiring UI.

- [x] 2.0 Persist profiles and migrate existing companion state
  - [x] 2.1 Implement private, atomic profile persistence with schema validation and serialized/version-checked changes; reject malformed state without replacing it with defaults. Keep credentials and canonical memory content out of this file.
  - [x] 2.2 On first successful migration, seed the existing configured local brain and retain it as active. Migration is idempotent, preserves memory/port/login settings, and never modifies CLI configuration or agent targets.
  - [x] 2.3 Add/update/remove named profiles. Validate existing local roots without initializing, migrating, indexing, or creating folders implicitly. Validate supported remote base URLs, reject embedded credentials/query secrets, and require HTTPS except explicit loopback development targets.
  - [x] 2.4 Store/change remote keys through Keychain references, with predictable cancellation/denial/missing-item behavior and no secret echo in responses, URLs, logs, process arguments, or localStorage. Define orphan cleanup and safe ordering when profile persistence or Keychain updates fail.
  - [x] 2.5 Preserve profiles and credential references through reinstall/update; separate mutable state from bundled runtime configuration. Define safe active-profile removal via the same switch guard, and keep profile removal distinct from deleting memory or revoking server keys.

- [x] 3.0 Route the editor to the selected brain safely
  - [x] 3.1 Keep the authenticated loopback control/settings surface alive independently of target health. Reuse existing local engine and HTTP transport seams; local target changes stop only owned child processes, never take over busy ports, and preserve existing watchdog/lock behavior.
  - [x] 3.2 Authenticate control and forwarding access separately from target credentials; validate loopback binding, Host/Origin, and CSRF protections. Do not expose filesystem/Keychain controls through a normal hosted memory server.
  - [x] 3.3 Forward only supported memory operations to saved, validated targets. Bound execution and response sizes, enforce TLS validation, and reject unsafe redirects/credential forwarding; do not create an arbitrary URL proxy or expose raw filesystem errors.
  - [x] 3.4 Bind every operation to profile ID + generation. Reject stale-tab mutations before dispatch; settle old in-flight writes before committing a switch. Never replay a save, creation idempotency key, index request, or retry on the newly active brain.
  - [x] 3.5 Scope document IDs, hashes, search/recent/graph caches, page references, history entries, creation retries, and status responses to the target generation. Clear old brain content on switch and prevent old responses/history URLs from opening an identically named ID on another brain.
  - [x] 3.6 Derive Dream/agent handoff URLs from the actual selected endpoint, not the loopback gateway. Define truthful local-target instructions and keep credentials/control tokens out of generated prompts.
  - [x] 3.7 Keep offline/authentication failure distinct from connected status; verify with an authenticated content-safe request, not public `/health` alone. Persist the selected target across restart without automatic fallback, provisioning, or remote writes.

- [x] 4.0 Coordinate loss-safe switching across tabs and the native menu
  - [x] 4.1 Register editor tabs and serialize competing switch requests through one authoritative coordinator. Freeze new edits/creation/navigation during preparation, flush every tab against its old target, and require positive acknowledgements before activation.
  - [x] 4.2 Reuse the save guard but account for same-document edits in multiple tabs: the existing one-retry last-write-wins behavior must not silently overwrite another tab while both report Saved. Implement a conflict-stop/resolution or explicit writer-ownership policy for this barrier.
  - [x] 4.3 Include failed/unconfirmed saves, lost-response note creation, and in-flight writes/index operations in the barrier. On failure/timeout keep the old active target and drafts; report the blocking tab/action without automatic discard. Already successful old-target saves stay saved.
  - [x] 4.4 Define closed/crashed/background tab handling and recoverable stale registrations. A missing acknowledgement is not proof a draft is saved; fence returning stale tabs before enabling editing and explain any limits after tab/browser crashes.
  - [x] 4.5 Commit/persist the new active profile only at the defined activation point, then publish its generation to all tabs/menu. Test target startup failure, persistence failure, coordinator crash, and rapid competing switches; never leave menu and writable editor sessions on different active targets.

- [x] 5.0 Add `/settings` and active-brain presentation
  - [x] 5.1 Add a reloadable `/settings` route and guarded navigation from home/editor/graph. Reuse the existing visual tokens, keyboard/focus behavior, and save/history guards; avoid maintaining a competing connection dialog with different semantics.
  - [x] 5.2 Show named profiles, local/remote type, safe destination details, active marker, and distinct checking/connected/offline/auth/Keychain states. Add edit/remove/test-connection actions; testing must not mutate memory or activate a profile.
  - [x] 5.3 Add existing-folder selection and remote URL/key entry backed by native capabilities. Keys are write-only/masked input, not returned from Keychain into the DOM; clear transient drafts after submission/cancel and show actionable validation failures.
  - [x] 5.4 Show the active brain consistently throughout the web shell and Mac drawer, with Settings and a guarded switcher in the drawer. Native switching must use the same all-tab barrier, not bypass it by changing a file or restarting the server.
  - [x] 5.5 Make menu commands target-aware: Open Memory Folder only for local profiles; restart only owned local processes; Refresh Search Index only on the selected authorized target. Offline brains must still allow opening settings and choosing another connection.
  - [x] 5.6 Display target-specific editing permission clearly. Connection tests/selection never imply global/team write approval; block mutation until the applicable explicit authorization exists.

- [x] 6.0 Verify and document the complete workflow
  - [x] 6.1 Add deterministic persistence/validation/migration/Keychain-failure/coordinator tests, including malformed files, concurrent writes, missing roots, missing credentials, and interrupted activation.
  - [x] 6.2 Add disposable local A/local B/remote integration fixtures. Verify all browser operations reach only the intended brain, identical document IDs cannot cross targets, and CLI/agent defaults/files remain unchanged.
  - [x] 6.3 Exercise two-tab edits, same-document conflicts, sleeping/unresponsive tabs, failed saves, uncertain creation, delayed old responses, native-triggered switches, browser history/reloads, competing requests, and restart with an offline last target. Record real browser/OS limits rather than inferring them from mocks.
  - [x] 6.4 Cover unauthorized local control access, untrusted origins/Host headers, malformed remote URLs, redirect key leakage, invalid TLS, plaintext secret leakage, and remote mutation without target-specific approval. A disposable self-signed TLS fixture confirms certificate failure before any authenticated target request; no trust overrides are used.
  - [x] 6.5 Extend companion smoke/install/update coverage for profile preservation, Keychain continuity, process ownership, login startup, busy ports, and switching during index/update work. Use disposable builds/roots; do not replace the user's installed app or touch real remote memory.
  - [x] 6.6 Update companion/install docs and affected owned source contracts with schema/location, credential handling, switching/offline behavior, authorization, and recovery. Add glossary terminology only if reusable. Record build/tests/manual checks and remaining platform limitations here.

## Acceptance criteria

- A user can save named existing local folders and remote brains, select either from `/settings` or the Mac drawer, and see one consistent active target across companion tabs.
- Remote keys live in Keychain; the connections file contains only non-secret details/references. No CLI/agent configuration changes occur.
- Switching cannot redirect old drafts, retries, stale history, or late requests to another brain. Failed/unconfirmed saves or unacknowledged live tabs block activation without discarding edits.
- The last active target survives restart; unavailable targets remain selected/offline with settings accessible and no silent fallback.
- Existing local/hosted engine and ordinary CLI/server behavior remain intact; profile management adds no sync or automatic memory creation/migration.
