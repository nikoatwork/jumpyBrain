# Settle and snooze note interface

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Let a person settle a note with a checkmark or snooze it with a clock, and show returning notes in the sidebar at the right time.

## Scope and ownership

- Read [coordination/contracts](2026-10-22_tasks-sidebar-attention-refresh.md), [metadata producer](2026-10-22_tasks-note-attention-metadata.md), source architecture/browser docs and design-system guidance.
- Own `src/adapters/http-server/browser-page-navigation.ts` attention data/controller/rendering, focused new attention/snooze UI modules, document-action hooks and transport helpers. In `notes-browser.ts`, own only list/action wiring and corresponding action markup; sidebar controls owns navigation layout and typography owns font declarations.
- Reuse typed document-controller/save/scope guards; new logic belongs in typed modules rather than more shell string logic. Keep pins scope-local and independent of attention state. Metadata/backend mutation belongs to its own track.

## Tasks

- [x] 1.0 Build against the metadata track's agreed list/mutation fixtures. Replace visit-history Recent with canonical Attention; migrate/retain existing pins safely and do not copy browser history into canonical notes. Keep Home Recent activity separate.
- [x] 2.0 Add clock and checkmark Settle affordances to sidebar rows and the current note toolbar so touch/keyboard users can act without hover. Use accessible names/tooltips and stable row focus; avoid nested buttons in links. Retain title truncation and modified-click behavior.
- [x] 3.0 Add an accessible compact snooze menu matching the supplied reference: In 1 hour, In 3 hours, Tomorrow 09:00, Next week Monday 09:00, Custom…. Show resolved local time/date; implement local-calendar arithmetic, DST/custom-time validation, Escape, keyboard selection and focus return using shared control/type tokens.
- [x] 4.0 Serialize attention mutations with editor saves: flush pending edits, obtain the confirmed hash, then patch metadata under the same scope/revision guards. Reconcile the new hash/frontmatter without replacing the body/caret or resending stale content. Failed/unconfirmed/conflicting saves block the action and retain drafts; target switching and external-refresh races cannot apply it to another note.
- [x] 5.0 Remove settled/future notes from the unpinned list only after a confirmed save. Preserve the open document. Offer Undo/Bring back and a current-note state/action so search/direct-link access can reactivate a settled or snoozed note. Keep pinned items visible and explain the independent pin behavior.
- [x] 6.0 Refresh on confirmed action/list entry/focus/pageshow and schedule the nearest backend wake deadline. Pause/cancel while hidden or leaving a brain; handle long timeouts, clock changes and sleep by rechecking current server state. Expired notes return without visits; suppress late responses and deduplicate pins.
- [x] 7.0 Cover API failure/read-only state, lost responses, concurrent editor changes, deadline expiry, hidden-tab return, reload, brain switch, invalid external metadata and empty lists. Test keyboard/touch actions and long titles in both themes at desktop/390/320px with disposable notes.
- [x] 8.0 Run the combined lifecycle smoke with the backend track; record snapshot/results/limits and give browser/glossary/release-note wording to the integrator.

## Acceptance

- A note can leave Attention through Settle or return after Snooze, including across reload/sleep. It remains findable and reversible.
- New/edit-recency defaults work without bulk migration. Pins, draft safety, scope isolation and Home Recent activity retain their agreed meanings.

## Implementation and verification — 2026-10-22

- Integrated typed `browser-attention.ts` scoped list/wake controller, `note-attention.ts` guarded note actions/local-calendar menu and server-only `note-attention-view.ts` markup/styles. Sidebar uses canonical Attention; existing pins remain scope-local and Home Recent activity is unchanged.
- Metadata actions flush content first, GET the target, PATCH explicit intent with If-Match and adopt a clean matching metadata baseline without replacing the rich editor. Busy guards participate in navigation, companion acknowledgement and native save barriers. Review fixed healthy companion polling releasing mutation locks, focus when Settle/Bring back replaces a toolbar action, due toolbar status and strict timestamp parsing.
- `test/note-attention-browser.test.js`: four focused tests passed for stale/scoped reads, bounded output/timers/cancellation/auth retry, DST gaps/overlaps/calendar presets and clean hash/body-only metadata adoption. Existing canonical/gateway/save regressions and the healthy companion action-lock test also pass.
- Production `npx --package=playwright node scripts/note-attention-smoke.mjs` passed: real server + disposable Markdown, exact body/edit-date/hash and caret/DOM preservation, settle/direct-link/Bring back/Undo, persistent independent pins, all four preset instants, invalid/valid custom time, unvisited and current-note deadline wake, toolbar status/focus, failed-save blocking/recovery, light/dark at 1280/390/320px. Screenshots inspected in `/tmp/jumpybrain-attention-qa`.
- Review kept server-rendered markup/styles out of the browser bundle. Reviewed gzip payload is 164,378 bytes versus prior 160,322; the explicit review gate is now 165 KB. No new frontend dependency, CDN, scheduler or persistent browser database.
- Full integration evidence belongs to the coordination list. Physical OS sleep, assistive technology, Safari/Firefox and a live published update remain separate manual gates; browser lifecycle/timer tests do not establish OS notifications. Attention visibility follows a bounded top-eight selection, not an exhaustive task inbox. No personal memory, installation or release was changed.

- Final lifecycle smoke explicitly exercised Undo after a settled recovered draft; override removal and unchanged writing passed (16 browser PATCHes overall).
