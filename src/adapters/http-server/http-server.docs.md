# HTTP server adapter docs

## Responsibilities

- Implement the remote HTTP protocol, authentication, JSON request/response handling, and HTTP status-code mapping for `/health`, the content-free `/` and `/graph` browser shell, and `/memories/all/{status,index,overview,tree,graph.json,search,recall,documents/:id,notes,wrapups,dream/...}`.
- Compose the dependency-free browser shell in `graph-page.ts`: shared transport, document codec/save controller, and optional graph presentation. `notes-browser.ts` owns the almost-empty home, native search/connection dialogs, full-page raw Markdown body editor, and guarded URL/history navigation. Both compile into the same nonce-protected HTML; there is no frontend build service or runtime dependency.
- Use authenticated indexed search for Cmd/Ctrl+K, validate canonical IDs from `provenance.metadata.id` rather than QMD hit IDs, deduplicate document hits, and report index staleness including locally confirmed writes. Home and direct `/?note=<id>` loads do not fetch graph data.
- Compose dated quick capture through authenticated idempotent `POST /memories/all/notes` with a browser-local date/time title and blank note body (the app writer supplies its heading). New note buttons and Cmd/Ctrl+N and Cmd/Ctrl+Shift+Enter share one guarded flow; retain the exact request/key after unconfirmed creation, suppress concurrent/repeated attempts, and restore history before unlocking a failed async creation. Retry state is tab-local, not crash recovery.
- Reuse the search dialog for literal `[[Exact Page Title]]` insertion via `[[` or Insert page reference. Preserve the draft/range, native textarea undo, cancellation and focus; block unsafe/missing or visibly duplicate titles and retain picker errors across save freshness updates. Do not imply collection-wide title uniqueness or title-based graph resolution; canonical link lookup remains filename-based. No editor/graph navigation or target write is needed for insertion.
- Share a neutral cream/charcoal visual foundation with restrained borders, hover states, visible focus, and semantic error feedback; keep graph category colors distinct from ordinary application chrome.
- Keep the persistent textarea/caret stable through blur, search, saves, and reconciliation. Reconcile idle saved frontmatter only when the response body still matches the local body. Preserve 750 ms/blur autosave, sequential If-Match saves, retained failed drafts and explicit retry, unload protection, and the temporary one-retry last-write-wins policy. No-op edits and undo to a confirmed body report Saved without another write. Unconfirmed saves remain pending even after undoing to the previous body, because a lost response may hide a committed write.
- Guard in-app and Back/Forward navigation before abandoning a draft. Restore a history traversal to the current entry before flushing, replay it only on success, and keep the editor read-only until the approved destination is applied. Close modal dialogs on history navigation. Canonical whole-document/frontmatter policy remains in existing app/core seams.
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
