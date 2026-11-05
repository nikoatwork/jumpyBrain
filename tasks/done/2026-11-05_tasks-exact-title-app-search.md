# Exact-title app search parity

Completed 2026-11-05: fresh canonical search results now replace older tab saves/tombstones even while host indexing bookkeeping lags, so an externally renamed exact-title note remains discoverable from another page. Concurrent tab mutations and stale/unknown-source safeguards remain intact.

## Scope and evidence

Live inbox checked 2026-11-05T09:33:06.645Z: all received non-spam mail, no date bound, two pages/52 scanned, complete; two labeled delivery tests excluded. Selected the newest genuine report (2026-11-05T09:20:36.618Z), [app/CLI exact-title search mismatch](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=e34678a8-5a2a-4a05-b2a8-fdb0ccb8a72b). Sanitized report: lowercase single-word title search finds a short exact-title note first in CLI but omits it from app results. Private note names/content are not needed. Other recent editor reports have completed fixes; remaining feedback is deferred from this one-item task.

The user clarified the target was not the open page and authorized a Nico test note in their personal local brain. Verified the active app and CLI selected the same local root, created that note through the installed CLI (`saved:true`, `indexed:true`), and searched lowercase `nico` from a different existing note in the installed Mac app. Both app and CLI ranked it first (CLI score 5.55). The test note remains saved; the original note was left unchanged and its search dialog dismissed. No personal bodies, IDs or absolute memory paths are retained here.

An initial exact-title exception to the current-page exclusion was discarded after the clarification. The retained reproduction instead saves a note in one tab, navigates elsewhere, externally renames the note and indexes through the local runtime. The server returns the new exact-title hit first with canonical readiness fresh, but separate host bookkeeping remains stale. The tab cache then suppresses that ID using its older title. A real disposable lexical/QMD/server/browser run failed waiting for the returned renamed title to appear (not while requesting or ranking it); the focused cache regression also returned the mention instead of the exact hit. This establishes a concrete cause of the reported symptom, not the exact history of the user's original private note. Written-date versus edit-date reporting is separate and deferred; creation time remains valid written provenance.

## Tasks

- [x] Reproduce exact-title disappearance from another page and add focused regression coverage.
- [x] Retire earlier tab saves/tombstones on verified fresh canonical readiness, preserving writes/removals during the query and existing broad exclusion/ranking.
- [x] Verify disposable real lexical CLI/server/browser flows and focused/full repository checks.
- [x] Record outcome/limits, update owning docs, pending release notes and changelog, archive and commit scoped work.

## Verification

Tested the implementation against base `c2894c3420df109004b43f1917c4cf798781c49d` plus this task's scoped changes. `npm run build` passed (222,231 editor gzip bytes, same 15 bundled packages). Focused browser/cache/recognition/maintenance checks passed (100 tests before the additional save/deletion-race assertions); final `npm test` passed **1,926 tests, two skipped, zero failures** (1,928 total). The final suite includes those additional assertions. `git diff --check` passed.

`npx --yes --package=playwright node scripts/search-recognition-smoke.mjs` passed with real disposable Markdown, pinned lexical QMD and the HTTP server at 1280/390/320px, light/dark. It compares CLI search and shallow recall with the server's first result and actual browser opening from another note; covers lowercase/uppercase/padded exact queries against eight newer title/body mentions; reproduces an old tab save followed by external rename/local indexing while another page is open; verifies fresh canonical readiness alongside stale host bookkeeping, visible/openable renamed result and unchanged canonical bytes. Existing immutable-read, bounded list, keyboard, preview safety, empty/error/retry and confirmed-save checks also pass. The runner now uses the real search keyboard shortcut when the narrow sidebar is hidden and waits for the destination load separately from dialog dismissal. Intermediate smoke failures from these harness assumptions were corrected before the final passing run.

The installed Mac app/CLI personal-brain check verified the requested fresh Nico case before changing the cache implementation. The cache correction itself was verified in the shared production browser build, not installed into the running desktop bundle. The user's original failing title/history remains unconfirmed; no blanket arbitrary-query or semantic-ranking guarantee is claimed. The fixture uses lexical mode, matching the reported app footer.

## Relevant files

- `src/adapters/http-server/recent-write-search.ts`
- `src/adapters/http-server/browser.docs.md`
- `test/recent-write-search.test.js`
- `scripts/search-recognition-smoke.mjs`
- `tasks/todo/release-next.md`
- `tasks/CHANGELOG.md`

## Limits

No release, installation, inbox mutation or shared/remote memory write requested. Only the explicitly authorized personal test note was saved. Unrelated README/release-documentation work landed separately while this task ran and is outside this commit.

## Follow-up: existing pages in the installed app

At the user's request on 2026-11-05, tested existing simple titles in the running local Mac app, from a different saved note, against installed CLI normal-depth searches with limit 24 and `--no-refresh`. Canonical readiness was fresh, lexical only. `mistral`, `Coaching`, `Book`, `Europace` and `bliro_ai` each appeared first in both interfaces. The fresh indexed metadata contains no page titled exactly `Bliro`; searching that word is therefore a broader query. Opening the first Mistral result verified its canonical ID/path and page name. Repeated its search after returning to the other page and after reloading the clean tab; it still appeared first. No missing/lower-ranked exact match was reproduced in these checks.

An interim interpretation of Mistral's accessibility row as a stale longer title was incorrect: inspecting the title/preview boundary showed the title is `mistral`; the following longer phrase belongs to the preview. No additional title-cache defect was established. No memory files were created or edited during this follow-up, and the app was left on the original saved page with search dismissed. The previously committed cache fix was not installed or released by this verification.
