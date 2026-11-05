# Search warning scope and certainty

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce an inactive Search warning hiding a successful clipboard confirmation.
- [x] Separate read cancellation from surface suspension; clear only search's warning/indicator on suspension or scope reset, and report state again on reentry.
- [x] Describe uncertain freshness without asserting total search failure.
- [x] Verify warning scope, same-state reentry, save-error priority, canonical preservation, cancellation and freshness neighbors.
- [x] Run writing-workspace neighbor; record evidence/limits and archive/commit.

Before-fix targeted browser assertion: “search warning does not outlive Search” fails (toast remains visible). Clipboard readback in the broader writing journey already proved actual copy success; the blocked confirmation was a notification-context defect. Global priority, index ownership and mutation behavior stay unchanged. Native UX ratings not observed.

Outcome: keep. Six desktop/mobile warning/copy/save-error cases passed; 36 maintenance/workspace/boundary/bundle/package tests passed. The full writing-workspace journey passed on the combined candidate with the scoped Escape fix: source writes/reopen, reference/Back/search, failed-save review, exact private-draft copy, read-only and responsive/palette checks. Search warnings clear only their own source; no priority change or hidden repair. Native ratings unobserved.
