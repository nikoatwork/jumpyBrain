# Obsidian import

## Goal

Add a shipped, local-only Obsidian vault importer; coordinate shared contracts with the separate Logseq readability task. Give a future agent a complete path from source discovery through canonical storage, current retrieval/editor behavior, safe reruns, and verified completion.

Status: **Obsidian implementation pending**. Logseq implementation was split into [its own task](../done/2026-10-24_tasks-logseq-readable-import.md) at the user’s request on 2026-10-24. Original review findings below describe the pre-implementation snapshot; consult the Logseq task and current owning docs for implemented behavior.

## Original planning review — 2026-10-24 (before Logseq implementation)

- `planLogseqDocument` and `renderLogseqEnvelope` in `src/core/migration/index.ts` prepend metadata and preserve source bytes exactly. `renderLogseqEnvelope` requires the extracted body hash to equal `sourceHash`. Existing metadata/policy/CLI tests explicitly assert this. The unwanted dashes are the current contract, not a missing CLI switch.
- `LOGSEQ_IMPORTER_VERSION`, manifest format and parser currently accept only version 1. Identical source/destination hashes select the no-op path. Simply changing a renderer would invalidate verification and obscure upgrade behavior; the conversion policy must participate in planning and manifest validation.
- Current app discovery, mappings, result fields (`pages`, `journals`), transaction paths, CLI parser/help/presentation, runtime and transport seams are Logseq-specific. Reuse the existing safety boundary; do not copy its source assumptions into Obsidian discovery.
- Current canonical scanning has a validated **Logseq-only** envelope exception for normally excluded names/directories. An Obsidian importer can appear successful while imported files remain absent from tree/index/ID lookup unless this is addressed.
- The original [Logseq implementation archive](../done/2026-09-19_tasks-logseq-to-jumpybrain-migration.md) remains historical evidence. Current behavior is documented in [Logseq migration](../../docs/logseq-migration.md); Obsidian research and the proposed contract live in [its implementation handoff](../../docs/obsidian-migration.md).
- No matching prior memory was found in a bounded recall. Review used repository source/tests and the official Obsidian storage, properties, links, embeds and Daily notes documentation linked in the handoff. No personal graph/vault was inspected or changed.

## Decisions and boundaries

- One-way import into a separate local root; source stays untouched. Preview first, explicit apply, body-free reports, transactional publication, separate indexing, no live sync or hosted import API.
- Logseq now defaults to readable outer-outline conversion and supports `--body-format preserve` for exact source bytes. Its separate task owns implementation/verification; reuse the current contract and preview body-policy upgrades even with unchanged source bytes.
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

- [ ] 2.0 Implement Obsidian policy, discovery and ownership
  - [ ] 2.1 Read affected module docs and extract only useful shared safety/transaction primitives. Retain source-specific types/policy where clearer; avoid a generic plugin framework and preserve public Logseq compatibility.
  - [ ] 2.2 Implement recursive root/nested Markdown discovery and literal `notes/<source-relative>` mapping per the handoff. Fixture root notes, nested folders, extension case, spaces/Unicode, percent signs, duplicate basenames, and note names that collide after normalization/case folding. Reject unsafe paths and overlapping roots before writes.
  - [ ] 2.3 Generate independent canonical IDs/provenance and deterministic titles while preserving the original source YAML/body. Fixture source `id`, `type`, `dream`, `confidence`, `attention_at`, aliases, tags and dates; none may silently take over protected jumpyBrain metadata. Do not apply Logseq outline conversion to Obsidian lists.
  - [ ] 2.4 Exclude hidden support/config/trash, symlinks and special/hardlinked active files, and omit non-Markdown including attachments and Canvas/Bases files. Count omissions without reading asset/plugin bodies; distinguish unsupported/reference diagnostics from successful imports. Report wiki/Markdown links, aliases, headings, blocks and note/asset embeds without fetching or executing them.
  - [ ] 2.5 Add a separate versioned Obsidian ownership manifest and stable source-wins reconciliation. Validate importer identity and overlapping destination ownership before publication, including first import into a Logseq-managed root, the reverse order, and malformed other-importer ownership state. Test changed/removed/renamed sources and wrong-vault rerun guidance.

- [ ] 3.0 Connect the shipped CLI and current canonical consumers
  - [ ] 3.1 Add `migrate obsidian` through strict args, focused CLI presentation, local transport and runtime/package exports. Reject remote flags before credential/network work and retain body-free summaries/results, dry-run nonmutation, explicit apply and `indexed: false`.
  - [ ] 3.2 Extend only validated import-envelope eligibility for Obsidian where required. Imported `gold.md`, `answer_session_ids.md`, and nonhidden `build/`/`logs/` descendants must remain discoverable without a manifest/index; forged envelopes, unrelated excluded notes, hidden support and symlinks must remain excluded.
  - [ ] 3.3 Verify tree, index input scanning, lexical recall/search, `show`/expansion by ID, title resolution, graph links and dream evidence windows use the same canonical imported notes. Confirm imports remain ordinary notes/sessions rather than dream pages and creation/modification times do not masquerade as event dates.
  - [ ] 3.4 Check relative and vault-root Markdown links after relocation, wiki basename ambiguity, block/heading anchors and embeds against actual graph/editor behavior. Preserve and report unsupported semantics; do not claim Obsidian rendering or graph parity. Scope any future rewriting separately.

- [ ] 4.0 Verify end to end and complete the handoff
  - [ ] 4.1 Use synthetic Obsidian fixtures for preview → apply → body/metadata/hash inspection → destination-only index → bounded recall → show by ID → current browser/editor open/save → rerun. Capture counts, source-tree hashes before/after, stable identities, no duplicate outputs, omission diagnostics and index/save status separately.
  - [ ] 4.2 Cover fresh and mixed nonempty destinations, destination conflicts/deletions, no-op reruns, manifest/version upgrades, unsafe paths, initialization/apply/rollback failures, concurrent edits and retained recovery receipts. Retain source-wins warnings and test body/path redaction in normal output.
  - [ ] 4.3 Run `npm test` and the relevant browser/editor smoke workflow from `docs/release-testing.md`; verify the packed CLI/runtime supports Obsidian in a temporary consumer. Record exact tested snapshot, commands, results, platform/semantic-index limits and untested real-vault behavior. Do not install over the user's CLI or import their vault for these tests.
  - [ ] 4.4 Update owning module docs, CLI usage/reference, memory format, both importer guides, agent workflows and README to reflect only verified support. Keep the implemented Logseq readable/preserve and upgrade contracts accurate while documenting Obsidian behavior. Add concise user-facing pending release notes only for implemented behavior.
  - [ ] 4.5 Record outcome/verification/remaining limits, archive this list to `tasks/done/YYYY-MM-DD_tasks-obsidian-logseq-imports.md`, repair links, update `tasks/CHANGELOG.md` for the completed result, and commit only scoped changes under `docs/task-workflow.md`. Report the commit; no push, release or personal import is implied.

## Planning verification

Original planning commit: `3a298bb`; build and 58 selected existing regressions passed. Obsidian support and its end-to-end acceptance remain pending.
