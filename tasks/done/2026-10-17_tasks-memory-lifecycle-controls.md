# Safe memory lifecycle controls

Status: complete, verified, and archived with user approval on 2026-10-17.

Completed historical evidence-date capture across local and hosted interfaces, preserved dates through edits, and verified guarded deletion, index reconciliation, and provenance safety.

## Goal

Support truthful historical capture and deliberate removal through the same local/hosted CLI workflow. Reuse existing document identity, date semantics, optimistic concurrency, and derived-index reconciliation rather than adding another memory format or hidden lifecycle database.

## Notes

- Client feedback coverage: 7 (backfilled dates), 8 (delete command), 10 (template-dependent lint).
- [Temporal retrieval](../done/2026-10-11_tasks-temporal-retrieval-correctness.md) already separates declared evidence `date` from writing/import and edit time. At planning time, creation could not accept that field; this task extends the draft while retaining the temporal model.
- [Maintenance reliability](../done/2026-10-10_tasks-consolidation-maintenance-reliability.md) already removed lint's exact `## Source memories` requirement. Keep this as compatibility/regression verification, not a second lint rewrite.
- Coordinate derived freshness/results with [self-maintaining recall](2026-10-11_tasks-self-maintaining-recall.md), installation/policy with [project integration](../todo/tasks-portable-installation-project-integration.md), and scheduling with [bounded execution](2026-10-11_tasks-bounded-retrieval-execution.md).
- Read `src/architecture.docs.md` and affected co-located docs before implementation. Core owns date/identity/filesystem safety policy; app owns workflows; CLI/HTTP remain thin.

## Design direction

- Add optional `remember --date` using the existing validated document evidence-date field. Accept real ISO calendar dates or timezone-explicit timestamps; keep `created_at`/`updated_at` writer-owned and the filename's current creation-date convention.
- A document date is a user-declared observation/evidence date, not proof of every event in a multi-period body or an inferred validity interval. Do not add parallel `event_date`/`occurred_at` fields or a parser that extracts dates from prose.
- Add single-document `delete --id ... --if-match ...` with explicit apply authorization and a nonmutating preview. Require the same identity/hash safety as editing and serialize with cooperating replacement writers.
- Start with explicit permanent removal of the selected canonical file; document irreversibility and user-controlled backup/Git recovery. No soft-delete query engine, trash retention service, bulk deletion, automatic backlink rewrites, or cascading deletes.
- Canonical mutation and index refresh are separate outcomes: once removed, index failure reports removal succeeded and freshness pending/failed. Missing/stale/duplicate identities never authorize deletion of a different file.
- Project capture approval does not authorize deletion. Global/team/remote removal remains explicitly authorized and protected by existing device/server policy; read-only targets cannot preview via a mutating request.

## Acceptance criteria

- Historical memories created locally/remotely retain today's writing timestamps and the caller's explicit valid evidence date. Temporal recall finds them by evidence date, not creation time.
- Missing `date` preserves current creation behavior. Invalid/impossible/ambiguous dates and malformed/repeated flags fail before canonical mutation; body frontmatter is not reinterpreted as metadata.
- Delete preview makes no canonical/index mutations. Apply requires a unique canonical ID, a matching prior-read hash, and explicit authorization; arbitrary paths/globs and missing preconditions fail closed.
- Cooperative update/delete races cannot lose an intervening edit or remove another document. Symlinks, hardlinks, special files, unsafe ancestors, duplicate IDs, and mismatched identity are rejected; limits against uncooperative external writers are explicit.
- Local/hosted deletion uses one workflow, removes the selected document from ordinary/dream/temporal retrieval after reconciliation, and preserves surviving documents and their links unchanged.
- Reference warnings are advisory and bounded, distinguishing inbound canonical links from declared relationships; they never imply a complete corpus dependency graph.
- Source lint accepts valid provenance under alternate headings or inline references and still distinguishes absent, broken/ambiguous, and context-only references. Heading text alone is not provenance.

## Relevant files

- `test/evidence-date-capture.test.js`, `test/document-deletion.test.js`, `test/filesystem-publication.test.js`, `test/semantic-index-lifecycle.test.js`, `test/processing-evidence.test.js` — date/transport, mutation safety, derived reconciliation, and provenance regressions.

- `src/types.ts`, `src/core/writing/`, `src/core/retrieval-policy/temporal.ts` — creation drafts and existing strict date policy.
- `src/app/writing/{local-writer,remote-writer}.ts`, `writing.docs.md` — local/hosted creation metadata.
- `src/core/canonical/{markdown-store,links}.ts`, `src/core/document-update.ts`, canonical/writing module docs — ID/hash/lock/path safeguards and reference semantics.
- `src/app/local-memory/index.ts`, `src/app/server-memory/index.ts`, `src/runtime/index.ts` — lifecycle use cases and public surface.
- `src/cli/{memory-write,document-edit,args,commands,usage,recipes,remote-access-policy}.ts` — CLI and authorization.
- HTTP client/server adapters, `docs/{memory-format,cli-commands,shared-memory-protocol}.md` — transport parity and date/deletion contracts.
- `src/app/processing/lint.ts`, `test/{processing-lint,filesystem-publication,temporal-retrieval,temporal-transport,remote-access-policy}.test.js` — safeguards/regressions.

## Tasks

- [x] 1.0 Expose existing evidence-date semantics during capture
  - [x] 1.1 Read affected docs; inventory local/hosted remember drafts, runtime exports, strict argument parsing, recipes, and client validation. Reuse existing date validation without conflating temporal interval bounds with document metadata.
  - [x] 1.2 Add optional validated `date` to creation drafts, CLI `remember --date`, and HTTP creation payloads. Both writers render the same canonical field; omitted values keep existing behavior.
  - [x] 1.3 Preserve writer-owned IDs/timestamps and body-only stdin. Ensure date-only values remain dates, explicit offsets retain documented meaning, and an explicit date is not substituted for filename/creation time.
  - [x] 1.4 Test valid historical/future evidence, leap days, impossible/timezone-less inputs, nonstring API values, repeated/missing flags, omitted date, and local/remote/recipe parity. Verify date-bounded recall and hash-checked edits preserve the declared field.
  - [x] 1.5 Update CLI/memory-format and agent capture guidance: backfill evidence dates deliberately, preserve uncertainty/multi-period citations, and do not claim verified event chronology.

- [x] 2.0 Define minimal guarded deletion
  - [x] 2.1 Specify preview/apply CLI/runtime/HTTP contracts, authorization, required ID/hash, static path-safe errors, removed/index-state outcomes, and repeated-request behavior. Preview can compose a normal read without introducing a mutating endpoint.
  - [x] 2.2 Reuse canonical unique-ID lookup, inode/path checks, and cooperating replacement exclusion for guarded removal. Recheck hash/identity immediately before mutation; keep concurrency and crash limitations explicit rather than claiming portable filesystem compare-and-swap.
  - [x] 2.3 Define bounded advisory inbound-link/relationship diagnostics using canonical resolution. Do not rewrite surviving notes, block deletion because of unrelated broken links, or require a new persistent graph/index.
  - [x] 2.4 Keep the operation single-document and explicitly permanent. Document recovery from user backups/Git and clarify missing-ID handling; no automatic ID stamping, force bypass, glob/path deletion, or cascade.

- [x] 3.0 Wire deletion through app and transport seams
  - [x] 3.1 Implement a shared app operation and runtime/local transport surface; thin server-memory and HTTP handlers invoke the same guarded canonical semantics.
  - [x] 3.2 Add strict CLI delete/recipe parsing with explicit apply authorization and prior-read hash. Classify deletion as a mutation before credentials/stdin/transport; trusted project capture settings cannot authorize it implicitly.
  - [x] 3.3 Reuse existing server replay/idempotency conventions where applicable; document retry-after-success and response-loss behavior. A stale token or disappeared file must not delete a recreated document at the same path.
  - [x] 3.4 Reconcile/invalidate ordinary and dream index state using the existing incremental lifecycle. Return truthful removal success with pending/failed index diagnostics if backend work fails; never restore or repeat canonical deletion merely to retry indexing.

- [x] 4.0 Validate lifecycle safety and existing provenance flexibility
  - [x] 4.1 Add deterministic races between update/delete/index/read plus cross-process cooperating writer tests. Cover changed hashes, duplicate/missing IDs, unsafe filesystem objects, permission errors, uncertain response delivery, and derived-index failure after removal.
  - [x] 4.2 Verify local/runtime/HTTP/CLI parity, protected remote target denial, surviving bytes/links unchanged, and deleted evidence absent after successful incremental reconciliation. Keep content/host paths out of remote errors.
  - [x] 4.3 Verify the shipped lint accepts `Sources`, other headings, inline/reference/wiki citations, and existing generated source lists. Add only missing regressions; preserve warnings for absent/broken/context-only evidence without another heading schema.
  - [x] 4.4 Update owning docs, CLI/protocol contracts, and backup/recovery guidance; run `npm test` and record results/platform limits here. No registry/global integration changes are required by this ticket.
  - [x] 4.5 Consolidate duplicated date validation, identity/precondition checks, and deletion-specific index logic where equivalent. Record the complexity review; do not retain speculative trash/bulk/relationship machinery or log planning as a completed changelog result.

## Browser-QA deletion implementation — 2026-10-16

The user authorized all six web-QA improvements in the current chat. Single-document deletion is implemented and verified through runtime, CLI/recipe, HTTP and browser/companion surfaces; [the QA owner](2026-10-22_tasks-local-companion-qa.md#all-improvements-implementation--2026-10-16) records files, safeguards and evidence. This does not implement the separate historical-date capture work in section 1 or close every broader lifecycle test/provenance item in section 4.

The operation previews by default, requires explicit permanent apply plus prior-read hash, reuses replacement serialization/locks, and reports derived-index outcomes separately. No Trash or replay database was introduced. Backlink/declared-relationship warnings are advisory. Identical-ID/content recreation across separate reads and noncooperating external writers remain documented filesystem limits.

## Implementation and focused verification — 2026-10-17

- Added optional `date` across the shared local/remote creation draft, both writers, strict remember/recipe parsing, HTTP client validation, and server validation. Reused `metadataDate`; dates/offsets remain literal, writing timestamps/filenames remain current, and stdin frontmatter stays body text. Omitted date preserves creation behavior.
- Body-only updates now retain evidence dates; explicit metadata may correct them or mark evidence time unknown with an explicit empty string. No new temporal model, event parser, or implicit date inference was introduced.
- Added date capture regressions for leap/future/offset dates, invalid/untyped input, missing/repeated/equals flags, local/hosted/direct/recipe parity, idempotency replay/conflict, protected identity, and hash-checked edits. End-to-end fake-QMD lifecycle tests verify historical recall across depths.
- Extended deletion checks with deterministic interleavings at lock acquisition (content/identity/hardlink/symlink/ancestor/special-file changes), a real child-process update against an active deletion lock, read-before/read-after assertions, lost-response/no-retry behavior, bounded relationship warnings, and simulated permission denial.
- Fixed HTTP document error mapping: arbitrary native error codes previously allowed filesystem messages through. Only recognized document errors retain domain text; unexpected I/O errors return generic messages. Fault-injected permission failures verify no root/body disclosure and preservation of the canonical file.
- Added gated indexing/removal coverage: removal during indexing leaves explicit stale readiness; failed reconciliation cannot resurrect the file; successful incremental repair clears ordinary/dream/temporal results while preserving surviving bytes/links. Existing read-only policy tests cover direct and recipe deletion denial before credentials.
- Existing lint already accepts alternate headings and inline/reference/wiki sources. Added generated `Source memories` and ambiguous-link regressions; absent/broken/context-only distinctions remain. No lint schema rewrite was needed.

## Complexity review and limits

One shared metadata validator supplies creation semantics; remote drafts now alias the existing common draft. Deletion continues to reuse canonical ID/hash/snapshot checks and cooperating replacement exclusion; existing freshness/index workflows handle reconciliation. No trash, bulk deletion, relationship engine, replay ledger, new storage, or registry/global integration changes were added.

Tests use disposable local roots and localhost servers. Index lifecycle tests use the existing pinned fake-QMD SDK/SQL fixture, not a downloaded model or production hosted deployment. Permission denial and the response-loss boundary are fault-injected. FIFO/links/process checks exercise this macOS filesystem; Windows and other filesystem semantics are unverified. Cooperating lock tests do not establish atomic compare-and-swap against hostile writers, crash recovery, or detection of identical-ID/content recreation between separate reads. Backup/Git recovery remains user-managed, and source warnings are advisory rather than exhaustive dependency analysis.

## Final verification — 2026-10-17

- `npm test` passed: 1,060 tests, 1,059 passed, zero failures/cancellations, one opt-in real-QMD test skipped because `JUMPYBRAIN_TEST_QMD_BIN` was not configured (48.8 seconds). The command rebuilt TypeScript and browser assets before running the complete repository suite.
- `git diff --check` passed. Full-suite coverage includes the new date/lifecycle regressions plus existing architecture, CLI, temporal transport, provenance, creation, and remote-policy checks.
- All task items are complete. Unrelated pre-existing desktop/installation edits were preserved. No global/team memory, installed application, integration, or registry was updated. The user approved archiving and committing the completed lifecycle work on 2026-10-17.
