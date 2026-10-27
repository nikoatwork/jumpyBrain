# Plain session recovery message

## Completed — 2026-10-27

**Implemented: plain recovery guidance.**

Relevance: both session-failure paths and Settings recovery repeated “fenced”/“session cookie” explanations. They now share “Your session ended; use Recover draft to copy your work before reopening the editor from the app menu.” Only Retry’s tooltip explains its prerequisite. The comparison dialog’s introduction is also plain and concise. Recovery, reload denial and the original request/session/brain/save fences remain in place.

## Tested snapshot

Base `56c8fe075508a6392417de275856a5190af29b55` plus this commit’s scoped working tree; built on 2026-10-27 with Node v26.7.0. Editor bundle: 540,252 bytes / 178,797 bytes gzip, SHA-256 `e95e3e65e9dcbab2d9e592881c9c8ff84ba2328c9bf7d447209332d758bd2873` (reviewed 180 KB gate, no new dependency).

## Verification

- `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR=/tmp/jumpybrain-note-find-qa npx --yes --package=playwright node scripts/companion-browser-smoke.mjs`: PASS live session expiry with a disposable unsaved draft, actual clipboard copy/read-back, disabled discard/reload, no retry PUT, canonical version unchanged, fresh-session second-tab reopen and original draft retained. Existing two-tab switch/conflict/read-only/session checks also pass. Log `/tmp/jumpybrain-ux-companion-smoke.log`.
- Inspected `/tmp/jumpybrain-note-find-qa/session-recovery.png` (draft copied and disabled reload).
- `scripts/note-lifecycle-smoke.mjs`: PASS current-saved/draft conflict comparison and guarded reload.
- Full suite: 1,392 pass, 1 skipped, 0 fail; `/tmp/jumpybrain-ux-all-tests-final.log`.

## Remaining limits

Expiry was controlled by deleting the disposable browser context’s session cookie against the production shell/control fixture. Real Keychain expiry, OS sleeping tabs and crash-persistent recovery are outside this check; drafts remain tab-local.

Owning browser/design-system/desktop docs and pending release notes updated. The changelog records the new find capability; routine copy/label/search refinements do not receive separate highlights. No glossary term was needed. No personal installation, real notes, live email, push, release or version change.

## Goal

Explain an expired editor session in one plain sentence with a clear route to keeping the draft and reopening the editor.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=19c9a293-59f3-474d-b9a9-805b0c34eebb); triaged 2026-10-27.
- Remove implementation terms such as fenced and session cookie. Keep Recover draft available and preserve the existing protection against losing unsaved work.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{companion-browser,notes-browser}.ts`, `browser.docs.md`; existing companion-browser smoke.

## Tasks

- [x] Replace the expired-session paragraph and duplicate technical recovery copy with consistent, short language; explain any retry prerequisite only where that action needs it.
- [x] Retain draft recovery and safe reopen/retry controls without weakening session or save guards.
- [x] Reproduce controlled session expiry with a disposable unsaved draft; check the message, copy recovery and reopening without draft loss.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.

## Combined verification

See [the integrated feedback result](2026-10-27_tasks-feedback-integration.md) for merged-snapshot testing and the cross-feature fixes found after this group was integrated. The measurements above describe this group’s original tested snapshot.
