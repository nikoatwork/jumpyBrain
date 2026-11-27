# HTTP client adapter docs

## Responsibilities

- Ordinary successful replies must be JSON objects. Document reads and update/attention receipts validate their consumed fields, bind the requested ID and (for updates) prior hash; board read/save receipts validate board identity, shape and hash. Invalid success is `invalid_response` with an explicitly unconfirmed mutation outcome, never an automatic retry. Additive envelope fields remain supported, and `indexed:false` remains canonical success. This validation does not independently verify a remote content hash against source bytes or validate every legacy endpoint schema. See `test/http-receipt-contracts.test.js` and real-server board/creation tests.

- Remember validates optional `date` with core writing policy before sending, then forwards its exact ISO representation. This adds no retry or extra request; date belongs to the existing creation body/idempotency contract.

- Implement remote memory client calls for status, index, overview/tree data, recall/search, document read/update, remember, wrapup, and read-only stateless dream windows. Preserve legacy dream status/batch lifecycle calls for compatibility.
- Window requests use authenticated GET `/memories/all/dream/window` with explicit query options. Reject unsupported responses and return upgrade guidance for 404/405; never fall back to stateful batch creation. Remember forwards the optional boolean dream marker.
- Encode overview/tree query options for file display, connection statistics, and result limits as `showFiles`, `connections`, and `limit` parameters on the remote overview route.
- Preserve remote response shapes expected by the CLI while adding transport details such as API keys, `If-Match`, content type, idempotency headers, and dream route paths.
- Keep remote-target communication isolated from local runtime internals.
- A brain URL may carry a path prefix that a reverse proxy strips (`https://host/team`). Every route, including the access client, the `/capabilities` probe and the CLI's live `/ws` join, goes through `remoteRouteUrl(base, route)`: base path without trailing slash plus a route starting with a single `/`, concatenated rather than resolved, so a route can never replace the prefix or name another host. A plain origin behaves exactly as before. Test: `a brain URL with a path prefix keeps it…` in `test/http-client.test.js`.

## Index and retrieval packets

`indexMemory({ rebuild?: boolean })` forwards only the optional boolean to authenticated POST `/memories/all/index`; reject indexing policy/model options locally. Policy is configured on the server filesystem, never through this transport. Preserve additive `readiness`, index `work`, and search `retrieval` fields without exposing host diagnostics. A failed backend request must remain an error, not an empty result. See [protocol](../../../docs/shared-memory-protocol.md#index-stale-state).

## Bounded retrieval

`compactSearchMemory(query, limit, { depth?, maxBytes?, diagnostics? })` POSTs to `/memories/all/recall/compact`; `expandMemoryDocument({ id, expectedContentHash, startLine?, endLine?, sectionLine?, maxBytes? })` POSTs to `/memories/all/expand`. Both use existing read authentication. Expansion accepts inclusive lines or a section anchor, never both; hash preconditions are mandatory.

`maxBytes` defaults to 8192, with integer bounds 1024–65536, using core's shared serialized-budget validator and size check. Validate budgets before sending, stream-bound successful responses, and validate version/kind, packet shape, declared budget, and compact JSON-plus-LF size before returning. Unsupported 404/405/501 or malformed packets give upgrade guidance with **no full-document fallback**. Expansion's `missing_id` 404 remains a document error, not an unsupported-server error. Existing rich recall and document methods are unchanged.

Bind recall to the exact query and requested depth (default `normal`). Bind expansion to canonical ID/hash, scope, and inclusive requested endpoints (defaults: line 1 through `totalLines`). A section anchor must lie within the requested section, not necessarily within its budget-truncated returned prefix. Validate whole-line counts, LF/CRLF framing, omissions, and continuation consistency. These are protocol checks, not independent verification of source bytes or section boundaries without the full document.

V1 packet/nested schemas reject unknown fields, including server-root/envelope fields. Canonical IDs, expansion-token identity/path basis, and strict ISO calendar dates share core validation. Recall excerpts can flatten source lines, so only expansion text has exact line-count validation. Reserved optional fields are:

- `readiness.lastFailure`: only `{ code: "index_failed" | "interrupted_update", at: <ISO date/timestamp> }`.
- Passage `documentId`: canonical ID consistent with the expansion token when available; may remain on a canonical-root `source_changed` passage.
- Expansion `continuationLine`: required for partial packets, absent for complete packets.
- With **requested** `diagnostics: true` only: packet `{ candidateResults, candidatePassages, budgetOmittedPassages }` nonnegative integer counts; passage `{ hitId, score, scoreBreakdown?, metadata? }`. Score breakdown requires numeric `qmdScore`, `exactMatchBoost`, `metadataBoost`, `finalScore` and string `driver`; optional numeric `titleMatchBoost`, `temporalRelevance`, `memoryStrength`, `provenanceConfidence`, `depthPolicyBoost`, `dreamBoost`, and enum `retrievalDepth` retain the shared scoring contract. Explicit diagnostic `metadata` is the sole open-key record: canonical frontmatter values are strings, finite numbers, booleans, or string arrays, never nested arbitrary objects. Diagnostics are optional even when requested; unsolicited diagnostics are rejected.

`retrieval.warnings` stays an open list of string codes inside the closed `retrieval` record, so advisory codes such as `no_matches_try_fewer_keywords` pass validation without a schema change and are returned exactly as the server sent them. The client adds, removes and interprets none of them except the required `read_only_index` acknowledgement.

Bounded-read error bodies have a separate fixed **8192-byte** stream cap, with cancellation on overflow and strict UTF-8/JSON parsing. Preserve HTTP status and short token-shaped error codes, but never echo remote messages/details. Known expansion errors receive static actionable guidance; malformed/oversized errors use static HTTP errors. Unsupported-status upgrade guidance still applies, except a well-formed expansion `missing_id` 404. These error limits do not redefine legacy rich endpoint behavior.

## Admission refusals

`admission.ts` classifies refusals once for ordinary and bounded requests. A valid remote code `execution_overloaded` stays `execution_overloaded` on any status; otherwise 429 becomes `rate_limited` and a 503 without a valid code becomes `service_unavailable`. Other codes (for example `read_only_busy` on 503) keep existing handling. Messages are static, so a proxy page or remote message never reaches the caller; 429/503 bodies on ordinary routes use the same 8192-byte capped decoder as bounded reads.

`RemoteMemoryError.retryAfterSeconds` is set only from a single `Retry-After` value: delta-seconds or an IMF-fixdate HTTP-date (compared with an injectable clock; a past date gives 0). Other date forms, negative, fractional, repeated or over-one-day values give no delay. The client never invents a delay, waits or retries: each public operation still makes one attempt (read-only preflight included), and a refused write remains possibly uncertain behind an unknown intermediary. Tests: `test/admission-errors.test.js`.

## Strict read-only retrieval

Rich/compact request `readOnly:true` first GETs observational status and requires `readOnlyRetrieval: "lexical-immutable-v1"` before any query request, within the same transport deadline/signal. Older servers fail with upgrade guidance without sending an ignored flag to write-capable legacy reads. Responses must acknowledge `read_only_index` in retrieval warnings; otherwise fail with no ordinary/full-document fallback. Static read-only failure guidance asks authorized maintenance to recover/checkpoint/rebuild, never a hidden client mutation. This mode is lexical-only; semantic omission is explicit.

## Execution lifecycle

Local transport `signal`/`timeoutMs` options on index/search/compact recall control fetch **and response-body consumption**, never serialized server knobs. Defaults are 70 seconds for reads and 610 seconds for index (headroom over default backend deadlines); longer server deadlines require a matching client runtime option. Each public operation creates exactly one deadline timer. Authenticated internal JSON requests and strict read-only status preflight inherit the same operation signal and remaining lifetime; preflight never resets or caps a longer caller deadline. Rich JSON and bounded streaming decoders remain separate, and both consume response bodies inside that operation scope. Timeout/abort produce static `RemoteMemoryError` codes `execution_timeout`/`execution_aborted` and remove timers/listeners. Server overload/deadline codes remain errors, not empty memory. Other legacy requests also have the finite 70-second transport default.

## Non-responsibilities

- Do not parse all CLI commands or own user-facing command usage text.
- Do not implement server route handlers or server-local memory writes.
- Do not implement AI/model calls or server-side dream consolidation; dream transport only moves JSON between CLI and server.
- Do not import QMD or filesystem memory-root internals.

## Temporal scope verification

Rich and compact searches forward optional `temporal` after core validation. `temporal-response.ts` compares every resolved interval field against `resolveTemporalQuery(request.temporal)` and validates coverage counts: missing/mismatched scopes fail with upgrade guidance, never unfiltered fallback. Compact V1 additionally requires in-scope `evidenceDate` on temporal passages and closed string/string-array `relationships`; these fields and the temporal envelope are rejected without a temporal request. Written dates remain independent. See [protocol](../../../docs/shared-memory-protocol.md#temporal-retrieval-options).

## Deletion transport

`previewMemoryDocumentDeletion(id)` uses authenticated GET on the document path with `?deletePreview=1`; `deleteMemoryDocument(id,{ifMatch,apply:true})` sends authenticated DELETE with `If-Match` and JSON `{apply:true}`. Missing/changed/duplicate identity failures propagate. Neither method automatically retries removal or refreshes indexing; callers repair the index independently of a confirmed removal.

## Living-page checks

`checkDreamSources(request)` POSTs saved-page ID or draft content/file to the source-check route. Unsupported 404/405 endpoints and malformed envelopes fail with upgrade guidance and no fallback or simulated check. This read does not grant write authorization.

## Recognition acknowledgement

Rich search forwards normalized opt-in `recognition` options and requires a version-1 acknowledgement with the same options. Older/ignoring servers fail with explicit upgrade guidance; no unfiltered fallback. Document updates forward optional declared `actor` alongside `content` and existing If-Match; note drafts already share the same optional actor. These claims never change authorization.

## Boards

`listBoards`, `readBoard`, `saveBoard`, `deleteBoard` and `getBoardStatus` use ordinary authenticated board routes and the existing request deadline. Creation POSTs a full versioned Board; updates PUT it with If-Match; deletion also requires If-Match. Preserve per-board hashes and bounded status evidence. No native companion discovery or automatic retries. CLI policy controls accidental writes; server authentication remains separate.

## Note attention

`listMemoryAttention` uses existing GET attention and `patchMemoryDocumentAttention` uses guarded document PATCH. Both retain ordinary authentication/deadlines; no automatic retries. Attention receipts contain the full canonical document, matching old/new hashes and pending indexing; they do not promise the ordinary body-update `updatedAt` field. Validate that separate shape rather than rejecting a saved metadata-only change. Shared packet types live in `types.ts`, with no client import of app implementations.

Default transport budgets now derive from the shared pure execution limits; the existing 70/610-second defaults and explicit client deadline semantics remain unchanged. A separately configured hosted backend still requires matching caller/gateway headroom; no timeout is serialized to its public protocol.

`access.ts` is a separate admin client for `/access` (list, issue, revoke) with a 15-second deadline, manual redirects and strict receipt validation. It is not part of the memory transport; an invalid mutation reply tells the caller to list keys before retrying. No retries.

`probeRemoteAccess` in the same file is the observational check behind `access whoami`: one `GET /capabilities` with the given key, a 10-second deadline, manual redirects and a 16,384-byte body cap. It returns a tagged outcome instead of throwing for remote conditions: `confirmed` (a known role, a bounded control-free name, a UUID credential ID, and the server's capability list filtered to known names, absent for an older server and `null` when malformed), `authentication_failed` (401/403), `offline` (timeout, network failure, 429/5xx) or `unsupported` (redirect, other status, invalid JSON or shape, unknown role). The body of a non-200 reply is cancelled unread, and no outcome carries a key, a response body or remote error text. Interpreting the list against the fixed role sets belongs to the caller, because this adapter does not import access control. Tests: `test/access-whoami.test.js`.
