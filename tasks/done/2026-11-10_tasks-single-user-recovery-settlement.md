# Single-user recovery and settlement reports

## Completed — 2026-11-10

Fixed two reproducible current paths: clean active live notes can change attention through verified live metadata checkpoints, and proven-clean editors can load changed saved source after a backend epoch change without draft review. Old carets are explicitly retired when their positions are unproven. Private drafts, unknown writes, composition, protected metadata and authorization retain their safeguards. No exact historical November 2 cause is established, and no installed app or release was changed.

## Goal

Investigate the two November 2 reports of unexpected recovery/settlement prompts while working alone. Fix reproducible current paths, preserve unpublished drafts and truthful uncertainty, and test the shipped live editor end to end.

## Evidence and boundaries

- Starting snapshot: `6f41ac11b1dfc46c1066f028fbefa74c1c5f12f9`; clean working tree.
- [Settlement report, November 2 16:37 UTC](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=86d7e133-0af0-4f00-b2f3-b90ff6430366) and [recovery report, 17:01 UTC](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=39ed96b3-95a6-4c4a-bc1e-cbeb432ee7f9).
- [Prior review](../done/2026-11-03_tasks-usability-state-and-sidebar.md) could not establish historical causes from bounded diagnostics. [Clean saved-update fixes](../done/2026-11-05_tasks-quiet-agent-external-edits.md) address distinct reproduced paths.
- Canonical Markdown, actual live epoch/revision, pending-write uncertainty, durable private drafts, protected metadata and scoped authorization remain authoritative. No guessed merge, automatic draft discard or HTTP receipt masquerading as a live snapshot.
- Scope: task, investigation, implementation where reproduced, focused tests/Chromium, independent review, docs, archive and local commit. No release, installation, push or private-note mutation.

## Tasks

- [x] 1.0 Establish current behavior and historical evidence.
  - [x] 1.1 Read task/testing/product/architecture and prior recovery evidence.
  - [x] 1.2 Reinspect full messages/attachments and independently trace settlement and recovery; record limits.
  - [x] 1.3 Reproduce current failures and select the smallest safe behavior contract.
- [x] 2.0 Implement and verify.
  - [x] 2.1 Fix reproduced session/action integration with meaningful regression coverage.
  - [x] 2.2 Exercise single-user clean saved edits, settle/snooze/Undo/reactivate and continued typing through the shipped live shell.
  - [x] 2.3 Protect pending/uncertain drafts, genuine overlaps, read-only/scope transitions and failed metadata writes.
  - [x] 2.4 Build, run focused deterministic/integration/Chromium checks, obtain independent review and address findings.
- [x] 3.0 Finalize.
  - [x] 3.1 Update owning contracts, per-email outcomes/follow-up, pending release notes and required changelog; retain historical uncertainty. No new glossary term needed.
  - [x] 3.2 Record outcome, tested snapshot/checks/limits, archive, repair references and commit scoped changes.

## Initial findings

- Active-note attention calls `acceptMetadata` before its PATCH. The shipped live session always returns false by design because HTTP metadata lacks an epoch/revision. This deterministically emits the settlement report's wording even for a clean matching note. The same unsupported call after PATCH would also reject. Existing metadata unit coverage uses the standalone HTTP editor.
- A real disposable HTTP/WebSocket Chromium reproduction independently confirmed clean Saved active-note Settle emits the exact error, sends zero PATCHes and preserves canonical bytes. New session-level metadata confirmation regression also fails against original `dist/` (`false !== true`).
- A second current path: changed canonical body in a new backend epoch conflicts even when the rendered/controller source was fully saved. Existing test around `collaboration-editor.test.js:421` explicitly expected that prompt. The fix must distinguish clean source from a private draft and retire an unproven old caret instead of guessing its position.
- Diagnostic reinspection confirms prior limitations. Both reports identify app/host 0.3.17 at build `6c0762ec59d5751f`. The 16:37 report's attachment was generated at 16:36:57 UTC but retained events only from 13:04–13:07: 26 distinct server search 503s and one pending index event, no attention/recovery event. The 17:01 report's attachment retains 16:57–16:58 events: 19 distinct server search 503s, one browser search abort, one unconfirmed/conflict save. Respectively 235/314 events were omitted, with other dropped/coalesced evidence. Neither proves source, restart, overlapping edits, lost receipt or failed input proof. No exact historical cause is claimed.

## Implementation contract

- Active-note attention confirms metadata asynchronously through actual live snapshots, never `resolveConflict`, forced draft adoption or an HTTP-supplied revision. Permit a matching live checkpoint arriving before the HTTP response; refuse stale receipts and recheck scope/draft/permission after awaits.
- A fully proven clean source may adopt changed canonical text after an epoch change with explicit caret retirement. Dirty, unconfirmed, in-flight, composing, unreported rendered input and actual conflicting drafts retain recovery safeguards.

## Relevant files

- `src/adapters/http-server/note-attention.ts`, `editor-session.ts`, `live-editor-session.ts` — consumer/session boundary.
- `src/adapters/http-server/collaboration-editor.ts` — source acknowledgement and draft protection.
- `scripts/single-user-recovery-settlement-smoke.mjs`, `scripts/simple-recovery-smoke.mjs`, `scripts/stale-note-editing-smoke.mjs`, `test/collaboration-editor.test.js`, `test/note-attention-browser.test.js`, `test/editor-session.test.js` — focused checks.

## Verification

- The new metadata confirmation test and changed-epoch test fail against original compiled code, confirming regression sensitivity. The new production browser journey also reproduces the active-note Settle failure before PATCH against that baseline.
- `npm run build` passed on the combined source. Editor bundle: 672,382 bytes minified / 222,201 gzip, under the unchanged 223,250-byte gzip ceiling. Optional desktop extensions: 15,513 / 5,669 bytes.
- `node --test test/editor-session.test.js test/note-attention-browser.test.js test/note-attention.test.js test/editor-source-map.test.js test/editor-markdown.test.js test/lexical-bundle.test.js`: 52 passed, no failures/skips.
- Worker `node --test test/collaboration-editor.test.js`: 24 passed, no failures/skips. Covers changed-epoch clean adoption and private body/title/uncertain/unreported source protection, composition/captured intent, and observational refresh races.
- Independent review found no blocking source/test findings.
- `npx --package=playwright node scripts/single-user-recovery-settlement-smoke.mjs`: worker run passed 12 checkpoint groups at 1280/390px using a real disposable HTTP/WebSocket shell. Covers active edited Settle/Undo; HTTP-before-checkpoint and checkpoint-before-HTTP; Snooze/Bring back, typing/Undo; held body event plus receipt before attention; HTTP 412 preservation; actual backend restart with changed source, interior/EOF caret retirement and no implicit writes; fresh input/Undo; genuine failed private draft retained and blocking settlement.
- Initial smoke attempts exposed fixture-only issues: keyboard focus needed to reveal the row action, and canonical YAML quoting required semantic metadata comparison. Corrected fixture assertions while retaining exact snapshot/canonical byte checks; no production workaround.
- `npx --package=playwright node scripts/simple-recovery-smoke.mjs`: 10 checkpoint groups passed at 1280/390px, including genuine private review, both choices, stale comparison protection, busy save, failed reads, full-copy fallback and reader restrictions.
- `npx --package=playwright node scripts/stale-note-editing-smoke.mjs`: all 40 input scenarios passed across idle (including actual 35-second input idle), reconnect, identical-source restart and disjoint external append. Exact operations, canonical persistence/reload, selective Undo/Redo and original caret positions remain correct. Separate held overlapping raw edit retained exact canonical bytes and durable private input; continued conflict typing sent no guessed replacement and preserved the first recovery reason.
- `git diff --check`, script syntax and updated local Markdown references passed. Tested snapshot is starting `6f41ac1` plus this task's scoped production changes; no production source changed after the successful build. The primary agent implemented session/attention integration and ran build, 52 focused tests and both existing Chromium regressions; workers implemented/retested collaboration changes and the new end-to-end regression. Independent diagnostic/source reviews found no blocking issue. No broad suite/eval was justified by this bounded change.

## Remaining limits

- Covered email outcomes mean reproduced current behavior has implementation and verification evidence, not proof that the historical events had these causes. Bounded old reports remain causally unresolved; reopen on a fresh matching symptom with current finite diagnostic reasons.
- Real disposable local HTTP/WebSocket Chromium checks at desktop/narrow widths exercise the shared Mac/browser editor. Native Mac lifecycle/OS sleep, physical IME/accessibility, other browser engines, a live VPS and arbitrary-corpus performance were not tested. No native boundary or protocol mutation was introduced.
- No installation, release, push, personal-memory write or private raw report was added. Pending release notes describe source fixes completed after v0.3.21.
