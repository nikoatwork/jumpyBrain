# Runtime module docs

## Responsibilities

- Compose the local application surface from core APIs, local app write workflows, local memory index/search/overview/document operations, processing operations, and host package metadata injection for setup.
- Keep the package entrypoint able to re-export one runtime surface without importing CLI command parsing.
- Preserve local and server use of the same Markdown memory semantics against a selected memory root.
- Keep the stable public runtime surface local-first: memory-root setup/status, local remember/wrapup, index/search/overview, `graphMemory`, processing, document show/update, local dream batch operations, and curated result types.

## Non-responsibilities

- Do not parse CLI commands or own stdout/stderr formatting.
- Do not implement HTTP request/response handling or authentication.
- Do not expose remote/server append-only writer helpers through the package root/runtime surface.
- Do not import QMD adapter internals directly; local memory and processing orchestration go through app use-case seams.
