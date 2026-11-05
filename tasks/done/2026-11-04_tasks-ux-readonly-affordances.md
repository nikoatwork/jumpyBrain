# Read-only note affordances

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce an actual hosted reader seeing empty-note “Start writing” guidance despite a locked body.
- [x] Reuse the same note editing lock for guidance/formatting and the editor controls; keep allowed private editing distinct from current network write readiness.
- [x] Distinguish a real 403 write-access denial from 401 authentication and verify visible writer-key repair.
- [x] Verify hosted reader copy/search/Back and hidden writing affordances, plus writer/reconnect behavior.
- [x] Verify blocked setup, ordinary writing and attribution neighbors.
- [x] Record evidence/limits, archive and commit.

Pre-fix production-browser assertion “a hosted reader must not be invited to start writing” fails. Proposed effect/protected neighbors recorded in parent before editing. This changes only loaded-note affordances, not global role administration, server authorization or CLI targeting. Native UX scoring remains unobserved.

Outcome: keep. Before changes, actual-reader probes failed both the empty-note
writing invitation and the 403 authentication advice. After changes, three
reader/writer affordance cases (1280/390, copy/search/Back and reconnect) and
three creation cases (real 403/no write, visible writer-key repair/exactly one
note, real 401/no additional write) passed. The blocked-editing neighbor passed
seven cases; full writing-workspace checks passed across its responsive widths.
All 39 related connection/architecture/bundle/package checks passed, with 20
focused checks repeated after the final wording change.

Protected behavior: network write readiness alone does not lock a known writer's
private editing, canonical empty-note bytes remain unchanged, and this does not
change authorization or introduce a global role cache. Native Mac, shared VPS
and manual accessibility scoring remain unobserved.
