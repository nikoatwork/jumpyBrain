# Own-edit external feedback

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce false own-title notification in the production browser shell before changing source.
- [x] Classify external feedback using complete validated operation history and scoped actor identity; ignore content-free checkpoints.
- [x] Verify own-title/body/Undo quietness and actual other-editor title/body notices at 1280/390px (14 browser checkpoints).
- [x] Run neighboring editor/history/external-update regressions and record evidence.
- [x] Archive/commit this scoped increment.

Pre-fix: `scripts/ux-update-feedback-smoke.mjs` failed at “1280: own title acknowledgement”: actual “Updated elsewhere”, expected empty. Expected effect and protected neighbors were recorded in the parent loop before implementation. Revisions containing a foreign edit followed by our own receipt must still notify; same-principal other tabs are foreign. No source/history/publication policy changes and no native UX rating claimed.

Outcome: keep the candidate. Build and 33 focused editor/history/feedback tests passed; 14 production-shell origin checkpoints at desktop/mobile passed; the neighboring external-update browser suite passed at 1280/390px. No lost checkpoints in these checks. Native scoring remains not observed. Tested base `577c31e` with this increment. The new deterministic origin test covers full-history gaps, same-account other tabs, unknown actors and content-free revisions.
