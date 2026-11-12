# Browse drawings before creating one

Status: planned. The user requested the task list only; no implementation is included.

## Goal

Make existing Excalidraw drawings easy to find in the Mac app without filling the
sidebar by default. Clicking the Drawings toolbar icon should reveal existing
drawings; creating a file should require a separate, explicit New drawing action.

## Proposed interaction

- Add a compact **Drawings** disclosure above Pages, collapsed by default. Its
  contents contain existing drawing names and one **New drawing** action.
- Rename the toolbar control's label/tooltip from **New drawing** to **Drawings**.
  Clicking it opens the section and brings it into view, including when the narrow
  layout has hidden the sidebar. Repeated clicks never create a file. The section
  header provides the collapse control.
- Expanding/collapsing the section leaves the current note or canvas open. Only
  choosing a drawing or New drawing navigates, through the existing save barrier.
- Reuse the existing short list and Show all / Show fewer affordance for larger
  collections. Keep text rows and the current ordering; no thumbnails, new modal,
  separate gallery, or extra settings are needed for this increment.
- With no drawings, show **No drawings yet** and the explicit create action.
  Loading and failed listing states must be distinguishable from an empty brain;
  a failed request offers Retry.
- Keep disclosure state in the current UI session, scoped to the selected brain;
  start collapsed in a fresh session. Opening a drawing through a direct link,
  search or note mention reveals its active sidebar entry. These are navigation
  preferences, never writes to the brain.
- Browsing remains available on read-only connections; creation is unavailable
  with a clear reason. Use the shared shell so hosted and Mac behavior agree.

## Current evidence and boundaries

- `drawings-view.ts` exports a toolbar button with `id="new-drawing"`, label
  **New drawing**, and a click listener calling `create()`. This supports the
  reported accidental-creation behavior; the installed Mac app was not reproduced
  during planning.
- The same module already owns a drawing listing, five-row preview, Show all,
  filename search and isolated lazy canvas. Its listing container is hidden in
  initial markup and later shown when connected; it has no user disclosure.
  Trace the actual app startup before attributing the user's hidden list to a
  specific connection/rendering issue.
- Reuse current list/create APIs, brain scoping, permissions, drawing URLs,
  hash-checked saves, rename/delete and search/mention behavior. No storage, API,
  native IPC, retrieval or Excalidraw editor redesign is proposed.

## Tasks

- [ ] 1.0 Reproduce and confirm the shared navigation behavior.
  - [ ] 1.1 Read the architecture map, browser owning docs and design system;
    trace toolbar/list initialization in the companion and hosted shells.
  - [ ] 1.2 Reproduce startup with zero, several and more than five drawings in
    disposable brains. Retain a regression proving a toolbar click currently
    creates a file and the new browse interaction performs no create request.
- [ ] 2.0 Implement the minimal disclosure and separate creation action.
  - [ ] 2.1 Give the toolbar its Drawings identity and add an accessible section
    header with `aria-expanded`, `aria-controls`, keyboard activation and visible
    focus. Opening from the toolbar reveals the section without stealing editor
    content or creating a canvas iframe.
  - [ ] 2.2 Place New drawing inside the expanded section; reuse existing names,
    active state, bounded listing and Show all / Show fewer. Ensure direct-link,
    search and mention navigation reveals the active row beyond the preview.
  - [ ] 2.3 Handle loading, empty, failure/Retry, disconnected and read-only
    states. Prevent duplicate creation from repeated create clicks and retain
    existing save/conflict guards before navigating.
  - [ ] 2.4 Fence late listing responses and disclosure state across brain and
    credential changes; refresh after create, rename and delete without reopening
    a deliberately collapsed section during unrelated background refreshes.
- [ ] 3.0 Verify the changed interaction and finalize the implementation.
  - [ ] 3.1 Build once, then run `node --test test/drawings.test.js` with relevant
    shell assertions updated. Adjust existing smoke selectors, including the
    native smoke's creation path, to use the explicit New drawing action.
  - [ ] 3.2 Extend and run `npx --package=playwright node scripts/drawings-smoke.mjs`
    against disposable hosted and real companion-gateway brains. Cover collapsed
    startup, repeated toolbar clicks with unchanged drawing files/count, opening
    existing files, explicit creation, zero/many drawings, listing failure/Retry,
    brain switching, read-only browsing and a blocked unsaved navigation.
  - [ ] 3.3 Check keyboard/focus and sidebar reveal at 1280/390px in both themes.
    Verify browsing loads no drawing editor bundle until a drawing opens. Use a
    native smoke only if reproduction reveals a native boundary issue; record
    untested native/assistive-technology limits accurately.
  - [ ] 3.4 Update browser owning docs and pending user-facing release notes;
    record tested snapshot, results and limits. Archive and commit the completed
    implementation under [the task workflow](../../docs/task-workflow.md), adding
    a changelog highlight only if the implemented result qualifies. No release,
    installation or push is implied.

## Acceptance

The default sidebar stays compact. A user can reveal and open existing drawings
with the Drawings control without creating or modifying a file. New drawing is
explicit and available from the same section. Browsing preserves the current
editor, read-only access and brain isolation; actual navigation preserves pending
work through the existing save barrier.

## Relevant files

- [Architecture map](../../src/architecture.docs.md), [browser contract](../../src/adapters/http-server/browser.docs.md#drawings),
  [design system](../../docs/design-system.md) and [testing guide](../../docs/testing.md).
- `src/adapters/http-server/drawings-view.ts` — drawing controls, listing,
  creation, save barriers and frame lifecycle.
- `src/adapters/http-server/{notes-browser,graph-page,companion-browser,browser-sidebar}.ts`
  — shared shell composition, navigation and responsive sidebar behavior.
- `src/adapters/http-server/boards-sidebar.ts` — existing disclosure/focus styling
  reference; reuse presentation conventions without coupling drawing state to boards.
- `test/drawings.test.js`, `scripts/drawings-smoke.mjs`,
  `scripts/drawings-electron-smoke.mjs` and `integrations/electron/smoke-drawings.mjs`
  — existing contracts, browser fixtures and native creation selectors.

## Planning verification

- 2026-11-12: inspected current drawing controls, listing and event handlers,
  shared-shell composition, existing drawing test/smoke coverage, glossary and
  repository workflow/testing guidance. Bounded local memory recall returned no
  relevant prior drawing-navigation decision.
- Planning only: product behavior is unchanged. Check local Markdown links and
  `git diff --check`; product builds/browser checks belong to implementation.
