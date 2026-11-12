# Release v0.3.24

Requested 2026-11-12 after consolidating worktrees. Latest published release is v0.3.23 (2026-11-11T07:13:19Z); no release published today in Europe/Berlin. Fetched origin/master and tags; no divergent remote work. Patch scope: idle reconnect, shared owner-only credential file, relative note-link rendering/editing, smaller editor bundle, settings card, access-key management and the recovered drawing rename/picker change.

## Worktree consolidation

- [x] Main checkout already on master; finalize its completed settings change as `0370e612` with [checks](../done/2026-11-12_tasks-settings-card.md).
- [x] Integrate the missing drawing change from old `dca97c9c` as `9d5bd0ae`, preserving the attribution-cleaned history; [checks and limits](../done/2026-11-10_tasks-drawing-mention-rename.md).
- [x] Verify patch equivalence for updater readiness, Markdown bullets and concurrent guidance (one equivalent commit each), plus all 183 commits unique by ancestry on the old Excalidraw branch. No unique patches remained there.
- [x] Confirm all three worktrees have no tracked/untracked changes; remove them and their branches. Ignored contents were generated dependencies/build/package fixtures. Remove both redundant feature branches after integration. Only the root worktree and master remain; no stash, unfinished tracked work or local feature branch remains.
- [x] Read completed source threads; they are settled. Reassert settlement for the integrated drawing source thread.

## Feedback review

`npm run --silent feedback:inbox`: checked at **2026-11-12T15:57:13.679Z**, complete received/non-spam history with no date bounds, two pages, **63 scanned, two synthetic tests excluded, 61 genuine messages**. Exact-ID comparison against the feedback index found one new report (November 12 15:42Z), read in full at 15:57:36Z, no attachments. Historical bodies/attachments were not re-audited; spam/trash/blocked mail excluded. No replies or test messages sent.

- New report: unclear remote authentication failure and credential source, with an unverified server-redeploy persistence concern. Added to [feedback follow-ups](tasks-feedback-follow-ups.md); deferred diagnosis, no claim the new access-key UI proves a cause or fixes historical loss.
- Existing covered reports in scope: idle-session fencing, post-update Keychain failures and relative note links.
- Existing open work remains: nested imported checkboxes, whole-note CLI/live-editor updates, rate-limit clarity, legacy managed installs, broader retrieval evaluation and richer saved views.

## Gates and evidence

Environment: macOS 15.7.7 ARM64, Node 26.7.0, QMD 2.8.3 (`/opt/homebrew/bin/qmd`). Product snapshot `9d5bd0ae`; later preparation bookkeeping does not alter runtime source.

- [x] Build passed after integration: editor **184,287 gzip bytes**, unchanged 185,000 gate. No version bump before the release workflow.
- [x] Reuse current settings/drawing checks above and prior focused checks for unchanged idle-reconnect/credential/link/access-key implementations.
- [x] Fresh `npm run desktop:pack`: passed, signed/verified outer app at `.local-pack/desktop/jumpyBrain.app`; disposable output, no installed app replacement. Log `/tmp/jumpybrain-v0.3.24-desktop-pack.log`.
- [x] `JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd npx --package=playwright node scripts/note-lifecycle-smoke.mjs`: passed capture, immediate search, canonical title graph, two-tab overlap merge, 390/320px, deletion cancellation/apply, preserved backlinks and index refresh. Log `/tmp/jumpybrain-v0.3.24-lifecycle.log`.
- [ ] Targeted current-snapshot idle recovery and credential-file gateway/CLI smokes, plus `npm run smoke:desktop` against the fresh native package.
- [ ] Review and commit curated exact release notes.
- [ ] `npm run release -- --dry-run` then full versioned `npm run release`.
- [ ] Verify annotated tag, aligned manifests/locks, exact public notes, all three downloaded asset digests.
- [ ] Pin demo to published tag, push its master, verify live version/revision, landing, note opening, search and graph; push demo bookkeeping too.
- [ ] Archive exact shipped notes and QA, reset pending notes, finalize this task and commit/push bookkeeping.

## Real-use decision and limits

`npm run dogfood:status`: superseded 0.3.21 candidate, recorded pre-cleanup commit `ace92efa`; no current candidate or normal-use evidence for this snapshot. Asked owner whether to publish after automated gates or install a new candidate first; publication awaits that decision. No personal notes are used for automated/fault tests. Intel runtime, physical IME/accessibility, real sleep/wake, a real packaged credential migration/update and arbitrary user extensions are untested unless later evidence explicitly records them.
