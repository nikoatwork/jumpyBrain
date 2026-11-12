# Companion control and switching

Select checks using [the testing guide](../../docs/testing.md); [WebSocket/editor scenarios](../../docs/testing.md#live-editing-and-websocket-scenarios) normally use Chromium. Add native checks for native boundary changes.

## Responsibilities

The native menu-bar button uses bundled `MenuBarBrain.png`, generated from `MenuBarBrain.svg`: the Electron brain contours as a transparent monochrome outline at 18 points. AppKit template rendering adapts it to light/dark menu bars. Health remains explicit in the tooltip and menu status. Minimal/older bundles fall back to system symbols. The native installer copies this resource independently of executable reuse.

Support diagnostics use private schema stores under `<support>/diagnostics/{gateway,electron}` (seven-day/10 MiB per store, ten 1 MiB segments, bounded queues). The owned local server exposes its store in process; a remote profile never supplies server filesystem evidence. Authenticated same-origin `GET /companion/diagnostics` uses existing generation/tab admission for browsers, pins active scope during collection, and returns sanitized source snapshots plus runtime/editor fingerprints. Cache entries are brain/generation scoped for two seconds. No arbitrary path/log reader, public hosted log endpoint, memory/index mutation, or provider execution.

Only native control-bearer holders may POST up to 64 safe Electron events to that route (32 KiB request bound). Sanitize before deduplication/persistence; browsers cannot ingest. Validated request correlation is forwarded to the owned target; target timeout/offline/credential/redirect and switch/ack failures retain categories without messages or target identities. Native-RPC stdout stays exclusive; bridge loss becomes a safe gateway event.

Swift maintains a separate 0600 `<support>/native-diagnostics.json`: at most 64 events/64 KiB covering startup, bridge, child termination and update failures, with failure priority and omission counts. Sanitize prior history before republishing and filter records older than seven days. Collection rejects symlinks/hardlinks/oversized/public-permission files. Raw `server.log`/updater files remain private administrator artifacts, excluded from feedback and the new store cleanup. Availability means a safe historical snapshot is readable, not proof every abrupt crash or failed final disk write was captured.

`gateway.mjs` is an opt-in host adapter launched only by the native companion, not by CLI parsing, the public runtime, or ordinary hosted `serve`. It composes the existing nonce-protected browser shell and local HTTP engine; memory semantics remain in app/core. Mutable metadata belongs to [`connections.mjs`](connections.docs.md); `switch-coordinator.mjs` owns one authoritative save barrier.

The stable loopback origin serves `/`, `/graph`, and `/settings` even when the selected brain is offline. A local target joins the authenticated root-owned backend through its private descriptor; a port alone never establishes ownership. Local target startup does not initialize/migrate memory. Its owned engine enables incremental background indexing after startup, quiet writes and periodic reconciliation; canonical saves still complete independently, and explicit Refresh Search Index remains recovery. A remote target uses its saved origin and the access key from `~/.config/jumpybrain/.env`, injected only on server-side forwarding. Browser requests use a fixed allowlist of existing memory routes/methods, finite request/response sizes, finite transport deadlines, and manual redirects (never followed). No remote cookie or authentication challenge is forwarded to the browser.

Index forwarding uses Node HTTP/HTTPS streams so the configured finite index deadline (610 seconds by default, with ten-second backend headroom) is not preempted by Node fetch's implicit five-minute response-header timeout. The same controller covers connection, headers and response-body consumption; cancellation still drains the admitted request before switch/shutdown. Redirects are never followed. Identity encoding is requested, with gzip/deflate/Brotli decoding when supplied; the existing 16 MiB response cap applies to decoded bytes, and the stream bridge has 64 KiB backpressure. Ordinary routes retain fetch and the 70-second app deadline. Injected test transports keep their existing seam.

The native bootstrap's private `api-key` is now a **control** capability, not a remote credential. Native requests authenticate with that bearer. Chrome receives it in `#companion=…`, immediately removes the fragment, exchanges it at same-origin POST `/companion/session`, and receives a session-only, HttpOnly, SameSite=Strict per-port cookie. Neither control token nor remote credentials are persisted in browser storage; legacy local-server browser keys are forgotten. Control/forwarding routes enforce exact Host and supplied Origin; browser POSTs require the exact loopback Origin. The content-free shell contains no user profile or note payload. The local same-user trust boundary is unchanged: this is not protection against malicious software running as the user, and plain loopback cookies cannot provide TLS security.

Remote access keys come from the shared owner-only `~/.config/jumpybrain/.env` through `appCredentials` ([credentials docs](../../src/adapters/credentials/credentials.docs.md)); a missing key or an insecure file reports `credential_unavailable` with a fix (never the key). The native folder picker travels through bounded anonymous stdin/stdout pipes: `{id,operation:"select-folder"}` requests and `{id,result}` replies. Node stdout is exclusively this protocol; diagnostics use static stderr. Unknown/malformed frames, including the removed `get`/`set`/`delete`, fail closed.

`/companion/connections` is native-only: safe GET snapshot; revision-checked POST local add/remove/select through the singleton store/save barrier, including first activation. Active removal and offline CLI edits are refused; selection never retargets the CLI.

## Switch protocol

- Every browser page registers a fresh tab ID and integer process-session generation before fetching memory. Memory requests, including Settings index refresh, carry `X-Companion-Generation` and `X-Companion-Tab`. The native menu leaves brain switching and indexing to browser Settings; native bearer authentication remains for companion control/state.
- One switch/edit transaction at a time. The coordinator publishes `preparing` plus a random switch ID. Each registered tab freezes editing/creation/navigation, settles current creation/navigation, flushes against the **old** target, and acknowledges only confirmed success. Failed/uncertain creation, failed saves, or missing acknowledgements block activation. There is no optimistic heartbeat expiry. A tab whose own poll is lost without an HTTP status (sleep/wake, suspended network) or gets a 5xx stays frozen and shows "Reconnecting…"; it retries `state`/`register` with 1–30 s backoff and immediately on focus/visibility/online, then unfreezes only after a fresh same-generation registration. A changed generation still reloads a clean tab or keeps a pending draft fenced. 401/403 is final and shows the reopen-from-menu recovery.
- Registered tabs may finish old-target requests before acknowledging. Once acknowledged, further memory admission is denied. Every admitted memory request pins the generation/target until it settles, including index requests; commit waits for their drain. New registration during commit is rejected.
- Only after all positive acknowledgements and drained scopes does the host persist the selection and fence the new generation. Old positively acknowledged tabs learn this state through polling and replace their route with scoped home/settings, clearing editor/cache/retry state. Old writes are always rejected. A process restart has a new random generation and no previous acknowledgements; old tabs are fenced with drafts retained, not silently reloaded. Reconnect refuses to move an unsaved draft across that boundary.
- Hosted and companion editors stop on HTTP 412 and expose explicit draft comparison/reload; neither automatically overwrites another writer. Copy/reconcile the draft deliberately rather than automatically overwriting another tab's saved version.
- Active destination/key/permission edits use the same barrier. Replacing a destination also allocates a new profile ID, so old `?brain=<id>&note=<id>` bookmarks cannot resolve on its replacement. Key rotation/permission changes on the same destination retain the profile identity but advance the process generation.
- A persisted selection remains selected if offline or its access key is unavailable. Switching never substitutes a different brain. A failed persistence step does not advance the generation; previously successful old-target saves are not rolled back.
- Remote profiles default read-only. Explicit target-specific editing/index approval is stored separately from connectivity. Changing the URL clears the browser approval checkbox; no approval transfers from the previous destination. The gateway enforces `allowWrites` for every local/remote mutation.

No tab-closure or browser-crash draft recovery is promised. An ordinary browser unload confirmation is still relevant; force-closing a tab can destroy browser-only drafts. An unresponsive registration blocks switching until the tab wakes or the user closes it. Restarting is not a safe save-guard bypass: old tabs are fenced and may need draft copying/manual recovery. Connections saved by older Keychain-based builds have no key in the file; re-enter it through guarded Settings repair. No hidden prompts or broad Keychain ACL relaxation is used.

## Non-responsibilities

No CLI/agent default changes, sync, public multi-root/control API, automatic global/team write approval, native memory engine, crash-persistent editor drafts, or signed-release credential migration. Dream handoffs use the real authorized remote origin; local companion handoffs explain the limitation instead of giving an unusable control-gateway URL to an agent.

Verification: `node --test test/{macos-companion-connections,macos-companion-gateway,companion-browser}.test.js`, `node scripts/companion-gateway-smoke.mjs` (Playwright Chromium), `node scripts/companion-idle-recovery-smoke.mjs` (dropped coordinator requests recover the same tab), and `python3 -B integrations/macos-companion/test_connections_native.py`. Disposable fixtures only; physical sleeping-tab behavior, actual login, interactive folder selection, and locked-user-Keychain flows remain manual checks.

## Browser lifecycle controls

Direct support feedback uses authenticated, Origin-checked, generation/tab-fenced `POST /feedback`, handled by the gateway itself. It forwards only the explicitly submitted report to the configured support relay, even if the selected brain is offline/read-only, without starting a local engine or forwarding remote credentials. It participates in the coordinator's in-flight drain. The relay URL is public package configuration generated at build time; native process environment filtering remains intact. Mail credentials exist only on the central relay. See [deployment](../../docs/feedback-delivery.md).

The route allowlist includes document DELETE as a write, forwarding its bounded JSON body and If-Match under the same generation/tab admission and target allowWrites policy as PUT. Read-only profiles cannot delete. GET `?deletePreview=1` remains observational. Browser deletion/reload actions settle before switch acknowledgement; destructive actions recheck current editor/scope/write authorization before submission. Expired-session UI offers direct Retry and Recover draft controls without moving a pending draft to a new generation.

GET `/memories/all/attention` is observational. Document PATCH is a write with its bounded JSON body and If-Match forwarded under the same generation/tab admission, drain and target-specific `allowWrites` policy as PUT/DELETE. Remote read-only profiles can discover attention but cannot settle, snooze or reactivate.

`GET /access` forwards as a read; `POST /access` and `DELETE /access/:id` are writes under the same session/Origin, generation/tab and `allowWrites` admission. The upstream server enforces the admin role. No other administrative route is forwarded.

POST `/memories/all/ensure-title` is a write, including requests that might reuse an existing page. Its bounded JSON title request uses the same session/Origin checks, generation/tab admission, request drain and target-specific `allowWrites` policy as note creation. POST `/memories/all/resolve-title` remains observational, so read-only profiles can still resolve existing references without permission to create missing pages. The target app owns canonical title lookup and find-or-create publication.

## Folder explorer

GET `/memories/all/files` is an observational canonical metadata listing forwarded through the existing generation/tab admission and response-size limit. Read-only local and remote profiles can browse folders; no filesystem root, note bodies or write permission are exposed by the listing. Older remote servers without this route return an ordinary unavailable response, not an incomplete overview fallback.

## Unified desktop hosting and shutdown

Owned local engines use the same host automatic incremental index lifecycle as hosted servers: startup, coalesced confirmed writes and five-minute external-write reconciliation. The gateway no longer disables local maintenance; stopping/switching away from the owned engine cancels its scheduler and drains work. Remote profiles never acquire a client-created maintenance timer or an implicit index mutation; target permissions and server policy still apply. No process-global/default CLI root is retargeted.

The bundled Swift helper runs with `--desktop-host`: no separate menu/update/login UI, runtime resolved within the enclosing app, and a parent watchdog. Electron verifies its fresh host-instance identifier in authenticated gateway state; an existing service is never adopted. Standalone mode remains for legacy installations and maintenance.

Native-only POST `/companion/shutdown` with `{action: "prepare"}` reuses the registered-tab save/acknowledgement barrier and request drain. Success returns an opaque `id` and holds admission closed without changing the selected brain or generation. `{action: "cancel", id}` releases that freeze; a 30-second lease also releases an abandoned prepared shutdown. Failure keeps the service available. Ordinary browser sessions cannot invoke this lifecycle control. After window-close guards and diagnostic flushing, native `{action: "commit", id}` must revalidate the live lease and permanently fence admission before the parent stops its host. An expired lease blocks shutdown; the user can retry Quit.

## Living-page source checks

POST `/memories/all/dream/sources/check` is explicitly observational (`write:false`) in the memory-route allowlist. Forward saved-page IDs and draft content/file bodies unchanged through the existing session/Origin, generation/tab admission and request drain, injecting only the active target credential. Both local and remote `allowWrites:false` profiles can check versions; this grants no note/index/update permission. GET and other source-operation paths remain unsupported. Gateway tests round-trip real saved/draft checks through both target types, assert no canonical byte/mtime change, and reject unauthenticated, wrong-Origin, unknown-tab, stale-generation and mutation attempts.

## Executable extensions

The desktop gateway alone composes one `createExtensionHost` from the bundled `dist/app/extensions/index.js`, with its package directory at `<support>/extensions`. Ordinary hosted servers and memory CLI commands do not activate extensions. Explicit `safeMode: true` and the `extensions/disabled` marker bypass preparation/factories before activation; Settings and CLI management remain available for recovery. Installed Node and same-origin UI code is trusted with the user's permissions; capabilities constrain the supported API rather than providing a security sandbox.

`extensions-gateway.mjs` owns the authenticated desktop protocol: GET `/companion/extensions`, POST `/companion/extensions/{manage,invoke,event}`, and GET `/companion/extensions/assets/<id>/<revision>.js`. Browser requests use the existing cookie, exact Host/Origin and registered generation/tab admission. Native CLI calls require the private control bearer and explicit current generation. Manage accepts only reload/enable/disable/remove; installing arbitrary filesystem paths is a local CLI operation. Revisioned scripts require authentication and an active matching revision; subresource requests need no tab headers. They use the shell's existing nonce CSP, with no Node bridge, eval or blob script. State/poll adds only `extensions: {revision,safeMode}`; descriptor refresh reuses the current poll.

Each invocation/event owns a cancellation signal, captured brain/generation, admission and a set of pending memory operations. Each operation rechecks scope and admission, uses existing `targetFetch` with linked request/deadline cancellation, and remains in the switch/shutdown drain through response consumption. Returning, disconnecting, disabling/reloading or shutdown aborts the lifetime; detached later continuations cannot reuse it. Already-started operations still drain before releasing their admitted scopes. A tab that has acknowledged a switch cannot start another operation. Events never authorize writes. Commands need both explicit `allowWrites` and the active target's independent editing approval. Search normalizes canonical metadata IDs, deduplicates and bounds results; read exposes saved content/hash. Create forwards an explicit Idempotency-Key and update forwards the prior If-Match hash. Upstream conflict/auth/write outcome packets retain their status; ambiguous writes are never automatically retried.

The gateway produces observational `scope.changed` after a committed brain selection or permission/credential generation change, using a fresh native-admitted context without write approval. Startup also announces the initial scope. The host deduplicates delivery by generation; another editor registering in the same generation never cancels current work. Browser event requests may report document/theme observations but cannot assert a scope transition. Event failures cannot roll back an already committed selection, and any event-initiated reads participate in normal scope drain.

For active local CLI management the gateway atomically publishes private `<support>/extensions-control.json` with its exact canonical support directory, loopback origin and process identity. It contains no credential. CLI checks ownership, private modes, link/file/size bounds, directory identity and the live process before reading that support directory's native `api-key`; it never uses a brain API key or remote target flags. A live but unreachable host fails rather than editing behind its back. A dead pointer permits offline management. Graceful shutdown removes only its own descriptor. The companion pack must include `extensions-gateway.mjs` alongside `gateway.mjs`.

Focused coverage: `node --test test/extension-gateway.test.js test/extensions-cli.test.js test/extensions-gateway-http.test.js`. The existing gateway and desktop lifecycle suites cover unchanged empty-install behavior. Same-process blocking code/unmanaged side effects cannot be preempted; cancellation only controls supported asynchronous operations.

The internal `readinessOnly` launch option forces an empty extension execution set without writing the persistent disabled marker. Electron forwards it through its private native child environment for staged/installed updater readiness. Actual application launch retains normal activation. `SwitchCoordinator.onTransition` cancels extension observations synchronously when switch/shutdown begins. Observers release their initial validation admission immediately; each actual memory request retains its own admission until transport settles, preserving the canonical save barrier.

## Drawings

The gateway serves `/drawing-frame` and `/drawing-app/*` from the bundled runtime without a session, like the shell, and keeps them out of request diagnostics. Drawing operations proxy the ordinary `/memories/all/drawings` routes to the selected brain: GET is observational; POST/PUT/PATCH/DELETE are writes and require that brain's editing approval. These write routes alone accept bodies up to 5 MiB. Verify with `node --test test/drawings.test.js` and the Mac-shell pass of `scripts/drawings-smoke.mjs`.

## Canonical brain boards

Board operations proxy the ordinary authenticated `/memories/all/boards` routes to the selected local or remote brain. GET is observational; POST/PUT/DELETE are writes and require the profile's `allowWrites` permission. Existing generation/tab admission, queue draining and save barriers apply. There is no app-support board store, `/companion/collections` route or native CLI capability advertisement. Per-board content hashes protect layout changes. Copying the brain carries its organization; two profiles of the same brain see the same boards. See [agent boards](../../docs/boards.md).

File explorer `POST /memories/all/files/operations` forwards explicit folder creation and guarded file moves/renames through ordinary write admission, preserving If-Match and the selected target until the request drains. Read-only profiles reject it. Acknowledged tabs and old generations cannot start another operation. The browser includes in-flight explorer operations in its existing save barrier. The optional `includeFolders=1` listing remains observational.

## Shared root owners and WebSockets

Local destinations join `ensureRootBackend`; switching or closing the gateway
does not kill another app/CLI's backend. The `/ws` bridge enforces the existing
Host/Origin/cookie boundary, tab registration, generation and write approval.
It substitutes the native credential in the hello frame and pins admitted
mutations until acknowledgement; observational calls validate scope without
leaving a mutation/save barrier. A generation change closes old subscriptions.
Unconfirmed upstream work retains admission fences instead of claiming a safe
switch. The packaged native helper includes live-gateway and the runtime vendors
its WebSocket dependency; neither relies on development node_modules.

The live bridge explicitly classifies source RPCs. `open`, `close`, `ping`,
`presence`, `stream.status`, `history.read` and `recovery.read` are observational.
They validate the registered tab/generation and stay on their captured upstream,
but release admission immediately so a delayed read or failed hello cannot leave
an uncertain mutation/save barrier. Replies from a retired generation are dropped.
`edit`, `undo`, `redo`, `title`, stream start/chunk/cancel/finish, and `resync`
require profile write approval and retain admission until acknowledgement.
`resync` remains writer-only here because an elevated substituted upstream
credential could reset a conflicted session/epoch even though a healthy resync
is observational. Read-only profiles cannot gain that capability. Unknown RPCs
remain denied. Interrupted dispatched writes retain their uncertain admission;
read/hello disconnects do not. Focused actual-cookie/WS/upstream and switch-drain
coverage: `node --test test/companion-live-gateway.test.js`.

## Local display name

Authenticated POST `/companion/identity` accepts only `{name}` and writes the device-local preference through `adapters/client-identity`. It never forwards a name-setting request or credentials to a brain. State/register/poll packets expose the current preference, or `identity.unavailable` if unreadable; the browser can repair it in Settings. An injected `identityFile` keeps fixtures isolated. This preference is independent of brain write permission and does not alter selected targets or access policy.

Native gateway stderr now uses bounded pipe ingestion: 64 KiB chunks into a
private no-follow 256 KiB log, truncated when full. Existing legacy `.previous`
files are preserved for explicit inspection. Owned TERM/clean exits are `normal`;
unexpected exits and failed/forced shutdown remain `child_terminated`. Bridge EOF
during an already requested stop does not add a spurious bridge failure.

## Backend restart recovery

Local destination resolution rechecks the private descriptor/lease and process,
plus the selected directory's device/inode generation. A changed or disconnected
owner retires its cached target. The next deliberate request or live reconnect
uses bounded authenticated `ensureRootBackend` discovery/activation; normal
requests only read registry state. Startup honors the enclosing request signal.
Opening a local brain after an update gracefully drains an authenticated older
numeric-version backend and starts/joins the current one within a bounded wait.
Each saved local profile receives this lazy handoff when next opened, including
profiles inactive during the update. Same-version divergent builds, newer/unknown
versions, unknown registry state, unavailable owners and replaced roots fail
explicitly. No request is automatically replayed, including a failed write.

Retirement closes that target's browser WebSockets with reconnectable status and
fences late HTTP/live responses. Browser brain/profile generation stays stable
for a same-root backend replacement. The existing document epoch and private
draft rules perform source resynchronization; unpublished or unconfirmed work
requires review and never becomes an automatic overwrite. Uncertain dispatched
live writes keep their existing switch/save admission until acknowledgement.
Remote destination credentials, profile switching and its save barrier retain
separate ownership.

`test/companion-backend-restart.test.js` exercises real CLI stop/recall replacement,
HTTP recovery and negative ownership/response/replay cases. After building a fresh
Mac bundle, `node scripts/backend-restart-smoke.mjs --resources <Contents/Resources>`
uses matching packaged application/native host/runtime/CLI resources in a
disposable brain, verifying Retry, notes/boards/search, fresh native editing and
private drafts over unchanged/changed canonical text. Its session interceptor
holds new WebSocket handshakes only while seeding an unsent positional draft
through the production editor API. It does not install an app or verify real
sleep, Intel, LaunchAgent or published-updater behavior.

Index forwarding uses the shared pure deadline policy: the local index environment setting plus headroom, or an explicit finite indexTargetTimeoutMs for a separately configured target. Backend and target-host configuration stay owner-side; requests never carry remote model paths or deadline knobs. Electron and Swift forward only the explicit local index-deadline/model-directory settings in addition to their existing fixed bootstrap environment. Restart the root owner after changing its environment; an already-running owner is not silently reconfigured.
