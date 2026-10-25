# Readable Logseq import

## Goal and scope

Implement the Logseq portion of the [original import plan](2026-10-25_tasks-obsidian-logseq-imports.md): readable outline prose by default, an explicit exact-preservation mode, and safe upgrades/reruns of existing imports. The user requested this scope on 2026-10-24; Obsidian implementation remained separate at this snapshot; its later completion is recorded in the linked import task.

## Decisions

- Source graphs remain untouched; dry-run, source-wins conflicts, stable identities, transactional rollback and separate indexing remain supported.
- Remove outer outline wrappers from prose/headings. Preserve nested lists when intent is ambiguous, with explicit diagnostics, rather than discarding parent/child meaning. Preserve tasks, code, properties and macros.
- `--body-format readable|preserve` selects the body policy; readable is the new default. Version the original and rendered-body checksums separately, accepting trusted version-one ownership manifests.
- Read architecture/co-located docs before edits. Validate through current CLI, canonical lookup, lexical retrieval and browser/editor using disposable fixtures; do not import a personal graph or install anything.

## Tasks

- [x] 1.0 Review existing policy, CLI, transaction and verification boundaries; split pending Obsidian work.

- [x] 2.0 Specify and fixture Logseq outline-to-Markdown conversion
  - [x] 2.1 Write exact before/after fixtures for prose blocks, adjacent blocks/paragraph spacing, headings, tab/space nesting, multiline continuations, blank blocks and child lists. Decide how to preserve parent/child meaning when flattening structural wrappers; document ambiguous cases rather than guessing.
  - [x] 2.2 Preserve intentional lists and ordered lists, checkbox states and Logseq task keywords, fenced/indented code (including literal `-` lines), quotes, tables, properties, block IDs/references, macros, YAML, Unicode, LF/CRLF and final-newline behavior. Unsupported/ambiguous structures must retain content and produce bounded warnings; no silent text loss. Include a real list nested under a prose block.
  - [x] 2.3 Implement deterministic pure readable conversion and exact preserve mode. Ensure headings/code/lists render as intended after removing their outer outline layer; do not turn every child block into an accidental code block. Invalid UTF-8 may remain byte-exact in preserve mode; readable mode must reject or explicitly preserve it with a warning, never replacement decoding.
  - [x] 2.4 Expose the Logseq-only format option through runtime/CLI and strict parsing; readable is the new default. Body-free preview/JSON must name the selected conversion/version and report changed/preserved/unsupported counts. Reject invalid/repeated options and Obsidian use of Logseq-only cleanup flags.

- [x] 3.0 Version transformation verification and upgrade existing imports safely
  - [x] 3.1 Distinguish original source hashes/bytes, converted body hashes/bytes, and full output hashes. Record transformation mode/version in validated ownership metadata so conversion changes cannot hide behind unchanged source hashes. Verify rendered output against the expected converted body, not the original source checksum.
  - [x] 3.2 Load trusted version-one manifests without weakening ownership/path/ID validation. Preview and transactionally apply conversion upgrades with unchanged source bytes, preserving IDs and `created_at`; identical reruns in the same mode/version must preserve output/manifest bytes and timestamps.
  - [x] 3.3 Exercise preserve → readable and readable → preserve, unknown converter-version rejection, source changes, source removal/rename, corrupt/unknown-version manifests, mapped edits and manually dash-cleaned destinations. `--fail-on-conflict` must catch independently edited outputs before any write; default source-wins effects stay visible. Old ad hoc imports remain outside ownership reconciliation.
  - [x] 3.4 Retain current rollback/recovery and source-immutability checks during manifest upgrades. Original sources remain the source of raw bytes; do not claim transformed output alone can reconstruct them or store permanent raw copies under disposable derived state.

- [x] 4.0 Verify and finalize
  - [x] 4.1 Test preview/apply/rerun, hashes, IDs, mode changes, legacy manifests, destination conflicts, removals, rollback and invalid arguments.
  - [x] 4.2 Run the full test suite and a synthetic CLI → index → recall → show → browser/editor open/save → rerun trace; verify the packed runtime/CLI without modifying user installations.
  - [x] 4.3 Update module/user docs, agent guidance, pending release notes and changelog; record exact verification/limits.
  - [x] 4.4 Archive this completed list and commit scoped changes, preserving pending Obsidian tasks.

## Outcome

Completed on 2026-10-24. Logseq imports default to readable outer-outline conversion with strict readable/preserve controls, bounded diagnostics, original/converted/output hashes, version-two ownership, trusted version-one upgrade paths, stable identities and byte-stable reruns. The separate Obsidian list remained active at that snapshot; no Obsidian command was added by this Logseq change.

## Verification

- Tested source began at `3a298bb`; unrelated planning-only commit `1817211` landed during verification and is preserved. Runtime/test/smoke snapshot SHA-256: `e5d2a3a0a564617f05b0e9306d2a176a1d65d333e960e3b05a4be601e5b36c9c` (sorted changed implementation/test/script paths, each path + NUL + bytes + NUL). No runtime edits followed passing checks. Node `v26.7.0`, macOS `15.7.7` arm64, QMD `2.8.3 (facd35e)`.
- `npm test` — **1,269 passed, zero failed, one skipped** out of 1,270 tests. The opt-in real-QMD physical-readonly/WAL integration test requires `JUMPYBRAIN_TEST_QMD_BIN`; it was not enabled. Includes the new exact conversion fixtures and transactional legacy-upgrade/conflict/no-op regressions. Log: `/tmp/jumpybrain-logseq-full-tests.log` (local, not committed).
- `npx --package=playwright node scripts/logseq-import-smoke.mjs` — passed with actual QMD lexical indexing and the current browser/editor. Two source files/two outputs; preview nonmutation, separate indexing, bounded recall, ID show, heading/paragraph rendering without prose list items, explicit editor save/reopen, protected conflict, source-wins refresh, stable rerun and unchanged source bytes all verified.
- `npm run cli:pack` — passed, validating 187 required distribution files including the new converter. The same smoke with `JUMPYBRAIN_SMOKE_PACKAGE_DIR` pointing to a temporary unpacked tarball passed, verifying public runtime export, CLI and browser behavior from the distribution without installing it.
- Inspected desktop/light and 390px/dark screenshots under `.local-pack/logseq-readable-import/` and `packed/`: ordinary prose renders as paragraphs and the heading remains a heading. No browser page errors. An initial smoke used an incorrect theme selector; corrected it to the existing `#color-theme` and reran successfully. A concurrent build briefly removed `dist` during another initial attempt; subsequent source and packed runs were sequential and passed.
- Owning docs, agent workflow, release-testing route, pending release notes and completion changelog updated; archive/new links and staged guard checked before commit. A 94-target link scan found no new broken links; the pre-existing changelog link to the removed `tasks-page-reference-manual-qa.md` was left outside this scope.

## Remaining limits

- This intentionally converts outer prose/headings, not arbitrary nested outline meaning. Child lists retain hierarchy with warnings; tasks/opaque properties/macros remain source text. Unsupported bytes, controls or unclosed YAML/fences preserve the whole source body with a warning. Exact source fidelity remains available via preserve mode.
- No real personal graph, Windows/Linux import, full Logseq grammar, attachment copying, source-link rewriting, semantic-model retrieval, native Mac installation or published release was exercised. Rollback/race/crash-recovery limits remain as documented. Existing source-authoritative applies can replace manual cleanup; preview and use fail-on-conflict where appropriate.
- No source graph, personal memory, CLI/app installation or global/team/remote memory was changed. Unrelated working-tree task files were preserved. No push or release.
