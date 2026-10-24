# Obsidian import and readable Logseq migration

## Goal

Add a shipped, local-only Obsidian vault importer and update Logseq import so ordinary outline prose becomes readable Markdown without manual dash removal. Give a future agent a complete path from source discovery through canonical storage, current retrieval/editor behavior, safe reruns, and verified completion.

Status: **review and implementation plan complete; implementation pending**. Creating this list does not implement Obsidian import or change Logseq output. Keep it active until all required implementation and verification below are complete.

## Review findings — 2026-10-24

- `planLogseqDocument` and `renderLogseqEnvelope` in `src/core/migration/index.ts` prepend metadata and preserve source bytes exactly. `renderLogseqEnvelope` requires the extracted body hash to equal `sourceHash`. Existing metadata/policy/CLI tests explicitly assert this. The unwanted dashes are the current contract, not a missing CLI switch.
- `LOGSEQ_IMPORTER_VERSION`, manifest format and parser currently accept only version 1. Identical source/destination hashes select the no-op path. Simply changing a renderer would invalidate verification and obscure upgrade behavior; the conversion policy must participate in planning and manifest validation.
- Current app discovery, mappings, result fields (`pages`, `journals`), transaction paths, CLI parser/help/presentation, runtime and transport seams are Logseq-specific. Reuse the existing safety boundary; do not copy its source assumptions into Obsidian discovery.
- Current canonical scanning has a validated **Logseq-only** envelope exception for normally excluded names/directories. An Obsidian importer can appear successful while imported files remain absent from tree/index/ID lookup unless this is addressed.
- The original [Logseq implementation archive](../done/2026-09-19_tasks-logseq-to-jumpybrain-migration.md) remains historical evidence. Current behavior is documented in [Logseq migration](../../docs/logseq-migration.md); Obsidian research and the proposed contract live in [its implementation handoff](../../docs/obsidian-migration.md).
- No matching prior memory was found in a bounded recall. Review used repository source/tests and the official Obsidian storage, properties, links, embeds and Daily notes documentation linked in the handoff. No personal graph/vault was inspected or changed.

## Decisions and boundaries

- One-way import into a separate local root; source stays untouched. Preview first, explicit apply, body-free reports, transactional publication, separate indexing, no live sync or hosted import API.
- Logseq's proposed default is **readable** conversion; retain an explicit **preserve** mode for exact source-body imports. `--body-format readable|preserve` is the intended new Logseq option, not an available flag today. Upgrading an existing import requires previewing changed output even when source bytes have not changed.
- Remove Logseq's structural outline wrappers from ordinary prose and headings; preserve meaningful task/list/code structure. A blanket regex deleting every leading dash is insufficient. Do not use an LLM to silently rewrite source meaning.
- Obsidian keeps prose and intentional lists as written, including original source YAML under an import envelope. Version one maps all notes (including daily notes) to `notes/` with literal relative-path titles; automatic YAML promotion, journal classification, attachment copying, link rewriting and plugin evaluation are out of scope. Report limitations explicitly.
- Keep stable identities and creation dates, source-authoritative reconciliation and fail-on-conflict. Do not overwrite another importer's owned mappings or infer ownership of old ad hoc imports. Do not apply this plan to the user's existing memory without a separately scoped import request.

## Relevant files

- `docs/obsidian-migration.md`, `docs/logseq-migration.md` — target handoff and current supported contract.
- `src/architecture.docs.md`, `src/{core,app}/migration/migration.docs.md`, `src/core/canonical/canonical.docs.md`, `src/cli/cli.docs.md`, `src/runtime/runtime.docs.md` — mandatory boundaries before changing modules.
- `src/core/migration/{index.ts,types.ts}` — mapping, identity, envelope verification, action planning, hashes and ownership validation.
- `src/app/migration/{index.ts,discovery.ts,filesystem.ts,transaction.ts}` — discovery, preflight, reconciliation, transactional publication and recovery.
- `src/core/canonical/markdown-store.ts` — validated import visibility and lookup; inspect associated indexing and title-resolution consumers.
- `src/cli/{args.ts,commands.ts,migrate.ts,local-transport.ts,usage.ts}`, `src/runtime/index.ts`, `src/index.ts` — shipped command/runtime interfaces.
- `test/logseq-{migration-policy,migration-cli,migration-safety,metadata,canonical-visibility}.test.js` — existing regressions; add Obsidian and conversion coverage beside these.
- `test/{architecture-boundaries,package-entrypoints,canonical-title-resolution,canonical-work-reuse,dream-window-imports}.test.js` — current downstream contracts.
- `docs/{agent-workflows,cli-commands,memory-format,release-testing}.md`, `README.md`, `tasks/todo/release-next.md` — workflow and support claims to update after implementation.

## Tasks

- [x] 1.0 Review the current importer and create a discoverable agent handoff
  - [x] 1.1 Read product/architecture/task guidance, original Logseq archive, current modules and regression assertions.
  - [x] 1.2 Check official Obsidian source format documentation and record bounded first-version decisions.
  - [x] 1.3 Link this active list and the Obsidian handoff from current agent/user guidance; distinguish proposed behavior from available commands.

- [ ] 2.0 Specify and fixture Logseq outline-to-Markdown conversion
  - [ ] 2.1 Write exact before/after fixtures for prose blocks, adjacent blocks/paragraph spacing, headings, tab/space nesting, multiline continuations, blank blocks and child lists. Decide how to preserve parent/child meaning when flattening structural wrappers; document ambiguous cases rather than guessing.
  - [ ] 2.2 Preserve intentional lists and ordered lists, checkbox states and Logseq task keywords, fenced/indented code (including literal `-` lines), quotes, tables, properties, block IDs/references, macros, YAML, Unicode, LF/CRLF and final-newline behavior. Unsupported/ambiguous structures must retain content and produce bounded warnings; no silent text loss. Include a real list nested under a prose block.
  - [ ] 2.3 Implement deterministic pure readable conversion and exact preserve mode. Ensure headings/code/lists render as intended after removing their outer outline layer; do not turn every child block into an accidental code block. Invalid UTF-8 may remain byte-exact in preserve mode; readable mode must reject or explicitly preserve it with a warning, never replacement decoding.
  - [ ] 2.4 Expose the Logseq-only format option through runtime/CLI and strict parsing; readable is the new default. Body-free preview/JSON must name the selected conversion/version and report changed/preserved/unsupported counts. Reject invalid/repeated options and Obsidian use of Logseq-only cleanup flags.

- [ ] 3.0 Version transformation verification and upgrade existing imports safely
  - [ ] 3.1 Distinguish original source hashes/bytes, converted body hashes/bytes, and full output hashes. Record transformation mode/version in validated ownership metadata so conversion changes cannot hide behind unchanged source hashes. Verify rendered output against the expected converted body, not the original source checksum.
  - [ ] 3.2 Load trusted version-one manifests without weakening ownership/path/ID validation. Preview and transactionally apply conversion upgrades with unchanged source bytes, preserving IDs and `created_at`; identical reruns in the same mode/version must preserve output/manifest bytes and timestamps.
  - [ ] 3.3 Exercise preserve → readable and readable → preserve, converter-version changes, source changes, source removal/rename, corrupt/unknown-version manifests, mapped edits and manually dash-cleaned destinations. `--fail-on-conflict` must catch independently edited outputs before any write; default source-wins effects stay visible. Old ad hoc imports remain outside ownership reconciliation.
  - [ ] 3.4 Retain current rollback/recovery and source-immutability checks during manifest upgrades. Original sources remain the source of raw bytes; do not claim transformed output alone can reconstruct them or store permanent raw copies under disposable derived state.

- [ ] 4.0 Implement Obsidian policy, discovery and ownership
  - [ ] 4.1 Read affected module docs and extract only useful shared safety/transaction primitives. Retain source-specific types/policy where clearer; avoid a generic plugin framework and preserve public Logseq compatibility.
  - [ ] 4.2 Implement recursive root/nested Markdown discovery and literal `notes/<source-relative>` mapping per the handoff. Fixture root notes, nested folders, extension case, spaces/Unicode, percent signs, duplicate basenames, and note names that collide after normalization/case folding. Reject unsafe paths and overlapping roots before writes.
  - [ ] 4.3 Generate independent canonical IDs/provenance and deterministic titles while preserving the original source YAML/body. Fixture source `id`, `type`, `dream`, `confidence`, `attention_at`, aliases, tags and dates; none may silently take over protected jumpyBrain metadata. Do not apply Logseq outline conversion to Obsidian lists.
  - [ ] 4.4 Exclude hidden support/config/trash, symlinks and special/hardlinked active files, and omit non-Markdown including attachments and Canvas/Bases files. Count omissions without reading asset/plugin bodies; distinguish unsupported/reference diagnostics from successful imports. Report wiki/Markdown links, aliases, headings, blocks and note/asset embeds without fetching or executing them.
  - [ ] 4.5 Add a separate versioned Obsidian ownership manifest and stable source-wins reconciliation. Validate importer identity and overlapping destination ownership before publication, including first import into a Logseq-managed root, the reverse order, and malformed other-importer ownership state. Test changed/removed/renamed sources and wrong-vault rerun guidance.

- [ ] 5.0 Connect the shipped CLI and current canonical consumers
  - [ ] 5.1 Add `migrate obsidian` through strict args, focused CLI presentation, local transport and runtime/package exports. Reject remote flags before credential/network work and retain body-free summaries/results, dry-run nonmutation, explicit apply and `indexed: false`.
  - [ ] 5.2 Extend only validated import-envelope eligibility for Obsidian where required. Imported `gold.md`, `answer_session_ids.md`, and nonhidden `build/`/`logs/` descendants must remain discoverable without a manifest/index; forged envelopes, unrelated excluded notes, hidden support and symlinks must remain excluded.
  - [ ] 5.3 Verify tree, index input scanning, lexical recall/search, `show`/expansion by ID, title resolution, graph links and dream evidence windows use the same canonical imported notes. Confirm imports remain ordinary notes/sessions rather than dream pages and creation/modification times do not masquerade as event dates.
  - [ ] 5.4 Check relative and vault-root Markdown links after relocation, wiki basename ambiguity, block/heading anchors and embeds against actual graph/editor behavior. Preserve and report unsupported semantics; do not claim Obsidian rendering or graph parity. Scope any future rewriting separately.

- [ ] 6.0 Verify end to end and complete the handoff
  - [ ] 6.1 Use synthetic Logseq and Obsidian fixtures for preview → apply → body/metadata/hash inspection → destination-only index → bounded recall → show by ID → current browser/editor open/save → rerun. Capture counts, source-tree hashes before/after, stable identities, no duplicate outputs, omission diagnostics and index/save status separately. Verify the ordinary Logseq prose fixture has no unwanted outline dashes in the editor.
  - [ ] 6.2 Cover fresh and mixed nonempty destinations, destination conflicts/deletions, no-op reruns, manifest/version upgrades, unsafe paths, initialization/apply/rollback failures, concurrent edits and retained recovery receipts. Retain source-wins warnings and test body/path redaction in normal output.
  - [ ] 6.3 Run `npm test` and the relevant browser/editor smoke workflow from `docs/release-testing.md`; verify the packed CLI/runtime supports both formats in a temporary consumer. Record exact tested snapshot, commands, results, platform/semantic-index limits and untested real-vault behavior. Do not install over the user's CLI or import their vault for these tests.
  - [ ] 6.4 Update owning module docs, CLI usage/reference, memory format, both importer guides, agent workflows and README to reflect only verified support. Remove obsolete universal byte-preservation claims when readable Logseq mode lands; document preserve mode, conversion upgrades, conflict behavior and recovery. Add concise user-facing pending release notes only for implemented behavior.
  - [ ] 6.5 Record outcome/verification/remaining limits, archive this list to `tasks/done/YYYY-MM-DD_tasks-obsidian-logseq-imports.md`, repair links, update `tasks/CHANGELOG.md` for the completed result, and commit only scoped changes under `docs/task-workflow.md`. Report the commit; no push, release or personal import is implied.

## Planning verification

Reviewed against source snapshot `fa8740e8c0d01cd0bb7723ab219ed24d4e1fb3cc` on 2026-10-24 with Node `v26.7.0`; this planning change modifies Markdown only.

- `npm run build` — passed.
- `node --test test/logseq-migration-policy.test.js test/logseq-migration-cli.test.js test/logseq-migration-safety.test.js test/logseq-metadata.test.js test/logseq-canonical-visibility.test.js test/architecture-boundaries.test.js test/package-entrypoints.test.js test/dream-window-imports.test.js` — **58 passed, zero failed/skipped**. Confirms current preservation, CLI preview/apply/rerun, conflict/removal, safety, rollback, canonical visibility and layer contracts.
- Local Markdown link check across the five changed documents — all 58 local targets exist. `git diff --check` passed.
- No runtime behavior changed; no feature release note or task archive is due. Full-suite, new-format/conversion, packed-consumer and browser/editor acceptance remain required implementation work above. Existing tests do not establish Obsidian support or readable Logseq conversion. No personal source files, memory roots, installations, global/team memory or remote deployments were changed.
