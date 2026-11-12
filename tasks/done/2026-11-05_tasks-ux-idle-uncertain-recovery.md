# Idle uncertain-draft recovery

Verification tranche of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md).

- [x] Add opt-in bounded idle/peer-edit controls with explicit lane selection and exact runtime/input receipts; keep default six cases.
- [x] Pilot one accepted-body lane through 132 peer edits and a short idle before actual long observation.
- [x] Retain one uncertain draft at 390px for one hour after 132 peer edits, then verify guarded Home, exact copy and explicit saved acceptance without replay.
- [x] Record outcomes/limits, archive and commit.

This supplements the long clean-writing fixtures with uncertain local editor state.
No product change is proposed without a failed checkpoint. Compiled runtime
hashes must remain unchanged; no rebuild during this test. No native/real-user
timing or actual shared-memory claim.

Pilot selection: 390px accepted-body, 132 actual peer edits, 1,000ms idle.
Passed at visible source revision 133, with retained private source, guarded
Home, exact clipboard copy, explicit saved acceptance and no canonical replay.
Receipt `.local-pack/ux-soak/uncertain-pilot-01-d5d2495/report.json`; all inputs
and canonical fixture copies retained. The short pilot is not the one-hour
result. The default six-lane behavior is being rechecked after the opt-in
controls, and broad runtime tests finish before the long observation starts.

The default six-case runner passed unchanged. Long idle now requires exactly
one explicit kind/width so a missing filter cannot multiply the one-hour bound.
This input-validation guard is the only post-pilot runner difference; both
executed input copies are retained separately. The current product snapshot
passed 1,902 tests, 17 skipped, zero failures (1,919 total) before this observation.

Outcome: passed, build `02721429af82d5af`, retained product `d5d2495`.
The explicit 390px accepted-body lane completed 132 peer edits (revision 133),
then a requested one-hour idle with 120 periodic observations. Private editor
source/title and failed-save state stayed retained; canonical peer text remained
byte-identical without automatic replay. After idle, guarded Home, exact draft
clipboard copy, saved comparison, explicit saved acceptance and full reopen all
passed. The process completed cleanly at 2026-11-05 00:56:47 UTC.

The complete runtime inventory matches its initial hash
`165376d2525f6f256f8b9e0ef0673368884a16f8956281cfdc0477afb92fc2e8`.
Retained inputs, report and canonical Markdown are under ignored
`.local-pack/ux-soak/uncertain-idle-01-d5d2495/`. Independent final Markdown
readback confirms the accepted human contribution and all 132 peer contributions
exactly once. This hour spans a UTC date boundary without a read-side canonical
mutation; it is not a general temporal-retrieval or native-client claim.

Receipt SHA-256 `6871efa903b607688019e14f79cb41f925c77dd0eb8e5ff50d31aaf2a5385289`; executed runner SHA-256 `6ba415a3182a7e37e1f046100af56b012603fbf12fdbec52bab0c97d899903f6`.

Default six fast cases passed after the optional controls were added; a separate
132-peer short pilot passed before the long run. The post-pilot single-lane guard
prevents accidental multi-hour matrix runs. No source-product change, dependency,
installation, index repair or real shared-memory write was needed. This is
source-informed localhost Chromium evidence; native Mac, physical keyboard/IME
and human usability scoring remain unobserved. The optional runner is not an
ordinary npm test, install or release gate.

Scope clarification: the hour-long lane lost acknowledgment of an already
accepted body write. The separate fast matrix covers rejected, genuinely
unpublished body text and lost title acknowledgments; those lanes were not
observed for an hour.
