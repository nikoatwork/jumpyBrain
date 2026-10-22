# Release candidate 0.3.5

## Scope and preparation

- [x] Inspect published releases and reconcile history/version metadata.
- [x] Preserve the original workspace; prepare `/tmp/jumpybrain-release-20261022` as a separate clone on `master`.
- [x] Merge published `v0.3.4` history with local completed changes. The coordinated updater replaces the app-only implementation, retaining cancellation/save barriers through its worker protocol and recovery tests.
- [x] Include the completed browser design system and curate five user-facing bullets in `release-next.md`.
- [x] Full test suite: 1,105 passed, one skipped, zero failed.
- [x] Complete core-flow and applicable change-specific release gates; retain logs and screenshots under `.local-pack/release-qa/`, `.local-pack/update-smoke/`, `.local-pack/update-ui/`.
- [x] Release dry run selects the unused next patch `0.3.4 → 0.3.5`.
- [ ] Obtain explicit same-day publication override.
- [ ] Run full `npm run release`, verify published tag/notes/asset/version/digest, archive exact shipped notes and QA, reset only shipped pending notes, commit/push bookkeeping.

## Snapshot and environment

- Runtime snapshot: `fbdf58f`; final QA-script snapshot: `901d7ed` (merge parent `a84c24d`, original local `9606d74`, published `v0.3.4` / `3bbb0f2`). Subsequent task-report-only commits do not change runtime code.
- macOS 15.7.7 (24G720), arm64; actual Node v26.7.0; QMD 2.8.3 (facd35e); Electron 44.8.0.
- Root dependencies installed with `npm ci`. Electron dependencies reuse the existing matching lockfile installation. All notes/profiles/update installations used by checks are disposable.
- Initial validation was discarded: shared dependency symlinks omitted license metadata, and an overlapping pack build removed files during tests. Repeated with checkout-local root dependencies and sequential builds; the complete suite passed.
- Candidate CLI ↔ browser roundtrip passed: remember, search/open, browser edit/save, compact recall and content-hash-guarded expand; explicit lexical reindex preserved canonical bytes. Disposable hosted CLI checks passed read-only recall/write rejection, invalid key, and offline errors.

## Publication blocker

`v0.3.4` was published 2026-10-22 at 08:30:24 UTC (10:30:24 Europe/Berlin); `v0.3.2` and `v0.3.3` were also published that day. `docs/releases.md` requires an explicit user override for an additional release on the same Europe/Berlin day. No new version bump, tag, push, publication, installed-app update, or memory write has been performed.

## Limits

Intel hardware, physical login/Keychain history, physical clipboard/accessibility/mobile devices and non-Chromium browsers are untested. Installed updater checks use immutable local fixture releases, not a live public-release upgrade. First-iteration scan/graph changes are included; matched RAM-budget acceptance remains a separate unfinished task and no measured savings claim is made in release notes.

## Final candidate verification — 2026-10-22

All applicable automated release gates passed. The tested runtime stays byte-identical to `fbdf58f`; subsequent changes are task evidence and smoke-test corrections only. This is the pre-bump candidate at 0.3.4 in all four manifests/lockfiles; the full release command will bump both products to 0.3.5 and repeat its mandatory validation before publishing.

- `npm test`: 1,105 passed, one skipped, zero failed. The skipped optional physical-readonly QMD test requires `JUMPYBRAIN_TEST_QMD_BIN`; the separate real-model semantic gate below passed.
- Candidate CLI/browser/hosted roundtrip passed via `.local-pack/release-qa/cli-app-roundtrip.mjs`; log: `.local-pack/release-qa/cli-app-roundtrip.log`.
- Reference integration smoke: 27 passed. Updated its old stale-banner expectation to prove that matching suggestions hide status while retaining stale state.
- Production gateway smoke: 14 passed. Updated conflict status to “Changes need review” and used overlapping replacements instead of safely mergeable concurrent appends. The initial fixture correctly reached Saved after merging appends; this was a fixture mismatch. Both local/remote overlapping edits now prove retained drafts, real 412 responses, rejected switches and unchanged canonical winner bytes. Failure output includes stack and bounded fixture status diagnostics.
- Semantic gate used provisioned `hf_ggml-org_embeddinggemma-300M-Q8_0.gguf`, 333,590,944 bytes, SHA-256 `b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63`; network/model downloads blocked. Local/server/HTTP paraphrase retrieval, edit/rename/delete repair and failed-model rollback passed. Optional SIGKILL probe was not requested.
- Installed update fixtures cover success, pinned CLI app-only, failed relaunch rollback, helper-death GUI recovery and pre-handoff app-death cancellation; canonical notes, CLI targets, agent settings, login preference, control key and source/ref policy were preserved.
- Open/create/reopen brain, write/paste/reopen, CLI↔app, search/references/map, conflicting and failed saves, switch/delete, close/reopen/quit and update routes were exercised by the corresponding suites. External CLI/filesystem/other-editor refresh passed at 1280/390px, including safe merges, conflicting review, caret/scroll/undo, read failures and recovery.
- Visually inspected actual editor/delete/feedback and native update screens, including light/dark and 390px views. Theme/sidebar/reference/update tests also cover keyboard controls; lifecycle covers 320px map controls. No unexpected browser errors were reported.
- Original workspace preservation verified: tracked diff exactly matches the initial saved patch and all three copied untracked files retain identical hashes.

### Sequential gate results

- PASS `npm run cli:pack` (2.2s).
- PASS `npm run desktop:pack` (12.4s).
- PASS `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` (6.2s).
- PASS `npm run smoke:electron` (3.2s).
- PASS `npm run smoke:desktop` (8.8s).
- PASS `node scripts/desktop-update-smoke.mjs success` (98.0s).
- PASS `node scripts/desktop-update-smoke.mjs app-only` (81.5s).
- PASS `node scripts/desktop-update-smoke.mjs relaunch-failure` (79.7s).
- PASS `node scripts/desktop-update-smoke.mjs helper-crash` (81.6s).
- PASS `node scripts/desktop-update-smoke.mjs app-crash` (76.2s).
- PASS `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-updater-ui.mjs` (1.7s).
- PASS `npm run smoke:lexical` (24.7s).
- PASS `npm run smoke:page-references` (135.1s).
- PASS `npm run smoke:graph-editor` (21.0s).
- PASS `npx --package=playwright node scripts/dream-handoff-smoke.mjs` (0.3s).
- PASS `npm run smoke:diagnostics` (7.4s).
- PASS `npx --package=playwright node scripts/companion-gateway-smoke.mjs` (32.3s).
- PASS `npm run smoke:semantic-index` (19.7s).
- PASS `npm run smoke:theme` (5.1s).
- PASS `npm run smoke:sidebar` (4.5s).
- PASS `npx --package=playwright node scripts/external-document-updates-smoke.mjs` (66.0s).

### Evidence and next action

- Logs/results: `/tmp/jumpybrain-release-20261022/.local-pack/release-qa/`; screenshots in its `screenshots/` subdirectory. Initial failed reference screenshots remain as diagnostic evidence alongside later passing runs.
- Native update screens: `.local-pack/update-ui/`; installed update evidence: `.local-pack/update-smoke/<mode>/result.json` and screenshots.
- Public notes for review: `tasks/todo/release-next.md` (five curated bullets). No published artifacts or notes have been changed.
- Rechecked GitHub after validation: v0.3.4 is still latest. GitHub publishing access is available (ADMIN); the explicit same-day override is the only publication prerequisite still outstanding.
- Once authorized, use this isolated checkout for full `npm run release`; verify tag/notes/asset/digest, then archive exact shipped notes to `tasks/done/releases/v0.3.5.md` and this QA evidence separately as `v0.3.5.qa.md`. Clear only shipped bullets and commit/push bookkeeping. Do not bump again if the release already exists.
