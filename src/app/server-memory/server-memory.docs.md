# Server-memory app use cases

## Responsibilities

- Compose server-local memory status, indexing, search/recall, graph assembly, document reads/updates, remote writes, idempotency records, auto-index state, and the shared dream workflow against one Markdown memory root.
- Return remote-safe packets that preserve public HTTP/CLI JSON shapes without exposing the server filesystem root; document reads/updates rewrite local-root metadata to `target: "remote"`, `memory: "all"`, and `root: "remote:all"`.
- Document updates reuse the local protected whole-document update seam, require a content-hash precondition, and mark the remote index stale after successful replacement.
- Provide non-HTTP seams that tests and protocol adapters can call directly, including remote-safe graph packets that do not expose server filesystem paths.
- Expose remote dream seams that use remote-safe metadata (`target: "remote"`, `root: "remote:all"`) and state paths under `.jumpybrain/remote/` while delegating workflow mechanics to `src/app/dream/`.

## Non-responsibilities

- Do not parse HTTP requests, authenticate API keys, or choose HTTP status codes.
- Do not parse CLI flags or format command-line output.
- Do not contain QMD internals; indexing and search go through the app local-memory seam.
- Do not run AI/model providers, schedule dreaming, synthesize memory, or apply generated consolidation edits on the server.
