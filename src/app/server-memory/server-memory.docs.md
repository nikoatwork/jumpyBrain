# Server-memory app use cases

## Responsibilities

- Compose server-local memory status, indexing, search/recall, graph assembly, document reads/updates, remote writes, idempotency records, auto-index state, and the shared dream workflow against one Markdown memory root.
- Return remote-safe packets that preserve public HTTP/CLI JSON shapes without exposing the server filesystem root; document reads/updates rewrite local-root metadata to `target: "remote"`, `memory: "all"`, and `root: "remote:all"`.
- `recentServerMemory` returns at most eight unique valid-ID documents across all canonical buckets as `notes`, with only `id`, `title`, root-relative `file`, and optional date fields. Each call scans fresh Markdown (no QMD/index/state reads), omits hidden paths, excludes every duplicate-ID occurrence before limiting (including hidden matches recognized by editor lookup), and checks root compatibility. Like editor GET/PUT, it scans the memory root, not a configured retrieval-only `indexRoot`, so listed IDs are openable.
- Recent ordering uses the first valid `updated_at`/`updatedAt`, falling back to `created_at`/`createdAt`/`date`, descending; unknown dates sort last with codepoint file ordering for ties. Dates must be real ISO calendar dates or timezone-explicit ISO timestamps. Returned `updatedAt` and `createdAt` preserve the selected valid metadata strings (`date` is the final `createdAt` fallback); invalid/missing dates are omitted. No mtime fallback: copies/imports must not manufacture recency. Missing titles remain empty, matching document reads.
- Document updates reuse the local protected whole-document update seam, require a content-hash precondition, and mark the remote index stale after successful replacement.
- Provide non-HTTP seams that tests and protocol adapters can call directly, including remote-safe graph packets that do not expose server filesystem paths.
- Expose read-only stateless dream windows with remote-safe metadata (`target: "remote"`, `root: "remote:all"`) through `src/app/dream/`, without reading or writing legacy state. Keep old batch APIs operational with state paths under `.jumpybrain/remote/` for compatibility.

## Non-responsibilities

- Do not parse HTTP requests, authenticate API keys, or choose HTTP status codes.
- Do not parse CLI flags or format command-line output.
- Do not contain QMD internals; indexing and search go through the app local-memory seam.
- Do not run AI/model providers, schedule dreaming, synthesize memory, or apply generated consolidation edits on the server.
