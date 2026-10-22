# Canonical note attention metadata

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Store settle/snooze intent in Markdown and produce a bounded attention list that automatically includes due notes, without relying on browser visit history or an index.

## Scope and ownership

- Read [coordination/contracts](2026-10-22_tasks-sidebar-attention-refresh.md), source architecture docs, core canonical docs, server-memory docs and the HTTP/gateway docs before changing those modules.
- Own pure metadata semantics (new focused core module), `src/core/frontmatter.ts`, `src/types.ts`, attention-safe merge/publication changes in `src/core/document-update.ts` and canonical store, app/server-memory attention operations, and thin authenticated HTTP/protocol/gateway admission plumbing.
- Core owns policy/parsing/publication; app owns scanning/orchestration; adapters own routes/auth. Keep QMD and HTTP out of core. Browser consumers belong to the attention interface track.
- Preserve Home's `recentServerMemory` contract. Reuse canonical scan/identity/publication helpers and existing write queues; do not create a second replacement engine.

## Tasks

- [x] 1.0 Freeze the `attention_at` absent/timestamp/null contract and exact list/mutation packet/route names in the coordination list. Inject a clock for deterministic selection. Include the earliest future wake deadline even when the visible cap is full.
- [x] 2.0 Add explicit YAML null support needed by this contract. Current `FrontmatterValue` excludes null and the parser reads `null` as text: test bare null round-trip versus quoted `"null"`, missing keys, invalid timestamps and legacy scalars. Audit affected scalar consumers so this does not silently change unrelated metadata semantics.
- [x] 3.0 Preserve explicit attention overrides through ordinary body/title updates. Keep existing protected metadata, evidence dates, unknown fields, body bytes/line endings and ID/path rules intact. Define invalid external attention values conservatively (fall back to normal recency with an appropriate non-content warning rather than silently settling).
- [x] 4.0 Implement guarded settle/snooze/reactivate metadata patches. Require current ID and If-Match, write authorization and existing atomic publication/queue rules. Preserve content edit timestamps for attention-only changes. Reject invalid/past snooze requests; return the confirmed new hash and attention state. Repeated/stale requests must not overwrite newer edits or recreate a deleted note.
- [x] 5.0 Produce a separate metadata-only attention list: canonical root, unique openable IDs, filter before limit, due-time ordering and stable ties, optional `nextWakeAt`. Keep missing-date behavior deterministic, scan bounded in output and disclose existing corpus-scan cost; no persistent cache, body payload, indexing or background scheduler.
- [x] 6.0 Expose thin authenticated read/write operations through the server and companion route allowlist with read-only/write-policy and generation/tab admission intact. Give UI consumers exact fixtures/types early. Existing CLI document operations must be able to retain/edit the canonical metadata; add a CLI command only if existing operations demonstrably cannot do so.
- [x] 7.0 Add focused behavioral coverage for all transitions, due-at-boundary selection, capped lists, duplicate/hidden IDs, null parsing, content-save preservation, unchanged edit time, stale hash, concurrent saves, read-only profiles and target isolation. Verify local/server canonical parity and that rebuilding indexes does not lose state.
- [x] 8.0 Update owning core/app/protocol docs and record the implemented contract/verification here. Supply glossary/browser wording to the integrator.

## Relevant files

- `src/core/{frontmatter,document-update}.ts`, `src/core/canonical/{markdown-store,metadata-date}.ts`, `src/types.ts` — parsing, date validation and canonical publication.
- `src/app/server-memory/{recent,index}.ts` and document workflow modules — patterns for root-scoped reads and writes.
- `src/adapters/http-server/routes.ts`, shared protocol definitions and `integrations/macos-companion/` gateway — transport admission only.
- `test/{server-recent,canonical-document-update,canonical-metadata-read,runtime-document-operations}.test.js` and companion gateway tests — existing test patterns.

## Acceptance

- Settle/snooze/reactivate survives restart and index rebuild and remains inspectable in Markdown.
- Due notes return without a browser visit; content timestamps stay truthful; stale/unauthorized mutations fail without losing note content.

## Implemented contract and verification — 2026-10-22

- Canonical policy and metadata-only patch live in `src/core/attention.ts`; publication uses the existing canonical root queue, snapshot/lock and atomic writer. Explicit overrides survive ordinary omitted-field content saves; deliberate submitted values remain editable. All other metadata/body bytes and content edit dates survive attention-only patches.
- Frozen transport: GET `/memories/all/attention`; PATCH existing `/memories/all/documents/:id`, strict `{action:"settle"|"reactivate"}` or `{action:"snooze",until:ISO}`, mandatory If-Match. Full confirmed document read packet plus old/new hashes/index state returns on success. GET notes extend recent metadata with optional `attentionAt`; packet optionally supplies `nextWakeAt` and displayed invalid-value warnings. Root integration owns browser transport/timers/pins and glossary wording.
- Isolated TypeScript + real editor bundle build and 50 focused/regression tests passed (canonical update/metadata read, string/null parsing/property checks, dream writing/retrieval, runtime document operations, recent and new attention tests). Two gateway tests also passed: read-only remote authorization and attention PATCH body/hash/generation/tab/target isolation. No shared dist build, release, installation, commit or personal-memory writes.
- Null consumer audit: canonical IDs/titles/dates use existing type validation; scalar/array policies retain guards/nullish fallbacks; bounded dream/frontmatter JSON packets preserve null. TypeScript strict compilation passes. Quoted `"null"` remains a string.
- State is entirely canonical, so no index restoration/migration is required. Tests prove listing before any indexing/state directory and across subsequent canonical mutation; an actual QMD full-rebuild run remains part of broader integration/release validation, not a prerequisite for metadata persistence. Corpus scan input work remains unbounded and filesystem cooperation limits remain documented.
- Backend evidence does not cover UI wake timers, custom local-time DST resolution, real device sleep/restart, pinned presentation or browser save barriers; these belong to the interface/integration track.
