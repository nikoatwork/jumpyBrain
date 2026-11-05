# Architecture and contract assessment — 2026-11-05

## Judgment

Follow-up: [contract hardening completed](../../tasks/done/2026-11-05_tasks-architecture-contract-hardening.md) with a [reproduced baseline](baseline-v1.json). The assessment below records the original reviewed snapshot; its verification limits are historical.

Keep the current architecture. This review found two credible structural cleanup candidates, not evidence for a general rewrite: the browser editor's controller composition and the private backend RPC agreement. Harden and reproduce their observable contracts before changing their structure. Strong existing canonical-publication, retrieval, lifecycle and permission tests should be reused.

The immediate deliverable is [the contract-hardening task list](../../tasks/done/2026-11-05_tasks-architecture-contract-hardening.md). Refactors remain candidates behind its final decision gate. The [interactive architecture map](architecture-map.html) separates clear ownership, contract gaps and mixed responsibilities; these are qualitative review judgments, not quality scores.

## Scope and evidence

Three read-only sub-agent reviews covered domain/retrieval, collaboration/editor, and CLI/server/desktop boundaries. The primary review checked their conclusions against the architecture rules, selected source, existing baseline machinery and active plans. Source references below describe commit `b469d5fff0f1cd6bef8c74b2049c7dec9f10f15a`. Documentation changes present at the start were finalized independently into that commit during this assessment; they were not modified by this work.

Executed: `node --test test/architecture-boundaries.test.js test/package-entrypoints.test.js` — **18 passed, zero failed/skipped**. These inspect source/manifest boundaries and do not need a `dist/` build. Sub-agents separately reported the same 17 architecture checks passing; those duplicate runs add no distinct behavioral evidence. The behavior tests named below were inspected, not rerun. No current whole-app baseline, defect reproduction, semantic-quality result or native/browser product verification is claimed by this assessment.

## Current ownership and communication

| Module / boundary | Communication and owner | Assessment |
| --- | --- | --- |
| CLI and public runtime | CLI selects local or remote transport. Package entrypoint exports runtime/app operations without CLI parsing or server imports. Canonical CLI mutations and repairing retrieval join the shared root owner; pure inspection and strict read-only retrieval can retain direct paths. | Clear; keep the explicit differences. |
| Local backend owner | `app/backend-host` discovers an authenticated owner per real root. Private HTTP RPC dispatches app operations; canonical mutations share admission/publication ordering while derived QMD work has separate admission. | Ownership clear; operation agreement spread across files. |
| Hosted HTTP | HTTP client → authenticated HTTP routes → `app/server-memory` → the same local app/core against a server-local root. Browser document operations use these protocols too. | Generally clear; ordinary successful response validation is uneven. |
| Live collaboration | Browser native WebSocket / CLI `ws` / desktop live proxy → protocol-2 live adapter → collaboration hub → core operation model and canonical publication. | Strong app/core separation; wire types and consumer validation need a tighter agreement. |
| Browser editor | Lexical/source binding and collaboration state are composed inside `notes-browser`; document actions still consume the older controller type. | Concrete mixed responsibilities: persistence disabled, state translated, controller methods replaced. |
| Core domain | Markdown semantics, metadata/provenance, retrieval-depth rules, source operations and board file rules. Core does not import app, protocols or QMD. | Clear and guarded. Backend-agnostic does not mean all of core is filesystem-free. |
| Retrieval app / QMD adapter | Local-memory orchestrates freshness, search and evidence packets through the QMD barrel. QMD owns engine execution and derived generations; some backend-independent ranking policy also lives there. | Import boundary clear; policy ownership partially mixed. Lower priority. |
| Desktop and gateway | Electron owns window/lifetime/save barriers; native helper owns native capabilities; gateway scopes authenticated HTTP/live traffic to the selected root/backend. | Broad responsibilities intentional. Preserve permission and lifecycle distinctions. |
| Boards and extensions | Boards: core canonical JSON → app → runtime/server transport. Extensions: public contract → adapter installation I/O → app activation; desktop supplies scoped operations. | No broad reorganization justified. Keep focused tests and ordinary-runtime isolation. |

Memory content is canonical Markdown; board organization is canonical JSON. QMD indexes/embeddings are derived. Private drafts, access credentials and recovery/operational records must not be treated as disposable merely because they are outside Markdown. Collaboration history is rebuildable, but that does not make every private operational file rebuildable.

## Findings and proposed agreements

### 1. Backend RPC operation agreement — high confidence maintenance risk

The caller accepts method strings, `unknown[]` and a caller-chosen result type in [`local-transport.ts`](../../src/cli/local-transport.ts) (lines 83, 109–115). [`backend-rpc.ts`](../../src/app/backend-rpc.ts) separately maintains dispatch, mutation classification and option positions (lines 15–41). [`http-server/index.ts`](../../src/adapters/http-server/index.ts) knows particular operation names and hash-argument positions for publication hooks (lines 175–180).

Specify arguments, output/error vocabulary, preconditions, cancellation, publication notification and admission class once in a small reviewable agreement. Exercise real dispatch with unknown/malformed methods, stale hashes, cancellation, saved-but-unindexed success and uncertain responses. This is not a reproduced data-loss bug. A later typed descriptor/dispatcher can consolidate duplicated knowledge if it actually removes those assumptions. The existing `reads` set includes derived index work intentionally; replacing it with a simplistic read/write split would change behavior.

### 2. Editor session agreement — strongest structural candidate

[`notes-browser.ts`](../../src/adapters/http-server/notes-browser.ts) creates `createDocumentEditor` at line 1484, disables its autosave at 1608, projects live state into older save state at 1678 and overrides methods at 1692–1712. [`document-actions.ts`](../../src/adapters/http-server/document-actions.ts), [`note-workspace.ts`](../../src/adapters/http-server/note-workspace.ts) and [`note-attention.ts`](../../src/adapters/http-server/note-attention.ts) depend on that concrete controller's return type.

Agree on the small consumer-facing session interface: canonical baseline, private draft, pending confirmation, permission, recovery, flush/navigation barrier and disposal. Preserve the separate connectivity/publication/draft/completion dimensions in the [experience state model](../../evals/workspace-experience/state-model.md). A typed session facade followed by removal of redundant persistence/state translation is justified once these behaviors are protected. File size alone is not the reason.

### 3. Wire shapes and success receipts — selective hardening

Snapshot shapes are declared in both [`app/collaboration/index.ts`](../../src/app/collaboration/index.ts) (line 65) and [`collaboration-client.ts`](../../src/adapters/http-server/collaboration-client.ts) (line 1). The browser uses `Promise<any>` for RPC results and validates only basic snapshot fields (lines 38, 98). Inventory optional compatibility fields before tightening validation; duplication alone does not prove a bug.

The ordinary HTTP client parses invalid JSON as `{}` and returns successful payloads without the bounded path's validation in [`http-client/index.ts`](../../src/adapters/http-client/index.ts) (lines 125–142). Prioritize document and board mutation receipts, then live positional/terminal fields. A malformed HTTP 200 must not become a confirmed save. First reproduce downstream behavior; record any accepted malformed-success behavior as a defect candidate, not an approved golden output. A deliberate fix belongs in a separate behavior-change commit before freezing the reference or in an explicitly reviewed contract delta.

Do not create a universal schema service. A narrow browser-safe wire type/decoder is conditional on the agreement revealing useful commonality, and must not import app/server code into clients.

### 4. Architecture guard coverage — inexpensive gap

[`architecture-boundaries.test.js`](../../test/architecture-boundaries.test.js) returns no violation for unclassified endpoints (lines 191–194). [`source-graph-helpers.js`](../../test/source-graph-helpers.js) scans `.ts` files under `src/` and literal imports using regex (lines 11–24). Make source classification complete and add small scanner fixtures documenting supported syntax and explicit exceptions. Unknown internal layers must fail. Do not claim this proves native integrations, computed imports or all runtime dependency edges; widen only where a selected refactor needs it. No AST dependency is required unless fixtures establish a concrete scanner failure.

### 5. Retrieval policy ownership — defer extraction

[`qmd-ranking.ts`](../../src/adapters/qmd/qmd-ranking.ts) contains exact-title preference and temporal policy (lines 7, 52), plus grouping/diversity. Some are backend-independent, whereas score calibration, candidate acquisition and engine lifecycle belong to QMD. Preserve evidence order, dates, qualifications, warnings and budget behavior before moving any pure helper. Consider extraction only when a real change or reuse benefits from it; do not replace QMD or redesign the retrieval app for symmetry.

## Existing evidence to reuse

| Agreement | Existing assertions / scenario owners | Missing work for refactor use |
| --- | --- | --- |
| CLI output, exit/error vocabulary and local/remote parity | `test/cli-baseline-contracts.test.js`, `test/cli-error-contracts.test.js`, `test/creation-outcomes.test.js` | Map selected public outcomes to the RPC agreement; preserve intentional hosted differences. |
| Canonical save separate from indexing | `test/creation-outcomes.test.js` (71, 140, 255), `test/semantic-index-lifecycle.test.js` (184, 280, 306, 354) | Reuse saved identity and partial-success assertions; never retry a canonical creation because indexing/receipt failed. |
| Bounded evidence and read-only retrieval | `test/compact-recall.test.js`, `test/recall-diversity.test.js`, `test/qmd-read-only.test.js` | Stable projections retaining order, citations, hashes, omissions and qualification text. |
| Processing preview/concurrency | `test/processing-safety.test.js` (38, 157) | Reuse byte-stable no-op and concurrent-destination protection if processing is touched. |
| Canonical publication / HTTP-live races | `test/collaboration-hub.test.js` (58, 183, 302, 359, 412, 494), `test/collaboration-http-races.test.js` | Map canonical bytes and acknowledgment invariants into selected replay checkpoints. |
| Live protocol / permission | `test/collaboration-live.test.js`, `test/companion-live-gateway.test.js` | Producer-to-consumer wire conformance, malformed inputs and deliberate additive compatibility. |
| Editor intent and uncertainty | `scripts/collaboration-editor-smoke.mjs`, `scripts/ux-uncertain-save-smoke.mjs`, `scripts/collaboration-retained-versions-smoke.mjs`, `scripts/ux-credential-draft-smoke.mjs` | Small replay records for private draft, own Undo, selection, save state, recovery and scope. Reuse existing traffic fault injection. |
| Owner replacement / save barriers | `test/backend-host.test.js`, `test/companion-backend-restart.test.js`, `test/macos-companion-gateway.test.js` | Trace admitted/dispatched/published/acknowledged-or-uncertain/drained-or-fenced; retain no mutation replay. |
| Boards / extensions | `test/boards.test.js`, `test/extensions-gateway-http.test.js` | Reuse as scoped conformance examples; no parallel redesign. |

This table is an inventory, not a command to run every test. [Focused testing](../../docs/testing.md) determines the selected checks.

## Baseline strategy

“Same behavior” means the same approved observations and canonical effects for a declared scenario set. It is not whole-program equivalence, a screenshot diff or equality of derived databases.

1. Name each contract's producer, consumers, ownership, preconditions, outcomes/errors, side effects and known exceptions. Classify each expectation as **preserve**, **intentional fix**, or **unresolved**. Resolve the subset being frozen; do not bless all current behavior.
2. Prefer existing semantic assertions. Add compact observation records only where cross-run comparison adds information. Retain raw evidence and review every normalization rule.
3. Pin source/build, contract/assertion/helper/fixture hashes, dependencies, runtime/platform, browser and applicable QMD/model identity. Use disposable roots and explicit environment inputs. A fresh baseline starts from a clean committed reference after agreed fixes, not this assessment commit by implication.
4. Repeat the unchanged reference twice in independent fixture roots. Compare exact canonical content and stable outcomes, along with identity relationships and valid transition order. Investigate nondeterminism before freezing.
5. Run the same pinned checks against a candidate worktree. Compare to the immutable baseline. Contract/test changes require an explicit reviewed reason and old/new hashes; the candidate cannot make itself pass by accepting new snapshots.
6. Demonstrate detection: a controlled negative fixture must fail for changed canonical content, lost draft/incorrect Saved, and a weakened or omitted required assertion. An unchanged candidate must pass.

Normalize temporary paths, ports, PIDs, nonce/UUID literal values and incidental clock values only after checking their relationships. Preserve content-hash validity against actual canonical bytes, document/operation identity, changed epochs, stale scope rejection, revision ordering, actor-local Undo and deadlines. Use milestone predicates and controlled delivery instead of exact concurrent event ordering or fixed sleep timing. Exact retrieval order applies to deterministic fixtures; semantic quality/performance requires its separately pinned engine/model environment and existing eval protocol.

Reuse [`multiplayer-verify.mjs`](../../scripts/multiplayer-verify.mjs), its [delta policy](../multiplayer-editing/contract-delta-review-policy.json), and observation recording in `ux-uncertain-save-smoke.mjs` where useful. **Current limitation:** exported `runGate` accepts a contract/probe, but the CLI does not expose arbitrary contract selection and its default environment probe requires QMD/browser dependencies. Do not advertise a lightweight profile as already available. First try a small focused contract/profile using existing helpers; add only the minimum selection/probe wiring demonstrated necessary. Leave the historical M0 and production contracts unchanged; their full native/Linux/packaging gates are not the everyday refactor gate.

## Refactor decision gate

| Candidate | Recommendation | Evidence required before proceeding |
| --- | --- | --- |
| Typed editor-session facade; remove method patching | First structural pilot | Four editor journeys reproducible; consumer interface documented; candidate reduces dual state/persistence ownership. |
| Typed backend operation descriptors/dispatch | Next small pilot, or first if editor setup is costly | RPC and host-policy conformance, including derived admission and uncertain outcomes; duplicated method/argument assumptions actually removed. |
| Shared browser-safe live wire agreement | Conditional | Compatibility decisions plus producer/consumer tests; demonstrated reduction of drift. |
| Move pure ranking policy out of QMD | Defer until changed/reused | Frozen deterministic evidence and applicable retrieval-quality gates. |
| Split hub/routes solely for size; new UI/DI/schema framework; universal transport/write policy; folder reshuffle; desktop rewrite | No-go on current evidence | A concrete future failure or maintenance burden must justify scope. |

Contract hardening should stop when the selected high-risk seams have agreed assertions, repeatable evidence and demonstrated regression detection. Do not require every internal function to become a public stable API. Existing [retrieval evaluation](../../tasks/todo/tasks-workspace-retrieval-evaluation.md), [desktop hygiene](../../tasks/todo/tasks-desktop-runtime-hygiene.md) and deferred [release testing at scale](../../tasks/todo/tasks-release-testing-at-scale.md) retain their scope. This work does not reactivate broad release QA or authorize implementation of all refactor candidates.

## Assessment deliverable verification

- Source/manifest checks: 18/18 passed as recorded above; no app code changed.
- Relative Markdown link check: 33 targets exist across the assessment and task list.
- Architecture HTML: Chromium exercised all nine selections and keyboard activation at 728, 390 and 320 CSS pixels, with no page errors or horizontal overflow. Desktop/mobile rendered previews were visually inspected. These checks verify this explanatory artifact, not the product editor.
- `git diff --check` passed. No build, broad suite, semantic model, native product or deployed service was needed for these planning-only changes.
- The active task remains in `tasks/todo/` because its implementation and behavioral baseline are future work. The completed assessment recommends a contract-first approach; it does not claim those contracts have been hardened.
