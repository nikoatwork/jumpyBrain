# Optional board trees in the sidebar

Status: completed 2026-10-31. Optional board trees, scoped personal preferences and heading-free page navigation implemented and visually verified in the production Mac shell.

## Goal

Let people optionally use an existing board as a project navigation tree: the board is the top level, its columns act like subfolders, and their pages act like files. Users can jump directly between project pages without returning to the Kanban view. Reuse boards and ordinary Markdown pages without introducing a project entity, real folders or a second organization model.

## Requested experience

- Opt in per board through board settings. Boards remain usable as ordinary Kanban boards when this option is off.
- An opted-in sidebar board has a familiar disclosure control to expand/collapse its columns. Columns have their own disclosure controls for their attached pages, with clear indentation at each level.
- Board navigation still opens the Kanban view; disclosure controls expand/collapse without navigating. Page entries open the existing page editor directly.
- Preserve column order and page order from the board. This is another view of the same membership, not a copied collection.
- Expanded boards push the general page list down within the scrolling library. Remove the visible Attention heading above that list; if the ongoing sidebar work has renamed it Pages, remove that equivalent heading too. Retain an accessible name for the region.
- Keep Settled and the connection/app footer reachable, including in small windows. People who do not enable this feature should see no additional tree controls or setup burden.

## Boundaries and dependencies

- [Sidebar hierarchy and settling work](2026-10-31_tasks-sidebar-hierarchy-and-settle.md) is complete and is the implementation baseline; do not redo or revert its behavior.
- Current boards have exactly three named columns and reference canonical page IDs. Pages may appear on multiple boards, but only once within each board. Use these existing rules.
- Markdown remains canonical for page content; `boards/<UUID>.json` remains canonical for board organization. Expanding a tree must not move files, modify note metadata or change board membership.
- Keep the setting's storage and scope an explicit design decision: shared board configuration versus personal navigation preference. Do not assume a new schema field is required.
- Do not add sidebar drag-and-drop, tree editing, arbitrary nesting, project metadata, a separate collection type or new project-management workflows in this ticket.
- Use disposable local/remote fixtures for verification; personal and shared brain contents are outside the test scope.

## Tasks

- [x] 1.0 Establish the smallest suitable UX and state model before implementation.
  - [x] 1.1 Inspect current board settings, sidebar rendering, navigation/save guards, title loading and preference scoping; read architecture and co-located docs before changing modules.
  - [x] 1.2 Compare a single per-board opt-in plus ordinary disclosure controls with separate visibility/expandability options. Prefer one setting unless an observed use case requires more; record the chosen label, default and rationale. Suggested starting label: `Show pages in sidebar`, off by default.
  - [x] 1.3 Decide whether opt-in is personal or shared and where it persists. Define read-only behavior, brain/profile isolation, backward compatibility, and behavior when preference storage is unavailable. Keep shared writes subject to existing permissions.
  - [x] 1.4 Define initial board/column expansion and persistence across navigation, refresh and app relaunch. Separate the opt-in preference from current open/closed state; avoid redundant settings for each state.
  - [x] 1.5 Define board-title versus chevron activation, keyboard disclosure/navigation, focus retention, selected-page indication and whether opening a page elsewhere reveals its tree path. Resolve repeated page appearances across boards and the general list without changing membership.
  - [x] 1.6 Define empty columns, missing/unavailable pages, settled/snoozed member pages, settled/restored/deleted boards and narrow-layout behavior. Board membership must not silently disappear because a page leaves the attention list.
  - [x] 1.7 Record the chosen interaction and persistence contract here before implementation, including any limits; keep alternatives proportionate to this navigation feature.

- [x] 2.0 Implement the optional board → column → page view.
  - [x] 2.1 Add the chosen per-board setting to existing board settings with the agreed default, persistence and permission behavior.
  - [x] 2.2 Render keyed, indented board and column disclosure rows and page links from existing board membership/order. Keep board-title navigation to Kanban available independently of disclosure actions.
  - [x] 2.3 Reuse guarded page navigation, save barriers and existing title resolution. Retain focus and expansion through routine refreshes; fence delayed results when switching brains.
  - [x] 2.4 Reflect renames, membership moves/additions/removals, and board settlement/restoration/deletion without stale entries or duplicate membership writes. Bound title reads and rendering for large boards.
  - [x] 2.5 Remove the general page-list heading, integrate the expanded tree above that list, and preserve library scrolling, sidebar collapse and footer access.
  - [x] 2.6 Provide accessible control names, expanded/selected states, usable keyboard and touch targets, restrained hover/focus styling and Reduced Motion behavior using existing design patterns.

- [x] 3.0 Test behavior and visually verify the actual experience.
  - [x] 3.1 Add focused regressions for opt-in/off defaults, independent board/column expansion, persistence/scoping, direct page versus board navigation, membership order and refresh/failure handling.
  - [x] 3.2 Verify tree expansion and page navigation leave canonical Markdown and board membership unchanged. Exercise a read-only connection and real brain switches against disposable fixtures.
  - [x] 3.3 Exercise the production Mac app: enable a board tree in settings, expand columns, jump between pages, open Kanban, move a card there, return to the updated tree, collapse it, disable the option and relaunch. Verify existing unsaved-edit protections still apply.
  - [x] 3.4 Capture and inspect collapsed/expanded states in light/dark appearance, at minimum/default/wide sidebar widths and short window heights. Include long board/column/page names, empty columns, several opted-in boards, many pages and the selected page. Check indentation, clipping, disclosure alignment, readable titles, scrolling and footer reachability.
  - [x] 3.5 Visually and interactively check keyboard focus, pointer/touch targets, Reduced Motion, missing-page feedback and the heading-free general list. Confirm users with the option off retain a simple sidebar.
  - [x] 3.6 Run affected board/settings/sidebar and production Electron smoke checks plus repository validation. Record the tested snapshot, commands/results, visual evidence locations and untested limits; fix observed defects before marking verification complete.

- [x] 4.0 Document and finalize the implemented feature.
  - [x] 4.1 Update owning board/sidebar/design docs for the actual setting, persistence and interaction contract; update glossary only if a reusable term changes. Add a concise pending release note when implemented.
  - [x] 4.2 Record outcome and remaining limits, archive this task and repair references, update the changelog for the completed result, and commit only scoped changes following the [task workflow](../../docs/task-workflow.md). Preserve unrelated work; no release or installation is implied.

## Acceptance criteria

- A user can opt one board into folder-like sidebar navigation, independently expand its columns, and open any member page directly while retaining Kanban access.
- Existing boards default to the ordinary compact sidebar presentation; turning the option off removes the nested view without altering organization or content.
- The tree follows canonical board order and membership, survives refresh according to the documented preference contract, and never leaks state or delayed results between brains.
- The general page list appears below expanded boards without an Attention/Pages heading; scrolling and app controls remain usable.
- Visual inspection in the actual app and focused behavioral checks demonstrate that navigation, focus, persistence and small-window layouts work. Test evidence and remaining limits are recorded before completion.

## Investigation starting points

- [Product vision](../../docs/product-vision.md), [architecture guidance](../../src/architecture.docs.md), [board contract](../../docs/boards.md), and [browser/sidebar contract](../../src/adapters/http-server/browser.docs.md).
- `src/adapters/http-server/boards-view.ts`, `board-settings.ts`, `browser-sidebar.ts`, `browser-page-navigation.ts` and `notes-browser.ts` — existing views, settings and navigation seams; confirm ownership before editing.
- `scripts/boards-smoke.mjs`, `scripts/board-settings-smoke.mjs`, `scripts/sidebar-layout-smoke.mjs`, `scripts/sidebar-smoke.mjs` and `scripts/electron-smoke.mjs` — existing interaction and visual regression entry points.

## Outcome and verification

Optional per-board navigation is implemented, along with heading removal, personal scoped preferences and keyboard/focus behavior. Required behavioral and visual checks are complete; verification and limits are recorded below.

## Implementation decisions — 2026-10-31

- One checkbox in Settings → Boards: **Show pages in sidebar**, off by default. This is a device-local preference keyed by profile ID, kind and destination, like pins; it never changes the board schema or requires remote write access. Storage failure keeps preferences for the tab lifetime.
- First enable opens the board and its three columns. Board and column disclosures retain their state across navigation/reload/relaunch on the same origin/profile; disabling keeps the last expansion state for re-enabling. No separate visibility setting.
- Use nested lists and named disclosure buttons, with Tab/Enter/Space and arrow navigation. Board-title clicks open Kanban; page clicks use the existing guarded editor navigation. No automatic expansion when a page is opened elsewhere. Selected occurrences are marked independently, including membership on multiple boards.
- Show canonical membership even for snoozed/settled pages. Empty columns say Empty column; missing/unavailable references remain navigable with explicit fallback labels. Settled boards disappear from active navigation and retain preferences on restore.
- Preserve keyed nodes/focus through refreshes; fetch titles only for the selected Kanban or visible expanded columns, at bounded concurrency. Narrow screens retain a vertical board tree above the existing horizontal general page list.
- The prior sidebar hierarchy task is now archived. Its footer, settle/unpin behavior and save guards remain the baseline. The unrelated remote-compatibility edits were preserved and independently committed as `84e9c7f` before this task was finalized.

## Verification record — 2026-10-31

- Base commit: `84e9c7f`. The unrelated sidebar and remote-connection work was committed independently before final review; this diff contains only the board-navigation feature and its checks/docs.
- Built successfully; editor bundle remains within the unchanged 190,000-byte gzip gate (189,959 bytes). No dependencies or canonical schema changes.
- New `board-sidebar-smoke.mjs` passes against a real disposable gateway: default-off and independent per-board opt-in, board/column reload persistence, keyboard/direct editor navigation, selected occurrences on multiple boards, stable focused DOM after refresh, missing references/empty columns, external membership move and column rename, canonical note/board byte preservation, opt-out and storage-denial fallback. It checks geometry at 224/280/480px sidebar widths, 900×480 short windows and 390/320px layouts in both themes, including Reduced Motion.
- Extended production `boards-desktop-smoke.mjs` passes actual sandboxed Mac Settings/tree/editor flows, CLI/UI membership agreement, read-only remote navigation/preferences, scope isolation, and preference/collapse persistence across a complete second Electron process. Fixture-tab unregister is awaited during teardown so the next process does not inherit a stale save-barrier participant.
- Existing board settings, Kanban, sidebar-layout and sidebar interaction smokes pass. General production Electron smoke passes onboarding, canonical saves, focus/keyboard, settling, navigation and close guards. Focused board/sidebar/bundle tests: 15 passed.
- Visually inspected native minimum-width light and short-window dark captures, the multi-board/long-title/missing-reference layout, 320px dark tree, and desktop/narrow settings. The first inspection/geometry check caught insufficient file indentation; page rows now sit distinctly below/inside column rows. Footer and Settled remain reachable while expanded content scrolls.
- Visual evidence: `/tmp/jumpybrain-board-sidebar-qa/`, `/tmp/jumpybrain-board-settings-qa/`, and `.local-pack/boards-native/tree-*.png`; native results include `result.json` and `result-relaunch.json`. Artifacts are disposable/ignored, not personal data or committed screenshots.
- Complete suite (`node --test --test-concurrency=4`, following the build): **1,523 passed, 0 failed, 1 skipped** of 1,524. The opt-in real QMD 2.8.3 WAL/physical-readonly test was skipped because `JUMPYBRAIN_TEST_QMD_BIN` was not provisioned. Log: `/tmp/jb-board-tree-full.log`.
- Final review subsequently added two narrow guards: prevent storage-event title reads before a newly selected brain's packet is bound, and return focus to the board name if another tab disables its focused disclosure. Final source build fingerprint: `bf4ba61f2e38ea46`; 45 affected board/sidebar/bundle/companion tests passed after rebuilding. Final tree checks (including cross-tab focus and lazy loading) and the production native/relaunch smoke pass on this fingerprint; the full suite above preceded these two guards.
- Older-server compatibility smoke passed 404/405 guidance, recovery, failure separation and read-only scope resets. New cross-tab and collapsed-tree checks verify storage synchronization, external opt-out focus, no hidden descendants and no title reads for collapsed columns.
- Limits: automated input in the real production Mac window, not physical VoiceOver/touch-device testing; local and loopback remote fixtures, not a live VPS. Maximum-size 100-board stress testing is not claimed. Preferences are device/browser-local, with in-tab fallback when storage fails. No install, push or release performed.

- Final checks: `/tmp/jb-board-tree-build-final.log`, `/tmp/jb-board-tree-tests-final.log`, `/tmp/jb-board-tree-smoke-final.log` and `/tmp/jb-board-tree-native-final.log`. The cross-tab regression also caught focus being cleared synchronously when hiding a disclosure; capturing the focused element before changing visibility fixed it. `git diff --check` passes.
