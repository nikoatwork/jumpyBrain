# HTTP server adapter docs

## Responsibilities

- Authenticated `POST /feedback` is a support transport, independent of canonical memory operations. `feedback-delivery.ts` bounds requests and limits concurrent/rate admission; the shared `../feedback/` adapter validates reports, forwards to one configured HTTPS relay without app credentials or redirects, and acknowledges only confirmed acceptance. The old delivery module re-exports the shared helpers for existing hosts. The standalone relay keeps AgentMail credentials server-side and fixes the recipient. See [feedback delivery](../../../docs/feedback-delivery.md). Reports are never indexed or written into a brain.

- Notes POST forwards optional untrusted `date` to app validation without string coercion or fallback. Document error mapping allowlists known domain codes; unexpected native I/O errors return generic messages so paths/content cannot escape through error text.

- Own server lifecycle, authentication, request decoding, response encoding, safe error mapping, and the content-free nonce-protected browser shell.
- Generate/validate bounded `X-JumpyBrain-Request` correlation and carry it through async request context. Mirror safe operation/status/duration/code/index-outcome facts to schema diagnostics under `.jumpybrain/logs/diagnostics`. Default persistence is bounded; a custom logger preserves the no-filesystem-write embedding contract unless an explicit store opts in. No public server diagnostics/log route is added. Shutdown drains owned app work and performs bounded diagnostic/text-log flushing.
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
