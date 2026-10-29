# Sidebar context and resizing

- [x] Add plain-text previews and edit ages to sidebar notes, including pins.
- [x] Reveal actions on hover/focus; add persisted bounded resizing.
- [x] Build and run sidebar checks; document and commit.

Outcome: 280px default, 224px minimum, responsive maximum; pointer and keyboard resizing, reset and persistence. Previews reuse search presentation and existing authenticated reads. Metadata changes preserve row DOM.

Verification: working implementation snapshot on 2026-10-29: npm run build; nine sidebar/navigation unit tests; scripts/sidebar-smoke.mjs passed including drag persistence, keyboard resizing, pin/rename/body-save DOM stability, cross-tab pins, failed-save navigation, themes and narrow layout.

Limits: shared browser shell tested through Playwright; packaged macOS app not installed or exercised. Preview reads are cached per brain and refreshed after local saves; external body-only edits may require reload. No release or push.
