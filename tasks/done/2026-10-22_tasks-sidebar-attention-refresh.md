# Sidebar cleanup and note attention — coordination

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Make the sidebar quiet and consistent, make updates an inline icon workflow, and let people settle or snooze notes so the sidebar surfaces what needs attention. Implementation followed the planning split requested on 2026-10-22, in the isolated `feat/sidebar-attention-refresh` worktree.

## User direction

- Search and New note become icons on one row. Theme is a sun/moon control. Graph, Settings and Feedback use the same interface typography.
- Remove “Pin pages to keep them here.” (explicitly confirmed). Keep empty Pinned navigation quiet.
- Replace the normal Updates/release entry with one stateful icon: download available update, show preparation, then offer relaunch. Normal updates need no popup.
- Add a checkmark Settle action and clock Snooze action, following the supplied screenshots. Snooze choices: In 1 hour, In 3 hours, Tomorrow at 09:00, Next week Monday at 09:00, Custom…; show the resolved local time beside each choice.
- Reduce interface font weights and ad hoc typography through the shared design system.

## Work tracks and ownership

1. [Typography rules](2026-10-22_tasks-browser-design-system.md#follow-up-restrict-interface-typography--2026-10-22) — token definitions, UI weight usage and design-system guidance.
2. [Sidebar controls](2026-10-22_tasks-sidebar-icon-controls.md) — sidebar shell, search/create icons and theme behavior.
3. [Coordinated update backend](2026-10-22_tasks-unified-mac-cli-update-experience.md) — shared app/CLI operation, state contract and restart lifecycle.
4. [Inline update icon](2026-10-22_tasks-inline-desktop-update-control.md) — desktop injection, narrow renderer capability and state presentation.
5. [Canonical note attention](2026-10-22_tasks-note-attention-metadata.md) — Markdown semantics, guarded mutation, list producer and protocol.
6. [Settle/snooze interface](2026-10-22_tasks-note-attention-interface.md) — attention list controller, note actions and snooze picker.

Implemented with three shared-worktree subagents: sidebar/typography, canonical metadata/backend and inline/coordinated updates. Root owned attention UI/integration; subagents also ran focused review and browser/installed-fixture QA. Ownership kept overlapping files limited to agreed regions.

Each implementer is sharing the checkout with other work: preserve existing edits and never revert another track. In particular, this checkout already contains unfinished browser/design-system and updater planning work. Use narrow patches; a separate worktree starts at a commit and will not include these uncommitted changes unless they are deliberately transferred.

Shared files need region ownership: typography owns font/token declarations; sidebar controls owns navigation markup and layout; note attention UI owns sidebar list data/rendering and document action hooks. Inline updates owns only its injected child control, not sidebar layout. Coordinate one integrator for `browser.docs.md`, shared shell composition, `tasks/todo/release-next.md` and final checks. Newly extracted modules should stay focused; do not turn this into an unrelated shell rewrite.

## Implemented attention contract

These rules are implemented and covered by the checks below. Changes to the contract should be coordinated with both producer and interface consumers.

- Canonical frontmatter key: `attention_at`. Absent = active, using valid `updated_at`/`updatedAt`, then `created_at`/`createdAt`, as its effective ordering time. A valid timezone-explicit timestamp = explicit attention time. Future = snoozed; due/past = active, ordered by that time. Explicit YAML `null` = settled, excluded from the attention list. No Infinity or arbitrary far-future sentinel.
- Ordinary new notes need no extra field: the fallback follows subsequent edits. Body/title edits preserve explicit settled/snoozed overrides. Opening a note does not reset them. “Bring back” removes the override and restores edit-recency behavior. These choices keep settling meaningful and reversible.
- Attention-only actions do not change the content's `updated_at`. Their canonical byte hash does change. Body/title edits still advance `updated_at` normally; metadata must survive those saves and external refresh.
- Active eligible notes sort by effective attention time descending with a stable file/ID tie-breaker; undated legacy notes sort last. Filter settled/future/ambiguous IDs before the bounded result limit (initially eight). A due snooze returns even if this browser never visited it. No bulk Markdown rewrite is needed.
- Pins remain an explicit, scope-local navigation preference: pinned notes stay pinned even if settled/snoozed, and are deduplicated from the unpinned attention list. Settle/snooze governs the unpinned list. Keep this interaction clear in tooltips/action feedback.
- Sidebar “Recent” becomes “Attention”, sourced from canonical metadata rather than localStorage visits. Home “Recent activity” keeps its existing edit-history meaning and endpoint. Search, direct links, graph and explicit agent recall can still find settled/snoozed notes; this is a presentation workflow, not deletion or knowledge validity.
- Add a separate authenticated attention-list operation rather than silently changing the existing recent-activity packet. List fields: `notes` with existing ID/title/file and content timestamps plus resolved `attentionAt`; optional `nextWakeAt` is the earliest future snooze deadline. The backend owns time validation and eligibility. Transport is GET `/memories/all/attention`; PATCH the existing `/memories/all/documents/:id` with mandatory If-Match and strict action intent. A successful mutation returns the complete confirmed document and new hash.
- Mutations use explicit `settle`, `snooze(until)` and `reactivate` intent with current canonical ID/hash and existing write authorization. The backend patches only attention metadata atomically. Never submit an old whole-note snapshot just to change attention. Existing CLI document read/edit can manipulate the same frontmatter; do not require a new agent-facing API workflow.
- Browser refreshes on list entry, confirmed mutation, focus/pageshow and the next snooze deadline; hidden tabs pause timers, resumed tabs recheck. No background service or persisted scheduling database is required.
- Snooze arithmetic uses the user's local time, persisted as an unambiguous UTC instant. Tomorrow/next Monday are calendar operations, not fixed 24-hour/seven-day offsets; Next week means the next calendar week's Monday at 09:00. Reject invalid, ambiguous/nonexistent custom times unless the UI resolves them explicitly.

## Shared presentation/update contract

- UI weights: regular 400 and semibold 600 only. One font/size/weight role for ordinary sidebar destinations; icons share glyph size, target size and focus treatment. Keep document typography and Markdown emphasis separate.
- Theme uses a direct Light/Dark toggle with sun/moon glyph and an accessible action name. Preserve a stored System choice until the first explicit toggle; no destructive preference migration is needed.
- Updater state comes from one native operation. Available = download icon; preparing = nonblocking progress; ready = relaunch icon. Prepared is not installed: current worker publishes after safe shutdown. Show installed success only after actual version/startup verification. Hide the prominent action when current; provide manual Check for updates in About/native menu.
- Normal activation starts preparation without a separate window. Exceptions (pinned/custom CLI policy, failures, recovery) remain actionable through inline details or explicitly opened recovery UI. Preserve save barriers, rollback and hosted-browser capability isolation.

## Integration tasks

- [x] Confirm exact attention protocol types/routes and updater status/action contract with the owning tracks; record changes here before consumers diverge.
- [x] Land typography tokens and sidebar control slots first; integrate backend contracts and their interface consumers in separate logical changes.
- [x] Verify the combined experience with disposable Markdown: create/edit, settle, search/reopen/reactivate, snooze expiry while idle/hidden/restarted, pinned interaction, brain switching and failed saves.
- [x] Inspect desktop and 390/320px layouts in both themes, keyboard focus, long titles and updater icon transitions. Reuse existing sidebar/theme/editor/update runners; record snapshot, results and limits in the owning lists.
- [x] Update browser/module docs and the glossary when implementation establishes the new attention vocabulary. Consolidate implemented user-facing release notes once; planning alone does not change the changelog or pending release notes. Implementation was verified without changing the personal installation or memory, and no release was published.

## Integrated verification — 2026-10-22

- Baseline: local commit `9606d74ccf60660ea96a6589e7255f39b595989b` plus the transferred relevant browser/updater snapshot and this worktree's implementation. Verification used the working snapshot; the user subsequently requested one commit containing all outstanding worktree files. No tag/release was created. Worktree: `/Users/monkey/dev/jumpyBrain-sidebar-attention-refresh`, branch `feat/sidebar-attention-refresh`.
- `npm test -- --test-concurrency=4 --test-timeout=60000`: **1,123 passed, one skipped, zero failures** (1,124 total). The initial unconstrained run hit the bundle review gate and an evidence-date test stall. Extracting duplicate server-only UI strings reduced the bundle; the bounded-concurrency rerun passed, and the stalled evidence-date file independently passed all four tests. The reviewed bundle is 164,378 gzip bytes; gate165KB.
- After the full suite, the final companion Settings admission correction (preventing sidebar reads from starting an engine on Settings) passed a fresh build and **104 focused browser/controller/bundle checks**. Production companion smoke also passed after the guard, preserving the Settings no-memory-fetch invariant and existing two-tab save/scope/session behavior. Final browser build fingerprint: `78b74c885fdc81ae`.
- Production sidebar and theme smokes passed; note-attention lifecycle smoke passed with expanded keyboard/current-note wake and failed-save recovery checks. Both themes and 1280/390/320px layouts inspected; screenshots `/tmp/jumpybrain-sidebar-attention-qa` and `/tmp/jumpybrain-attention-qa`.
- Actual sandboxed Electron inline updater smoke passed, including fixed/stale/child-frame capability restrictions, duplicate-click/status races, keyboard use and retained editor text/selection. Artifact-only desktop pack passed. Disposable installed GUI, open-CLI and closed-CLI old0.3.3→fixture0.3.4 upgrades passed with app/runtime/CLI agreement and unchanged protected Markdown/settings/targets/login/keys. Artifacts `.local-pack/update-inline-ui/` and `.local-pack/update-smoke/`; these fixture versions are not a public release or a personal app upgrade.
- Existing companion/gateway tests cover read-only profiles, target/generation/tab isolation and failed-save switch barriers. Real physical sleep, assistive technology, other browsers, Intel/public signing/notarization and live public-release upgrade remain explicit manual limits.
- Owning docs, glossary and pending release notes updated. The user approved finalization: completed sidebar, attention and unified-update lists are archived under `tasks/done/`; unfinished release-policy/testing work remains active.

## Combined master integration — 2026-10-22

- User requested one combined commit on master, including the separate unified Mac/CLI backend and semantic/shared graph search. Existing completed GUI-updater, design-system, sidebar, attention, unified update and graph task lists are archived together; future release-policy/testing work remains active.
- Reconciled the separate updater backend with the icon consumer: current-caller recovery ownership, required helper-resource preflight, bounded process probes, UTF-8/private socket creation, and inline blocked-restart feedback. Kept offered-release reuse, native action availability/race fencing and truthful installed version verification.
- Shared graph search uses the same authenticated retrieval, normalized results and recent-save projection as global search. Existing retrieval/index readiness determines semantic availability; no graph-specific engine or similarity threshold was introduced. Existing graph focus/orphan controls can further narrow canonical file matches before the node cap.
- Main-checkout changes were snapshotted before reconciliation so they can be integrated without losing concurrent edits. Final combined validation and master commit are recorded at completion below.

### Final combined checks

- `npm test -- --test-concurrency=4 --test-timeout=60000`: **1,128 passed, one skipped, zero failures** after incorporating shared/semantic graph search and newer unified updater fixes. Final combined browser build `9a0a6183dceec7fd`; gzip164,523 bytes within165KB.
- Graph/browser108 focused tests, real501-note warning fixture and full production graph-editor/Dream/UI smokes passed. Main's completed graph task is archived alongside the eight completed sidebar/attention/updater/predecessor lists.
- Documentation and release notes consolidate all three capabilities. Final integration uses a squash onto master so the combined changes appear as one commit; no version bump, public release or personal installation is part of this request.

### Final merged updater verification — 2026-10-22

- Combined source updater/lifecycle/host/setup suite: **31 passed**. Actual sandboxed Electron icon UI smoke and artifact-only desktop packaging passed against the final graph/sidebar/attention build.
- Disposable `success`, `app-only` and `helper-crash` modes all passed. Paired success keeps actual app/runtime/CLI at fixture0.3.4; app-only preserves pinned CLI0.3.3 and explicitly reports it unchanged; killed-worker recovery restores/reopens the previous working installation.
- Paired success edited and saved the actual Markdown note while preparation ran and verified those exact saved bytes after relaunch. Failed/unresponsive saves blocked restart with inline feedback and no extra dialog. Protected Markdown/configuration/agent integration/login/private-key hashes stayed unchanged in all three scenarios.
- Evidence: `.local-pack/update-smoke/{success,app-only,helper-crash}/result.json` and `.local-pack/update-inline-ui/`. These are local immutable release fixtures, not a public release or a change to the personal installation.
