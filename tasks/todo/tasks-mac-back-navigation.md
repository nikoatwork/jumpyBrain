# Minimal Mac app back navigation

## Goal

Let the Mac app return to the last viewed page using a mouse Back button or the macOS swipe-back gesture, where supported by the current Electron host. Implement only if this stays small, bounded, and inexpensive in RAM.

## Scope and constraints

- Planning default: allow up to five previous destinations per editor window. Confirm the cheapest way to enforce that boundary before implementation; no unlimited application-owned history.
- Reuse the existing browser history and guarded navigation. Avoid a second routing system or duplicate history stack. Native history alone is not proof that retained page resources are bounded.
- Retain only lightweight destination identifiers/URLs if extra state is necessary. Do not retain document bodies, editor instances, DOM trees, graph snapshots, or drafts per history entry.
- No new dependency, background worker, polling, persistent history, history UI, or host migration. No requirement to restore per-page caret/scroll or build Forward navigation for this ticket.
- Keep the change at the existing navigation/input seams. If reliable input support or a practical history bound requires a large navigation rewrite, custom gesture recognizer, hundreds of production lines, or meaningful retained-memory growth, record the limitation here and defer that part. A thousand-line implementation is outside scope.
- Native mouse/gesture support remains unverified. Verify the shipped Electron version and actual macOS/device behavior; report unsupported inputs explicitly.
- Task-list creation does not implement, install, or release the feature.

## Relevant files

- `integrations/electron/window.mjs` — editor window, native event wiring, and navigation restrictions.
- `integrations/electron/electron.docs.md` — desktop ownership and sandbox contract.
- `src/adapters/http-server/notes-browser.ts` — existing navigation controller, history entries, save guard, and `popstate` handling.
- `src/adapters/http-server/companion-browser.ts` — brain/profile scope and history reset on switching.
- `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md` — architecture and browser navigation contracts to read before source edits.
- `integrations/electron/smoke-app.mjs`, `test/notes-browser.test.js`, `test/companion-browser.test.js` — existing verification seams.
- [Desktop RAM follow-up](tasks-desktop-ram-follow-up.md) — coordinate any retention finding without expanding this ticket into the full RAM program.

## Tasks

- [x] 1.0 Verify the minimal approach before committing to implementation.
  - [x] 1.1 Trace note/reference/search/graph navigation through the existing browser history and save guard. Check whether mouse Back and trackpad swipe currently reach that path in the Mac app.
  - [x] 1.2 Check supported native input hooks in the installed Electron version. Prefer a small adapter that requests existing guarded history traversal; avoid duplicate handling when Chromium already handles an input.
  - [x] 1.3 Determine whether five previous destinations can be supported with bounded lightweight state and without retaining old page resources. Distinguish any added state limit from Chromium's own history retention; do not promise that a short URL list alone caps RAM.
  - [x] 1.4 Record the approach, expected patch size, supported inputs, and retention boundary here. Proceed only if it meets the scope above; otherwise record a concise deferral and leave implementation unchecked.
- [ ] 2.0 Implement bounded Back through the existing navigation path.
  - [ ] 2.1 Wire each supported native Back input to exactly one traversal. At the oldest allowed destination, do nothing; do not navigate into bootstrap/authentication pages or outside the app.
  - [ ] 2.2 Count actual destination changes, including note-to-note transitions. Avoid entries for autosaves, same-destination clicks, or a canceled/failed navigation; discard older destinations at the agreed boundary.
  - [ ] 2.3 Preserve pending-save/conflict handling: Back must not lose a draft, bypass a blocked save, or consume history when a transition is canceled. Reuse existing traversal recovery.
  - [ ] 2.4 Keep history window- and brain-scoped; switching destinations cannot reopen a previous brain's page. Release added state/listeners with the window and preserve existing authentication, sandbox, and graph cleanup behavior.
- [ ] 3.0 Verify functionality and cost, then document the delivered scope.
  - [ ] 3.1 Run focused existing navigation/save/companion tests and add only the regression coverage needed for native dispatch and the history boundary. Check repeated Back, the empty/oldest boundary, branching after Back, failed saves, deleted targets, and brain switching.
  - [ ] 3.2 Manually exercise a physical mouse Back button and macOS trackpad swipe on the tested Mac/Electron version. Confirm one transition per action and no interference with editor selection, horizontal scrolling, or graph pan. Record unavailable hardware or unsupported gestures.
  - [ ] 3.3 Compare the same repeated note/graph navigation workload before and after. Inspect retained history, editor/DOM/listener counts and settled renderer/whole-app memory after recovery; require bounded added state and no meaningful retained-memory regression. Record measurements and noise rather than promising zero allocation.
  - [ ] 3.4 Record the tested snapshot, results, patch size and remaining limits here. Update owning docs and `tasks/todo/release-next.md` only for delivered behavior; follow repository changelog/archive rules when finalizing this list.

## Implementation decision — 2026-10-22

- Electron 44.8.0 on macOS 15.7.7 exposes `navigationHistory.removeEntryAtIndex`; a disposable live probe preserved renderer `history.back()` and its state after removing the oldest entries. Use the existing native history, capped at six entries total (current plus five previous), with no application-owned list. Keep renderer traversal because Electron's immediate native `canGoBack()`/`goBack()` probe did not traverse after pruning.
- Input support: capture standard DOM mouse button 3 once on mouseup, suppress its default down/up/auxclick handling, accept driver-mapped Cmd+[, and use Electron's native rightward `swipe`. Electron documents the swipe event for the older three-finger gesture with “Swipe with two or three fingers” enabled. Standard animated two-finger swipe is deferred: no custom wheel/gesture recognizer. See [Electron gesture contract](https://www.electronjs.org/docs/latest/api/browser-window#event-swipe-macos) and [history removal](https://www.electronjs.org/docs/latest/api/navigation-history#navigationhistoryremoveentryatindexindex).
- Implementation is one small Electron adapter plus a guarded Back method in the existing controller; no extra history snapshots. Reload and brain-scope changes clear the window's native history. Target production change is below 100 added lines. Physical hardware behavior and memory results remain to be verified or explicitly recorded as untested.
