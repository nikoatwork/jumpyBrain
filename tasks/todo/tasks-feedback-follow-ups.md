# Remaining feedback follow-ups

Canonical owner for the residual email items below. [Email index](../feedback.md) records which messages have been reviewed; reading is not resolution. This list records follow-up scope, not authorization to implement every item now. Existing specialist lists retain their own broader unfinished work.

## Reproduce and investigate

- [x] **P1 — CLI-authored Markdown in the Mac editor.** [Completed source and CLI-to-shell verification](../done/2026-11-05_tasks-feedback-markdown-rendering.md). Ordinary top-level bullets now render supported emphasis and safe HTTP(S) links; simple relative links stay editable/inert without making the whole line literal. Canonical CRLF edits/Undo/live caret/reopen pass. Ordinary nested/ordered lists and unsupported syntax retain literal fallback.
- [x] **P1 — Guidance for concurrent human/agent edits.** [Completed source and end-to-end verification](../done/2026-11-05_tasks-feedback-concurrent-guidance.md). Initial/write/help/managed skill and recommended workspace text now prefer authorized collaboration without asking the user to stop typing. Actual read-base, stable client identity, resync and uncertain-write safeguards remain. Existing user-authored/installed integrations are unchanged.
- [x] **P1 — Updater readiness error.** [Completed controlled reproduction and fix](../done/2026-11-05_tasks-feedback-updater-readiness.md). Failed manual/startup discovery no longer revives old preparation offers; readiness requires a newer target and stale actions preserve current state. Real UI/bridge failure/retry, packaged replacement/preservation and forced-relaunch rollback passed. The original November 4 network cause remains unproven.
- [ ] **P1 — Historical single-user recovery/settlement reports.** [November 2, 16:37](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=86d7e133-0af0-4f00-b2f3-b90ff6430366) and [17:01](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=39ed96b3-95a6-4c4a-bc1e-cbeb432ee7f9). Both attachments were inspected in [usability/state work](../done/2026-11-03_tasks-usability-state-and-sidebar.md); historical causes remain unconfirmed. Reproduce from new diagnostic evidence if the symptom recurs. [Calmer recovery](../done/2026-11-05_tasks-quiet-agent-external-edits.md) fixes distinct reproduced paths and simplifies choices; it is not proof these older events were resolved.

## Deferred, already reviewed

- [ ] **P2 — Written-date versus edited-date presentation.** Secondary observation in the [November 5 search report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=e34678a8-5a2a-4a05-b2a8-fdb0ccb8a72b). [Exact-title search](../done/2026-11-05_tasks-exact-title-app-search.md) is fixed in source; this date-label question is separate. Preserve creation/writing provenance and evidence-date meaning; assess whether an explicit last-edited label is needed rather than replacing history with modification time.
- [ ] **P2 — Related-note hover snippets.** [October 28 report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=de085efa-7ab8-4f6e-b7b6-d203c6a5469b). Two-line preview request remains deferred; stable related links are already a separate completed fix.
- [ ] **P2 — Remove the insert-page-reference control.** [October 28 report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=9ad52cc5-e7ab-4336-b148-17f203e38ed8). The current plus-icon control is quieter but was not removed. Revisit discoverability alongside existing @/link workflows before changing it.
- [ ] **P2 — Further simplify deletion confirmation.** [October 28 follow-up](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=33dd30f2-bd06-4c63-a569-ac0c3abc4aa3). [Earlier copy reduction](../done/2026-10-27_tasks-note-delete-copy.md) does not close this later repeated-warning report; assess the current dialog before another change.

## Existing owners, without duplicate checklists

- [Runtime hygiene](../done/2026-11-08_tasks-desktop-runtime-hygiene.md): implementation finalized with packaged launch checks and explicit storage/platform limits. Exact historical macOS 26 failure remains unverified; reopen on a matching failure or new diagnostics.
- [Hosted build/operations](tasks-hosted-build-and-operations.md): actual systemd-manager validation remains open after container/proxy/restore work.
- [Portable installation](tasks-portable-installation-project-integration.md): remaining compiler/platform/payload and project-integration work.
- [Workspace retrieval evaluation](tasks-workspace-retrieval-evaluation.md): broader quality work; prior semantic candidates were rejected, not shipped as ranking fixes.
- [Properties and saved views](tasks-properties-and-saved-views.md): deferred richer metadata/view proposals. Wider workflow/product ideas retain the [completed discovery decisions](../done/2026-11-02_tasks-feedback-product-discovery.md).

No raw private messages or attachments are stored here. Priorities are triage judgments, not confirmed causes or release promises. Finish each retained fix under [task workflow](../../docs/task-workflow.md), then update its email-index outcome and owner link.
