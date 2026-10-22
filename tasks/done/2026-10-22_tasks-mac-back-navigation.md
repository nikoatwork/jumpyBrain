# Minimal Mac app back navigation

Status: implemented and verified on 2026-10-22; physical device emission remains untested and standard two-finger swipe is deferred. Finalized within the minimal scope below.

## Goal

Let the Mac app return to the last viewed page using a mouse Back button or the macOS swipe-back gesture, where supported by the current Electron host. Implement only if this stays small, bounded, and inexpensive in RAM.

## Scope and constraints

- Planning default: allow up to five previous destinations per editor window. Confirm the cheapest way to enforce that boundary before implementation; no unlimited application-owned history.
- Reuse the existing browser history and guarded navigation. Avoid a second routing system or duplicate history stack. Native history alone is not proof that retained page resources are bounded.
- Retain only lightweight destination identifiers/URLs if extra state is necessary. Do not retain document bodies, editor instances, DOM trees, graph snapshots, or drafts per history entry.
- No new dependency, background worker, polling, persistent history, history UI, or host migration. No requirement to restore per-page caret/scroll or build Forward navigation for this ticket.
- Keep the change at the existing navigation/input seams. If reliable input support or a practical history bound requires a large navigation rewrite, custom gesture recognizer, hundreds of production lines, or meaningful retained-memory growth, record the limitation here and defer that part. A thousand-line implementation is outside scope.
- Native mouse/gesture support remains unverified. Verify the shipped Electron version and actual macOS/device behavior; report unsupported inputs explicitly.
- Implementation and scoped commit are authorized. Installation, pushing, and release remain outside this task.

## Relevant files

- `integrations/electron/back-navigation.mjs`, `window.mjs` — bounded native history, mouse/gesture input and navigation restrictions.
- `integrations/electron/electron.docs.md` — desktop ownership and sandbox contract.
- `src/adapters/http-server/notes-browser.ts` — existing navigation controller, history entries, save guard, and `popstate` handling.
- `src/adapters/http-server/companion-browser.ts` — brain/profile scope and history reset on switching.
- `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md` — architecture and browser navigation contracts to read before source edits.
- `scripts/mac-back-navigation-smoke.mjs`, `integrations/electron/smoke-back-navigation.mjs` — disposable production-window/gateway input, save, history and retention checks.
- `test/electron-back-navigation.test.js`, `test/notes-browser.test.js`, `test/companion-browser.test.js` — native wiring and guarded traversal regressions.
- [Desktop RAM follow-up](../todo/tasks-desktop-ram-follow-up.md) — coordinate any retention finding without expanding this ticket into the full RAM program.

## Tasks

- [x] 1.0 Verify the minimal approach before committing to implementation.
  - [x] 1.1 Trace note/reference/search/graph navigation through the existing browser history and save guard. Check whether mouse Back and trackpad swipe currently reach that path in the Mac app.
  - [x] 1.2 Check supported native input hooks in the installed Electron version. Prefer a small adapter that requests existing guarded history traversal; avoid duplicate handling when Chromium already handles an input.
  - [x] 1.3 Determine whether five previous destinations can be supported with bounded lightweight state and without retaining old page resources. Distinguish any added state limit from Chromium's own history retention; do not promise that a short URL list alone caps RAM.
  - [x] 1.4 Record the approach, expected patch size, supported inputs, and retention boundary here. Proceed only if it meets the scope above; otherwise record a concise deferral and leave implementation unchecked.
- [x] 2.0 Implement bounded Back through the existing navigation path.
  - [x] 2.1 Wire each supported native Back input to exactly one traversal. At the oldest allowed destination, do nothing; do not navigate into bootstrap/authentication pages or outside the app.
  - [x] 2.2 Count actual destination changes, including note-to-note transitions. Avoid entries for autosaves, same-destination clicks, or a canceled/failed navigation; discard older destinations at the agreed boundary.
  - [x] 2.3 Preserve pending-save/conflict handling: Back must not lose a draft, bypass a blocked save, or consume history when a transition is canceled. Reuse existing traversal recovery.
  - [x] 2.4 Keep history window- and brain-scoped; switching destinations cannot reopen a previous brain's page. Release added state/listeners with the window and preserve existing authentication, sandbox, and graph cleanup behavior.
- [x] 3.0 Verify functionality and cost, then document the delivered scope.
  - [x] 3.1 Run focused existing navigation/save/companion tests and add only the regression coverage needed for native dispatch and the history boundary. Check repeated Back, the empty/oldest boundary, branching after Back, failed saves, deleted targets, and brain switching.
  - [~] 3.2 Physical mouse/trackpad operation was not performed by the agent. Chromium mouse/keyboard input and the native swipe callback are verified automatically; physical device emission/settings and standard two-finger swipe remain unverified/deferred. No custom scrolling or gesture interception was added.
  - [x] 3.3 Compare the same repeated note/graph navigation workload before and after. Inspect retained history, editor/DOM/listener counts and settled renderer/whole-app memory after recovery; require bounded added state and no meaningful retained-memory regression. Record measurements and noise rather than promising zero allocation.
  - [x] 3.4 Record the tested snapshot, results, patch size and remaining limits here. Update owning docs and `tasks/todo/release-next.md` only for delivered behavior; follow repository changelog/archive rules when finalizing this list.

## Implementation decision — 2026-10-22

- Electron 44.8.0 on macOS 15.7.7 exposes `navigationHistory.removeEntryAtIndex`; a disposable live probe preserved renderer `history.back()` and its state after removing the oldest entries. Use the existing native history, capped at six entries total (current plus five previous), with no application-owned list. Keep renderer traversal because Electron's immediate native `canGoBack()`/`goBack()` probe did not traverse after pruning.
- Input support: capture standard DOM mouse button 3 once on mouseup, suppress its default down/up/auxclick handling, accept driver-mapped Cmd+[, and use Electron's native rightward `swipe`. Electron documents the swipe event for the older three-finger gesture with “Swipe with two or three fingers” enabled. Standard animated two-finger swipe is deferred: no custom wheel/gesture recognizer. See [Electron gesture contract](https://www.electronjs.org/docs/latest/api/browser-window#event-swipe-macos) and [history removal](https://www.electronjs.org/docs/latest/api/navigation-history#navigationhistoryremoveentryatindexindex).
- Implementation is one small Electron adapter plus a guarded Back method in the existing controller; no extra history snapshots. Reload and brain-scope changes clear the window's native history. Target production change is below 100 added lines. Physical hardware behavior and memory results remain to be verified or explicitly recorded as untested.

## Verification and limits

- Tested on macOS 15.7.7 (24G720), arm64, Electron 44.8.0, Node 26.7.0. Base snapshot: `2edde21` plus this task's scoped changes. Final renderer build and source fingerprints are recorded below. No installed app, personal memory, remote brain or release was modified.
- Production change: 58 added lines total across one 48-line Electron adapter, two integration lines and the existing controller/search adjustments; below 100 added production lines, no new dependency, worker, polling, page cache or application-owned history list. Native entries are capped at six total and cleared on reload/brain changes.
- Three interleaved baseline/changed repetitions: same production renderer/gateway, disposable three-note brains, prior `2edde21` window versus new adapter. Each warms 12 destinations, then visits 120 note/graph/home destinations, waits three seconds and samples before diagnostic collection. Final same-note search/self-reference fixes do not run in this measured workload. These short fixture runs assess incremental retention, not a whole-desktop budget or long-term leak guarantee.
- Baseline versus changed: history 50 versus 6; reachable DOM 1 document/1,022 nodes in every run; listeners 213 versus 217 (four fixed input listeners, no growth from warm-up). One window, four Electron processes, no hidden graph nodes/layout timer, and tab cleanup all verified. Test-only diagnostic GC distinguishes reachable objects; raw heap/process samples are captured first and production adds no GC hook.
- Settled renderer working set: baseline 142.27–144.41 MiB, changed 135.34–137.52 MiB. Electron process working-set sum: 420.72–423.08 versus 414.30–416.22 MiB. Gateway RSS: 120.69–121.98 versus 119.95–121.42 MiB. Combined fixture sum: 541.45–545.06 versus 535.27–537.20 MiB. No meaningful added-memory regression observed; these RSS sums can double-count shared pages and are not physical footprint. Do not generalize the small apparent reduction into a product savings claim. The native helper, real Keychain, large corpora, indexing/model work and physical gestures were outside this fixture.
- Native/Chromium input checks cover full mouse down/up/default suppression, five-step/empty boundary, branching, Cmd+[, right-swipe callback, failed-save draft/URL restoration with explicit Retry and canonical save, deleted-target recovery, actual companion brain switch/reload, and tab cleanup. Existing Electron and companion browser smokes also cover sandbox/auth, search, save/close and generation behavior.
- The broader companion smoke caught a same-note Search dismissal regression from URL scoping; the scoped comparison and a dedicated unit regression now preserve dismissal without a new history entry. Resolved self-references also reuse their current entry after guarded preflight.
- Local raw logs/comparison and the baseline module are ignored under `.local-pack/back-navigation/`; regenerate using the checked-in smoke driver rather than treating absent machine-local artifacts as a blocker.

Final built renderer: `02635f6f57a2adcb` (version 0.3.5). Source SHA-256:

- `integrations/electron/back-navigation.mjs`: `ac9e3439490795e3c169027676d652d5d6501c02ef9327ecdf4d26fe14b82ca2`.
- `integrations/electron/window.mjs`: `4b8e5e17e67ba43252d84607986793184866381a99ef9c1247ab4697da1d4030`.
- `src/adapters/http-server/notes-browser.ts`: `35d784a614f0c9742ee2d2b485cdffd7ce5cee5b150de065d307021a686e9880`.

Final checks on the recorded source:

- `npm run build` followed by `node --test`: 1,158 passed, one skipped, zero failed. The skipped real-QMD 2.8.3 test requires the optional `JUMPYBRAIN_TEST_QMD_BIN`; it is unrelated to navigation.
- `node scripts/mac-back-navigation-smoke.mjs`: passed, including actual Chromium mouse/keyboard dispatch, native callback dispatch, failed saves, deletion, real brain switching, repeated traversal and cleanup. Three matched baseline/changed resource repetitions also passed; measurements above are from the sequential comparison, not later concurrent smoke runs.
- `node scripts/electron-smoke.mjs`: passed existing production onboarding, authentication/sandbox, feedback, Settings, graph, autosave, keep/discard and tab cleanup.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs`: passed search/current-note dismissal, settings, references, two-tab save barriers, conflicts, generation reload, read-only, stale links and session fencing.
- Owning docs and pending release note updated; changelog records the delivered user capability. No new glossary term. `git diff --check` passed. Scoped staging/guard and commit finalize this archive.
