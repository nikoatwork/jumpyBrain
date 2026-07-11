# HTTP client adapter docs

## Responsibilities

- Implement remote memory client calls for status, index, overview/tree data, recall/search, document read/update, remember, wrapup, and dream status/batch lifecycle operations.
- Encode overview/tree query options for file display, connection statistics, and result limits as `showFiles`, `connections`, and `limit` parameters on the remote overview route.
- Preserve remote response shapes expected by the CLI while adding transport details such as API keys, `If-Match`, content type, idempotency headers, and dream route paths.
- Keep remote-target communication isolated from local runtime internals.

## Non-responsibilities

- Do not parse all CLI commands or own user-facing command usage text.
- Do not implement server route handlers or server-local memory writes.
- Do not implement AI/model calls or server-side dream consolidation; dream transport only moves JSON between CLI and server.
- Do not import QMD or filesystem memory-root internals.
