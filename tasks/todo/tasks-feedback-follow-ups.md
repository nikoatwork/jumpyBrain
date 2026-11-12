# Remaining feedback follow-ups

Canonical owner for the residual email items below. [Email index](../feedback.md) records which messages have been reviewed; reading is not resolution. This list records follow-up scope, not authorization to implement every item now. Existing specialist lists retain their own broader unfinished work.

## Reproduce and investigate

- [x] **P1 — Local editor fenced after long idle (Nov 12).** [Completed in source](../done/2026-11-12_tasks-idle-session-recovery.md): dropped coordinator requests now reconnect the same tab automatically (backoff, focus/visibility/online) without reload or draft loss; authorization failures keep the hard fence. Real sleep/wake on packaged Electron is untested. Pending release.

- [x] **P1 — Keychain access key lost after every app update (Nov 11).** [Completed in source](../done/2026-11-12_tasks-env-file-credentials.md): keys now live in the owner-only `~/.config/jumpybrain/.env`, shared with the CLI, and survive updates; Keychain code removed. Existing remote connections need their key re-entered once. Not run across a real packaged update. Pending release.

- [x] **P2 — Relative note links in agent-authored metadata lines (Nov 11).** [Completed in source](../done/2026-11-12_tasks-relative-note-links.md) (owner chose option 1): `[label](../x.md)` and bare `[label](folder/x.md)` links open the resolved note by click or Tab then Enter in any rendered line; other relative links stay inert. Pending release.

- [ ] **P2 — Nested checkboxes after Obsidian import.** Reproduce with a disposable imported source containing nested checked and unchecked tasks. Establish whether import, canonical Markdown, or the Mac editor loses hierarchy/state; preserve source bytes and avoid treating an unsupported construct as success.

- [ ] **P1 — CLI whole-note updates around an open live editor.** Reproduce the reported hash-guarded append against a remote shared brain with active human presence. Determine why a successful `update` remains stale in the session and is classified as destructive, before deciding whether to route/warn/offer a bounded append operation. Preserve canonical bytes, drafts and revision/hash safeguards; do not auto-retry a potentially committed write.

- [x] **P2 — Repeated stale-index warnings in Mac search.** [Quiet maintenance presentation completed](../done/2026-11-10_tasks-quiet-search-freshness.md): repeated Search use no longer dispatches maintenance toasts; scoped recovery controls and real query/reindex errors remain. Desktop/narrow Chromium and existing automatic-publication checks pass. The November 8 attachment was inspected; historical HTTP 503 causes remain unproven. This source fix was completed after v0.3.21 and is pending release.

- [x] **P1 — CLI-authored Markdown in the Mac editor.** [Completed source and CLI-to-shell verification](../done/2026-11-05_tasks-feedback-markdown-rendering.md). Ordinary top-level bullets now render supported emphasis and safe HTTP(S) links; simple relative links stay editable/inert without making the whole line literal. Canonical CRLF edits/Undo/live caret/reopen pass. Ordinary nested/ordered lists and unsupported syntax retain literal fallback.
- [x] **P1 — Guidance for concurrent human/agent edits.** [Completed source and end-to-end verification](../done/2026-11-05_tasks-feedback-concurrent-guidance.md). Initial/write/help/managed skill and recommended workspace text now prefer authorized collaboration without asking the user to stop typing. Actual read-base, stable client identity, resync and uncertain-write safeguards remain. Existing user-authored/installed integrations are unchanged.
- [x] **P1 — Updater readiness error.** [Completed controlled reproduction and fix](../done/2026-11-05_tasks-feedback-updater-readiness.md). Failed manual/startup discovery no longer revives old preparation offers; readiness requires a newer target and stale actions preserve current state. Real UI/bridge failure/retry, packaged replacement/preservation and forced-relaunch rollback passed. The original November 4 network cause remains unproven.
- [x] **P1 — Single-user recovery/settlement investigation and reproduced fixes.** [Completed investigation and verification](../done/2026-11-10_tasks-single-user-recovery-settlement.md) fixes active-live-note attention falsely rejecting clean metadata and clean changed-source backend restart unnecessarily requiring recovery. Current-note Settle/Snooze/Bring back/Undo, both receipt orders, caret retirement, continued typing and protected drafts pass. Both November 2 attachments were reinspected; their exact historical causes remain unconfirmed. Source fixes are pending release; reopen on recurrence with new diagnostics rather than treating unrelated historical failures as proven resolved.

## Four UI follow-ups

- [x] **P2 — Written-date versus edited-date presentation.** [Implemented in source](../done/2026-11-10_tasks-four-ui-requests.md): explicit Edited search ages and separate Written/Last edited saved-note facts. Creation and evidence dates retain their meaning. Source change pending release.
- [x] **P2 — Related-note hover snippets.** [Implemented in source](../done/2026-11-10_tasks-four-ui-requests.md): two-line text-only hover/keyboard previews with bounded on-demand reads and brain/navigation fencing. Source change pending release.
- [x] **P2 — Remove the insert-page-reference control.** [Implemented in source](../done/2026-11-10_tasks-four-ui-requests.md): toolbar Link button removed; inline `[[` completion and companion `@` insertion remain. Source change pending release.
- [x] **P2 — Further simplify deletion confirmation.** [Implemented in source](../done/2026-11-10_tasks-four-ui-requests.md): Delete note?, note title, one irreversible-removal warning and Cancel/Delete actions. Guarded preview/hash/save checks remain. Source change pending release.

## Existing owners, without duplicate checklists

- [Runtime hygiene](../done/2026-11-08_tasks-desktop-runtime-hygiene.md): implementation finalized with packaged launch checks and explicit storage/platform limits. Exact historical macOS 26 failure remains unverified; reopen on a matching failure or new diagnostics.
- [Hosted build/operations](tasks-hosted-build-and-operations.md): actual systemd-manager validation remains open after container/proxy/restore work.
- [Portable installation](tasks-portable-installation-project-integration.md): remaining compiler/platform/payload and project-integration work.
- [Workspace retrieval evaluation](tasks-workspace-retrieval-evaluation.md): broader quality work; prior semantic candidates were rejected, not shipped as ranking fixes.
- [Properties and saved views](tasks-properties-and-saved-views.md): deferred richer metadata/view proposals. Wider workflow/product ideas retain the [completed discovery decisions](../done/2026-11-02_tasks-feedback-product-discovery.md).

No raw private messages or attachments are stored here. Priorities are triage judgments, not confirmed causes or release promises. Finish each retained fix under [task workflow](../../docs/task-workflow.md), then update its email-index outcome and owner link.
