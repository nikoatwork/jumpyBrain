# Plain session recovery message

## Goal

Explain an expired editor session in one plain sentence with a clear route to keeping the draft and reopening the editor.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=19c9a293-59f3-474d-b9a9-805b0c34eebb); triaged 2026-10-27.
- Remove implementation terms such as fenced and session cookie. Keep Recover draft available and preserve the existing protection against losing unsaved work.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{companion-browser,notes-browser}.ts`, `browser.docs.md`; existing companion-browser smoke.

## Tasks

- [ ] Replace the expired-session paragraph and duplicate technical recovery copy with consistent, short language; explain any retry prerequisite only where that action needs it.
- [ ] Retain draft recovery and safe reopen/retry controls without weakening session or save guards.
- [ ] Reproduce controlled session expiry with a disposable unsaved draft; check the message, copy recovery and reopening without draft loss.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
