# Desktop update: reopen existing brains

Status: complete. Reproduced against public v0.3.17; implemented and verified the targeted handoff and diagnostics. Publication is tracked separately.

## Scope

Owner requested live feedback review, independent reproduction and a pragmatic published hotfix for both existing brains failing after the software update. Keep canonical Markdown and pending drafts safe; no broad rollback. A shortened automated verification window is appropriate to this hotfix request; no new real-brain use has been established.

## Feedback

- Live inbox checked 2026-11-03T07:53:14.725Z: full available received/non-spam history, one page, complete; 41 scanned, two delivery tests excluded, 39 genuine reports (including owner/agent reports).
- Read today's report and its attached diagnostics privately: v0.3.18 gateway requests/status fail immediately with HTTP 503; diagnostic code is reduced to `unknown`; backend diagnostics unavailable. Board toast is a symptom, not proof of board corruption.
- Prior release reviewed earlier reports; new November 2 editor draft/conflict reports require separate follow-up. Do not include private feedback bodies or raw attachments in Git.

## Tasks

- [x] Reproduce upgrade against already-running per-brain owners, inspect startup/auth and diagnostics independently.
- [x] Implement bounded authenticated recovery for the demonstrated update path and preserve explicit failure for unsafe/unknown owners.
- [x] Preserve useful backend error codes in diagnostics and actionable UI guidance.
- [x] Run meaningful regression and packaged update/core-flow checks; record exact evidence and limits.
- [x] Finalize implementation, docs, pending release notes and this task; commit scoped changes.
- [x] Transfer publication ownership to [release v0.3.19](../todo/tasks-release-v0.3.19.md); no publication claim from implementation alone.

## Current evidence

Clean master at `ac94cea`, package v0.3.18. Latest public release v0.3.18 published 2026-11-02T17:01:19Z; none published on November 3 Europe/Berlin. Independent investigations underway using disposable fixtures only.


## Reproduction and result

Two independent investigations identified surviving root-owned v0.3.17 daemons
as the update regression. Using the actual downloaded public v0.3.17 tarball,
the v0.3.18 gateway returned status/boards HTTP 503 in 6/3 ms with
`backend_version_mismatch`, matching today's private diagnostic latency.
The candidate automatically drained that authenticated old instance and returned
status/boards 200 in 157/3 ms; canonical fixture bytes were unchanged.

The gateway now opts into lazy older-version daemon handoff for each opened saved
local profile. It verifies private registry and bounded authenticated readiness,
uses the exact-instance graceful-stop capability, waits for lease release and
joins/starts one current owner. It never forces a process kill, downgrades,
replays an ambiguous operation or replaces a same-version divergent build.
Legacy foreground servers expose a different readiness shape and remain running;
unknown shapes also refuse automatic replacement. CLI mismatch remains explicit.

Independent concurrent-caller coverage exposed ECONNRESET during overlapping
handoff. The corrected path observes exact lease release after a stop-network
failure and never repeats the POST. Slow drain/cancellation preserve the old
owner and never start a competing writer. Existing private-draft review remains
in force after reconnect; previously unconfirmed edits are not auto-published.

Diagnostics preserve a finite set of backend error codes while excluding raw
messages, paths, descriptors and credentials. Connection/board version conflicts
show static software recovery guidance rather than implying folder corruption.

## Verification and remaining limits

- macOS 15.7.7 ARM64, Node 26.7.0; clean intake `ac94cea`.
- Build and fresh signed desktop package pass; unchanged verified native helper
  reused. Core note lifecycle passes capture, immediate search, graph/title,
  stale-tab recovery, narrow layout, guarded deletion and index refresh.
- Final targeted regression selection: 41/41 pass across backend upgrade,
  reconnect, diagnostic export, connection/board UX. Upgrade file has 11 cases:
  both persisted profiles, saved access, unchanged notes, six independent
  concurrent callers, foreground/newer/same-build refusal, invalid registry/
  readiness, exact-instance fencing, bounded slow drain and cancellation.
- Initial installed-update assertions passed but its cleanup failed ENOTEMPTY
  because shared fixture backends survive GUI quit. Harness now gracefully
  stops only its disposable brain owner before recursive removal; final rerun
  and fresh packaged recovery results are recorded below.
- No personal brain mutation/fault injection, existing installation replacement,
  live remote write or feedback send. No matching real-brain use window;
  pragmatic hotfix request supplies the shorter automated-test decision. Existing
  obsolete v0.3.13 dogfood status is not treated as candidate-use evidence.
- Does not establish the other machine's exact state, Intel/macOS 26, physical
  OS sleep, clean-OS install, arbitrary plugin data, or installed public upgrade.
  The two new single-user draft/conflict reports remain with unit 7 of the
  [feedback backlog](../todo/tasks-feedback-independent-increments.md).
- Logs: `/tmp/jumpybrain-hotfix-{build,desktop-pack,lifecycle,targeted,backend-host,update,packaged-recovery}.log`.


## Final preparation outcome

- Final targeted selection 41/41 plus backend-host baseline 7/7 pass, no skips.
- Fresh packaged backend recovery passes all five scenarios: saved note, boards/
  search, fresh editing, unchanged private draft and conflicting private draft.
- Installed GUI update success passes with matching fixture app/runtime/CLI
  versions, source policy/preferences/frozen v1 extension preservation, two
  expected real extension activations and no probe activation. Final fixture
  cleanup drains successfully. Evidence:
  `.local-pack/update-smoke/success/2026-11-03T08-02-04.083Z-3WwXOT`.
- `git diff --check` passes. Tests use the final source diff built over
  `ac94cea`; the containing implementation commit identifies that snapshot.
- Archived this completed task; changelog and two pending user-facing release
  bullets updated. Full versioned release suite/publication belongs to the
  release task, rather than an unverified completion claim here.
