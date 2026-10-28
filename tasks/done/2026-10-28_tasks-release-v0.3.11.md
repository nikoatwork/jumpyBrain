# Release v0.3.11

## Scope

Publish the completed Settings/sidebar/Appearance and formatting changes since v0.3.10 as the next patch beta. Original clean master snapshot: `ab72324`. No release published today (Europe/Berlin); latest is v0.3.10, published 2026-10-27T18:11:13Z. Remote master is an ancestor; all intended implementation is committed.

## Tasks

- [x] Check publication cadence, fetch origin/tags, review scope and curate public notes.
- [x] Build, package a fresh desktop candidate and pass the core note lifecycle smoke.
- [x] Run release dry run and the full release-owned version/test/package/tag/push/publication workflow.
- [x] Verify exact public notes, annotated tag, aligned manifests/locks and downloaded distribution/digest.
- [x] Archive shipped notes and QA, reset the shipped queue, archive this task and commit bookkeeping.

## Evidence

Environment: Node v26.7.0, QMD 2.8.3 (facd35e) at `/opt/homebrew/bin/qmd`, macOS 15.7.7 (24G720), arm64. Use existing locked dependencies and disposable smoke roots; no personal installation or memory changes.

Reused unchanged feature evidence: Settings sidebar and save barriers, visual schemes/palettes and extension-theme fallback, Home/New note/Search order, formatting groups, and all-theme visual/contrast/browser review. See the corresponding 2026-10-28 archives. No updater/installer behavior changed, so no new installed-update matrix is selected.

Selected preparation: `npm run build`, `npm run desktop:pack`, `npx --package=playwright node scripts/note-lifecycle-smoke.mjs`. Full versioned deterministic tests and CLI distribution validation remain owned by `npm run release`. Logs go under `.local-pack/release-0.3.11/`.

Preparation snapshot `2eac9e1`: build passed (181,746-byte gzip editor), desktop packaging/signature verification passed with a freshly compiled native helper, and real-QMD lexical note-lifecycle smoke passed (capture, immediate search, graph, conflicts, recovery, narrow layout, deletion and refresh). The outer preparation candidate still uses 0.3.10 metadata before the release-owned version bump; no native bundle is uploaded.

## Outcome

Completed 2026-10-28: [v0.3.11 beta](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.11) published and independently verified at 2026-10-28T10:30:45Z. Release commit `da2c73d9ab06d6b2d42c77ff48b3855aa5ec21d7`; asset digest `sha256:b11951a7b6ee4e09189aee2efd2bf4dfbc0521608d8bf96ea46bdcadd2dafed7`. All preparation/release/publication gates passed; exact notes and full evidence/limits are in [release notes](releases/v0.3.11.md) and [QA](releases/v0.3.11.qa.md). No deferred notes, installation or unrelated work was included.
