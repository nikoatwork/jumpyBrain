# Create missing reference pages

## Goal

In the Mac app, clicking `[[alla]]` when no page has that title should create and open a page titled `alla`. Completing `[[alla]]` while writing should also create that page, while keeping the user in the source note.

Status: implemented and verified 2026-10-22. No installation or release performed.

Reverified against current HEAD on 2026-10-23; see the follow-up verification below. The former `tasks/todo/tasks-create-missing-reference-pages.md` path is obsolete; this archive remains the canonical task record.

## Current behavior

- Writable Mac reference activation creates a missing target after the source save, validates the target and opens it. Read-only connections retain the source with permission feedback.
- Newly completed active references queue target creation until the current source body is fully saved. Existing-title search suggestions and `@` still insert canonical bracket links.
- Fresh canonical title lookup already distinguishes found, missing, ambiguous and unopenable outcomes independently of the search index.
- The Mac app uses the shared browser/editor over the existing memory app. Keep creation policy in app use cases and HTTP routes thin.

## Scope and constraints

- Store new pages as canonical Markdown under `pages/`, with a normal generated document ID and the requested title. Indexing remains derived.
- Reuse a uniquely matching existing page using the current normalized exact-title rules. Do not create duplicates for ambiguous titles, invalid identities, failed scans, retries or repeated clicks.
- Creation on typing must require a completed, valid reference; unfinished `[[alla`, code examples and escaped/inert references must not create pages.
- Opening or hydrating an old note must not create every unresolved reference it contains. External refreshes and history restoration must not masquerade as user input.
- Preserve source drafts, save/history guards, authentication and companion brain/session fencing. Read-only connections must not create pages.
- Create newly completed references only when the complete current body matches the confirmed saved body. Continued typing and safe concurrent-edit rebases defer creation until the next confirmed save.
- No version bump, installation or publication is part of this task.

## Tasks

- [x] 1. Define the creation contract and typed-reference trigger.
  - [x] Specify empty-page content and metadata, preserving the exact display title.
  - [x] Finalize when completed references create targets, including paste, autocomplete insertion, edits, undo/redo and IME composition.
  - [x] Distinguish newly entered references from pre-existing references and external updates.
- [x] 2. Add a canonical find-or-create app operation.
  - [x] Resolve titles freshly at the active editor memory root, independently of QMD/search freshness.
  - [x] Serialize missing-title lookup and publication with existing server writes; document limits across processes and external filesystem writers.
  - [x] Reuse existing targets and refuse ambiguous/unopenable outcomes without writing.
  - [x] Make concurrent requests and uncertain-response retries reuse the saved page. Separate successful canonical publication from index bookkeeping failures.
  - [x] Expose the operation through authenticated, validated transport while retaining read-only title lookup semantics.
- [x] 3. Create and open missing references on activation.
  - [x] Save the source through the existing navigation guard before creating a missing target.
  - [x] Fetch and validate the confirmed target before replacing the editor; preserve browser history and keyboard/touch activation.
  - [x] Coalesce repeated activation and fence late responses after note, credential or brain changes.
  - [x] Give clear retry feedback for real failures and explain read-only/ambiguous outcomes without losing the draft.
- [x] 4. Create targets for completed references while writing.
  - [x] Recognize valid newly entered references using the editor's conservative reference rules.
  - [x] Create missing targets without navigating away, changing source text, moving the caret or breaking undo history.
  - [x] Reuse existing pages and refresh search/map freshness after actual creation.
  - [x] Retain a clear recovery path when creation cannot be confirmed; avoid silent duplicate retries.
- [x] 5. Verify behavior and document the result.
  - [x] Test click-to-create/open, typed `[[alla]]` creation, exact titles, existing-page reuse and blank-page editing/save/reload.
  - [x] Test duplicate/normalized titles, concurrent requests, repeated clicks, lost responses, deletion/rename races and stale indexes.
  - [x] Test failed source saves, read-only/auth failures, brain switches and cancelled navigation.
  - [x] Test partial syntax, escaped/code/inert references, paste, IME, undo/redo, hydration and external refresh.
  - [x] Extend production reference browser smokes for desktop and narrow touch; verify the Mac companion path and record any installed-app limits.
  - [x] Update owning browser/server-memory/writing/protocol docs and add a short pending release note only after implementation lands.
  - [x] Record the tested snapshot, results and remaining limits here; assess any changelog entry against repository hygiene rules.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` — activation, navigation/save guard and note-save callbacks.
- `src/adapters/http-server/{lexical-editor,reference-autocomplete,reference-ranges,reference-policy}.ts` — literal reference editing, recognition and suggestions.
- `src/adapters/http-server/reference-creation.ts` — newly completed reference detection, confirmed-source queue, rebase/retry/session policy.
- `src/adapters/http-server/{routes,browser-transport}.ts`, `src/adapters/http-protocol.ts` — authenticated browser transport and route ownership.
- `src/app/server-memory/resolve-title.ts`, `src/app/server-memory/index.ts` — canonical lookup and server-local write orchestration.
- `src/app/server-memory/ensure-title.ts` — canonical queued find-or-create policy, title safety and saved/index outcome.
- `src/app/writing/remote-writer.ts`, `src/core/document-title.ts` — page publication and shared normalized-title policy.
- `test/server-title-resolution.test.js`, `test/daily-notes-browser.test.js`, reference policy/range tests — deterministic regression coverage.
- `scripts/{page-reference,reference-autocomplete,page-reference-editor}-smoke.mjs` — production editor/reference integration coverage.
- `scripts/missing-reference-pages-smoke.mjs` — real engine/gateway desktop and narrow touch creation, save/retry/permission checks.
- `integrations/macos-companion/gateway.mjs` — generation/tab/target permission admission for `ensure-title` writes.
- `test/{missing-reference-pages,reference-creation,reference-creation-merge}.test.js` — server, completion/retry, and 412 rebase regressions.

## Implementation decisions

- New pages use the standard writer metadata and a title heading only, with no placeholder prose; ordinary page-POST body validation is unchanged.
- Newly completed literal occurrences from typing, paste, title edits, picker insertion and redo are eligible after committed input and confirmed source save. Undo, hydration, external updates and context-only unwrapping of old literals do not create targets. Undo never deletes a target already created.
- Pending local intent survives a safe external rebase; external references are never newly enqueued. Creation waits for a clean confirmed body so an external same-title occurrence cannot authorize an unsaved local one.
- `POST /memories/all/ensure-title` shares the host write queue with other writes. It reuses a fresh unique canonical title; ambiguity or invalid identity never authorizes creation. Derived index failures retain canonical success.
- Title retry is fresh lookup, not an idempotency ledger. One host serializes its requests; independent servers/CLI/filesystem writers are outside that queue. Rename/delete between attempts can change the result or allow later recreation.
- Unconfirmed typed-reference creation retains explicit retry feedback and blocks navigation/switch acknowledgement. Removing the reference clears its pending intent. Registered read-only connections may follow existing references or see missing-page permission feedback; frozen/session-fenced/navigation-locked editors remain inert.
- No personal/global memory, installed app, release version or distribution was changed.

## Verification

Tested the working-tree implementation over `640ae50`, build `3795f1fc248e0a91` (version 0.3.5), including the previously implemented `@` shortcut:

- `npm run build`: passed. Final bundle 503,254 bytes minified / 165,904 bytes gzip. Reviewed the roughly 1.5 KB increase over the attention bundle: local completion/queue logic, no new dependencies. Raised the explicit review gate from 165,000 to 167,000 bytes; the first full run identified this gate, all functional tests already passed.
- Final `node --test`: 1,152 passed, one skipped, zero failures (1,153 tests). Includes canonical title/empty-page creation, concurrent/retried writes, index failure recovery, gateway permissions/fencing, activation/save/navigation, completion/IME/undo policy and three 412 rebase regressions.
- `npx --package=playwright node scripts/missing-reference-pages-smoke.mjs`: final production engine + gateway + editor run passed all 14 scenarios at 1280px desktop and 390px touch, with zero page errors. Covered hydration inertness, existing/missing activation, page edit/reload, typing/paste only after a held source PUT confirms, preserved source/caret, code/escape/incomplete exclusion, failed-source-save retry, published-but-lost creation response and explicit same-ID retry, and read-only feedback/403.
- `npx --package=playwright node scripts/page-reference-editor-smoke.mjs`: all 54 editor scenarios passed, including typing/paste/picker/title-edit/redo completion, synthetic committed/preedit IME, hydration/external/context/cross-leaf exclusion and permission-readonly activation with selection protection.
- `npx --package=playwright node scripts/reference-autocomplete-smoke.mjs`: all 36 desktop/narrow scenarios passed, including the prior `@` shortcut and original bracket behavior.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs`: passed. Updated its synthetic server to support existing-title ensure replay and wait for an editable loaded note before input.
- Integrated review identified and resolved local-intent loss during safe external merges and external same-title additions/removals around the save boundary. All 13 focused controller/rebase tests passed after the fixes.
- `git diff --check`: passed.

The new 14-scenario production smoke was rerun against the final controller/rebase bundle; the final full suite also includes the last fixes. Physical Mac app installation, actual native Keychain/folder UI, real keyboard/IME/assistive technology, Safari/Firefox and real hosted deployment were not exercised. Synthetic browser/Chromium CDP input is not physical IME validation. Cross-process title locking and atomicity against external rename/delete remain unsupported; one host queue is the tested concurrency boundary. Existing [manual reference QA](../todo/tasks-page-reference-manual-qa.md) remains separate. No release, installation, account messaging or memory write was performed.

## Follow-up verification — 2026-10-23

The requested todo path was already archived by implementation commit `c450fc544b9dd64f8f98bbe3997ed2066a1a8cc0`. Audited the completed requirements against current HEAD `214cf7df288ba5e43b079aba991539549416bdd8` and reverified that snapshot, version 0.3.6, build `14598887705f8ca5`. No implementation changes were needed.

- `npm test`: build passed; 1,197 tests passed, one skipped, zero failed (1,198 total). Bundle: 516,721 bytes minified / 170,876 bytes gzip, within the current repository gate.
- `npx --package=playwright node scripts/missing-reference-pages-smoke.mjs`: all 14 production engine/gateway/editor scenarios passed at 1280px desktop and 390px touch, including confirmed-save ordering, click/create/edit/reload, inert syntax, failed-save recovery, uncertain-response retry and read-only protection.
- `npx --package=playwright node scripts/page-reference-editor-smoke.mjs`: all 54 editor scenarios passed.
- `npx --package=playwright node scripts/reference-autocomplete-smoke.mjs`: all 36 desktop/narrow scenarios passed.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs`: passed, including two-tab save/freeze, generation fencing, uncertain creation, conflicts and read-only behavior.
- `git diff --check`: passed. The original archive, changelog link, owning docs and shipped v0.3.6 release notes already describe this behavior; no stale repository links to the former todo path were found before this explanatory note. No new capability or pending release note is introduced by this verification-only follow-up.

The original manual/native-device, physical IME, alternate-browser, hosted-deployment and cross-process concurrency limits remain. Browser checks used disposable memory roots; no installation, publication or personal/global memory write was performed.
