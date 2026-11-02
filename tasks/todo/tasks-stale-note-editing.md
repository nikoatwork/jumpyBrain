# Reliable editing after a note has been idle

Priority: P0 — ordinary editing can leave an unpublished draft. Status: active investigation; installed build identified, current-source disposable matrix passes; the reported idle failure remains unclassified.

## Goal

Deleting text from a note left open for a while should save normally when its source is unchanged. If the source changed or the edit cannot be proven, preserve the draft and offer clear recovery without guessing a replacement.

## Evidence and boundaries

- [Direct user report, 2026-11-02 09:32 UTC](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=c85a4812-1f2f-4e79-bdc9-73c5684890f0): deleting existing text after an idle period failed source-range mapping, with no reported intervening agent edits. Idle duration, exact selection/input and installed build are unknown.
- The report includes diagnostic attachment metadata; its contents were not downloaded or inspected during triage. Do not put private notes or raw diagnostics in Git.
- [Fresh-note deletion](../done/2026-11-02_tasks-fresh-note-edit-feedback.md) is fixed in source at `11f9951`; Git history was checked during triage. That does not establish an installed or published fix for the reporter.
- The existing fresh-note outcome and calm error presentation do not establish that idle-note mapping is fixed. Establish the reporter's installed build and compare it with current source before choosing a change.

## Relevant files

- `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md`, `src/app/collaboration/collaboration.docs.md` — ownership and source/draft contracts.
- `src/adapters/http-server/lexical-editor.ts`, `src/adapters/http-server/collaboration-editor.ts` — input proof, selection mapping and source reconciliation.
- `scripts/fresh-note-feedback-smoke.mjs`, `scripts/collaboration-editor-smoke.mjs` — existing real editor regression paths.
- `scripts/stale-note-editing-smoke.mjs` — disposable existing-note lifecycle/input matrix and overlapping-write retention proof.

## Tasks

- [/] 1.0 Reproduce and classify the failure.
  - [/] 1.1 Record exact source/build, backend epoch, note revision, input/selection and elapsed idle period using disposable notes. Current-source matrix records these; reporter sequence and artifact reproduction remain unavailable.
  - [/] 1.2 Exercise deletion by Backspace/Delete, selected text and selection across paragraphs, including existing empty blocks. Disposable cases pass; no cause established for the report.
  - [x] 1.3 Inspect the report's diagnostic attachment through the documented read-only API; sanitized findings and missing evidence are recorded below.
- [ ] 2.0 Repair the proven failure at its owning seam.
  - [ ] 2.1 Refresh/reconcile invalid derived editor state before accepting a provable input; preserve source operation identity and exact publication semantics.
  - [x] 2.2 Verified existing private-draft/first-failure retention on a genuine overlapping external write; no mapping proofs or replacement policy changed.
- [/] 3.0 Verify and finalize.
  - [/] 3.1 Added disposable idle/lifecycle/input matrix with exact bytes, reload and real-conflict draft checks; reporter's actual sequence remains unknown.
  - [x] 3.2 Focused source/selection tests and real editor/collaboration smokes passed on disposable roots; packaged-Mac coverage is absent and recorded below.
  - [/] 3.3 Owning docs, evidence and checks recorded; release notes/changelog unwarranted. Commit the investigation increment; keep this list active until diagnosis/repair complete under [task completion](../../docs/task-workflow.md).

## Investigation evidence — 2026-11-02

- Source baseline: `a2a90cf`, package 0.3.17, computed browser/runtime source fingerprint `833414faf5489833`; this includes `11f9951`. No new runtime change is justified by this investigation yet.
- Read-only inbox check at 09:57:41 UTC covered received reports since 2026-11-02 00:00 Europe/Berlin (one page, complete). Retrieved the selected report's 21,320-byte diagnostic attachment through the authenticated message/attachment API; kept raw data and credentials out of Git. No message or feedback was sent.
- Attachment identifies version 0.3.17, app and host fingerprint `6c0762ec59d5751f`, macOS, Electron 44.10.0, companion mode and a connected note view. Recomputing the repository build algorithm over release `48e2e59` gives that same fingerprint; the source input fingerprint is consistent with the release before `11f9951`, not current source. This is not a binary/package integrity check or proof that the report is the fresh-note bug.
- The attachment was generated at 09:31:33.564 UTC, before message receipt at 09:32:03.933 UTC. It contains no save/source-mapping conflict event. It records 215 omitted events, gateway/server drops and truncated inputs, and current-tab-only browser history. Earlier gateway `stale_generation` events do not establish the later edit's cause. Note content, selection, revision/epoch, actual idle duration and reconnect sequence are absent.
- New disposable production-shell runner: `scripts/stale-note-editing-smoke.mjs`. It records actual source epoch/revision, DOM selection, elapsed input idle and outgoing operations. The matrix includes Backspace, forward Delete, selected text, selection across paragraphs containing empty blocks and removal of an empty paragraph; each runs after unchanged observation, socket reconnect, identical-source backend restart and disjoint external append. Canonical file bytes, reload and actor Undo/Redo are checked. A separate real overlapping external-write case checks private-draft durability and retention of the first failure while typing.

## Validation and remaining work

Tested source: `a2a90cf` plus the scoped runner/docs; no runtime-source/version/dependency changes. Existing dependencies were copied into this isolated worktree without installation.

- `npm run build` — passed; editor gzip 219,948 bytes and 15 bundled license notices.
- `node --test test/editor-source-map.test.js test/editor-markdown.test.js test/collaboration-editor.test.js test/collaboration-model.test.js test/collaboration-history.test.js test/lexical-bundle.test.js` — passed, 48 tests.
- `npx --no-install --package=playwright node scripts/fresh-note-feedback-smoke.mjs` — passed at desktop/mobile widths.
- `npx --no-install --package=playwright node scripts/collaboration-editor-smoke.mjs` — passed, including two-context convergence, selective Undo, real external/agent writes, offline body/title recovery, changed-source restart recovery, actual positional intent and actor churn.
- `npx --no-install --package=playwright node scripts/stale-note-editing-smoke.mjs` — passed all 20 lifecycle/input cases plus the genuine overlapping-write retention case. Outgoing source intervals are asserted against explicit fixture coordinates.
- `node --check scripts/stale-note-editing-smoke.mjs`, `git diff --check`, staged guard — passed.

The final matrix passed all 20 cases: one measured 35,020 ms input idle and four roughly 2.1-second unchanged-observation cases; reconnect/restart/disjoint-external cases completed in roughly 0.3–0.5 seconds. Idle input still allows live presence heartbeats; this does not reproduce OS sleep, hidden-tab suspension, long disconnected history eviction, or the unknown reporter timing. The genuine overlapping-write case also passed. During fixture development, a wait incorrectly expected conflict before releasing its held input; the final fixture instead waits for the actual external canonical event before releasing the old input. No runtime change resulted.

Remaining required work: reproduce the reporter's actual failure with its source/build and selection/lifecycle sequence, classify it, then retain a runtime fix only with that regression proof. If the reporter reproduces only on the older installed build, verify a matching packaged current build before concluding `11f9951` covers it. No matching packaged-Mac artifact was supplied here; Electron/physical keyboard/IME/OS lifecycle checks have not run. Chromium loopback tests do not establish packaged-Mac behavior.

This task remains active because diagnosis and any warranted repair are incomplete. No pending release-note or changelog entry is warranted for an inconclusive investigation and regression tooling alone. Parent owns integration/combined checks; no push, installation, release, deployment or feedback reply occurred.

## Blockers

- Parent reran the full 20-case stale-note matrix and real gateway flows on the [integrated source](../done/2026-11-02_tasks-feedback-parallel-integration.md), with all 1,828 deterministic/real-QMD tests passing. Those current-source results do not supply the missing reporter sequence or packaged-Mac evidence described below.

- The report omits exact note shape, selection/input, elapsed idle and connection/suspension sequence. Its diagnostic attachment lacks the mapping event. Current-source reproduction has not failed; a new causal runtime repair would be speculative.
- No matching current packaged-Mac artifact was supplied or built in this lane. Installed build evidence predates the source fix; matching packaged validation remains required before declaring the user report resolved.
