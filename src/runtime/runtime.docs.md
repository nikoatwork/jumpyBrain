# Runtime module docs

## Responsibilities

- `boards.ts` re-exports app board operations through the ordinary runtime/package entrypoint: list/read/save/delete, bounded status and pure layout/selection helpers. It takes a canonical root and imports no host discovery or protocol code.

- Export local `migrateObsidian(source, root, { apply?, failOnConflict? })` with `ObsidianMigrationOptions` and `ObsidianMigrationResult` through the same app seam. It preserves source bodies and has no remote transport or automatic indexing. Test hooks are not public.

- Compose the local application surface from core APIs, local app write workflows, local memory index/search/overview/document operations, processing operations, and host package metadata injection for setup.
- Export local `migrateLogseq(source, root, { apply?, failOnConflict?, bodyFormat? })` and `LogseqMigrationResult` from the app migration seam. Export `LogseqMigrationOptions` and `LogseqBodyFormat` too; readable is the default and preserve is explicit byte fidelity. Migration is dry-run-first, never indexes, and does not expose a remote writer.
- Keep the package entrypoint able to re-export one runtime surface without importing CLI command parsing.
- Preserve local and server use of the same Markdown memory semantics against a selected memory root.
- Keep the stable public runtime surface local-first: memory-root setup/status, local remember/wrapup, index/search/overview, `graphMemory`, processing, document show/update, read-only `getDreamWindow` and legacy dream batch operations, and curated result types.

- Export `DreamWindow`, its request/range/file/date-basis contracts, and `DreamWorkflowConfig` alongside `getDreamWindow({ root, request?, config?, now? })`. Windows use resolved inclusive UTC dates, optional source IDs, bounded body contexts, and request-local offsets; they never write or consult dream completion state. Legacy batch exports remain operational for compatibility.

## Retrieval lifecycle surface

`indexMemory(root, options?: IndexMemoryOptions)` accepts `rebuild?: boolean` and `indexing?: IndexingPolicy`. Exports include `IndexMemoryOptions`, `RetrievalReadiness`, and `RetrievalOutcome`; the options embed the indexing-policy shape. Routine indexing is incremental; policy persists in `jumpybrain.json`. `memoryRootStatus` composes app readiness, not only core schema compatibility. Status/index/search retain prior fields with additive readiness; search distinguishes partial fallback from total backend failure. No HTTP transport or QMD implementation becomes part of this local boundary. See [local-memory](../app/local-memory/local-memory.docs.md#indexsearch-contract).

Local search/compact recall default to automatic incremental repair; `refresh: false` opts out of repair/publication recovery, not PID-lock coordination writes. Export `ensureMemoryIndexed(root, ExecutionOptions)` for explicit app-owned automatic maintenance without policy persistence or rebuild. See the local-memory contract for missing/stale/failure outcomes.

Rich/compact `readOnly: true` offers strict no-derived-write lexical retrieval and implies no refresh. Unsafe publication/WAL/lock/generation states fail closed; semantic omission remains explicit. Writers return `saved:true`, `id`/`file` and a separate pending/indexed/failed indexing outcome; export post-save `ensureSavedMemoryIndexed` to verify that saved identity is actually covered (unrelated/excluding `indexRoot` stays pending); callers must repair indexing, never retry saved creation.

Index/search/compact recall accept `ExecutionOptions` (`signal?: AbortSignal`, `timeoutMs?: number`), exported for local hosts; these are lifecycle controls, not retrieval-depth/effort policy. See [execution limits](../adapters/qmd/qmd.docs.md#bounded-execution).

## Bounded evidence surface

Export `compactSearchMemory(root, query, limit, options)` plus compact packet/options types and serializer, and `expandMemoryDocument(root, options)` plus canonical expansion types/serializer. Both compose the same local/server app operations, preserve unbudgeted search/show contracts, and return version-1 root-relative packets with a 1024–65536 serialized UTF-8 byte budget (default 8192, including LF). Callers must not wrap or pretty-print packets after packing. See [local-memory](../app/local-memory/local-memory.docs.md#opt-in-compact-recall) and [guarded expansion](../core/canonical/canonical.docs.md#guarded-evidence-expansion).

## Non-responsibilities

- Do not parse CLI commands or own stdout/stderr formatting.
- Do not implement HTTP request/response handling or authentication.
- Do not expose remote/server append-only writer helpers through the package root/runtime surface.
- Do not import QMD adapter internals directly; local memory and processing orchestration go through app use-case seams.

## Temporal retrieval surface

Export `TemporalQuery`, `TemporalResolution`, `TemporalCoverage`, `TemporalRetrieval`, `EvidenceDate`, and `resolveTemporalQuery`. Rich and compact search accept the same explicit temporal options; no temporal request preserves legacy packet shape. Relative bounds require a caller-supplied UTC reference date.

## Deletion surface

Export observational `previewMemoryDocumentDeletion(root,id)` and permanent single-document `deleteMemoryDocument(root,id,{ifMatch,apply:true})`, plus preview/result types. They use the same canonical root and optimistic publication policy as editing, without CLI/HTTP dependencies. Confirmed removal and derived-index status are separate outcomes.

## Living-page checks

Export local `checkDreamSources(root, request)` and `SourceCheckRequest`/`SourceCheckResult` from the shared app/core seams. It is observational, without synthesis, scheduling, indexing or publishing.

## Recognition types

The public local runtime re-exports `MemoryActor`, `SearchRecognitionOptions`, `SearchRecognitionMetadata` and `SearchRecognitionScope`. Existing note/update/search app operations accept the optional declared-actor/recognition fields; no new protocol or CLI dependency enters the runtime.
