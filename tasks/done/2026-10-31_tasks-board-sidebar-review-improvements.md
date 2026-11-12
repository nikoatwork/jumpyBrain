# Board sidebar: three review-driven UX improvements

Status: completed 2026-10-31. Implemented three review-driven improvements: content-first narrow navigation, distinct non-page status rows, and predictable board/column action labels.

## Goal and selection

Help people move through a project hierarchy without losing their place or hiding the page they chose. Preserve the existing board → column → page model and the user's preference for a calm sidebar with hidden scrollbar chrome.

Both reviewers directly inspected populated screenshots and recommended keeping the hierarchy. Selected priorities: Sol’s narrow-screen content visibility and action ambiguity, plus Mistral’s shared state distinction for missing references and empty placeholders. These address reading the chosen page, knowing what is a real page, and predicting a click.

- Sol review: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A9149bdee-8b5b-498d-89df-868353dc0289%3Adelegate-task%3A2396c6d0-69df-4f89-975c-773f2729aec4>
- Mistral review: <t3-thread://v2/e2ddce68-4862-4cde-bb7d-20fe060e49b8/thread:delegated-task:command%3Amcp%3A9149bdee-8b5b-498d-89df-868353dc0289%3Adelegate-task%3A7979246f-5e49-4db9-916e-287221f1d61d>

## Tasks

- [x] 1. Let the selected content take priority on narrow screens.
  - [x] Reuse the existing sidebar toggle to close navigation after a successful sidebar page/board navigation at ≤680px. Keep the save guard: a rejected navigation must leave the sidebar and draft available.
  - [x] Make automatic collapse transient and narrow-only, preserving the user's desktop preference, open branches and scroll position. Reopening stays one action and keyboard focus remains reachable.
- [x] 2. Distinguish page status from actual content.
  - [x] Use shared restrained italic/muted styling for empty columns and loading/missing/unavailable references. Keep status text explicit and preserve opening/retry for references.
  - [x] Track load status independently of page titles, so a real page named “Page missing” or “Empty column” remains an ordinary page. Clear status on successful refresh and brain switches.
- [x] 3. Make the board-versus-column click distinction predictable.
  - [x] Give board links explicit Open board action tooltips/accessibility names, preserving full titles. Give column-name controls Expand/Collapse action names matching their chevrons and state.
  - [x] Preserve the visual hierarchy, Kanban access, page links, state and keyboard behavior. Avoid new project entities, permanent extra controls and icons without evidence.
- [x] 4. Verify and finalize.
  - [x] Assess both reviews, record agreements/disagreements and deferred findings.
  - [x] Add focused behavioral checks for transient narrow collapse, rejected-save navigation, reference status/recovery, scroll boundaries and action semantics; run affected sidebar/board and native Mac checks.
  - [x] Inspect populated light/dark, narrow and short-window captures after the changes. Record tested snapshot and limits.
  - [x] Update owning docs and pending release notes, archive the completed task, update the changelog and commit scoped changes under docs/task-workflow.md.

## Deferred scope

Sol’s scroll-continuation suggestion is a screenshot hypothesis; existing overflow and fixed-footer behavior work, and last-row reachability will be checked. No new scroll decoration is needed for the selected three changes. Separator/helper-copy proposals remain deferred. Mistral’s duplicate-selection concern is already covered by matching selection on all occurrences, and its settings concern is resolved by the intentionally per-board setting. Full-title tooltips already exist. No duplicate suppression, filesystem folders, drag-and-drop, new settings, installation or release is included.

## Verification

Required build, behavioral and visual checks are complete; results and limits are recorded below. Base: `553b8ac`, clean worktree at start. Prior implementation: [optional board trees](2026-10-31_tasks-board-sidebar-tree.md).


## Verification evidence — 2026-10-31

- Tested source fingerprint: `bf3bcdb5bb1ee2bf` (`0.3.13`), base `553b8ac`. Normal build passes; unchanged editor gzip gate passes at 189,959 bytes (190,000 limit).
- Focused sidebar preference, navigation, bundle and companion checks: 28 passed. New test covers transient narrow dismissal, focus transfer, desktop resizing, Settings, explicit storage changes and reopen.
- Extended `board-sidebar-smoke.mjs` passes against a real disposable gateway. It verifies loading/missing/temporary-unavailable states, successful retry, real pages literally titled “Page missing” and “Empty column”, rendered action tooltip, Expand/Collapse names, current-page dismissal, failed-save retention and canonical byte preservation, successful narrow navigation, branch/scroll-position preservation, desktop expansion and final-row reachability at 900×480. Existing scope/cross-tab/order/persistence checks also pass.
- Production `boards-desktop-smoke.mjs` passes both Mac processes: actual narrow selection/reopen, unchanged desktop preference, tree persistence after relaunch, real loopback read-only brain, CLI/UI agreement and canonical preservation. Native minimum window constraints apply; 320px coverage comes from Chromium, not a physically 320px Mac window.
- Existing `boards-smoke.mjs`, `sidebar-smoke.mjs`, and `sidebar-layout-smoke.mjs` pass. The board smoke's archived-row lookup now uses the explicit Open board accessible action.
- Visually inspected `/tmp/jb-sidebar-review-qa/narrow-selected-content-dark.png` (320×650: title and body visible after choice), `open-board-action.png` (actual focused tooltip), populated missing-reference/real-title captures, and `.local-pack/boards-native/tree-1280-850-280-light.png` (italic empty placeholder) plus `tree-narrow-selected-content.png`. Light/dark and minimum/default/wide/short layouts are exercised by the smoke capture matrix.
- Tooltip checks use the actual shared `#control-label` popover because the component intentionally removes the native title attribute while active. Breakpoint assertions wait for the media-query update rather than reading in the resize race. These were test-harness corrections, not product behavior changes.
- Full suite after the initial build: **1,524 passed, 0 failed, 1 skipped** of 1,525 (`node --test --test-concurrency=4`, `/tmp/jb-sidebar-review-full.log`). The opt-in real QMD 2.8.3 physical-readonly/WAL test was skipped because its binary was not provisioned. Final review then added one toggle-branch fix for automatic mobile dismissal → explicit desktop collapse → narrow reopen. After rebuilding, **28 affected tests plus the complete board/sidebar and production native/relaunch smokes pass** on the final fingerprint, including first-click reopening. Logs: `/tmp/jb-sidebar-review-{build,tests,tree,native}-final.log`. The full-suite run preceded only that small branch fix. `git diff --check` passes. Physical screen-reader/touch input and live VPS checks are not claimed. Existing general-page duplicates and per-board settings semantics remain intentional. No installation, push or release.
