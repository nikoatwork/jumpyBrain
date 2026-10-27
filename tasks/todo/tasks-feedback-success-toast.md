# Close feedback after successful sending

## Goal

Close the feedback modal after a successful send and show a short thank-you toast.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=2ddb848a-f51c-4958-8e1e-f876a52ea82c); triaged 2026-10-27.
- Use the shared system-message/toast component. Failed sends must keep the draft and retry path; an accepted submission must not imply the feedback has already been reviewed.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{feedback,browser-system-messages}.ts`, `browser.docs.md`; `scripts/feedback-smoke.mjs`.

## Tasks

- [ ] On confirmed success, clear the submitted draft, close the modal, restore focus and dispatch one concise thank-you toast.
- [ ] Preserve in-flight duplicate protection, failed-send draft retention and safe handling of late responses after closing/reopening or changing scope.
- [ ] Run focused feedback UI checks with a fixture sender for success, failure and retry; inspect toast/focus behavior without sending live test emails.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
