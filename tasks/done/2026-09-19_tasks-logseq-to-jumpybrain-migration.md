# Logseq to jumpyBrain Migration

Completed on 2026-09-19. Shipped the local CLI importer, validated source-authoritative reconciliation and failure rollback, and applied the user-authorized vault import to local memory. Original granular checklist retained below.

## Goal

Ship a generic, safe, rerunnable migration workflow that copies a classic file-based Logseq graph into a separate jumpyBrain memory root. Import every Markdown document under `pages/` and `journals/` as one canonical jumpyBrain document, preserve each source body losslessly, and leave the source graph untouched. On later runs, treat Logseq as authoritative: update the same destination documents instead of creating duplicates, overwrite conflicting jumpyBrain content by default, and reconcile imports removed from the source.

## Notes

- This is a one-way migration into a new memory root, not in-place conversion or ongoing bidirectional synchronization.
- Import all regular `.md` files recursively under Logseq `pages/` and `journals/` only.
- Map `pages/` to jumpyBrain `notes/` and `journals/` to `sessions/`; preserve relative subpaths within each bucket.
- Preserve Logseq body bytes and syntax, including bullets, tabs, properties, tasks, macros, wiki links, line endings, and final-newline state. Add a separate jumpyBrain frontmatter envelope without normalizing the body.
- Do not copy assets, Logseq configuration, backups, scripts, root-level Markdown, or any non-Markdown file. Existing references to omitted assets remain text and should be reported, not rewritten or followed.
- Default to dry-run. Applying a migration must be source-read-only, destination-safe, auditable through a checksum manifest, and transactionally recoverable if a run fails partway through.
- A rerun is a source-authoritative reconciliation, not an additive import: classify files as create/overwrite/delete/unchanged; preserve stable jumpyBrain document IDs for existing mapped documents; overwrite mapped destination content by default; and remove previously imported outputs whose source files disappeared.
- Successful overwrite is intentionally not a merge. Edits made only in an imported jumpyBrain document are replaced on the next migration run. The untouched Logseq graph remains the source of truth and the reliable way to recreate a clean destination.
- The supported user surface should be the shipped CLI, backed by core/app seams, rather than a development-only repository script. Recommended command shape: `jumpybrain migrate logseq --source <vault> --root <new-memory-root> [--apply] [--json]`.
- The importer must not classify every Logseq page as a jumpyBrain synthesized `page`; imported pages are `note` documents and journals are `session` documents.
- Do not add Logseq database-graph/mirror support in this task. Detect likely DB/mirror inputs and fail with a clear unsupported-mode message rather than claiming a lossless migration.

## Research Findings

- The inspected example `~/Documents/bliro-md` is a Logseq 0.10.15 file graph with 56 active page files, 8 active journal files, 25 historical Markdown backups under `logseq/bak/`, and one root instruction Markdown file.
- The example has no YAML frontmatter. It relies on Logseq outliner Markdown, `property:: value`, task markers, tabs, and wiki links.
- Its few `id:: <uuid>` values occur inside journals and represent Logseq block identity; they must not be reused as jumpyBrain file-level `mem_<uuid>` IDs.
- A disposable-copy smoke with the current generic index scanned all 90 Markdown files, including 25 backups and the root instruction file. A generic search returned backup content among its results. Migration discovery therefore must use an allowlist (`pages/**/*.md`, `journals/**/*.md`), not the current whole-root Markdown walk.
- Current `ensure-ids` would prepend YAML to Logseq pages, and the current page writer emits a top-level heading. Neither is an appropriate migration path for this graph.
- No private source content or filenames should be copied into repository fixtures. Build synthetic fixtures that reproduce only the relevant structure and syntax.

## Relevant Files

- `src/architecture.docs.md` - Layering and canonical Markdown constraints.
- `src/core/canonical/canonical.docs.md` - Canonical discovery, parsing, provenance, and document identity boundary.
- `src/core/canonical/markdown-store.ts` - Existing Markdown walking and canonical bucket behavior; do not broaden its normal write scope accidentally.
- `src/core/memory-root/memory-root.docs.md` and `src/core/memory-root/index.ts` - Destination initialization and schema compatibility.
- `src/core/writing/writing.docs.md` and `src/core/writing/` - Pure ID, path, Markdown rendering, and metadata policy.
- `src/app/app.docs.md` - App orchestration boundary.
- `src/app/local-memory/local-memory.docs.md` and `src/app/local-memory/index.ts` - Destination indexing after a successful import.
- `src/runtime/index.ts` - Public local runtime surface.
- `src/cli/commands.ts`, `src/cli/args.ts`, `src/cli/local-transport.ts`, `src/cli/usage.ts` - CLI dispatch, arguments, local runtime seam, and help.
- `src/core/migration/{index.ts,types.ts,migration.docs.md}` - Pure mapping, lossless envelopes, action planning, reference diagnostics, and durable manifest validation/types.
- `src/app/migration/{index.ts,discovery.ts,filesystem.ts,transaction.ts,migration.docs.md}` - Local discovery/preflight, apply, rollback, and manual recovery receipts.
- `src/cli/migrate.ts` - Local-only CLI presentation and explicit index follow-up.
- `src/core/frontmatter.ts` - JSON-quoted scalar metadata round-trip.
- `test/logseq-{migration-policy,migration-cli,migration-safety,canonical-visibility,metadata}.test.js` - Synthetic migration, integration, and regression coverage.
- `docs/logseq-migration.md` - Supported import/rerun/recovery contract.
- `docs/memory-format.md`, `docs/cli-commands.md`, `docs/agent-workflows.md` - User-facing format and workflow documentation.
- `test/architecture-boundaries.test.js`, `test/package-entrypoints.test.js`, `test/memory-cli.test.js` - Boundary, package, and CLI test patterns.
- `scripts/pack-local.mjs` and `package.json` - Packed/installed CLI validation.

## Tasks

- [x] 1.0 Define and document the migration contract
  - [x] 1.1 Read `src/architecture.docs.md` and the nearest co-located `*docs.md` before changing each source module.
  - [x] 1.2 Specify `jumpybrain migrate logseq --source <vault> --root <new-root>` as a local-only operation; default to a non-mutating dry-run and require `--apply` to create output.
  - [x] 1.3 Define the source allowlist as regular `.md` files recursively under configured/default `pages/` and `journals/` directories. Never scan the whole graph root and never traverse symlinks.
  - [x] 1.4 Define the fixed initial mapping: `pages/<relative>.md` → `notes/<relative>.md`; `journals/<relative>.md` → `sessions/<relative>.md`.
  - [x] 1.5 Define source immutability: migration must never initialize, stamp IDs, rename, reformat, index, or otherwise write inside the Logseq graph.
  - [x] 1.6 Define destination safety: reject source/destination equality and unsafe overlap, incompatible memory roots, path escapes, normalized/case-folded source collisions, unsupported file types, and likely DB-graph Markdown mirrors. Allow a compatible non-empty destination because reruns and conflicts are expected.
  - [x] 1.7 Define source-authoritative rerun behavior. Compare the current source plan with the prior manifest and destination, classify every action as create/overwrite/delete/unchanged, and make identical reruns no-op successfully.
  - [x] 1.8 Define conflict behavior explicitly: a mapped Logseq source overwrites its destination path by default even when the destination changed independently; preserve an existing valid destination `mem_<uuid>` and `created_at` while replacing its imported metadata/body and refreshing `updated_at`.
  - [x] 1.9 Reconcile removals so a prior manifest entry absent from the current Logseq source cannot remain as a duplicate/stale imported document. Delete only the exact manifest-owned output after validating its path and identity; never infer deletions by scanning unrelated jumpyBrain files.
  - [x] 1.10 Provide an opt-in fail-on-conflict mode if useful for cautious users, but keep overwrite as the documented default.
  - [x] 1.11 Keep live bidirectional synchronization, block-level splitting, journal append, source cleanup, and reverse conversion as explicit non-goals. Rerunning the full migration command is the supported refresh mechanism.

- [x] 2.0 Implement pure Logseq migration planning policy in core
  - [x] 2.1 Add focused core migration policy under a documented submodule such as `src/core/migration/`; keep filesystem orchestration, CLI parsing, QMD, and logging out of it.
  - [x] 2.2 Model a deterministic migration plan containing source-relative path, destination-relative path, destination type, derived title, source body hash, prior manifest/destination state, create/overwrite/delete/unchanged action, warnings, and collision/error information without including memory bodies in normal output.
  - [x] 2.3 Derive page titles from source-relative filenames with bounded Logseq filename decoding (including percent escapes and triple-lowbar namespace encoding) and a safe literal fallback when decoding is invalid.
  - [x] 2.4 Derive journal titles and an optional `date` field from supported `YYYY_MM_DD.md` filenames without treating filesystem timestamps as historical event dates.
  - [x] 2.5 Define imported frontmatter with a fresh file-level `mem_<uuid>` ID for new outputs, mapped `type`, derived `title`, `source: "logseq-migration"`, source-relative provenance, destination creation/update timestamps, and no false `user-reviewed` confidence claim. On overwrite, preserve the valid existing mapped document ID and `created_at` so reruns do not break document identity.
  - [x] 2.6 Add an import-specific Markdown renderer that prepends simple jumpyBrain frontmatter while preserving the complete Logseq source as the exact body. Do not use body rendering that trims whitespace, changes line endings, or rewrites Logseq syntax.
  - [x] 2.7 Treat Logseq `id::` properties as body content only. Never interpret block UUIDs as jumpyBrain document IDs.
  - [x] 2.8 Add pure detection/reporting for wiki links and local non-Markdown references so dry-run can report unresolved page targets and omitted assets without changing source text.

- [x] 3.0 Implement transactional local migration orchestration
  - [x] 3.1 Add a focused app migration module that resolves and validates source/destination roots, discovers only allowlisted source files, builds the complete plan before writing, and delegates pure transformations to core.
  - [x] 3.2 Ensure discovery supports nested page/journal directories but ignores `logseq/`, `logseq/bak/`, `assets/`, root Markdown, hidden support state, and every non-`.md` file by construction rather than an ever-growing denylist.
  - [x] 3.3 Load and validate a prior migration manifest when present. Build current source mappings by source-relative identity and stable destination path so reruns cannot create date-suffixed or otherwise duplicate copies.
  - [x] 3.4 Make dry-run perform all readable preflight checks and return create/overwrite/delete/unchanged counts, byte totals, mappings, warnings, and errors without creating or changing destination state.
  - [x] 3.5 On first `--apply`, create the destination through normal memory-root setup. On rerun, require a compatible jumpyBrain root and plan changes against its prior manifest and current canonical files.
  - [x] 3.6 Implement source-wins overwrite with atomic same-directory file replacement. Preserve an existing mapped destination ID/creation timestamp, but replace its body and imported metadata even when its current checksum differs from the previous manifest.
  - [x] 3.7 Remove stale prior imports only when the prior manifest path and memory ID identify the exact managed output and the corresponding source mapping is now absent. A missing/mismatched identity must fail safely rather than deleting an unrelated file.
  - [x] 3.8 Write a versioned replacement manifest containing relative source/output mappings, stable memory IDs, source body hashes, output hashes, migration timestamp, importer version, and aggregate action/warning counts. Do not store source bodies or require absolute source paths in the manifest.
  - [x] 3.9 Verify every proposed output by reparsing its frontmatter and comparing its extracted body hash to the source hash before committing the run.
  - [x] 3.10 Make the complete apply transactional across creates, overwrites, deletions, and manifest replacement: retain temporary rollback copies during the operation, restore the pre-run destination after injected failure, and clean temporary state after success. Do not retain old canonical content as derived-state backups after a successful source-authoritative overwrite.
  - [x] 3.11 Decide whether successful apply should rebuild the derived QMD index automatically or print an explicit follow-up `jumpybrain index` command. Whichever policy is chosen, canonical migration success must remain distinguishable from an optional indexing failure.

- [x] 4.0 Expose the migration through runtime and CLI boundaries
  - [x] 4.1 Export plan/apply operations through `src/runtime/index.ts` without importing CLI or server protocol code.
  - [x] 4.2 Add a local transport seam and focused CLI command module rather than putting migration behavior in the executable shim or shelling directly from CLI into QMD.
  - [x] 4.3 Parse `migrate logseq`, `--source`, `--root`, `--apply`, and `--json`; reject remote target flags because migration reads a local source graph and creates a new local root.
  - [x] 4.4 Make human dry-run output lead with planned page/session and create/overwrite/delete/unchanged counts, destination, omitted-file warnings, the source-wins warning, and the exact apply command. Do not print note bodies, snippets, secrets, or source absolute paths unnecessarily.
  - [x] 4.5 Make JSON output stable enough for automation and clearly identify `dryRun`, `applied`, `sourceDocuments`, `outputDocuments`, `created`, `overwritten`, `deleted`, `unchanged`, `warnings`, `manifest`, and `indexed` state.
  - [x] 4.6 Ensure the migration command is included in the installed/packed CLI; do not rely on an unpackaged developer-only file under `scripts/`.

- [x] 5.0 Add deterministic migration and safety coverage
  - [x] 5.1 Create a synthetic Logseq file-graph fixture with pages, journals, nested files, tabs, CRLF/LF files, no-final-newline files, properties, tasks, macros, wiki links, block IDs, omitted asset links, config, backups, and unrelated root Markdown. Do not copy content from `~/Documents/bliro-md`.
  - [x] 5.2 Test that only active `pages/**/*.md` and `journals/**/*.md` regular files enter the plan and that every source file produces exactly one destination document in the correct canonical bucket.
  - [x] 5.3 Test byte-for-byte body preservation across frontmatter insertion, including leading delimiters, Unicode, tabs, line-ending styles, blank files, trailing whitespace, and final-newline state.
  - [x] 5.4 Test fresh valid IDs, destination types/titles/dates/provenance, unique IDs, and non-reuse of Logseq block `id::` values.
  - [x] 5.5 Test dry-run non-mutation, source-tree non-mutation after apply, transactional restoration on injected failure, incompatible destination rejection, path traversal, symlinks, case-fold collisions, duplicate normalized paths, and source/destination overlap.
  - [x] 5.6 Test manifest verification and reruns: identical input is a no-op; changed Logseq content overwrites the same output without creating another file; the original memory ID/creation timestamp remain stable; and `updated_at`/manifest hashes advance.
  - [x] 5.7 Test destination conflicts explicitly: independently edit an imported jumpyBrain body, rerun migration, and verify the Logseq body wins by default. Cover an opt-in fail-on-conflict mode if implemented.
  - [x] 5.8 Test source removals/renames: stale manifest-owned outputs are removed, renamed source files produce only their new mapped output, and unrelated canonical jumpyBrain documents are never deleted. Test identity mismatch fails before deletion.
  - [x] 5.9 Test direct path conflicts with pre-existing jumpyBrain documents according to the source-wins contract, including stable ID preservation when valid and fresh ID assignment when absent.
  - [x] 5.10 Test that omitted asset/config/backup counts and unresolved wiki-link counts are reported without copying or rewriting those files/references.
  - [x] 5.11 Add CLI tests for human/JSON dry-run, first apply, overwrite rerun, removal reconciliation, missing/invalid source directories, remote-target rejection, unsupported DB/mirror detection, and useful errors without body leakage.
  - [x] 5.12 Extend architecture tests so pure migration policy stays in core, filesystem workflow stays in app, CLI remains a boundary, and QMD internals remain behind the approved adapter/app seam.

- [x] 6.0 Validate against the representative vault without retaining private content
  - [x] 6.1 Run dry-run against `~/Documents/bliro-md` and verify it selects only the active page and journal Markdown present at validation time—not `logseq/bak`, root instructions, scripts, config, or assets.
  - [x] 6.2 Apply into a disposable new root outside the source vault and verify source tree hashes are unchanged before and after migration.
  - [x] 6.3 Verify destination document count equals selected source count, all imported IDs are valid/unique, all body hashes match the manifest, and no non-Markdown source content was copied.
  - [x] 6.4 Modify one source document and independently modify its imported destination in the disposable copies, rerun migration, and verify Logseq wins, the destination path/ID stay stable, and no duplicate appears.
  - [x] 6.5 Remove or rename one source document in the disposable source copy, rerun, and verify the old managed output is reconciled without touching unrelated destination memories.
  - [x] 6.6 Build the destination index and smoke `tree`, `search`, and `recall`; verify provenance points only to `notes/` and `sessions/` outputs and no backup content can surface.
  - [x] 6.7 Delete all disposable copies after validation. Record only aggregate counts/results in the task list or changelog—never private filenames, note text, snippets, or absolute-path-bearing manifests.

- [x] 7.0 Document, package, and finalize
  - [x] 7.1 Add `docs/logseq-migration.md` covering prerequisites, dry-run/apply examples, exact source/output mapping, text-only behavior, body preservation, manifest verification, source-authoritative overwrite/reconciliation reruns, stable IDs, transactional failure recovery, clean-root recreation, and limitations.
  - [x] 7.2 Update `docs/cli-commands.md`, `docs/memory-format.md`, `docs/agent-workflows.md`, CLI usage text, and relevant co-located `*docs.md` files.
  - [x] 7.3 Clearly document that attachments are not copied, their textual references may no longer resolve, imported Logseq properties/macros remain plain Markdown content, and migration does not provide continued sync or bidirectional editing.
  - [x] 7.4 Run `npm run validate`, `npm run cli:pack`, `git diff --check`, and an installed/packed-CLI migration smoke against a synthetic fixture.
  - [x] 7.5 On completion, record the shipped migration contract and validation result in `tasks/CHANGELOG.md`, mark this task complete, and archive it under `tasks/done/` with the completion date.

## Implementation / Validation Progress

- Core/app importer, runtime/CLI seams, documentation, and synthetic tests complete. `npm run validate`: 275 passing tests; `npm run cli:pack`: 115 required files verified; `git diff --check` passes. Actual offline-installed package CLI preview/apply/no-op/update/delete and public runtime exports verified.
- Indexing is an explicit separate command. Redirected destination `indexRoot` is rejected.
- Retain `.logseq-migration-manifest.json` outside derived state as durable deletion-ownership metadata. Handled failures roll back; interrupted/unsafe transactions retain private receipts/preimages and block further runs pending documented manual recovery.
- Default Logseq directory configuration only; reject custom directories rather than silently missing content. POSIX literal colon filenames are supported; Windows alternate data streams are rejected.
- Canonical scanning narrowly admits validated imported envelopes despite legacy filename/directory exclusions; ordinary excluded files remain excluded. JSON-quoted envelope metadata now round-trips through canonical parsing.
- Representative disposable-vault validation: 88 pages + 21 journals (109 imports); all IDs, source/output/body hashes, canonical visibility, exact rerun, conflict overwrite, rename/removal, unrelated-file preservation, tree, real-QMD search/recall pass. Original source-tree hashes unchanged; all private disposable trees removed. Record aggregate evidence only.
- User-authorized local import: 440 pages + 1,036 journals (1,476 creates), zero overwrites/deletions; all body/output checksums and IDs verified; source tree unchanged; five existing memories preserved. Immediate repeat: 1,476 unchanged, zero mutations. Rebuilt index: 1,481 documents. Tree/search/recall pass with imported provenance. No arbitrary earlier-import deduplication required.
- Deployment note: repository/packed runtime sees all 1,481 local documents; the already-running frozen companion runtime sees 1,480 due to its pre-fix legacy filename exclusion. The companion/global CLI were not replaced or restarted during this task; refresh their installed runtime separately to pick up the new command and canonical-discovery fix. No private filenames or note bodies retained in repository evidence.

## Decisions

- Create a new jumpyBrain root; never convert the Logseq source in place.
- Import all active Markdown under `pages/` and `journals/`.
- Preserve one destination document per source file; do not split blocks.
- Map pages to `notes/` and journals to `sessions/`.
- Preserve source body syntax and bytes rather than normalizing Logseq Markdown.
- Copy Markdown only. Do not copy assets or any other non-Markdown source content.
- Make migration dry-run-first, source-read-only, destination-safe, manifest-backed, and transactional on apply failures.
- Treat Logseq as authoritative on rerun: overwrite mapped destination content by default, preserve stable destination IDs where valid, remove stale manifest-owned imports, and never create duplicate copies for the same source path.
- Destination-only edits to imported documents are intentionally replaceable; this workflow does not merge changes in both directions.
- Defer live bidirectional support unless a later task establishes a safe, necessary design.

## Changelog

- Do not update `tasks/CHANGELOG.md` for planning or incremental task edits. Update it only when this migration task is completed and archived.
