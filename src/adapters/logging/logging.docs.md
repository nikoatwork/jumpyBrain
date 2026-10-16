# Logging module docs

## Responsibilities

- Provide small filesystem logging helpers for infrastructure boundaries such as the server.
- Keep log creation deterministic and safe for support files under `.jumpybrain/`.
- Remain easy to replace if logging moves to another adapter later.
- The private legacy text logger serializes at most 128 pending lines, limits recursive formatting, redacts named secrets in nested objects/arrays, and handles circular values/errors/getters without failing user work. Owned daily files rotate continuously at 1 MiB with one previous segment; age/aggregate cleanup applies only to that logger's own names. New files are 0600. `flush` is bounded; append/format failures remain nonfatal.
- Legacy text may contain private document IDs/relative filenames and is never a feedback source. Strict schema events and private support stores belong to [diagnostics](../diagnostics/diagnostics.docs.md). Server composition mirrors safe facts with request context, without parsing arbitrary text. Custom loggers retain memory-only diagnostics unless a store is explicitly provided.

## Non-responsibilities

- Do not own memory semantics, retrieval behavior, or write policy.
- Do not parse CLI commands or HTTP requests.
- Do not make tests depend on synchronous log writes; callers that inspect logs should poll for expected content.
