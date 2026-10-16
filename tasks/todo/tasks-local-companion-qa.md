# Local companion QA follow-up

Current follow-up: the user authorized all six exploratory-QA improvements. Implementation and disposable-root validation are recorded below; installed-app QA remains historical evidence.

## Goal and ownership

Resolve the findings in [the 2026-10-16 QA report](../../deep-dives/local-companion-qa/2026-10-16.md). This list owns implementation status.

- User approved upstream P1/P2 implementation, then scoped commit/push and cleanup. Unrelated existing theme/product work stays uncommitted.
- Starting HEAD: `d65dad0f77bac4cafee385f4706b505e539920bb`; implementation verification initially included uncommitted theme/product work. Commit preparation separately verifies P1/P2 on the clean baseline.
- Original QA is historical evidence, not a current test pass. Its installed build differs from this checkout. Do not modify the installed app or personal memory; all mutation coverage uses disposable fixtures.

## Tasks

- [x] 1.0 Confirm upstream authorization, instructions, dirty state, and task ownership.
- [x] 2.0 **P1 — Preserve interactions across healthy companion polls (development build).**
  - [x] 2.1 Add failing unit and integrated production-shell regressions for idle Search from Home/navigation, delayed query completion, inline suggestions/insertion, and local Dream explanation.
  - [x] 2.2 Limit destructive reference/dialog cancellation to entering frozen state; retain permission/UI synchronization and existing save/switch/session/generation barriers.
  - [x] 2.3 Verify genuine freezing still cancels interactions, repeated frozen snapshots do not repeat cancellation, and failed switches unfreeze only on authoritative idle.
  - [x] 2.4 Run relevant tests, companion browser/gateway smoke coverage, and review the incremental changes; record exact results below.
- [x] 3.0 **P2 — Explain partial graph results (development build).**
  - [x] 3.1 Confirm packet semantics: `stats.documents` is the whole-brain count, not matching-filter count; the node limit includes unresolved targets. The existing warning can also occur for exactly-limit filtered results, so do not infer an exact omitted/matching count.
  - [x] 3.2 Add failing unit/browser regressions, including a disposable real graph with more than 500 Markdown notes.
  - [x] 3.3 Render safe, accessible warnings plus shown/global counts and a filtering hint without changing graph limits or API semantics.
  - [x] 3.4 Cover filtered/uncapped/empty/refresh/error states, warning removal, unresolved targets, untrusted text, and stale response races; preserve existing theme/P1 work.
  - [x] 3.5 Rebuild, run targeted tests/browser smoke and incremental review, and record precise QA evidence.
- [x] 4.0 **Test maintenance — Daily-capture helper.** Replace the stale inline `/Enter to insert/` assertion with stable instruction/behavior coverage and rerun all 15 cases, including desktop/narrow reference cases.
- [x] 5.0 **Usability — Narrow graph filtering.** Give the input usable width at 390 px and 320 px without horizontal overflow; retain change/blur/Enter filtering unless separately agreed.
- [ ] 6.0 Record a dated follow-up QA report for the exact fixed build. Do not claim installed-app, theme, physical device/IME, OS clipboard, assistive-technology, other-browser, native Keychain/picker, signing/update, or real-hosted validation without performing it. Coordinate separate device gates with `tasks-page-reference-manual-qa.md`.

## Decisions

- P1 and P2 are complete in the development build; daily-capture test maintenance and narrow filter layout remain subsequent work.
- P2 is presentation-only: keep the bounded graph protocol unchanged, label total notes as whole-brain counts, and present the existing limit warning without claiming how many additional notes match a filter.
- No installed-app update, personal-memory mutation, or deployment is authorized by commit/push approval. Commit only the QA fixes, regressions, and evidence.

## Verification

[P1 follow-up QA record](../../deep-dives/local-companion-qa/2026-10-16-p1-follow-up.md) records commands, tested working-tree hashes, red/green evidence, preservation, and limits.

- Before fix: 2 new unit regressions failed; updated production-shell smoke reproduced Home Search closing across idle polls.
- After rebuild: 164 targeted Node tests passed; companion browser smoke passed including real poll-surviving Search/query/reference/Dream behavior; all 14 production-gateway checks passed; 26 autocomplete checks passed at 1280 px / 390 px.
- Incremental review found no introduced issues; `git diff --check` passed.
- Installed app remains unchanged and unverified for these fixes. Implementation verification did not change personal memory, configuration, deployment, or commits. Test maintenance and layout follow-ups remain pending; do not call the full QA clean.

[P2 follow-up QA record](../../deep-dives/local-companion-qa/2026-10-16-p2-follow-up.md) records semantics, commands, tested hashes, and limits.

- Before P2 fix: all four new unit cases failed; the new real-route browser runner reproduced hidden limit warnings with 501 disposable notes / 500 returned nodes.
- After rebuild: 168 targeted Node tests passed; graph-warning smoke passed at 1280/390/320 px with the unchanged cap; indexed graph-editor/Dream/map smoke and companion-browser smoke passed.
- New runner: `scripts/graph-warning-smoke.mjs`; count/global scope and warning text are visible, safe, and cleared/replaced on refresh/failure/retry. Read-only review and whitespace check passed.
- Existing graph warning precision for exactly-limit filtered results remains a possible separate follow-up; no matching/omitted total is invented by the UI.

## Isolated commit verification

P1/P2 were extracted from the dirty tree and applied to clean baseline `d65dad0f77bac4cafee385f4706b505e539920bb`, excluding unrelated theme/product changes. The independently built commit contents passed:

- `npm run build`, then `node --test`: **909 passed, 0 failed, 1 skipped**. The opt-in real-QMD 2.8.3 physical-readonly test requires `JUMPYBRAIN_TEST_QMD_BIN`; it was not provisioned for this run.
- All 168 targeted tests; graph-warning browser smoke at 1280/390/320 px; companion browser smoke; indexed graph-editor/Dream/map smoke; and all 14 production gateway browser checks.
- The first graph-editor run alongside the full suite reported two aborted recent-list requests; a separate serial rerun passed. Record this timing sensitivity rather than treating the first run as clean.
- Staged secret guard and whitespace checks passed. Only the QA code/tests/evidence are included; the installed app, personal memory, demo deployment, and unrelated working files remain unchanged.
- Cleanup removes the duplicate demo report/detailed checklist in favor of one upstream owner and a short demo handoff. Retain all three upstream QA reports as historical evidence; temporary staging worktree/backup files are not durable docs.

## Installed local-brain exploratory QA — 2026-10-16

User explicitly requested thorough testing against their local brain, including note creation, linking, deletion, and improvement ideas. This supersedes the earlier fixture-only restriction for this QA pass. No source implementation, installation, deployment, remote profile changes, or global/team memory writes were performed.

### Environment and preservation

- Tested the installed `0.3.0` companion at loopback port 3787 in desktop Google Chrome on macOS, against the configured local Markdown brain. This is installed-build evidence, separate from development-build tests above. The install manifest records a local source directory and no exact Git revision; do not equate it with checkout HEAD.
- Installed SHA-256 fingerprints: `editor-bundle.js` = `b34b89ff62ef8ae6a31c487f023bd6a00e5f9898fc87cc016dea3c1d9d741749`; `notes-browser.js` = `6e78327c2463039c5a0c0391bee6c421f1ec808d4b06e519ceab8df2c0d381aa`; `companion-browser.js` = `6488f8e46919ff8cc26fabffe76124ab672d8f84741566bdd428f2f367f0300a`; `graph-page.js` = `d1e9401d11344f3636a76dce0f4e17097c1a6fb3f0b8cbddf56d0a2935feb990`.
- SHA-256 baseline covered all **1,636 pre-existing Markdown files**. Created exactly two temporary notes, `QA web interface 2026-10-16 A` and `B`; existing notes were only read/link targets. After cleanup: **1,636 files, zero changed or missing originals, zero additional Markdown files**.
- No supported web/CLI note-delete action exists. Cleanup moved only the two verified newly-created QA files outside the canonical root into `/tmp/jumpybrain-web-qa-20261016/removed-notes/`, retaining recoverable copies. This proves external file removal/missing-target behavior, **not a passing UI deletion workflow**.
- Ran installed CLI incremental indexing after cleanup: 1,636 documents; readiness fresh, lexical available, embeddings disabled. Baseline and preservation evidence are local temporary artifacts under `/tmp/jumpybrain-web-qa-20261016/`.
- Screenshots are private local artifacts in the current Codex visualization directory, not repository assets: `local-brain-map-390.png`, `local-brain-conflict.png`, `local-brain-missing-link.png`.

### Observed workflows

| Workflow | Result |
| --- | --- |
| Existing tab / session recovery | Old tab started fenced with session unavailable. Settings activation did not visibly recover it in the immediate observation; reload exposed Retry companion session, which did not restore the expired cookie. Opening the installed companion produced a fresh authenticated editor. Recovery friction observed; no claim of a proven permanent Settings deadlock. |
| Home and recent notes | Existing notes listed; New note opened the editor with a readable date title and separate `How is your day?` heading. |
| Create / edit / autosave | Two real UI creations succeeded. Changed title/body, multiline Unicode (`café`, `Straße`, Japanese, emoji), blur-save and reload persisted to canonical Markdown. |
| Duplicate title / blocked navigation | Renaming A to B's title failed with a visible duplicate-title explanation; Home did not abandon the draft. Restoring A's title recovered Saved state. |
| Global search / keyboard | Cmd+K opened Search; query completed without healthy polls dismissing it. ArrowDown + Enter opened the selected QA note after indexing; Escape closed search. |
| Search freshness | Before refresh, saved QA notes were absent and Search said `No notes found. Try another word.` alongside a freshness warning. Settings refresh completed; both notes appeared afterward. |
| Explicit reference picker | Searching an existing note and Enter inserted literal `[[Title]]`; one undo removed insertion and redo restored it. |
| Inline autocomplete | Typing `[[Mistral Product` at a verified end-of-line caret displayed matching options and stale-index feedback; Enter inserted the completed literal title reference. |
| Rich formatting | Selecting text and pressing Bold produced `**Temporary QA note.**` in canonical Markdown without damaging Unicode or the reference. |
| Fresh title resolution | B's manually entered link opened newly-created A before indexing. A's link to an existing note opened that note with native click. |
| History / graph navigation | Back/Forward returned between Settings and editor; native reference navigation and Back worked. A real graph node opened its editor. |
| Map completeness | Whole-brain map truthfully displayed 500 shown / 1,638 total and the 500-node warning. Filtering to QA notes returned two real notes. Zoom in / Reset were exercised. |
| Map reference consistency | **Mismatch:** B's `[[QA web interface 2026-10-16 A]]` opened A in the editor, but the filtered graph displayed both real A and a separate same-title unresolved target, with one connection to the unresolved target. This is consistent with the currently documented title-versus-filename resolution split; it is still a user-facing inconsistency. |
| Narrow graph | At verified viewport widths 390 / 320, page scrollWidth matched viewport width. Filter input measured approximately 70 / 78 px; at 390, labels overlapped near adjacent graph nodes. Screenshot retained. Narrow writer measurements were not established and are not claimed. |
| Two-tab stale edit | Both tabs loaded A; tab 1 renamed/saved it; tab 2's stale body update failed with a stale-hash error. Draft remained visible, canonical winner was preserved, Home stayed blocked. Retry reproduced the same error. Closed the disposable losing-draft tab afterward. |
| Missing reference target | Moved QA A outside the root; clicking its link in B showed `No page has this title. Your draft is retained.` and retained B. |
| Delete / cleanup | UI deletion unavailable. Removed both QA files externally with recoverable copies, then reconciled the derived index. |

### Prioritized improvements from this pass

- [x] **P1 — Unify reference resolution between editor and map.** A reference inserted by the product should connect to the same note that clicking it opens. Reuse canonical resolution policy across both consumers; cover renamed titles, duplicates, filename fallback, and legacy aliases. Preserve uncertainty for ambiguous titles rather than silently choosing one. Coordinate with core canonical/local-memory owners; do not patch only the map label.
- [x] **P1 — Give conflict recovery a usable exit.** Keep the existing fail-closed stale-hash protection, add Copy draft / compare with current saved version / explicitly reload or discard controls, and explain why Retry alone cannot fix the conflict. Never silently overwrite another tab. Verify safe navigation after explicit resolution.
- [x] **P2 — Provide note deletion through supported product surfaces.** Coordinate with [memory lifecycle controls](tasks-memory-lifecycle-controls.md), which already owns guarded deletion. Add a deliberate UI entry with the selected title, concurrency checks, inbound-link warning, truthful index outcome and clear recovery/irreversibility wording; the current design direction is permanent single-document removal, not implemented Trash.
- [x] **P2 — Make saved notes immediately discoverable.** Consider a bounded session-local overlay of confirmed writes in search/reference suggestions or a safe incremental refresh after saves. At minimum put an actionable Refresh index control/link next to stale search results and replace misleading `Try another word` guidance for known recent writes. Preserve the explicit freshness contract and avoid a full index on every keystroke.
- [x] **P2 — Fix narrow map controls and label collisions.** Let the filter take a usable row width at 390/320 px; collapse or wrap secondary actions first. Bound/cull overlapping labels while preserving accessible names and note activation. Task 5.0 is completed by the implementation below.
- [x] **P3 — Improve expired-session recovery copy.** Offer a direct route to companion reopening/retry from the fenced state, state when Retry requires a fresh companion session, and keep draft-copy recovery visible. Reproduce the stale-tab path with controlled session expiry before treating the initial Settings behavior as an implementation bug.

### Limits

This was hands-on exploratory Chrome coverage on the installed local app, not a full automated suite or certification. No Safari/Firefox, physical mobile/touch/IME, screen-reader, physical clipboard round-trip, remote/readonly profile switching, native folder/Keychain, offline/network fault injection, crash durability, theme-change behavior, security audit, or load benchmark was performed. No existing manual-device gate is closed by this pass. The reproduction above is historical; the source implementation and its verification follow.

## All-improvements implementation — 2026-10-16

### Authorization and scope

User requested “do all improvements,” authorizing the six findings above. Implemented them in this checkout, preserving pre-existing dirty work. No installed-runtime replacement, native rebuild, deployment, commit/push or personal/global/team memory mutation occurred. Existing physical-device and cross-browser gates remain open.

### Completed behavior

- Exact canonical metadata titles now resolve to the same ID-backed file in editor activation and the graph. Duplicate/unopenable title matches cannot silently fall through to a coincidental filename. Existing Markdown paths, IDs, wiki aliases/anchors and ID-less legacy filenames remain supported. Shared title normalization lives in `src/core/document-title.ts`.
- Removed implicit stale-hash overwrite retries for all browser modes. Failed drafts expose Recover draft, current-versus-saved comparison, copying with a selectable fallback, and an explicitly authorized reload that rereads on acceptance. Scope/revision/write-permission checks reject stale or frozen actions.
- Added single-note permanent deletion through core/app/runtime, CLI/recipe, authenticated HTTP and the permission/generation-fenced companion gateway. Preview is observational, title/hash/known references are reviewable, Cancel preserves the file, and Apply shares update queues/locks and guarded final validation. Surviving notes/backlinks are unchanged. Removal success survives derived-index bookkeeping failure. No Trash, cascade or automatic deletion retry.
- Confirmed writes immediately join global search and inline reference suggestions through `recent-write-search.ts`: at most 50 notes, 32 KiB body search per note, scoped to this tab/credential revision/brain generation. Exact indexed title matches precede body-only cache matches. Verified fresh server generations retire the overlay unless another save arrived during the request, preventing old local text from hiding newer external changes. Stale Search also offers explicit index refresh with actionable errors.
- Narrow map filtering has a full-width row at 390/320 px. Measured featured labels are culled on overlap/edge clipping while full accessible titles and keyboard/focus activation remain intact.
- Expired sessions offer direct Retry and Recover draft controls. Guidance distinguishes valid-cookie retry from reopening the companion, and preserves pending drafts across generation fences.

### Ownership and safety review

Canonical removal reuses replacement serialization and `.replace.lock` rather than adding another lock/state system. The browser actions and tab-write overlay are typed modules bundled through the existing browser entry; the HTTP shell composes them. Preview examples are capped at 20, remain advisory, and never authorize cascades. Local readiness and explicit indexing reconcile canonical removals; no deletion replay ledger or permanent client cache was added. Identical-ID/content recreation between separate reads cannot be distinguished by a content hash; external writers ignoring the lock can still race final unlink. These limits are documented, not presented as atomic filesystem compare-and-swap.

### Verification evidence

- `npm run build` passed; the existing 160 KiB gzip review gate remains satisfied.
- New core/runtime/HTTP/CLI tests cover previews, apply authorization, malformed flags, hash/identity conflicts, duplicates, hardlinks/symlinks, cooperating update/delete races and cross-process lock exclusion, same-path replacement by another ID, preserved survivors, repeated deletion, and successful removal despite index-state failure.
- Gateway tests verify read-only DELETE denial, old-generation fencing, forwarded If-Match/JSON, and single-target preservation. Tab-search tests cover immediate discovery, stale hit suppression, exact-title ordering, bounded/scoped caching, canceled/late requests, explicit local-only fallback, fresh-generation retirement and concurrent saves.
- Real-server/QMD `scripts/note-lifecycle-smoke.mjs` passed capture, immediate search, graph title links, two-tab stale-edit comparison/reload without overwrite, 390/320 filter/label geometry, delete preview/cancel/apply, surviving backlink bytes, and explicit index refresh.
- Existing graph-warning smoke passed 1280/390/320 with 501 disposable notes; graph-editor smoke passed desktop/mobile, search/history/failure/Dream/map flows; production companion-gateway smoke passed all 14 checks; companion-browser smoke passed including expired-cookie retry controls; daily-capture smoke passed all 15 cases after updating the stale instruction assertion and fixing the new cache ranking regression.
- One concurrent full-suite run encountered an existing fixture cleanup `ENOTEMPTY` after server close in `server-http.test.js`; it did not fail a behavior assertion. The initial full run passed 975 tests / 1 optional skip. Final-suite and final lifecycle results are appended below.
- Personal-brain SHA-256 comparison still matches all **1,636 original Markdown files** exactly. Installed app and settings were not changed.

Build fingerprints: `editor-bundle.js` SHA-256 `d1d6461e1265015c2eca44451a0f951ef4e34e7f60641c249e10206555fd4e20`; `graph-page.js` `15df918ce9f746edeb7b9a2f035c193338ef8852a790a21674979c5493d7dceb`; core `links.js` `91e73d28051d9c061686a6457cd674df0d541853c2d5a5a2d44b3fd2217c5349`; `markdown-store.js` `a716060c61589db593fc968d418babb77bba0756b6346cfcec916b47663dc8a3`. Temporary logs/screenshots live under `/tmp/jumpybrain-improvements-20261016/`; they contain only synthetic fixture content.

### Final verification

- Final isolated `node --test` run after the final build: **980 passed, 0 failed, 1 skipped (981 total)**. The existing opt-in physical QMD readonly test was not provisioned; the skip remains explicit. Runtime was approximately 45 seconds.
- Final real-server/QMD note-lifecycle browser run passed, including an ordinary backend search after explicit refresh confirming the removed ID is absent. All earlier listed companion/gateway/map/editor/daily-capture runners passed; the only behavioral regression discovered (cached body hits ahead of exact titles) was fixed and covered.
- `git diff --check` passed. No source edits remain unverified by the final build/full tests. No personal-memory, installed-runtime, deployment or commit changes were made.
