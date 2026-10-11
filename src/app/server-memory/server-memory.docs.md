# Server-memory app use cases

## Responsibilities

- Compose server-local memory status, indexing, search/recall, graph assembly, document reads/updates, remote writes, idempotency records, auto-index state, and the shared dream workflow against one Markdown memory root.
- Return remote-safe packets that preserve public HTTP/CLI JSON shapes without exposing the server filesystem root; document reads/updates rewrite local-root metadata to `target: "remote"`, `memory: "all"`, and `root: "remote:all"`.
- `recentServerMemory` returns at most eight unique valid-ID documents across all canonical buckets as `notes`, with only `id`, `title`, root-relative `file`, and optional date fields. Each call scans fresh Markdown (no QMD/index/state reads), omits hidden paths, excludes every duplicate-ID occurrence before limiting (including hidden matches recognized by editor lookup), and checks root compatibility. Like editor GET/PUT, it scans the memory root, not a configured retrieval-only `indexRoot`, so listed IDs are openable.
- Recent ordering uses the first valid `updated_at`/`updatedAt`, falling back to `created_at`/`createdAt`/`date`, descending; unknown dates sort last with codepoint file ordering for ties. Dates must be real ISO calendar dates or timezone-explicit ISO timestamps. Returned `updatedAt` and `createdAt` preserve the selected valid metadata strings (`date` is the final `createdAt` fallback); invalid/missing dates are omitted. No mtime fallback: copies/imports must not manufacture recency. Missing titles remain empty, matching document reads.
- `resolveServerMemoryTitle` checks root compatibility and delegates fresh exact-title resolution at the editor memory root, never retrieval `indexRoot`. Its minimal result contains only status and, when found, the canonical ID; no body, title echo, candidate paths, filesystem diagnostics, or index state. It is read-only, does not use the write queue, and does not make scan/read uniqueness atomic. Root/configuration errors propagate to the protocol's generic error handling.
- `expansion.ts` exposes `expandServerMemoryDocument({ root, ...expansionOptions })`, delegating the local guarded evidence use case. It returns the identical version-1 bounded packet, with root-relative `filePath` and no root/target/index envelope added after packing. See the [core contract](../../core/canonical/canonical.docs.md#guarded-evidence-expansion); protocols must retain compact serialization plus one LF. This operation reads canonical Markdown without writes or indexing.
- `compact.ts` delegates opt-in compact recall to local-memory without appending target/index fields after packing. The server runtime exposes both `compactSearchMemory` and `expandMemoryDocument`; successful wire packets are byte-identical to local packets for the same source state and options. Legacy rich search packets remain separate compatibility envelopes.
- Document updates reuse the local protected whole-document update seam, require a content-hash precondition, and mark the remote index stale after successful replacement.
- Provide non-HTTP seams that tests and protocol adapters can call directly, including remote-safe graph packets that do not expose server filesystem paths.
- Expose read-only stateless dream windows with remote-safe metadata (`target: "remote"`, `root: "remote:all"`) through `src/app/dream/`, without reading or writing legacy state. Keep old batch APIs operational with state paths under `.jumpybrain/remote/` for compatibility.

## Daily quick capture

- Note creation accepts optional `dailyDate` on the server write descriptor only, not the general remote writing draft. It must be a real browser-local `YYYY-MM-DD` date (years 0001–9999), with exactly `type: "note"`, a blank string body, and no explicit title. Invalid types, rollover dates, or conflicting titles are rejected in the app. Without `dailyDate`, explicit-title creation is unchanged.
- Inside the idempotency create callback, scan fresh canonical Markdown across every bucket at the memory root (not retrieval `indexRoot`), including ID-less documents. Read frontmatter titles, never filenames, headings, QMD, or counters. Match rename normalization: NFKC, trim, lowercase, NFC.
- Generate `YYYY-MM-DD_note_N`, starting at 1 or one above the maximum matching decimal suffix (including zero-padded imported suffixes). Gaps are not reused while a higher suffix exists; deleted/renamed-away maxima can be reused. Each date has an independent sequence. The existing writer supplies the same title heading. No existing files are renamed or migrated and no persistent counter is added.
- Allocation and writing share the HTTP server's existing write queue. This prevents collisions among writes through **one server queue**, not across server processes or external filesystem edits. Direct app callers must serialize writes themselves. Existing legacy explicit-title writes may still introduce duplicates.
- Idempotent replay bypasses allocation and retains the original title/ID/result; the original request body, including `dailyDate`, remains the conflict fingerprint. Changed-body reuse of a key conflicts. Existing idempotency is not a transaction spanning Markdown and its replay record (a crash between them remains a recovery limitation).

## Indexing and diagnostics

Manual and five-minute auto-index runs share the local incremental lifecycle and persisted server-local policy. Remote callers may request `rebuild`, never model paths/policy. The runner joins ordinary overlapping work; a rebuild waits for a successful in-flight run before its own explicit rebuild. Remote state writes are serialized per root and atomically replaced; writes during indexing keep freshness stale until covered, and failure does not mark fresh.

Status/index/search packets preserve existing `index` metadata and add safe `readiness`; search also adds `retrieval` outcomes. Do not expose model paths, hashes, backend stderr, or server filesystem roots. Status uses canonical/derived stats without inference/download. Public health is a protocol-only liveness check, not readiness. Run one server process per root: this queue is not distributed coordination, and the [QMD PID lock](../../adapters/qmd/qmd.docs.md#index-lifecycle-and-readiness) rejects busy cross-process operations rather than serving reader snapshots.

## Non-responsibilities

- Do not parse HTTP requests, authenticate API keys, or choose HTTP status codes.
- Do not parse CLI flags or format command-line output.
- Do not contain QMD internals; indexing and search go through the app local-memory seam.
- Do not run AI/model providers, schedule dreaming, synthesize memory, or apply generated consolidation edits on the server.
