# Runtime module docs

## Responsibilities

- Compose the local application surface from core APIs, local app write workflows, local memory index/search/overview/document operations, processing operations, and host package metadata injection for setup.
- Export local `migrateLogseq(source, root, { apply?, failOnConflict? })` and `LogseqMigrationResult` from the app migration seam. Migration is dry-run-first, never indexes, and does not expose a remote writer.
- Keep the package entrypoint able to re-export one runtime surface without importing CLI command parsing.
- Preserve local and server use of the same Markdown memory semantics against a selected memory root.
- Keep the stable public runtime surface local-first: memory-root setup/status, local remember/wrapup, index/search/overview, `graphMemory`, processing, document show/update, read-only `getDreamWindow` and legacy dream batch operations, and curated result types.

- Export `DreamWindow`, its request/range/file/date-basis contracts, and `DreamWorkflowConfig` alongside `getDreamWindow({ root, request?, config?, now? })`. Windows use resolved inclusive UTC dates, optional source IDs, bounded body contexts, and request-local offsets; they never write or consult dream completion state. Legacy batch exports remain operational for compatibility.

## Retrieval lifecycle surface

`indexMemory(root, options?: IndexMemoryOptions)` accepts `rebuild?: boolean` and `indexing?: IndexingPolicy`. Exports include `IndexMemoryOptions`, `RetrievalReadiness`, and `RetrievalOutcome`; the options embed the indexing-policy shape. Routine indexing is incremental; policy persists in `jumpybrain.json`. `memoryRootStatus` composes app readiness, not only core schema compatibility. Status/index/search retain prior fields with additive readiness; search distinguishes partial fallback from total backend failure. No HTTP transport or QMD implementation becomes part of this local boundary. See [local-memory](../app/local-memory/local-memory.docs.md#indexsearch-contract).

## Non-responsibilities

- Do not parse CLI commands or own stdout/stderr formatting.
- Do not implement HTTP request/response handling or authentication.
- Do not expose remote/server append-only writer helpers through the package root/runtime surface.
- Do not import QMD adapter internals directly; local memory and processing orchestration go through app use-case seams.
