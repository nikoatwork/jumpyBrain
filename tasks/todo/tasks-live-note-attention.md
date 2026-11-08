# Make attention actions work on the open live note

Status: planned; recommended next editor increment. Creating this list does not implement the fix.

## Goal

Let Settle, Snooze, Bring back and their Undo work on the currently open live
note while preserving its body, title, private draft, selection and own Undo.
Keep one authoritative collaboration source revision and existing permissions.

## Evidence and scope

- The [completed session refactor](../done/2026-11-08_tasks-editor-session-contract-refactor.md) deliberately preserved this limitation: `live-editor-session.ts` returns false from `acceptMetadata`. `note-attention.ts` requires acceptance for the current note before its guarded PATCH, so the action can stop before publication. This is source evidence; reproduce the exact shipped user-visible failure before implementing.
- HTTP document receipts identify content hashes but do not establish live epoch/revision. Do not fix this by accepting arbitrary receipts, copying a second mutable baseline, inventing revision numbers, or discarding/reopening the editor.
- Reuse the existing collaboration publication queue, live snapshot/history and hash guards. Choose the smallest revision-aware reconciliation or publication path after tracing the current HTTP/live race; a new metadata wire method is not assumed necessary.
- Keep attention semantics in core/app, and routes/presentation thin. Preserve protected frontmatter, exact body bytes, edit provenance/date policy, permissions, no automatic mutation replay, and reader/blocked/offline safeguards.
- Scope is existing attention controls and the shared session contract. General custom properties/saved views stay in [their existing list](tasks-properties-and-saved-views.md). Do not introduce a framework or generic event bus.

## Tasks

- [ ] 1.0 Reproduce and name the publication agreement.
  - [ ] 1.1 Read architecture, browser, live and collaboration owning docs; trace current-note GET/accept/PATCH versus live notification/history ordering and the matching HTTP-only behavior.
  - [ ] 1.2 Retain a failing regression for an attention action on the actual open live session. Distinguish an action on another sidebar note; assert whether PATCH was dispatched, canonical attention and exact body bytes, plus visible outcome.
  - [ ] 1.3 Define the minimum accepted metadata evidence, navigation barrier and permission/scope checks. Account for live notification arriving before/after the HTTP receipt, a newer peer body/title revision and a lost response. Preserve uncertainty instead of retrying a possibly committed PATCH.
- [ ] 2.0 Implement one revision-aware path for current-note attention.
  - [ ] 2.1 Compose metadata publication/reconciliation against the existing live owner. Preserve pending-input flush, private-draft durability and actor-local Undo; keep standalone HTTP sessions working.
  - [ ] 2.2 Fence work across note, brain, principal, tab and disposal changes, including transports that ignore abort. Do not adopt a stale metadata baseline or reset selection/history to reconcile it.
  - [ ] 2.3 Preserve sidebar settle/removal, local pin rules, Undo and scoped busy/error feedback. Confirm a saved mutation separately from receipt uncertainty and derived indexing.
- [ ] 3.0 Verify and finalize.
  - [ ] 3.1 Build once; run affected session, attention-browser and canonical attention tests. Include delayed/reordered HTTP/live confirmations, stale hash, peer edits, lost PATCH reply, readonly/offline states and scope cancellation. Assert protected metadata, exact body/title, caret/selection and own body Undo after metadata-only publication.
  - [ ] 3.2 Exercise the shipped server/editor in Chromium at 1280/390px with a disposable brain: edit then Settle, action Undo, Snooze/Bring back, another-note action and permission/scope changes. Extend the existing attention smoke/fault injector rather than create a second harness. State native/other-browser limits honestly.
  - [ ] 3.3 Run the focused frozen editor profile only if input/history/recovery behavior changes; preserve original observations and review any exact assertion deltas. Check the ordinary bundle/package budgets for the final change.
  - [ ] 3.4 Update owning docs and pending user-facing release notes, record tested source/results/limits, then archive and commit under [task completion](../../docs/task-workflow.md). No push, installation or release is implied.

## Acceptance

Current-note attention succeeds from acknowledged live state and preserves the
writing surface and own Undo. Failed/unconfirmed mutations and stale scope cannot
silently overwrite newer content or discard a private draft. Readers cannot
publish. Other-note and standalone HTTP behavior remain supported.

## Relevant files

- [Architecture map](../../src/architecture.docs.md), [session agreement](../../src/adapters/http-server/browser.docs.md#editor-session-consumer-agreement), [live lifecycle](../../src/adapters/live/live.docs.md) and `src/app/collaboration/collaboration.docs.md`.
- `src/adapters/http-server/{editor-session,live-editor-session,note-attention,collaboration-editor}.ts` — consumer agreement and current source owner.
- `src/adapters/http-server/document-controller.ts`, `src/app/server-memory/`, `src/app/collaboration/`, `src/core/attention.ts` — guarded metadata semantics/publication; inspect owners before deciding implementation.
- `test/{editor-session,note-attention-browser,note-attention}.test.js`, `scripts/note-attention-smoke.mjs`, `scripts/collaboration-smoke-transport.mjs` — reuse existing regressions and real transport scenarios.
