# Idle editor session recovery

## Goal

A local, single-user Mac editor left open for hours must not end in a permanent "Your session ended" lock. Recover the session automatically when it is safe (wake/refocus/next poll), and offer a clear one-click reconnect when it is not. Report: [November 12 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=bee0edf8-50db-4243-b968-0903aeab6ac8) ([index](../feedback.md)).

## Evidence and boundaries

- Starting hypothesis: one failed companion `poll` calls `companionFence()` (`src/adapters/http-server/companion-browser.ts`), which sets `companionSessionFailed` with no automatic re-registration. Sleep/wake, a backend restart or a brief loopback failure would be enough.
- Unpublished private drafts, unknown writes and protected recovery remain authoritative. Never discard or guess a draft to unlock the editor; never optimistic-unfreeze on a lost coordinator response without re-establishing state.
- Scope: investigation, smallest safe fix, focused tests and Chromium scenario, docs, archive and local commit. No release, install or push.

## Tasks

- [ ] 1.0 Establish behavior.
  - [ ] 1.1 Read companion/live docs and the November 12 diagnostics attachment; record limits.
  - [ ] 1.2 Trace every path to `companionFence`/session failure and what the companion coordinator does on idle, sleep and backend restart.
  - [ ] 1.3 Reproduce the fence with a stalled/failed poll in a disposable brain; choose the behavior contract.
- [ ] 2.0 Implement and verify.
  - [ ] 2.1 Retry/re-register transparently when no pending input exists; keep the fence and recovery path when a draft could be lost.
  - [ ] 2.2 Recover on visibility/focus and on an explicit reconnect button.
  - [ ] 2.3 Focused regression tests plus the applicable Chromium scenario.
- [ ] 3.0 Finalize: docs, feedback index/follow-up outcome, release note, archive, commit.
