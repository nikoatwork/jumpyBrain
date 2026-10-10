# HTTP client adapter docs

## Responsibilities

- Implement remote memory client calls for status, index, overview/tree data, recall/search, document read/update, remember, wrapup, and read-only stateless dream windows. Preserve legacy dream status/batch lifecycle calls for compatibility.
- Window requests use authenticated GET `/memories/all/dream/window` with explicit query options. Reject unsupported responses and return upgrade guidance for 404/405; never fall back to stateful batch creation. Remember forwards the optional boolean dream marker.
- Encode overview/tree query options for file display, connection statistics, and result limits as `showFiles`, `connections`, and `limit` parameters on the remote overview route.
- Preserve remote response shapes expected by the CLI while adding transport details such as API keys, `If-Match`, content type, idempotency headers, and dream route paths.
- Keep remote-target communication isolated from local runtime internals.

## Index and retrieval packets

`indexMemory({ rebuild?: boolean })` forwards only the optional boolean to authenticated POST `/memories/all/index`; reject indexing policy/model options locally. Policy is configured on the server filesystem, never through this transport. Preserve additive `readiness`, index `work`, and search `retrieval` fields without exposing host diagnostics. A failed backend request must remain an error, not an empty result. See [protocol](../../../docs/shared-memory-protocol.md#index-stale-state).

## Non-responsibilities

- Do not parse all CLI commands or own user-facing command usage text.
- Do not implement server route handlers or server-local memory writes.
- Do not implement AI/model calls or server-side dream consolidation; dream transport only moves JSON between CLI and server.
- Do not import QMD or filesystem memory-root internals.
