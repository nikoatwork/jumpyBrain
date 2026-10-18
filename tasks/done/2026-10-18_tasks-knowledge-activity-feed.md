# Knowledge activity feed

**Finalized 2026-10-18 — complete.** Completed the agreed metadata-only recent-files view, refresh behavior, and recorded server/browser verification; history and attribution remain deferred. Archived with user approval. Verification below is historical; no implementation checks were rerun for this archival pass.

Status: complete, 2026-10-17. Captured 2026-10-16; scope simplified with the user on 2026-10-17.

## Goal

Show which files were updated recently and let the reader open them. Reuse the home screen's recent-note view, with one entry per file showing its latest available update.

## Agreed scope — 2026-10-17

- Use current canonical Markdown metadata. No durable activity log, revisions, diffs, block attribution, or contributor tracking.
- Reuse the existing fresh, read-only recent-note scan and eight-file limit. No new storage, index, endpoint, watcher, or background job.
- Order by valid `updated_at`/`updatedAt`, falling back to `created_at`/`createdAt`; unknown dates sort last. Show Updated, Created, or Date unknown. Evidence `date` describes the knowledge, not a file edit or creation, and must not manufacture recent activity. Do not use filesystem mtime: copies/imports can change it without a knowledge edit.
- Refresh on home entry and through an explicit Refresh action. Local desktop and hosted brains use the same app operation against their selected Markdown root.
- Include external edits when their metadata changes; edits that leave timestamps unchanged may not move in the list. Multiple saves collapse to the current file entry; deleted files disappear on refresh.
- Do not infer an editor from `source`, an API key, or a timestamp. Existing supported recent-note metadata has no last-editor field, so omit author labels in this version.
- Keep existing authenticated reads, read-only profile access, guarded note navigation, and cancellation of outdated loads across navigation/brain changes. Feed reads never write canonical files or start indexing.
- No unread/caught-up state, notifications, proposal workflow, or generated change summaries. This is a recent-files view, not a complete answer to every change since a visit.

This replaces the earlier history/owner-plus-actor architecture proposal. Personal-key provisioning, stable actors, contributor history, retention, and multi-file save/history atomicity are deferred; none is a dependency of this version. Block-level blame was considered and deferred for low initial value relative to complexity.

## Acceptance criteria

- Home shows up to eight eligible files, once each, latest metadata dates first, with safe titles and direct note links.
- Visible date labels distinguish an update from creation and an unknown date. Historical evidence dates are never labeled as recent edits or creation.
- Refresh picks up current Markdown without indexing or writing notes. Repeated refreshes do not create duplicate rows; deleted files disappear.
- Loading, empty, disconnected, and retry states remain usable. Late responses cannot restore another brain's or an abandoned view's rows.
- Keyboard navigation, narrow layouts, and read-only connections retain the existing supported behavior.

## Relevant files

- `src/app/server-memory/recent.ts`, `src/app/server-memory/server-memory.docs.md` — fresh metadata scan, ordering, and eligibility.
- `src/adapters/http-server/notes-browser.ts`, `src/adapters/http-server/browser.docs.md` — home list, refresh, date labels, and navigation.
- `docs/shared-memory-protocol.md`, `glossary.md` — public contract and scope language.
- `test/server-recent.test.js`, `test/notes-browser.test.js`, `scripts/recent-notes-smoke.mjs` — focused server/controller/browser verification.
- [External document updates](2026-10-18_tasks-live-external-document-updates.md) — separate open-note refresh behavior; no dependency on a retained history system.

## Tasks

- [x] 1.0 Set the lean scope and reuse existing behavior
  - [x] 1.1 Record the user's metadata-only, latest-entry-per-file decision and replace the earlier history/attribution requirements.
  - [x] 1.2 Inspect existing scan, home UI, protocol, and tests; retain the eight-file cap and existing local/hosted transport.
- [x] 2.0 Finish the recent-files experience
  - [x] 2.1 Use modification/creation metadata only; keep evidence dates and filesystem timestamps out of activity recency.
  - [x] 2.2 Present Recent activity with Updated/Created/Date unknown labels and an explicit Refresh action, reusing guarded links and existing load states.
  - [x] 2.3 Preserve brain/navigation isolation and read-only behavior without adding persistence or write-path hooks.
- [x] 3.0 Verify and document
  - [x] 3.1 Verify metadata ordering, repeated/external edits, deletion, unchanged timestamps, historical dates, and reads without an index or canonical writes.
  - [x] 3.2 Run focused browser/controller checks for refresh, failure/retry, cancellation, keyboard navigation, and desktop/narrow layouts.
  - [x] 3.3 Update owning docs/glossary, record results and limitations here, and apply the repository changelog rule for the completed scope decision.

## Completion and verification — 2026-10-17

Implemented the scoped feature using the existing home list and app scan. Home now presents Recent activity, explicit Refresh, and Updated/Created/Date unknown labels. Removed the evidence-date fallback from activity recency; no new API, storage, identity model, or write-path changes were needed.

- `npm run build` passed; editor bundle remains within its gzip gate.
- Focused server, browser-controller, and companion tests passed: 92 tests. Coverage includes authenticated read-only discovery, HTTP saves/creation, external edits/deletion, duplicate exclusion, historical dates, unchanged timestamps, cancellation, and brain/credential fencing.
- Architecture/core/runtime/server/package-boundary checks passed: 21 tests.
- `npx --package=playwright node scripts/recent-notes-smoke.mjs` passed at 1280px and 390px, including real-filesystem refresh/reordering/deletion, empty states, explicit date labels, date-only timezone preservation, keyboard opening, failed-load retry, and draft-safe navigation/disconnect. Desktop and narrow screenshots were inspected.
- `git diff --check` passed. Owning app/browser/protocol docs, glossary, and changelog reflect the completed scope. No installed app or real memory was modified.

Limits: latest eight eligible current files only; no history, unread marker, or editor attribution. External edits need timestamp metadata updates to establish new recency. Files without unique valid IDs remain excluded by the existing editor-openability policy. Fresh scans read the canonical root, so the output cap is not a bounded scan-cost guarantee. Browser checks used Chromium; physical devices and other browser engines were not verified.
