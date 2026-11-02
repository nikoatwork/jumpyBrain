# Release v0.3.17

Requested 2026-11-02: cut release immediately following the completed shared-backend/live-editing work. Default patch beta release. Latest published release v0.3.16 is November 1; no release today in Europe/Berlin. Clean isolated release checkout starts at implementation snapshot 124c416, containing fetched origin/master 9208c7f and all landed local master changes through cd3db86. The original checkout's two unrelated untracked task notes remain excluded and untouched.

- [x] Review live feedback, publication history, source ancestry and release scope.
- [x] Prepare fresh build/desktop package and core note-lifecycle flow, reusing unchanged feature evidence.
- [ ] Run release dry run and full aligned-version test/pack/commit/tag/push/publication workflow.
- [ ] Verify public tag, notes, component versions and downloaded asset SHA-256.
- [ ] Archive exact public notes and QA, reset only shipped pending notes, and push bookkeeping.

## Scope and evidence

Ship the seven curated pending bullets: live human/agent note editing and cursors; one local/VPS backend with scoped revocable access; scoped private drafts/file recovery; coordinated protocol upgrade; folder actions/moves; search/page actions; compact sidebar actions. No unrelated unfinished work is included.

Source snapshot 124c416 passes 1,788 tests, four original browser flows and all twelve production gates, zero skips. Pinned Linux Node 22.12.0 and 26.7.0 each pass 217 checks with matching 491-file runtime artifacts. Source-level Astra high architecture/interaction reviews and the actual packaged menu/keyboard/IME/AX proofs are retained in the completed implementation task and production-verification record. Reuse these for unchanged implementation inputs; the release-owned suite and distribution validation still run on aligned 0.3.17 manifests.

Environment: macOS arm64, Node 26.7.0, QMD 2.8.3, provisioned Playwright 1.64.1 and matching Electron 44.10.0. The dogfood receipt is stale/current=false (older 0.3.13 candidate), so there is no claimed personal-use window for these changes. The owner's explicit request to cut this release now selects a shortened window after extensive disposable-fixture verification. No personal brain migration or installation is part of publication.

## Live feedback review

Checked 2026-11-02T07:47:31.059Z: full available received/non-spam inbox without date restriction, complete one page; 21 scanned, 2 labeled delivery tests excluded, 19 genuine reports from October 20–31. No new messages since the documented November 1 review. The two latest remote/Keychain report bodies were read again; no attachments, replies or test submissions.

Sanitized triage: current release adds folder actions and separate remote credentials with explicit app/server upgrade coordination. Existing installer, native identity/path and permission guidance fixes are preserved. Public signing/notarization, continuity across genuinely changed native signing resources, real public deployment coverage and remaining editor polish requests remain deferred; none are newly claimed fixed. Raw bodies, addresses and operator credentials are excluded from Git.

## Release record

Preparation passed: fresh build, fresh signed outer desktop package, and the real note-lifecycle smoke (capture, immediate search, graph/title navigation, guarded two-tab recovery, narrow layouts, deletion and index refresh). Release dry run selects 0.3.17 beta. All implementation inputs are unchanged from the accepted 124c416 candidate; only release notes/task bookkeeping changed. The isolated clone's remote fetch mapping was normalized and fetched origin/master ancestry verified before publication.

Logs: `.local-pack/release-prep/{build,desktop,core-note,dry-run}.log` in the parent worktree. No installed app/CLI, personal brain or VPS was changed. The full release-owned versioned suite and distribution/publication verification remain required.
