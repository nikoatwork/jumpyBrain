# Clear primary capture action and readable new-note titles

Status: completed and archived 2026-09-27 with user approval.

Delivered a prominent New note home action, Cmd/Ctrl+Enter capture, and readable server-numbered daily titles. Verified 358 tests, desktop/mobile browser flows, screenshots, and packaging. No local installation was changed.

## Goal

Keep home minimal while making New note the unmistakable primary action and Search the secondary action. Offer an easy keyboard shortcut without taking browser New Window/Tab shortcuts. Replace timestamp titles with readable browser-local `YYYY-MM-DD_note_N` titles.

## Decisions

- New note: Cmd/Ctrl+Enter. Search: Cmd/Ctrl+K. Keep Cmd/Ctrl+N, T, and Shift+N untouched.
- Ignore creation shortcuts during composition, inside dialogs, or after another handler consumed the event; suppress repeated keydown creation.
- Buttons and keyboard use the existing guarded/idempotent creation flow, including save failures and retry.
- Server allocates daily suffixes from fresh canonical titles inside its existing write queue/idempotency callback. No QMD lookup or persistent counter; explicit-title API calls stay unchanged. This is not a cross-process/external-writer uniqueness guarantee.
- Search-ranking planning is separate: leave `tasks-search-title-and-recency-ranking.md` unchanged.

## Tasks

- [x] 1.0 Style a prominent home New note action and quieter Search action, with platform-appropriate shortcut hints and accessible focus.
- [x] 2.0 Wire safe Cmd/Ctrl+Enter and replace timestamp capture payload with browser-local daily-date naming.
- [x] 3.0 Add server allocation/validation and concurrent creation/idempotency regression tests.
- [x] 4.0 Verify unit/browser flows, inspect desktop/mobile screenshots, update owning/user docs, and record results.

## Verification

- `npm test`: 358 tests passed, including new real-HTTP daily naming tests (date validation, all canonical buckets/ID-less titles, Unicode normalization, concurrency, replay/restart, legacy explicit titles).
- Daily-capture browser smoke: all 15 scenarios passed, including real Meta+Enter in the editor, Control+Enter from home, dialogs/repeats ignored, no extra newline, and failed-save blocking.
- Recent-notes, graph/editor, and Lexical preservation/security browser regressions passed at desktop/mobile sizes.
- `npm run cli:pack`: package built with 126 required files verified, including the new server naming module. `git diff --check` passed.
- Inspected `/tmp/jumpybrain-capture-shots/desktop-home.png`, `mobile-home.png`, and `desktop-editor.png`; prominent capture/secondary search fit both viewports, and numbered headings remain formatted.
- Fixed a discovered Lexical edge case: intraword underscores in numbered titles are ordinary text, not unmatched emphasis requiring literal-block fallback.
- Browser test Select All replacement now uses the actual clipboard-paste event path and waits for Lexical selection, avoiding Chromium/CDP insertText stale-range behavior. User typing/shortcuts remain exercised separately.
- Updated HTTP adapter, server-memory, writing, setup, and protocol contracts. Suffixes advance past the maximum current matching title, not a persistent counter; deleted/renamed-away maxima can be reused. No existing notes were renamed.
- Scope limits: real OS/Safari/Firefox/physical-keyboard behavior beyond Chromium remains separate QA. External filesystem writers and multiple server processes are outside the existing write-queue guarantee.
- Unrelated search-ranking and macOS-update task work was left untouched.
