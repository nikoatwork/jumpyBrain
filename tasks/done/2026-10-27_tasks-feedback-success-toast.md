# Close feedback after successful sending

## Completed outcome — 2026-10-27

Relevance: confirmed sends cleared the text but left the dialog open with inline success. Implemented the remaining close-and-toast behavior.

- Only matching `{accepted:true,id}` clears the submitted report, closes the dialog, restores Feedback focus and dispatches one shared app-scoped thank-you message, revisioned by submission ID. Feedback delivery is support/app-owned, independent of the selected brain; acceptance does not imply human review.
- Ordinary in-flight dismissal/duplicate sends remain blocked. Failed or mismatched acknowledgements retain the draft and frozen ID/report for retry. Forced session closure suppresses late success/failure UI, and accepted late submissions clear only their submitted report.
- Browser and Electron smoke expectations now reopen after success and check fresh diagnostics collection, frozen attachment evidence and opt-out/cancellation. Updated owning docs and pending release notes. This routine fix does not require a separate changelog highlight.

## Verification and remaining limits

- `scripts/feedback-smoke.mjs`: **PASS**, `/tmp/jb-feedback-smoke.log`: desktop/narrow, light/dark, failed send/reopen/same-ID retry, attachment and opt-out, focus/shortcuts, unconfirmed saves/conflict privacy and success-close/shared toast. Screenshots inspected under `/tmp/jb-feedback-related-qa/feedback*.png`, including closed-dialog `feedback-sent-{1280,390,320}.png`.
- `scripts/electron-smoke.mjs`: **PASS**, `/tmp/jb-feedback-electron-smoke.log`: production sandboxed window/gateway fixture delivery, close/focus, onboarding, guarded save/close and cleanup.
- `scripts/diagnostics-electron-smoke.mjs`: **PASS**, `/tmp/jb-feedback-diagnostics-smoke.log`: renderer crash/reload, safe host/browser evidence, frozen report, fresh reopening and cancellation/opt-out.
- Deterministic dialog tests cover duplicate clicks, mismatched acceptance, forced closure and late results. No live provider delivery or assistive-technology behavior was asserted; feedback drafts remain tab-local and are lost on reload.

## Tested snapshot and shared verification

- Base `56c8fe075508a6392417de275856a5190af29b55` plus this task's scoped commit in the isolated worktree; jumpyBrain 0.3.9, Node 26.7.0, macOS arm64. Final generated runtime/editor build: `23cc2c2dfa532d81`. No version bump, personal installation, live mail, push or release.
- Final focused run: **197 passed, 0 failed**, `/tmp/jb-final-focused.log` (related pages, feedback dialog/delivery/configuration/privacy, shared toasts, notes navigation, installation/preflight/lifecycle/updater and companion gateway tests).
- `node --test test/qmd-execution.test.js`: **15 passed, 0 failed**, `/tmp/jb-qmd-execution-rerun.log`. An earlier unrestricted-concurrency full run had 7 failures in that file; isolated rerun passed.
- `node --test --test-concurrency=4`: **1,397 passed, 0 failed, 1 skipped**, `/tmp/jb-related-feedback-full-final.log`. Reduced concurrency avoids the earlier process/deadline fixture instability.
- `git diff --check`: passed. Browser checks use the repository Playwright runtime and disposable real engines/gateway, never personal notes.

## Goal

Close the feedback modal after a successful send and show a short thank-you toast.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=2ddb848a-f51c-4958-8e1e-f876a52ea82c); triaged 2026-10-27.
- Use the shared system-message/toast component. Failed sends must keep the draft and retry path; an accepted submission must not imply the feedback has already been reviewed.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{feedback,browser-system-messages}.ts`, `browser.docs.md`; `scripts/feedback-smoke.mjs`.

## Tasks

- [x] On confirmed success, clear the submitted draft, close the modal, restore focus and dispatch one concise thank-you toast.
- [x] Preserve in-flight duplicate protection, failed-send draft retention and safe handling of late responses after closing/reopening or changing scope.
- [x] Run focused feedback UI checks with a fixture sender for success, failure and retry; inspect toast/focus behavior without sending live test emails.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
