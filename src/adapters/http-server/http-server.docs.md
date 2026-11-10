# HTTP server adapter docs

## Responsibilities

- Authenticated `POST /feedback` is a support transport, independent of canonical memory operations. `feedback-delivery.ts` bounds requests and limits concurrent/rate admission; the shared `../feedback/` adapter validates reports, forwards to one configured HTTPS relay without app credentials or redirects, and acknowledges only confirmed acceptance. The old delivery module re-exports the shared helpers for existing hosts. The standalone relay keeps AgentMail credentials server-side and fixes the recipient. See [feedback delivery](../../../docs/feedback-delivery.md). Reports are never indexed or written into a brain.

- Notes POST forwards optional untrusted `date` to app validation without string coercion or fallback. Document error mapping allowlists known domain codes; unexpected native I/O errors return generic messages so paths/content cannot escape through error text.

- Own server lifecycle, authentication, request decoding, response encoding, safe error mapping, and the content-free nonce-protected browser shell.
- Generate/validate bounded `X-JumpyBrain-Request` correlation and carry it through async request context. Mirror safe operation/status/duration/code/index-outcome facts to schema diagnostics under `.jumpybrain/logs/diagnostics`. Default persistence is bounded; a custom logger preserves the no-filesystem-write embedding contract unless an explicit store opts in. Diagnostics remain operator-only and are not exposed through the desktop browser route allowlist. Shutdown drains owned app work and performs bounded diagnostic/text-log flushing.
- Keep routes thin: delegate memory behavior to [server-memory use cases](../../app/server-memory/server-memory.docs.md); share route literals with the HTTP client through `http-protocol.ts`.
- Authenticated `POST /memories/all/ensure-title` accepts only a safe literal `title`, then queues the app's complete canonical find-or-create operation alongside ordinary writes. `resolve-title` remains read-only. Ensure-title exposes minimal found/ID/created outcomes plus safe indexing guidance after actual creation, never titles, bodies or paths. Companion gateways classify ensure-title as a write so read-only profiles reject it.
- Discriminate JSON parser errors by internal class; untrusted `statusCode`/`body` fields must never become responses or logged error codes.
- Follow the [public protocol](../../../docs/shared-memory-protocol.md) for schemas, auth, CSP, compatibility, and errors; follow the [browser contract](browser.docs.md) for editor/map/companion state and verification.

- Authenticated `GET /memories/all/attention` delegates metadata selection to app/server-memory; `PATCH /memories/all/documents/:id` requires If-Match, parses strict attention intent and uses the shared write queue. Route handlers do not implement attention semantics or rewrite Markdown. See the public protocol for packets and errors.

## Non-responsibilities

- Do not own canonical publication/frontmatter policy, app workflows, CLI parsing, or QMD internals.
- Do not run model providers or turn browser dream instructions into server permissions.

## Companion-only browser contract

See the [owned browser contract](browser.docs.md#companion-only-browser-contract). Ordinary hosted servers do not enable companion controls.

## Index protocol boundary

See the [protocol reference](../../../docs/shared-memory-protocol.md#index-stale-state).

## Execution lifecycle

The started host owns one background index scheduler, with optional configuration or complete `autoIndex:false` opt-out. Only authenticated confirmed canonical write routes signal `onMemoryWrite`; foreground document/search routes may signal `onMemoryActivity`. Signals schedule work without granting remote clients index authority. Status includes safe host maintenance booleans; existing index timestamps/readiness describe publication. Direct server close, convenience close and listen failure stop scheduled work before runner drain. Low-level `createJumpyBrainHttpServer` retains its embedding contract and does not create its own maintenance timer.

See the [protocol reference](../../../docs/shared-memory-protocol.md#backend-execution-limits).

## Strict read-only retrieval

See the [protocol reference](../../../docs/shared-memory-protocol.md#creation-outcomes-and-strict-observational-reads).

## Bounded retrieval protocol

See the [protocol reference](../../../docs/shared-memory-protocol.md#post-memoriesallrecallcompact).

## Temporal retrieval protocol

See the [protocol reference](../../../docs/shared-memory-protocol.md#temporal-retrieval-options).

## Living-page checks

Authenticated POST `/memories/all/dream/sources/check` delegates to shared app policy, outside the write queue, with no-store responses and existing JSON/error limits. Bodies accept only `id` OR `content,file`, never a caller root. The content-free shell includes an on-demand source panel; no server model or scheduler. See [protocol](../../../docs/shared-memory-protocol.md#living-page-source-checks).

## Folder explorer protocol

Authenticated `GET /memories/all/files` delegates canonical metadata listing to `app/server-memory/folder-explorer.ts`, passing request cancellation and returning no-store JSON. It is read-only and does not use the write queue or signal indexing. Other methods return 405; unexpected errors return the generic `files_failed` response. See the [protocol](../../../docs/shared-memory-protocol.md#get-memoriesallfiles).

## Board protocol

Authenticated `/memories/all/drawings` and per-name routes delegate to `app/server-memory/drawings`. POST creates; PUT (scene), PATCH (rename) and DELETE require a SHA-256 If-Match and share the host write queue. Only these routes accept JSON bodies up to 5 MiB; stored scenes are capped at 4 MiB. Reader credentials may list and read. `drawing-assets.ts` serves the public, content-free `/drawing-frame` page and the build-emitted `/drawing-app/*` files with a separate CSP (`script-src 'self'`, same-origin fonts, `frame-ancestors 'self'`); only files present in the build output are addressable. The shell CSP adds `frame-src 'self'` for that frame alone. `test/drawings.test.js` covers routes, limits, statics and the gateway.

Authenticated `/memories/all/boards` and per-ID/status routes delegate to `app/server-memory/boards`. POST creates; PUT/DELETE require a SHA-256 If-Match and share the host write queue. Core enforces strict schema and 64 KiB file size; unexpected I/O errors receive safe generic messages. No index mutation or desktop dependency. See [protocol](../../../docs/shared-memory-protocol.md#boards).

## Explorer mutation transport

`POST /memories/all/files/operations` is a thin authenticated decoder into `app/server-memory/folder-explorer-operations.ts`, using the existing write queue and safe document-error mapping. Folder creation accepts only `{action:"create-folder",path}`. File move/rename accepts only `{action:"move-file",id,file,destination}` with `If-Match`. Successful moves notify index maintenance; empty-folder creation does not. GET `/memories/all/files?includeFolders=1` adds visible canonical directories without changing the default packet. The companion gateway classifies file operations as writes under ordinary profile/generation/tab admission.

## Shared backend and live operations

### Selected host-policy agreement

| Operation | CLI remote policy | Hosted server | Companion |
| --- | --- | --- | --- |
| Search/recall/expand, document/board reads | Allowed on a configured read-only target | Authenticated read; observational POSTs retain read authorization | Selected target, session/Origin, tab and generation checks; no write barrier for live reads |
| Document/attention/board mutation | Configured read-only target denies before credentials/dispatch | Writer/admin plus domain preconditions | Also requires target `allowWrites`; admitted mutation drains before switching |
| Live history/recovery read | Live open/watch remain observational | Authenticated subscription/document scope | Allowed for read-only profiles; late old-generation reply is fenced |
| Live `resync` | Mutation command path | App/principal rules | Writer-only: substituted upstream credentials must not reset unsafe sessions for a read-only profile |
| Unknown live method | No supported command | Rejected | Rejected, never treated as a permissive read |
| `/_backend/call` | Private root-owner transport only | Operator capability, never public writer privilege | Not in browser route allowlist |

The policy owners stay separate. Existing `remote-access-policy`,
`collaboration-live`, `companion-live-gateway`, `macos-companion-gateway` and
`boards` tests exercise this matrix, including observational source-check POSTs,
stale generations, all-tab acknowledgments and drain. The focused contract
profile selects these suites; this table does not grant new permissions.

The host composes the collaboration hub and protocol-2 `/ws` adapter using the
same canonical publication queue as HTTP document writes. Guarded PUT/PATCH/DELETE
notify live sessions; derived QMD work retains separate admission so inference
does not hold the typing queue. Reader/writer/admin authorization applies to
every protected route. Operator-only `/_backend` readiness, cancellation,
local RPC, stop and sanitized diagnostics support the private owner descriptor.
These administrative endpoints never pass through the desktop browser allowlist.
Private owner calls use `../backend-protocol.ts` for canonical admission and
guarded-document preconditions, then `app/backend-rpc.ts` for use-case dispatch.
The host owns cancellation/root authority, queueing and pre-write/publication
execution; it does not maintain a second operation-name or hash-position list.
Public routes and their distinct permission/error policies are unchanged.

Hosted `/session` GET establishes a brain-scoped HttpOnly SameSite=Strict24-hour
cookie from a valid bearer credential; DELETE clears it. Cookie-authenticated
mutations require exact Origin and every request revalidates authorization.
WS resolves the browser-session marker from the authenticated upgrade cookie;
credentials never enter the socket URL. See [collaboration](../../../docs/collaboration.md).

## Retained external versions

`document-retained-versions.ts` owns the accessible notice/dialog installed by document actions. Complete retained copies are optional history under More info → Earlier versions; a clean Saved note has no review notice or acknowledgement step. Incomplete discovery still shows a visible warning outside the disclosure. It compares a hash-verified earlier copy with a freshly read saved note using the shared bounded Added/Removed summary. Keep current note / Use earlier version are the only main choices; full copies, selection and copy tools stay under More options. Successful restoration closes the dialog. Large comparisons use individually bounded copy reads. Scope changes clear dialog text; stale comparisons and revoked/read-only credentials cannot restore.

The collaboration facade preserves a unique private draft before adopting a reviewed body/title. Storage failure leaves that draft active. Explicit restoration uses the current reviewed hash and exact revision in the serialized backend; it cannot overwrite protected frontmatter or silently rebase across a newer save. Retained files remain durable independently of browser review state. `scripts/collaboration-retained-versions-smoke.mjs` exercises the shipped shell, actual HTTP/WS credentials and raw writes.

## Participant label placement

`collaboration-labels.ts` places up to 64 peer labels independently from their caret/selection marks. It searches bounded nearby rows/columns within each clipped scroll viewport, prevents label intersections, and collapses overflow to an explicit participant count when physical space is insufficient. Source coordinates and actual caret marks never move to make room for labels. The shared participant list retains names independently of the overlay.
