# HTTP server adapter docs

## Responsibilities

- Implement the remote HTTP protocol, authentication, JSON request/response handling, and HTTP status-code mapping for `/health`, the content-free `/graph` browser shell, and `/memories/all/{status,index,overview,tree,graph.json,search,recall,documents/:id,notes,wrapups,dream/...}`.
- Own the dependency-free graph browser's presentation and client state, including document-level rendered/editable Markdown, 750 ms autosave, guarded GET/PUT requests, sequential optimistic-concurrency saves, and the temporary one-retry last-write-wins policy. The shell edits only document bodies and leaves canonical whole-document/frontmatter policy to existing app/core seams.
- Start and stop the Node HTTP server used by the opt-in `serve` command.
- Call app/server-memory seams for server-local status, index, graph, search/recall, document reads/updates, writes, idempotency, dream batches, and auto-index state while hiding server filesystem paths from remote clients.
- Keep document update handling protocol-only: parse JSON and `If-Match`, run the update inside the shared write queue, map precondition errors to HTTP status codes, and log only method/path/status/id/file/stale/error-code metadata.
- Keep dream route handling thin: parse JSON/caps/batch IDs, run state transitions inside the shared write queue, delegate selection/state to app/server-memory, and log only route/status/batch/file-count/error-code metadata.
- Share route literals with the HTTP client through `src/adapters/http-protocol.ts`; keep future route splits behind this adapter surface.

## Non-responsibilities

- Do not parse CLI command usage or target selection.
- Do not own canonical Markdown storage semantics, protected-frontmatter normalization, or server-memory workflows beyond delegating to app use cases; browser reconstruction is transport/UI state for the existing whole-document PUT contract.
- Do not run AI/model providers, schedulers, prompt construction, or server-side memory consolidation for dreaming.
- Do not expose QMD adapter internals directly to CLI modules.
