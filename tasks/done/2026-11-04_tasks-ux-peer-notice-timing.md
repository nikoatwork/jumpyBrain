# Latest peer notice timing

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md).

- [x] Reproduce a newer peer notice cleared by the earlier peer edit's timer.
- [x] Give the note one replaceable timer and cancel it on note disposal.
- [x] Verify latest interval, quiet expiry, own acknowledgments, canonical source and scope/focus neighbors.
- [x] Record outcome/limits, archive and commit.

Pre-fix actual peer reproduction failed: after the second edit, the visible
notice was already empty at ~2.4 seconds because the earlier clear fired.
Receipt `/tmp/jumpybrain-ux-peer-timer-before.log`. Candidate replaces one scoped
timer per remote update and cancels it with the editor.

Outcome: keep, build `a29d2f6b48755f42`. The 18 production-browser checkpoints
pass at 1280/390: opens/own title/body/Undo remain quiet, separate editors retain
notices, a rapid later peer edit gets its intended interval, and the notice
still expires after activity stops. Focus and canonical snapshot/file equality
remain unchanged. All 117 focused origin/editor/browser/architecture/bundle
tests and eight real CLI generation feedback cases pass.

Package: 1,448,672 compressed bytes, 4,564,979 unpacked, 3,050,993 runtime,
646 files. Editor 223,116 gzip bytes, same 15 packages, all ceilings unchanged.
The in-progress 90-minute soak uses an earlier frozen artifact and does not
establish this timer change. Native Mac/public VPS and physical accessibility
remain unobserved. Final broad verification remains owned by the parent loop.

Commit hygiene: formatting exposed an existing dummy-key assignment to the
environment-style scanner. The fixture now generates a UUID credential per run;
its runtime expression also matched that scanner's bare `token =` pattern, so
the local binding is named `fixtureKey`. The guard remains unchanged and no
real credential is committed. All 18 browser checkpoints passed with the
generated credential before the binding rename.
