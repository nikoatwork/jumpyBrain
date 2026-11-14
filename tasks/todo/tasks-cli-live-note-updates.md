# Make guarded CLI updates coherent with live editors

Priority: P1. Status: investigated and planned on 2026-11-14; implementation and browser reproduction remain open.

## Goal

A supported, hash-guarded document update must become the same canonical state observed by connected human editors. Distinguish deliberate supported writes from uncoordinated external replacements without losing drafts, source-position safeguards or retained versions of genuinely destructive changes.

## Evidence and current findings

Inspected HEAD `bfeb0a1533e1ac60ae8b24eaa1fdc7090ea8b3da` (v0.3.25). [November 10 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=d467c485-e2c9-4db0-8833-92634c6e13d9) reports v0.3.22: successful remote `show` → hash-guarded `update`, new bytes visible to CLI reads, two app viewers remaining stale, and destructive-replacement recovery after an intended append. Those observations are separate claims; the historical stale-view cause is unproven.

- **Updates already join live publication observation.** [HTTP PUT](../../src/adapters/http-server/routes.ts), document-update branch around line 553, calls `beforeLegacyWrite`, writes, then `notifyCanonicalWrite` inside the existing shared queue. [Local backend RPC](../../src/adapters/http-server/index.ts), around lines 183–192, applies the same guard/notification. [Hub refresh](../../src/app/collaboration/index.ts), around lines 1430–1506, adopts canonical bytes and emits snapshots. A warning that supported updates inherently cannot appear live would be inaccurate.
- **A concrete false classification reproduces.** `refresh` treats any replaced body **or prefix** bytes as destructive. [Document merge](../../src/core/document-update.ts), `mergeMemoryDocumentUpdate`, rewrites frontmatter, updates `updated_at` and stamps attribution. A disposable guarded pure-append probe with existing `updated_at` and declared agent metadata returned the correct appended body to both hub read and subscription, while adding `external_destructive_replacement`. This establishes a current classification problem, not the feedback's entire failure chain.
- **Body and metadata may advance separate revisions.** The probe advanced revision 0 → 2; the final snapshot does not alone contain the body operation. [Editor reconciliation](../../src/adapters/http-server/collaboration-editor.ts), `canonicalHistory`/`acceptNow`, already reads contiguous history when needed. Reproduce this path through actual remote CLI and two Chromium viewers before changing delivery or history behavior.
- **Simple append already exists.** [CLI stream](../../src/cli/collaborate.ts), `stream.start` around line 310, defaults to the current saved body's end when `--start` is absent. The existing read-base/version contract and stream lifecycle support this without UTF-16 offset calculation. Prefer documenting and testing that route before adding an `append` command.
- [Prior quiet-update work](../done/2026-11-05_tasks-quiet-agent-external-edits.md) verified CLI updates, retained comparisons and continued typing in disposable local Chromium. It does not establish remote two-viewer behavior or explain this later report. [Collaboration ownership and recovery](../../src/app/collaboration/collaboration.docs.md) remain the governing contracts.

## Recommended direction and boundaries

Keep one app publication queue for local and hosted use. First prove supported updates reach both remote viewers, then fix only demonstrated delivery/reconciliation failures. Presence is advisory; it must neither authorize a write nor make the result depend on an exact viewer count.

Give the existing guarded-write boundary explicit, internal before/after evidence of a successful supported publication. Use that evidence to distinguish writer-managed timestamp/attribution/serialization changes from loss of meaningful user content. Preserve conservative raw-file observation and ambiguity-aware body alignment. A matching hash proves the document version selected for replacement; it does not prove append intent, exact operation positions, absence of meaningful metadata removal, or safety of arbitrary replacement. Classifying recovery must remain separate from positional provenance and live save confirmation.

Prefer a small extension of existing guard/notification seams over a new diff-to-operations API, duplicate writer or transport. If inspection shows an equally safe smaller change, record that choice before implementation. Do not globally ignore timestamp/metadata changes from untrusted raw writers. Deliberate body replacement and meaningful metadata removal retain the existing recovery policy unless a separately documented supported-write contract justifies changing it.

Non-goals: a new collaboration protocol, general merge engine, append alias, presence-based permission prompt, automatic replay, forced reload, background prompt injection, or a broad rewrite of collaboration history. Preserve explicit remote write authorization, protected identity fields, hash/read-base checks, bounded resource use and Markdown authority.

## Acceptance criteria

- A guarded append through the remote CLI reaches two connected clean Chromium viewers without switching notes or re-publishing. Their source and canonical bytes agree; reconnect/reopen returns the same state. Capture a bounded delivery deadline in the fixture and report failures explicitly.
- Routine managed metadata changes accompanying an append do not create a misleading destructive transition. Genuine body removal/replacement and meaningful metadata loss remain covered by deterministic positive controls; equivalent raw-file changes retain conservative recovery behavior.
- Concurrent independent human typing survives and stays editable with correct caret/Undo. An overlapping or unprovable draft is retained with an explicit recoverable state; a silently stale clean view is unacceptable.
- Stale hashes reject before publication. Lost response/event confirmation remains uncertain and never causes automatic re-publication or duplicate appended text. Reader/device read-only policy cannot be bypassed.
- Entry guidance gives a short stdin-to-`collaborate stream` append example, keeps `show/update` for intentional complete replacement, and claims no receipt of human viewing from a canonical save alone.

## Tasks

- [ ] 1.0 Establish current delivery behavior with a minimal disposable reproduction.
  - [ ] 1.1 Add a deterministic regression for guarded append with existing `updated_at`, attribution and ordinary protected/custom metadata; capture canonical hash, emitted revision/history and recovery classification.
  - [ ] 1.2 Extend the existing Chromium CLI-update scenario to two viewers using a loopback hosted target and real `--target-url` CLI commands. Reproduce a clean append, metadata-only update and deliberate replacement; inspect RPC, document events, history and rendered source separately.
  - [ ] 1.3 Repeat only the affected path with one viewer typing and with delayed/lost response or document event via the existing fault injector. Record whether stale rendering reproduces and the first failed contract. Do not infer a historical cause from the classification probe.
- [ ] 2.0 Correct supported-write classification at the shared publication boundary.
  - [ ] 2.1 Choose the smallest explicit handoff of guarded before/after publication evidence, shared by HTTP PUT and local backend document update. Keep app policy in the collaboration app and transport routes thin; preserve guards and canonical-save outcome if later bookkeeping fails.
  - [ ] 2.2 Prevent routine supported metadata normalization from turning an append into destructive recovery. Retain actual body/metadata loss and raw-write controls; do not derive positional identity or safe rebasing merely from hash match or text inclusion.
  - [ ] 2.3 Add deterministic cases for pure append, repeated text, CRLF/non-BMP text, unchanged update, managed metadata rewrite, custom metadata deletion, title change, body replacement, raw metadata rollback, stale hash, and publication failure. Select relevant cases rather than constructing a new matrix framework.
- [ ] 3.0 Repair any reproduced delivery or reconciliation defect.
  - [ ] 3.1 If task 1 reproduces stale rendering, repair its earliest failing existing seam and retain a regression. In particular, verify body-plus-metadata revision gaps and `history.read` continuity before altering event framing.
  - [ ] 3.2 If no stale-view defect reproduces, record tested scope and remaining historical uncertainty; complete the confirmed classification fix without inventing a delivery rewrite. Preserve explicit draft/conflict feedback and optional retained-version review.
- [ ] 4.0 Verify and document the supported workflow.
  - [ ] 4.1 Build once with `npm run build`; run the changed cases in `test/collaboration-hub.test.js` and `test/collaboration-http-races.test.js`. Add the relevant `test/collaboration-editor.test.js` or `test/collaboration-cli-read-base.test.js` cases only when those behaviors change.
  - [ ] 4.2 Run the extended `npx --package=playwright node scripts/ux-update-feedback-smoke.mjs` scenario in Chromium, asserting exact canonical/source/draft bytes, continued typing, caret/Undo and reopen. Use the applicable fault-injected case from [testing](../../docs/testing.md#live-editing-and-websocket-scenarios) for changed uncertainty behavior; no default full suite, soak or native-app gate for a shared-editor-only change.
  - [ ] 4.3 Update [collaboration](../../docs/collaboration.md), [CLI instructions](../../src/cli/instructions.ts), CLI help and nearest owning module docs only where contracts/examples change. Reuse existing append streaming and generated-integration coverage; do not silently rewrite installed user instructions.
  - [ ] 4.4 Record tested snapshot, outcomes and remaining limits; update this report's [email index](../feedback.md) outcome and [residual owner](tasks-feedback-follow-ups.md), add a concise pending release note for implemented behavior, then finalize under [task workflow](../../docs/task-workflow.md).

## Investigation verification and limits

On the inspected HEAD, `npm run build` passed. `node --test test/collaboration-http-races.test.js` passed 2/2. An inline disposable hub probe verified the current append-classification failure with assertions for exact body, subscriber delivery and recovery code; its root was removed. To repeat: initialize a temporary root; write a synthetic note with an existing `updated_at`; open/subscribe through `createCollaborationHub({ observeIntervalMs: 0, quietMs: 0 })`; call `beforeLegacyWrite` with its content hash, `updateMemoryDocument` with the same hash plus an appended body/new timestamp/declared agent, then `notifyCanonicalWrite`; assert the hub read and last subscription agree while `recovery.code` is `external_destructive_replacement` (observed revision 0 → 2); close the hub and remove the temporary root. These checks establish the source-level direction only. No Chromium, packaged Mac app, actual shared server, real memory write or historical v0.3.22 reproduction was run during planning. Local memory recall was unavailable because the installed CLI and running backend use different builds; repository docs/source supplied the evidence, and the backend was left untouched.

Planning integration review checked local document links, referenced command targets and unchanged open feedback outcomes; `git diff --check` passed. Implementation and its required verification remain open.
