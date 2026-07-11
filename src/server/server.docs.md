# Server module docs

## Responsibilities

- Compose server-local memory operations, including remote dream state/batch workflows, through the `src/app/server-memory/` use-case seam against one configured Markdown memory root.
- Re-export the HTTP server adapter and server-memory helpers for compatibility while keeping route parsing/auth implementation under `src/adapters/http-server/`.
- Preserve remote JSON shapes and avoid leaking server filesystem paths to remote clients.

## Non-responsibilities

- Do not import CLI command parsing or CLI helper modules.
- Do not implement HTTP routes directly in the server boundary when the HTTP server adapter can own protocol details.
- Do not require local-first CLI users to run a server.
- Do not add dreaming schedulers, AI provider configuration, or server-side model calls; remote dreaming is a CLI/local-agent workflow over server-tracked batches.
