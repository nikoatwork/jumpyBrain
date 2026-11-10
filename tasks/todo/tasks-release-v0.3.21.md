# Release v0.3.21

Status: preparing the next patch from clean master; user explicitly chose publication after automated checks instead of installing a candidate first.

## Scope and evidence

- Runtime source: `21cc44d`; latest published numeric release: v0.3.20 (`6d06cb9`). Local master contains all fetched origin/master history and 37 additional commits; no unrelated uncommitted upstream work. No published release on November 10 Europe/Berlin; latest was November 4.
- Curated seven public bullets in release-next.md against the complete v0.3.20..HEAD diff. Active live-note attention, semantic-link quality, broader retrieval and installation proposals remain unfinished and are not claimed delivered.
- Live feedback checked **2026-11-10T08:13:21.462Z**, full available received/non-spam inbox, no date bounds: two pages, complete, 54 scanned, two synthetic tests excluded, 52 genuine reports, October 20–November 8. Exact-ID reconciliation against [feedback index](../feedback.md); one new November 8 stale-warning report read in full and assigned to [follow-ups](tasks-feedback-follow-ups.md). No replies/test sends; attachments and historical bodies not re-audited. Spam/trash/blocked mail excluded.
- Included completed Markdown, agent collaboration, title/search, related-page, updater and recovery fixes. Repeated search warnings, date-label presentation, historical single-user settlement reports, hover snippets, reference-control removal, further deletion-copy changes, semantic-link quality and broader ranking/model decisions remain open/deferred in their existing owners.
- macOS 15.7.7 ARM64; Node 26.7.0; QMD 2.8.3 (facd35e).
- `npm run dogfood:status`: no recorded candidate. User explicitly selected **Publish after automated checks** on November 10. No day-long personal-use evidence or installed-app update is claimed.
- Reuse completed scoped implementation evidence, including direct-session frozen observation equality and editor Chromium cases, backend operation agreement tests, updater failure/retry and packaged replacement checks, and semantic graph implementation/evaluation with its quality limit. Fresh release core-flow/package checks follow.

## Tasks

- [x] Review history, live feedback and pending notes; record owner decision.
- [x] Fresh build and desktop package; disposable core note lifecycle.
- [/] Select any extra checks warranted by changes; dry run and full release.
- [ ] Verify tag, exact notes, aligned metadata and all three downloaded asset digests.
- [ ] Refresh public demo to exact published revision; verify landing, note opening, search and graph.
- [ ] Archive exact notes and QA; reset pending note; archive this task and commit bookkeeping.

## Limits

No Intel runtime, macOS 26, physical IME/accessibility, live model download, notarization, personal-use or installed public-upgrade claim. Demo deployment details stay in the private deployment repository.

## Preparation results

Fresh `npm run build`, `npm run desktop:pack` and `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed on runtime source `21cc44d`. Signed outer app refreshed; verified unchanged native helper reused. Core smoke covered capture, immediate search, graph/title navigation, guarded two-tab recovery, 390/320 layouts, deletion cancel/apply, preserved backlinks and index refresh.

Additional `scripts/collaboration-editor-smoke.mjs` passed real Chromium two-context convergence, own Undo, external writes, agent streams, IME, offline body/title recovery, shipped shell/actor isolation, granular cursor intent and 132 fresh CLI actors. Native inert updater UI smoke passed phases, themes, compact layout, app-only, keyboard details and recovery. Existing packaged updater success/rollback evidence is reused from the completed updater-readiness task: no replacement/transaction/signing code changed there. No extra public install matrix selected.

Editor: 671,081 minified / 221,862 gzip bytes, 15 packages; unchanged editor budget passes. Logs: `/tmp/jumpybrain-v0.3.21-{build,desktop-pack,lifecycle,collaboration,updater-ui}.log`; screenshots `.local-pack/update-ui/`. Demo access and disk headroom verified; deployment follows publication.
