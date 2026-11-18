# Remaining feedback follow-ups

Canonical owner for the residual email items below. [Email index](../feedback.md) records which messages have been reviewed; reading is not resolution. This list records follow-up scope, not authorization to implement every item now. Existing specialist lists retain their own broader unfinished work.

## Reproduce and investigate

- [x] **P2 — Remote authentication diagnosis (Nov 12).** [Completed in source](../done/2026-11-13_tasks-remote-auth-diagnostics.md): 401/403 errors name the key's source and a non-secret fingerprint, list shadowed keys, precedence and the admin reissue path; `status --target-url` reports the accepted key. Server-redeploy key loss remains unproven. Pending release.

- [x] **P1 — Local editor fenced after long idle (Nov 12).** [Completed in source](../done/2026-11-12_tasks-idle-session-recovery.md): dropped coordinator requests now reconnect the same tab automatically (backoff, focus/visibility/online) without reload or draft loss; authorization failures keep the hard fence. Real sleep/wake on packaged Electron is untested. Released in v0.3.24.

- [x] **P1 — Keychain access key lost after every app update (Nov 11).** [Completed in source](../done/2026-11-12_tasks-env-file-credentials.md): keys now live in the owner-only `~/.config/jumpybrain/.env`, shared with the CLI, and survive updates; Keychain code removed. Existing remote connections need their key re-entered once. Not run across a real packaged update. Released in v0.3.24.

- [x] **P2 — Relative note links in agent-authored metadata lines (Nov 11).** [Completed in source](../done/2026-11-12_tasks-relative-note-links.md) (owner chose option 1): `[label](../x.md)` and bare `[label](folder/x.md)` links open the resolved note by click or Tab then Enter in any rendered line; other relative links stay inert. Released in v0.3.24.

- [x] **P2 — Nested checkboxes after Obsidian import.** [Completed in source](../done/2026-11-13_tasks-checkbox-rendering.md): import already preserved bytes; the editor now renders tab/four-space nested task lists with exact toggles. One indentation unit per note; ordered `1. [ ]` stays literal. Pending release.

- [x] **P1 — CLI whole-note updates around an open live editor (Nov 10).** [Verified in source](../done/2026-11-18_tasks-cli-live-note-updates.md): guarded appends with routine metadata changes reach both open viewers without false destructive recovery. Deliberate replacement retains the prior version. The historical stale-view report remains unconfirmed. Pending release.

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

- [x] [New-note false conflict](../done/2026-11-17_tasks-new-note-false-conflict.md): Nov 17, P1. Cutting the starter heading now saves in the shared editor. Genuine external changes still trigger recovery. Chromium verified the fix. Pending release.
- [x] [Graph hover flicker](../done/2026-11-18_tasks-graph-hover-flicker.md): Nov 17, P2. Dense graph labels stay steady under the pointer. Verified in Chromium with focus and label clicks preserved. Pending release.
- [ ] [Hosted index location](tasks-hosted-index-location.md): Nov 17 (two emails), proposed P2. Network storage for canonical files and a smaller hosted image.
- [ ] [Org MCP access](tasks-org-mcp-access.md): Nov 17, proposed P2. Needs a product decision on the CLI-only rule before building.
- [ ] [Page backlinks](tasks-page-backlinks.md): Nov 14, proposed P2. Show notes linking to a page and open the graph centred on it.

- [x] [Shared-brain admission and errors](../done/2026-11-14_tasks-shared-brain-admission-errors.md): completed in source. 429/503 refusals are explained consistently with an optional validated delay, `--json` memory/recipe/board failures print one JSON error object, the companion forwards a valid `Retry-After`, and nothing retries automatically. The historical deployment policy remains unverified. Pending release.
- [x] [Sidebar request reduction](../done/2026-11-14_tasks-sidebar-request-reduction.md): completed in source. Opening a window now costs 7 HTTP requests instead of 17 (attention read once, previews sent with it); two windows on the shared test brain went from 32 to 14. Idle polling is unchanged. Pending release.
- [Legacy managed upgrades](../done/2026-11-14_tasks-legacy-managed-upgrade.md): Nov 10 upgrade/migration implemented and verified 2026-11-14; broader distribution and project integration remain separate.

- [Runtime hygiene](../done/2026-11-08_tasks-desktop-runtime-hygiene.md): implementation finalized with packaged launch checks and explicit storage/platform limits. Exact historical macOS 26 failure remains unverified; reopen on a matching failure or new diagnostics.
- [Hosted build/operations](tasks-hosted-build-and-operations.md): actual systemd-manager validation remains open after container/proxy/restore work.
- [Portable installation](tasks-portable-installation-project-integration.md): remaining compiler/platform/payload and project-integration work.
- [Workspace retrieval evaluation](tasks-workspace-retrieval-evaluation.md): broader quality work; prior semantic candidates were rejected, not shipped as ranking fixes.
- Properties and saved views: dropped 2026-11-14 and the list deleted; boards cover the need. Wider workflow/product ideas retain the [completed discovery decisions](../done/2026-11-02_tasks-feedback-product-discovery.md).

No raw private messages or attachments are stored here. Priorities are triage judgments, not confirmed causes or release promises. Finish each retained fix under [task workflow](../../docs/task-workflow.md), then update its email-index outcome and owner link.
