# Four UI requests

Completed 2026-11-10: all four UI changes implemented, focused checks passed, and feedback/release records updated. Pending publication through the normal release workflow.

User-authorized scope, 2026-11-10: written versus edited dates, two-line related-note hover previews, remove the insert-reference button, and simplify deletion confirmation. Owns the four deferred UI items in [feedback follow-ups](../todo/tasks-feedback-follow-ups.md).

## Work

- [x] Label search edit ages explicitly; show separate Written and Last edited facts without changing evidence dates or canonical metadata.
- [x] Add safe two-line related-note previews on hover and keyboard focus, including cancellation and brain/navigation fences.
- [x] Remove the toolbar Link button; retain inline reference completion.
- [x] Use one deletion warning and short Cancel/Delete actions, retaining hash/permission/save guards.
- [x] Run focused unit and Chromium checks; record evidence and limits.
- [x] Update owning docs, feedback index, pending release notes and changelog; archive and commit scoped changes.

## Verification

Tested on base `1c03261fe127cb987d99e2c7638f79444d0873b8` plus this task's working changes; final source build fingerprint `643a383f67788942` (v0.3.21). Shared-editor checks use disposable Markdown and Chromium.

- `npm run build` — passed; editor bundle 674,683 minified / 222,903 gzip bytes, below the existing gate.
- `node --test test/note-workspace.test.js test/search-recognition.test.js test/related-pages.test.js test/notes-browser.test.js test/daily-notes-browser.test.js test/browser-page-navigation.test.js test/companion-browser.test.js test/lexical-bundle.test.js` — 149 passed.
- `npx --package=playwright node scripts/related-pages-smoke.mjs` — passed: hover/focus/Escape, text-only unsafe/long body, two-line clamp and viewport bounds in both themes at 1280/390/320, failed and delayed previews, navigation/save guards, and real read-only brain switch with the same note IDs and different bodies.
- `npx --package=playwright node scripts/note-workspace-smoke.mjs` — passed: separate Written/Last edited facts, absent toolbar button, real inline completion, formatting/Undo, autosave/reopen, save recovery, scoped focus and read-only facts; desktop/narrow/theme/palette layouts.
- `npx --package=playwright node scripts/search-recognition-smoke.mjs` — passed at 1280/390/320 in light/dark, including explicit Edited labels, real search and confirmed-save freshness. Reused after the final companion-only startup fix; hosted search source/behavior did not change.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` — passed: Cancel initially focused, one warning, short labels, cancel/apply, conflict handling, canonical removal and index refresh. Reused after preview-only refinements and the companion startup reference removal; deletion source/behavior did not change.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs` — broader optional attempt stopped at line 170: its Settings fixture expects the dark name-input background to equal the body color. This task changes neither that input styling nor its assertion; not counted as a pass. Real companion startup, read-only notes and brain fencing pass in the two production gateway journeys above.
- `npx --package=playwright node scripts/reference-autocomplete-smoke.mjs` — passed: 1280/390 inline `[[` and companion `@`, insertion/Undo, pointer/touch, query cancellation, scope/read-only guards and unsafe-title handling. Transport is stubbed; real editor and keyboard input are exercised.
- Visually inspected narrow dark related preview and narrow light search and narrow dark Written/Last edited card screenshots. `git diff --check` passed.

Earlier attempts caught and corrected focused-preview scroll dismissal and a companion-only startup reference to the removed button. The page-action keyboard helper now checks Shift+Tab/Tab so its round-trip stays inside the document when More info is the final tab stop. Modal-picker policy regression checks use the retained internal picker entrypoint; the user journey verifies inline completion.

Limits: no installed-app update, native-device run, semantic-ranking evaluation, publication or deployment. Existing ranking, canonical dates/evidence metadata and guarded deletion policy are unchanged. Preview snippets are transient, plain text, on-demand, reused for up to 30 seconds with at most 20 cached entries within the current note/scope, and never an editing baseline.


## Relevant files

- `src/adapters/http-server/{notes-browser,graph-page,note-workspace,related-pages}.ts`: shell, dates and related previews.
- `src/adapters/http-server/browser.docs.md` and `docs/design-system.md`: presentation contracts.
- Focused Node tests and browser/native smoke fixtures: labels, inline insertion, missing toolbar button and deletion/previews.
- Feedback index/follow-ups, pending release notes and changelog: outcomes and archive links.
