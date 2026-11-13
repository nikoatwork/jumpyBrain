# Release v0.3.25

Completed 2026-11-13: published and verified v0.3.25 beta, refreshed the public demo to the exact tag, and archived shipped notes/QA.

Requested 2026-11-13: cut the next patch beta from clean master. Implementation snapshot `53ced7fe`; local master contains origin/master (15 commits ahead before preparation). Latest public release is v0.3.24, published November 12; no release published November 13 in Europe/Berlin.

## Scope and feedback

- Ship the original six user-facing notes: Settings navigation/key wording, drawing browser, broader exact-byte task checkboxes, remote CLI key diagnostics, and heading-free new agent notes. Release-gate investigation additionally fixes extension event delivery after timeout. No deferred pending-note bullets.
- Live feedback check at **2026-11-13T18:54:25.270Z**: full received/non-spam inbox, no date bounds, two pages, 66 scanned, two synthetic tests excluded, 64 genuine messages, complete. All exact message IDs already indexed; no new bodies or attachments needed. No messages sent. [Per-email outcomes](../feedback.md).
- Included recent feedback fixes: duplicate title heading, checkbox rendering and diagnostic remote authentication errors. Historical server-redeploy key/note loss remains unproven. Existing open/mixed/deferred feedback stays with its owners, including whole-note CLI update visibility, rate-limit clarity, legacy managed upgrades and broader retrieval evaluation.
- `dogfood:status` reports the old `ace92efa` candidate superseded, not installed. It supplies no current real-use evidence. Proceeding on the explicit release request with the automated beta gate; no current-candidate normal-use claim and no personal app replacement.

## Tasks

- [x] Check published release cadence, fetch origin/master and tags, inspect snapshot and reconcile live feedback.
- [x] Prepare build, fresh desktop package and Chromium core note lifecycle; reuse unchanged feature-specific evidence.
- [x] Commit preparation and run release dry run, then full `npm run release`.
- [x] Verify exact public notes, annotated tag, aligned component versions and all three asset digests.
- [x] Refresh public demo to the exact published tag and verify version, landing, note opening, search and graph.
- [x] Archive exact shipped notes and QA, reset pending notes, finalize task/changelog and push bookkeeping.

## Verification

Environment: macOS 15.7.7 ARM64, Node 26.7.0. QMD 2.8.3.

- `npm run build`: passed; editor 184,683 gzip bytes, below the unchanged 185,000 ceiling.
- `npm run desktop:pack`: passed fresh signed/verified outer package, reused native executable with verified unchanged build inputs. Log: `/tmp/jumpybrain-v0.3.25-desktop-pack.log`.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs`: passed capture, immediate search, canonical title graph, two-tab overlap merge without review, 390/320 layouts, delete cancel/apply, preserved backlinks and index refresh. Real lexical QMD, disposable brain. Log: `/tmp/jumpybrain-v0.3.25-lifecycle.log`.
- Reused feature evidence: [drawing browser](2026-11-13_tasks-drawings-browser-navigation.md), [checkbox rendering](2026-11-13_tasks-checkbox-rendering.md), [remote auth](2026-11-13_tasks-remote-auth-diagnostics.md), [title heading](2026-11-13_tasks-duplicate-title-heading.md). Those implementations are unchanged in this release snapshot. Known baseline-only browser runner failures remain documented in the checkbox task; not counted as passes.

## Release gate recovery

- First full run was interrupted during the test suite when the conversation was steered; it recorded three timing failures before interruption, with no release commit, tag, push or publication. Log: `/tmp/jumpybrain-v0.3.25-release.log`. Restored only its four version-metadata edits before restarting.
- The backend slow-drain case independently reproduced `backend_not_ready` instead of `backend_stop_pending`: its 150 ms total discovery/drain allowance expired before reaching the intended drain boundary. Increased only that fixture deadline to 2 seconds; the owner never releases its lease and every stop/spawn/identity assertion remains.
- Presence and stream lease tests now control `Date.now`, explicitly advancing it past the lease after reconnect/anchor assertions. Real WebSocket transport and observer scheduling remain exercised; the stream cleanup wait uses monotonic real time. No production runtime changes or removed assertions.
- Focused rerun of the three previously failing cases passed (3/3), including the slow-drain safety and lease expiry assertions. Log: `/tmp/jumpybrain-v0.3.25-timing-focused.log`. The full versioned release gate must still pass.

- Second full release gate completed: **2,041 passed, two failed, two optional skips of 2,045**. The original three timing cases passed. No commit/tag/publication occurred. Log: `/tmp/jumpybrain-v0.3.25-release-attempt2.log`. Restored only version metadata before correction.
- Extension notification failure was **real**, not just a flaky test: a timer waking slightly before its wall-clock deadline let a second observer start (`2 !== 1`). A deterministic early-timer regression reproduced this on the unchanged runtime (`/tmp/jumpybrain-v0.3.25-extension-negative.log`). The host now marks the shared notification budget expired on timeout, including nested scope delivery, and admits no later handler. Existing timeout, cancellation, retained-context and observer-count assertions remain; regression covers direct scope notification and nested scope before document notification. Public API and generic error policy are unchanged.
- The frontmatter property test expected two body newlines for empty input, contradicting the new documented frontmatter-only blank-note behavior. Updated that expectation while retaining all generated metadata/body/line assertions.

- Final build plus `node --test test/extensions-runtime.test.js test/markdown-properties.test.js test/title-heading.test.js test/architecture-boundaries.test.js`: **51 passed, zero failures**. Early-timer direct/nested regressions both pass. Log: `/tmp/jumpybrain-v0.3.25-recovery-focused.log`. Browser lifecycle evidence remains applicable: no browser, memory lifecycle, CLI or canonical-writing implementation changed during gate recovery. Fresh outer Mac package rebuilt for the corrected extension host.

## Limits

No current-candidate real-use window, installed app update, Intel execution, physical IME/accessibility, or broad updater/retrieval evaluation. Additional limits and publication/demo evidence will be recorded in the release QA before completion.

## Publication

Published v0.3.25 at **2026-11-13T20:18:22Z**, annotated tag `6755714475263129b9e1f00e701b5b8064513614`. Final full suite: **2,044 pass / zero fail / two optional skips**. All public assets, notes and component versions verified. [Exact notes](releases/v0.3.25.md) and [QA](releases/v0.3.25.qa.md). Public demo rollout and all required live flows verified at **2026-11-13T20:22:29.849Z**. Exact version/revision, landing, note opening, 28-node graph, 13 search results and zero page errors; deployment bookkeeping pushed. Pending notes reset to an empty heading.

Finalization: scoped notes, QA, archived task, feedback index and changelog retained in Git. No glossary changes. Publication and demo verification are complete; listed real-use/native limits remain explicit.
