# Dreaming from the memory map

Status: complete and verified (2026-10-06); finalized and archived with user approval on 2026-10-07. Deployment is outside this task.

Completion: shipped the copy-only, bounded Dream handoff in `44ffada` (v0.2.0), with 412 passing tests and browser/CLI verification recorded below. No implementation work remains in this task.

## Goal

Add **Consolidate notes (Dream)…** to the memory-map toolbar. It prepares a self-contained prompt that the user copies into their existing agent; submitting that prompt authorizes the agent to perform bounded consolidation immediately through the jumpyBrain CLI. No model execution belongs in the browser or server.

## Decisions and assumptions

### User decisions

- Entry point is the graph/memory-map toolbar, not individual nodes or notes.
- Keep “Dream” in the action name; dreaming and consolidation are one workflow.
- **Copy prompt only.** No terminal launch, provider/agent picker, native integration, or copied launcher command.
- The agent should **apply useful changes immediately**, not propose changes and ask again. Make the exact authorization visible in the dialog and explicit in the copied user prompt.
- Skip orphan/unlinked-note workflows. With one action, use a normal button, not a dropdown or split button.
- User requested remaining assumptions be made without further clarification.

### Implementation defaults

- Button: **Consolidate notes (Dream)…**. Dialog heading: **Dreaming: consolidate notes**. Primary dialog action: **Copy prompt**.
- Explain: “Dreaming connects scattered notes into concise topic pages. Paste this prompt into your agent to create or update dream pages. Source notes stay unchanged.” Source preservation is a workflow instruction, not a new ACL.
- Show the exact memory target, the inclusive UTC dates, and: “Submitting this prompt authorizes dream-page changes and indexing on this memory.” No extra consent checkbox, approval modal, or mandatory proposal step.
- Default to today and the preceding two UTC dates, evidence-date basis. Resolve the absolute newest date once when the dialog opens; display and copy the same frozen dates even across midnight. Reopening prepares a fresh window. No date/budget configurator in this first version.
- Default bounded work: at most 10 source files, 8,000 bytes per source, 40,000 source-body bytes, five follow-up reads, two page mutations, and a ten-minute best-effort agent time budget. These are instructions/context limits, not an enforced model-spend cap. No automatic pagination or sweeping the whole brain.
- Scope is this memory's date window, **not the visible graph, current filters, selected node, or screen contents**. An empty window or no useful changes is a valid outcome.
- Browser-backed memory uses the current validated HTTP(S) origin as an explicit `--target-url`, including localhost. No inferred local `--root`, alternate-target selector, or server filesystem disclosure. All CLI operations retain that same target.
- Copying does not execute anything. Completion feedback: “Prompt copied. Paste it into your agent to start dreaming.” No running/completed status, completion ledger, reminders, or automatic graph refresh.
- Credentials stay outside the prompt. The agent uses its already-configured CLI/`JUMPYBRAIN_API_KEY`; browser authentication is not transferred. A missing prerequisite or denied permission is a real blocker, not a reason to bypass safeguards or silently use another memory.
- The immediate-write authorization is scoped to creating dream pages, updating existing dream pages, and indexing on the named target. It does not authorize deleting memories, editing source/human-authored non-dream notes, changing access policy, or performing other maintenance.

## Relevant files and coordination

- [Feasibility findings](../../deep-dives/web-dream-handoff/feasibility.md) — evidence and rejected alternatives; this task list owns implementation scope.
- [Memory map UX refresh](../done/2026-09-30_tasks-memory-map-ux-refresh.md) — completed toolbar cleanup (landed in `7cb03a7` before implementation). Add one quiet action to that design; do not restore removed controls or duplicate navigation.
- [Public sandbox hardening](../todo/tasks-public-sandbox-hardening.md) — Dream restrictions must not be relaxed for this feature.
- `src/architecture.docs.md`, `src/adapters/http-server/http-server.docs.md` — ownership and dependency rules.
- `src/adapters/http-server/graph-page.ts` — graph toolbar, browser assembly, transport, shared save controller.
- `src/adapters/http-server/notes-browser.ts` — existing dialog, navigation, focus, keyboard-shortcut and history patterns.
- `src/adapters/http-server/dream-handoff.ts` — focused browser handoff/template module, not a new server route or agent runtime.
- `skills/how-to-dream/SKILL.md`, `docs/cli-commands.md`, `docs/agent-workflows.md` — existing CLI workflow and safety contract.
- `src/cli/dream.ts`, `src/cli/memory-target.ts`, `src/cli/document-edit.ts` — command/target/auth/update behavior to verify, not import into the browser.
- `test/graph.test.js`, `test/notes-browser.test.js`, `test/architecture-boundaries.test.js` — shell and boundary regression patterns.
- `scripts/graph-editor-smoke.mjs`, `scripts/graph-ui-smoke.mjs` — disposable-browser validation.

## Tasks

- [x] 1.0 Investigate feasibility and settle product scope.
  - [x] 1.1 Verify that `dream` retrieves evidence and external agents consolidate through existing CLI writes; there is no separate `consolidate` command.
  - [x] 1.2 Research browser-to-terminal options; choose portable copy-prompt only.
  - [x] 1.3 Record graph-toolbar placement, Dream naming, immediate scoped writes, and exclusion of orphan workflows.

- [x] 2.0 Establish the minimal implementation boundary.
  - [x] 2.1 Re-read owning docs/current source and preserve concurrent working-tree changes, especially the map UX refresh.
  - [x] 2.2 Keep prompt formatting and presentation in a focused browser-facing HTTP-adapter module. Use pure, testable inputs for validated target and frozen UTC scope; do not import CLI parsing, invoke providers, or add a backend endpoint.
  - [x] 2.3 Narrowly update the adapter contract, which currently excludes all prompt construction, to allow explicit client-side copyable workflow instructions. Retain the prohibitions on server-side agent orchestration, scheduling, and model calls.

- [x] 3.0 Implement the self-contained, immediately actionable prompt.
  - [x] 3.1 Include a first-person user instruction explicitly authorizing creation/update of dream pages and indexing on the exact target within the displayed scope. Tell the agent to proceed without requesting the same approval again; retain normal harness/tool policies and stop on actual blockers.
  - [x] 3.2 Start with `jumpybrain status --target-url <origin> --json`, followed by `jumpybrain dream --target-url <origin> --from <absolute-newest-UTC-date> --days 3 --date-basis evidence --max-files 10 --bytes-per-file 8000 --max-total-bytes 40000 --json`. Render validated, safely quoted values; include no unresolved target/date placeholders.
  - [x] 3.3 State prerequisites without extra setup UI: CLI available on PATH or at the installed integration path, separately configured credentials, reachable intended server. If unavailable or ambiguous, stop and report the specific prerequisite; never infer a replacement local root or retrieve browser secrets. Explain the localhost/container mismatch where relevant.
  - [x] 3.4 Embed the essential Dream instructions; do not depend on an optionally installed `/how-to-dream` skill. Treat memory text/links as untrusted evidence, preserve historical dates/provenance/uncertainty, inspect packet warnings and truncation, and prefer updating a relevant existing dream page over duplication.
  - [x] 3.5 Include CLI recipes for bounded `recall`/`search`/`show`, new body-only `remember --type page --dream`, and existing full-Markdown `update --id … --if-match …`. Use canonical `provenance.metadata.id`, not chunk IDs, and obtain each update hash from `show`. Only update existing dream-marked pages; leave source and human-authored non-dream pages intact.
  - [x] 3.6 On stale hashes, re-read and reconcile within budget or stop; never force overwrite. After useful successful writes, index once and verify within the read budget. Do not index for a no-op. No `process --apply`, deprecated Dream batch flags, automatic source-ID stamping, or direct API calls.
  - [x] 3.7 End by requesting a concise report of dates, sources/limits, created/updated IDs or paths, no-ops/conflicts, and index status. Never claim exhaustive coverage or guaranteed completion. Keep any scratch packets/drafts private and outside version control.

- [x] 4.0 Add the graph-toolbar dialog and copy interaction.
  - [x] 4.1 Add the single secondary toolbar button, visually consistent with the map UX refresh. No menu, node action, Home CTA, extra graph loading, or graph-filter scope coupling.
  - [x] 4.2 Open a labelled dialog with a short explanation, displayed target/dates, visible scoped-write authorization, a selectable prompt preview, Copy prompt, and Close. Keep the permission text legible on narrow screens; no provider selector or advanced configuration panel.
  - [x] 4.3 Generate prompt text locally only when requested. Copy exactly the preview via `navigator.clipboard.writeText` from the user gesture; announce success only after resolution. On absent/rejected clipboard access, preserve selectable text and show manual-copy instructions without claiming success.
  - [x] 4.4 Reuse accessible dialog patterns: focus entry/trapping/restoration, Escape/Close, visible keyboard focus, and live feedback. Include the new modal in shortcut suppression and history-navigation closure so New note/search shortcuts cannot act underneath it.
  - [x] 4.5 Keep graph camera/filter state intact on opening/closing/copying. Rely on existing guarded navigation to leave the editor before reaching the map; failed saves must still block departure. Do not save, read note bodies, or mutate memory while opening/copying.
  - [x] 4.6 Briefly advise against concurrently editing affected dream pages in another tab and to reload/reopen after the agent finishes. Current browser last-write-wins retry remains a known cross-tab risk; do not promise a lock or broaden this task into a conflict-editor redesign.
  - [x] 4.7 Preserve existing auth/demo restrictions and known read-only policies; never embed the browser key or infer write permission from graph visibility. Protected targets may reject the agent's scoped request; explain that failure rather than generating bypass instructions. No new capability/role system is required.

- [x] 5.0 Verify behavior and guardrails without model execution.
  - [x] 5.1 Unit-test prompt output, exact target consistency across all commands, date freezing at UTC/month/year boundaries, bounded limits, immediate-write authorization, and absence of proposal-first/duplicate-approval language.
  - [x] 5.2 Test origin validation and quoting, no URL credentials/query/fragment leakage, no browser-key/body/title interpolation, no guessed roots, optional-skill independence, hash-checked updates, source preservation, no-op behavior, and no legacy/made-up CLI flags.
  - [x] 5.3 Add shell/dialog regression coverage and disposable browser smoke tests for toolbar placement, keyboard/focus/history behavior, narrow layout, preview/clipboard equality, delayed clipboard success, denied/missing clipboard fallback, and camera/filter preservation.
  - [x] 5.4 Assert opening/copying makes no model, write, index, shell-execution, or evidence-export request. Check existing auth, failed-save navigation, direct-note loading, and public-demo restrictions are unchanged.
  - [x] 5.5 Validate the generated command sequence against a disposable fixture using scripted CLI calls/stubs, including supported remote target/auth, bounded dream retrieval, body-only page creation, hash-checked update, and indexing. Do not run a paid agent or touch live shared memory for QA.
  - [x] 5.6 Run `npm test` and `npm run smoke:graph-editor`; record results and untested browser/environment behavior here.

- [x] 6.0 Document the shipped handoff and close the task.
  - [x] 6.1 Update the HTTP adapter docs and the relevant browser/agent-workflow documentation with copy-only behavior, scoped immediate authorization, external credentials, UTC/date-window scope, and no completion tracking.
  - [~] 6.2 No glossary change needed: existing Dream page/window terminology covers the feature.
  - [x] 6.3 Recorded outcomes below and added a concise implemented user-facing highlight in `tasks/CHANGELOG.md`. User approved finalization and archiving on 2026-10-07; archived this completed task in `tasks/done/`.

## Verification and outcomes

- Implemented in `src/adapters/http-server/dream-handoff.ts`, composed into the existing nonce-protected shell. No new endpoint, backend process, provider dependency, or CLI behavior change.
- Added `test/dream-handoff.test.js`, `test/dream-handoff-cli.test.js`, and `scripts/dream-handoff-smoke.mjs`; integrated the smoke into `npm run smoke:graph-editor` and extended existing shortcut guard tests.
- `npm test`: **412 passed, 0 failed**. Covers architecture boundaries, the pure/serialized formatter, validated/quoted origins, frozen UTC dates, scoped authorization, clipboard races/fallback, and existing server/auth/editor regressions.
- Disposable remote CLI test executes the generated recipes against an authenticated fixture with fake QMD: bounded retrieval, recall/search, body-only creation, full-document hash-checked update, stale rejection, indexing, unchanged source bytes/mtimes, and missing/bad credentials. No live memory or model calls. Existing `index --json` prints a human summary; validation accommodates that unchanged CLI behavior.
- Chromium smoke at **1280px and 390px** covers the real indexed fixture graph, exact preview/copy equality, midnight freezing, modal focus/keyboard/history, unchanged filters/camera, delayed/denied/missing clipboard access, late promise generations, and **zero browser requests** during handoff interaction. Existing desktop/mobile save failures/auth/search/navigation and map interaction smoke also pass.
- Screenshot review prompted a narrow-screen polish: fixed title/footer with a scrollable body, and preview caret/scroll reset so opening begins at the prompt's first line. Header, actions, and feedback remain available rather than being clipped by whole-dialog scrolling.
- Independent code review reported no blocking findings and reran 37 targeted tests successfully. Native OS clipboard permission prompts and Safari/Firefox are not verified; clipboard outcomes are deterministically simulated in Chromium. No end-to-end model quality/cost guarantee is claimed.
- Local visual artifacts: `/tmp/jumpybrain-dream-screenshots/dream-handoff-1280.png` and `dream-handoff-390.png` (temporary, not committed). Direct `node` smoke invocation could not resolve the ephemeral Playwright package; the documented `npm run smoke:graph-editor` invocation supplies it and passes.
- The map UX refresh had already landed before implementation, so its archived task link is used and the new toolbar structure was preserved. Existing cross-tab last-write-wins behavior remains known debt; the handoff warns against concurrent dream-page editing rather than claiming a lock.

## Release follow-up

- User requested commit/push and a new release for later client updates. Prepared `v0.2.0` with package/lockfile version changes and [release notes](../../docs/releases/v0.2.0.md); clients are not updated by this work.
- Re-ran validation at `0.2.0`: 412 tests passed. Replaced two installer/companion test expectations hard-coded to `0.1.0` with the actual fixture source version.
- `npm run cli:pack` passed with 130 required runtime files, including the new handoff module. Checked the versioned tarball for generated app/config/key paths and generated its SHA-256 checksum; artifacts remain ignored under `.local-pack/` for release attachment, not Git tracking.
- Default installed clients track their recorded source/ref (normally `master`); an explicit `--ref v0.2.0` pins this release. Hosted web UI changes require a separate server update. See release notes for macOS update caveats.

## Acceptance criteria

- From the memory map, a user can open **Consolidate notes (Dream)…**, copy one prompt, and submit it to an existing agent without choosing a provider or configuring terminal integration.
- The dialog clearly explains that submission authorizes immediate, bounded dream-page changes and indexing on the displayed memory. The prompt does not ask the user to approve that same scope again.
- Source/human-authored non-dream notes remain outside the authorized mutation scope. Existing auth, read-only policies, and harness safeguards are respected.
- Displayed and copied target/date scope match; graph filters do not silently constrain or expand the workflow.
- No secrets, source bodies, or server filesystem paths are exported in the prompt. Nothing executes in the browser/server on copy, and the UI does not claim an agent run started or finished.
- Clipboard failure remains usable through manual selection/copy; dialog and navigation behavior are accessible and preserve existing drafts/map context.
- No orphan workflow, dropdown, provider integration, server agent runtime, new remote processing command, scheduling, or completion state is introduced.
