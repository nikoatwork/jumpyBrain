# HTTP client adapter docs

## Responsibilities

- Implement remote memory client calls for status, index, overview/tree data, recall/search, document read/update, remember, wrapup, and read-only stateless dream windows. Preserve legacy dream status/batch lifecycle calls for compatibility.
- Window requests use authenticated GET `/memories/all/dream/window` with explicit query options. Reject unsupported responses and return upgrade guidance for 404/405; never fall back to stateful batch creation. Remember forwards the optional boolean dream marker.
- Encode overview/tree query options for file display, connection statistics, and result limits as `showFiles`, `connections`, and `limit` parameters on the remote overview route.
- Preserve remote response shapes expected by the CLI while adding transport details such as API keys, `If-Match`, content type, idempotency headers, and dream route paths.
- Keep remote-target communication isolated from local runtime internals.

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

Bounded-read error bodies have a separate fixed **8192-byte** stream cap, with cancellation on overflow and strict UTF-8/JSON parsing. Preserve HTTP status and short token-shaped error codes, but never echo remote messages/details. Known expansion errors receive static actionable guidance; malformed/oversized errors use static HTTP errors. Unsupported-status upgrade guidance still applies, except a well-formed expansion `missing_id` 404. These error limits do not redefine legacy rich endpoint behavior.

## Execution lifecycle

Local transport `signal`/`timeoutMs` options on index/search/compact recall control fetch **and response-body consumption**, never serialized server knobs. Defaults are 70 seconds for reads and 610 seconds for index (headroom over default backend deadlines); longer server deadlines require a matching client runtime option. Timeout/abort produce static `RemoteMemoryError` codes `execution_timeout`/`execution_aborted` and remove timers/listeners. Server overload/deadline codes remain errors, not empty memory. Other legacy requests also have the finite 70-second transport default.

## Non-responsibilities

- Do not parse all CLI commands or own user-facing command usage text.
- Do not implement server route handlers or server-local memory writes.
- Do not implement AI/model calls or server-side dream consolidation; dream transport only moves JSON between CLI and server.
- Do not import QMD or filesystem memory-root internals.

## Temporal scope verification

Rich and compact searches forward optional `temporal` after core validation. `temporal-response.ts` compares every resolved interval field against `resolveTemporalQuery(request.temporal)` and validates coverage counts: missing/mismatched scopes fail with upgrade guidance, never unfiltered fallback. Compact V1 additionally requires in-scope `evidenceDate` on temporal passages and closed string/string-array `relationships`; these fields and the temporal envelope are rejected without a temporal request. Written dates remain independent. See [protocol](../../../docs/shared-memory-protocol.md#temporal-retrieval-options).
