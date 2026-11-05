# Retrieval option error precedence

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce invalid depth reaching retrieval/tool setup rather than explaining the user option.
- [x] Reuse core depth policy before target/credential and engine access.
- [x] Verify rich/compact search/recall with local/remote targets and no transport calls.
- [x] Run CLI error/recipe/bounded-read neighbors and archive/commit.

Expected effect and safeguards recorded in parent before source edit. No ranking/depth policy, transport permissions or canonical writes change. Native UX scoring not observed.

Outcome: keep. The original no-transport regression failed before the fix; all eight rich/compact × search/recall × local/remote checks now reject the bad depth before touching transport. Six no-engine error/bounded-read tests passed. With isolated pinned QMD, 25 CLI baseline/error/bounded-read/architecture tests passed, including valid recipe and ordinary operation paths. No native score claimed.
