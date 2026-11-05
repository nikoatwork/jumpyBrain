# Retained comparison acknowledgment

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce unchanged notice after explicit Keep current in the production browser shell (baseline assertion: notice visibility remained true).
- [x] Implement bounded tab/scope-only acknowledgment of an exact successfully compared retained record, preserving version access.
- [x] Verify explicit Keep current, Escape, failed/stale comparison, same-tab revisit, own saves, new records and scope changes.
- [x] Verify neighboring recovery/restore/access safeguards.
- [x] Record evidence, limits and keep/revert decision; archive and commit.

Expected effect and protected neighbors recorded in parent task before source changes. No canonical or recovery-record mutation, no persistence, no automatic acknowledgments. Only successful/stable comparison plus explicit choice quiets a record; at most 64 opaque signatures are held. Reload resets them. Scope changes clear them. The historical native baseline stays unchanged; native UX ratings remain not observed.

Validation preparation: full suite is running against the prior built artifact. A temporary source/scripts/package fixture with a symlink to existing dependencies allows candidate builds without mutating those artifacts. It is not a product installation or a separate Git worktree. Candidate source will be rechecked against the main checkout before retention.

Outcome: keep. Temporary production build `906168ecc6279bcc` passed ten desktop/mobile review scenarios, including credential-scope reset, new records and failed/stale comparisons. All 11 existing retained-version browser scenarios and four bounded comparison tests passed. Main/candidate TypeScript source trees matched SHA-256 `5097f132164853c6ef38c456acdc07b5ec7d8297e30b0617dfecea7cd8c40814`. An accidental run against the deliberately unchanged main build reproduced the old failure again; candidate claims use the explicitly named temporary build. The neighboring smoke needed the real Git metadata path for its read-only head inventory; no Git metadata or tracked source was fabricated. Native ratings not observed.
