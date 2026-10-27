# Short note deletion confirmation

## Completed — 2026-10-27

**Implemented: compact guarded deletion.**

Relevance: the current dialog still showed backup/Git paragraphs, inbound-link/relationship counts and a duplicate confirmation instruction. It now shows the selected note title, “Deleting this note cannot be undone.”, Cancel and Permanently delete note. Transient preparation/failure status remains actionable. The existing flush, preview identity/hash, If-Match, one-attempt, read-only, session/scope and navigation guards are retained.

## Tested snapshot

Base `56c8fe075508a6392417de275856a5190af29b55` plus this commit’s scoped working tree; built on 2026-10-27 with Node v26.7.0. Editor bundle: 540,252 bytes / 178,797 bytes gzip, SHA-256 `e95e3e65e9dcbab2d9e592881c9c8ff84ba2328c9bf7d447209332d758bd2873` (reviewed 180 KB gate, no new dependency).

## Verification

- `npx --yes --package=playwright node scripts/note-lifecycle-smoke.mjs`: PASS (capture/search, two-tab conflict recovery, Cancel/successful DELETE, unchanged surviving backlinks and index refresh). Log: `/tmp/jumpybrain-ux-lifecycle-smoke.log`.
- `scripts/note-find-smoke.mjs`: PASS dialog text/cancel/byte preservation at 1280/390/320px, light/dark. Captures `/tmp/jumpybrain-note-find-qa/delete-{width}-{theme}.png`.
- `node scripts/electron-smoke.mjs`: PASS actual sandboxed Mac dialog/cancel at 1200/480px in both themes. Inspected `.local-pack/desktop/delete-480-dark.png` and browser captures. Log `/tmp/jumpybrain-ux-electron-smoke.log`.
- Full suite: 1,392 pass, 1 skipped, 0 fail; `/tmp/jumpybrain-ux-all-tests-final.log`.

## Remaining limits

Deletion remains permanent; no Trash/Undo was added. Actual deletion used disposable browser fixtures; native Mac dialog inspection/cancellation used the disposable Electron app. Physical assistive technology/other browsers remain unverified.

Owning browser/design-system/desktop docs and pending release notes updated. The changelog records the new find capability; routine copy/label/search refinements do not receive separate highlights. No glossary term was needed. No personal installation, real notes, live email, push, release or version change.

## Goal

Make deleting a note a clear, compact confirmation with one plain warning sentence.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=965ae728-c5fc-4e26-bd47-f7995d80e3fd); triaged 2026-10-27.
- Keep the note title, Cancel and an explicit delete action. Preserve permanent-delete semantics and all existing authorization, conflict and draft guards.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/notes-browser.ts`, `browser.docs.md`; existing note-lifecycle smoke.

## Tasks

- [x] Replace the explanatory paragraphs and dependency counts in the confirmation with one sentence that clearly says deletion cannot be undone.
- [x] Keep confirmation tied to the selected note and preserve cancellation, focus handling and guarded deletion.
- [x] Inspect the dialog in the Mac app at desktop/narrow widths; exercise Cancel and successful deletion using a disposable note, plus existing lifecycle checks.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
