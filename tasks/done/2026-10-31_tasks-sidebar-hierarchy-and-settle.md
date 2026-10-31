# Mac sidebar hierarchy and visible settling

Completed 2026-10-31: unified Pages, visible settle/unpin, concise action tooltips and a separate brain/footer area.

## Goal

Make the Mac sidebar feel like one clear list of pages, with boards above it and app controls below it. Settling should visibly clear a page out of the active list, including when that page is pinned.

## Scope and decisions

- Requested 2026-10-30, based on the user's two sidebar screenshots. Implementation authorized in the follow-up request. Paused on 2026-10-30, resumed and verified on 2026-10-31.
- Settling a pinned page must also unpin it. This supersedes the previous behavior and message, `Settled. Pinned pages stay visible.`
- Pinned and Attention become one section of pages. Pinning is a subtle state within that section, not a separate category of content.
- Boards belong above the pages section. Board creation belongs in the top toolbar, alongside the small New note control.
- Settled belongs with the pages, above Local brain. Local brain belongs in the bottom app-control area with the action icons.
- Implementation decisions: one Pages section, pins first; a 240ms scoped exit/collapse after confirmed saves, instant with Reduced Motion; Undo restores the old pin, Bring back reveals without re-pinning. The requested hierarchy and settle/unpin behavior are already decided.

## Tasks

- [x] 1.0 Make settling consistently clear the active list.
  - [x] 1.1 Settling any active page removes it from the active pages list; pinned pages are unpinned as part of that action.
  - [x] 1.2 Keep the settled page accessible through Settled and existing ways of finding/opening it; settling does not delete its content.
  - [x] 1.3 Replace feedback that says pinned pages stay visible with concise feedback matching the new outcome.
  - [x] 1.4 Ensure the settled/unpinned result survives refresh and reopening the app. Failed settling must not leave the page falsely shown as successfully cleared.
  - [x] 1.5 Investigate existing Undo and Bring back behavior and define their pin-state outcomes before implementation; preserve a clear recovery path.

- [x] 2.0 Make removal perceptible and calm.
  - [x] 2.1 Give every settled active row a brief, subtle exit transition, such as a swoosh out, so the user can see which page left. This applies to ordinary pages as well as pinned pages.
  - [x] 2.2 Let the remaining rows close the gap visibly, making the list feel shorter instead of relying on a status message alone.
  - [x] 2.3 Keep the result understandable with Reduced Motion, rapid consecutive settles, a scrolled list and the last remaining page. Keep keyboard focus usable after a row disappears.
  - [x] 2.4 Investigate interaction with Show more/refilling the visible list so a replacement row does not conceal the sense of having cleared something.

- [x] 3.0 Make hover actions explain the action and pin state.
  - [x] 3.1 Use short action tooltips: `Pin` for an unpinned page and `Unpin` for a pinned page. Do not append the note title to the action tooltip.
  - [x] 3.2 Make the pinned state recognizable at a glance through a filled pin or similarly clear, subtle treatment, including when the row is not hovered.
  - [x] 3.3 Review the other sidebar hover actions for concise action labels, legible tooltips and clear keyboard/accessibility feedback. Keep title overflow help separate from action help.

- [x] 4.0 Restore a clear sidebar hierarchy.
  - [x] 4.1 Merge Pinned and Attention into one pages section with no duplicate entries or separate pinned heading. Indicate pinned pages subtly within it.
  - [x] 4.2 Place boards above the unified pages section so they are immediately discoverable.
  - [x] 4.3 Replace the large inline `+ New board` entry with a compact top-toolbar creation button comparable to New note, with an understandable label/tooltip.
  - [x] 4.4 Place the Settled disclosure with the pages, below the active list and above Local brain; preserve access to its count and contents.
  - [x] 4.5 Group Local brain visually with the bottom action-icon bar so connection/app controls read as a distinct footer.
  - [x] 4.6 Keep this hierarchy usable in short/narrow windows, with long titles, many boards/pages and empty sections. Investigate scrolling and spacing as part of achieving that outcome.

- [x] 5.0 Verify the experience and reconcile the documented behavior.
  - [x] 5.1 Exercise pinned and unpinned settle flows in the Mac app, including visible removal, persistence, recovery and failure feedback; record the tested snapshot and any limits.
  - [x] 5.2 Check the full sidebar hierarchy, pin indication and tooltips in light/dark appearance, keyboard use and Reduced Motion. Add focused regression coverage for the changed behavior after investigation establishes the implementation.
  - [x] 5.3 Update the owning sidebar/attention docs and the glossary's Note attention entry to reflect the delivered settle/unpin contract. Add concise pending release notes when implemented.
  - [x] 5.4 Once implementation and required checks are complete, record results and remaining limits, archive this list, update the changelog for the completed result and commit the scoped work under the [task workflow](../../docs/task-workflow.md).

## Outcome and implementation

- The sidebar now places boards above one Pages list, with existing pins first and no duplicate rows. A small filled marker identifies pinned pages even at rest; Pin/Unpin and other action tooltips are short. New board is a compact toolbar control beside New note.
- Settled belongs to the pages above a separate footer containing Local brain and the action-icon bar. The layout retains full-width desktop rows, the existing sidebar width control, narrow horizontal lists and accessible disclosure behavior.
- Canonical attention saves remain the gate. Only a confirmed Settle removes the local pin and projects the page into Settled; failed saves leave both intact. The projection cancels stale reads. A scoped 240ms sideways fade and gap collapse makes removal visible; Reduced Motion clears immediately.
- Settling reduces the visible allowance so a polling refresh does not instantly refill the gap. Show more explicitly expands the list. Undo restores the prior attention and pin state, including the onboarding starter; Bring back reveals the page without re-pinning it.
- Focus follows the next row or Settled after the final row, while preserving a new focus target selected during saving/animation. Shared row hydration avoids duplicate initialization and keeps the editor bundle within its existing budget.
- Full validation exposed an unrelated title-resolution fixture cleanup race. Its real server now closes before the temporary root is removed, preventing background logging/maintenance from recreating deleted directories.

## Verification

Tested snapshot: `f214067` plus this task's scoped implementation and test changes. Concurrent remote-connection work is excluded from this task commit, including separate changes to the shared boards/companion source files.

- `npm run build` passed: editor 573,812 bytes minified / **189,959 bytes gzip**, below the unchanged 190,000-byte gate; optional extension UI 5,669 bytes gzip.
- Focused bundle, attention, page navigation, sidebar and title-resolution tests: **39 passed**.
- Full `node --test --test-concurrency=4`, using that completed build: **1,515 tests, 1,514 passed, zero failed, one skipped**. Log: `/tmp/jumpybrain-sidebar-final-tests.log`. Together with the build, this runs the repository validation steps with bounded test concurrency.
- `scripts/sidebar-settle-smoke.mjs` passed against a real disposable companion gateway: action tooltips; filled/resting pins; rejected-save preservation; measured vertical and horizontal animation/gap geometry; next/last-row focus; no focus stealing; Undo; pagination without immediate refill; Bring back; Reduced Motion; repeated/final-row settlement and reload.
- `scripts/sidebar-layout-smoke.mjs` passed actual 224/280/480px desktop widths, short windows and 390/320px layouts, light/dark palettes, toolbar/Search insets, footer alignment, scroll isolation, hover/focus, touch and Settings.
- `scripts/sidebar-smoke.mjs`, `scripts/collaborative-sidebar-smoke.mjs` and `scripts/note-attention-smoke.mjs` passed persistence/cross-tab pins, age/order, shared edits, caret/focus stability, canonical body preservation, failed-save recovery, snooze/wake, Undo and narrow/theme checks. Browser scripts used `npx --package=playwright node`.
- `node scripts/electron-smoke.mjs` passed in the production sandboxed Mac window: ordinary pinned/unpinned and starter settlement, Undo restores pins, reload/relaunch, Bring back, compact board creation, editing/save guards and native navigation.
- Inspected final Ocean light/dark sidebar captures under `/tmp/jumpybrain-sidebar-layout-qa/`, including the actual 224px minimum at a short height. Native captures are under `.local-pack/desktop/`.
- `git diff --check` passed. Earlier full runs exposed the size/cleanup issues above; those failed runs are superseded by the final passing build and suite, not treated as successful verification.

## Limits

- No personal notes, installed app, release, push or remote memory changes. Tests use disposable roots and profiles.
- Physical assistive technology, Safari and non-Mac desktop platforms were not tested. Pins remain device-local; blocked storage retains only in-tab preferences. Canonical attention and content continue to use Markdown.
- The pending user-facing release notes remain in `tasks/todo/release-next.md` until a release is requested.

## Relevant files

- [Browser contract](../../src/adapters/http-server/browser.docs.md), [design system](../../docs/design-system.md) and [glossary](../../glossary.md).
- `src/adapters/http-server/browser-page-navigation.ts`, `browser-attention.ts`, `note-attention.ts`, `notes-browser.ts`, `companion-browser.ts` and `boards-view.ts`.
- `scripts/sidebar-settle-smoke.mjs`, existing sidebar/attention smokes, `integrations/electron/smoke-app.mjs`, and the focused attention/title-resolution tests.
- [Task completion workflow](../../docs/task-workflow.md).
