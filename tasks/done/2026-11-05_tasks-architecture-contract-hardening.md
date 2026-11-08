# Harden architectural contracts before selective refactors

Status: completed 2026-11-05. Selective boundary fixes, executable agreements and a reproducible reference are complete; refactor implementation remains separate.

## Goal

Make important app behavior reproducible across a structural refactor, using explicit boundary agreements and existing tests. Preserve the current layered architecture. Finish with a trustworthy reference and a go/no-go decision for one small refactor, not a presumption that a rewrite is necessary.

## Evidence and scope

- [Assessment and source evidence](../../deep-dives/architecture-contracts/assessment.md); [interactive module map](../../deep-dives/architecture-contracts/architecture-map.html).
- Reviewed source: `b469d5fff0f1cd6bef8c74b2049c7dec9f10f15a`. Architecture + package-entrypoint checks passed 18/18. Existing behavioral tests were inspected, not rerun; no whole-app baseline is captured yet.
- Highest-value seams: private backend RPC, editor-session composition, critical HTTP/live receipts and source-layer guard completeness. These are maintenance/verification findings; no data-loss bug was reproduced by the assessment.
- Markdown is canonical memory content; boards use canonical JSON. Derived indexes can be rebuilt; credentials, private drafts and unique recovery records are not disposable caches.
- User requested this first task list before refactors. Source refactors, releases, installation, deployment and personal/shared-memory writes are outside its execution scope. Small contract-validation fixes require explicit recorded behavior decisions within this list; broad source moves wait for a later scoped task.
- Follow [focused testing](../../docs/testing.md). A contract inventory is not a mandate to execute every test. Keep routine selection narrow, build once before consuming `dist/`, and use Chromium for shared-editor behavior.

## Tasks

- [x] 1.0 Agree on a small contract inventory and equivalence rules.
  - [x] 1.1 Record producer/consumers, owner, accepted inputs, outputs/errors, preconditions, canonical/derived effects, cancellation/retry rules and existing assertions for the four priority seams. Keep ownership in co-located docs and a small test-selection manifest; do not duplicate product docs into a second spec tree.
  - [x] 1.2 Classify expectations as preserve / intentional fix / unresolved. Explicitly decide invalid HTTP 200 handling, live optional fields, unknown backend methods and save-versus-index outcomes. Reproduce suspected defects before treating them as established. Freeze only resolved contracts; put accepted fixes in distinct behavior-change commits with regressions.
  - [x] 1.3 Define stable observations and permitted normalization. Preserve canonical bytes, source/operation identity relationships, content-hash validity, ordered retrieval evidence, permission denials, private drafts and meaningful state transitions. Document intentional local/hosted differences instead of requiring identical envelopes.
  - [x] 1.4 Select the smallest useful initial tests and four browser journeys from the assessment inventory. Record prerequisites, expected scenario IDs, practical run-time budget and limits. Additional retrieval/processing/native scenarios are triggered only by the selected seam's impact.

- [x] 2.0 Close concrete boundary-verification gaps before freezing the reference.
  - [x] 2.1 Make architecture classifications complete for the intended source set: unknown internal layers fail. Add meaningful import-scanner fixtures and explicit scope/exceptions. Cover a selected integration boundary only if its refactor needs it; do not claim whole-program import proof.
  - [x] 2.2 Specify the private backend operation agreement and add focused caller/dispatcher/publication-hook conformance cases: method/argument/result shape, unknown/malformed operations, stale hash, cancellation and uncertain response. Preserve independent canonical-publication and derived-index admission. Do not consolidate implementation yet.
  - [x] 2.3 Add critical HTTP receipt and live producer→consumer conformance cases using real serialized messages: document/board hashes, saved/indexing outcomes, revision/epoch, positional and terminal fields, malformed messages and allowed additive fields. Tighten only agreed validations; keep browser contracts free of app/server imports.
  - [x] 2.4 Record and test a compact host-policy matrix for selected operations: CLI remote-write consent, server authentication/role, companion target permission and tab/generation admission. Include observational POSTs, writer-only companion resync, stale scopes and unknown methods. Keep distinct policy owners; do not invent a universal isWrite function.

- [x] 3.0 Make editor behavior observable independently of its controller structure.
  - [x] 3.1 Specify the consumer-facing editor session agreement: canonical baseline, private draft, pending confirmation, permission, recovery, flush/navigation barrier and disposal. Map existing document-actions/workspace/attention consumers without replacing their controller yet.
  - [x] 3.2 Reuse the current Chromium runners and traffic fault injector for: own edit + peer edit + own Undo; accepted edit with lost reply **and** document-event confirmation; external destructive replacement + retained comparison/restoration; credential/epoch transition with a private draft.
  - [x] 3.3 Retain compact checkpoints with canonical text/metadata, actual operations and identity relationships, private draft content, save/completion state, scope, selection/focus and recovery actions. Reuse the uncertain-save runner's recording where possible. Assert milestone ordering and bounded completion; avoid full DOM/screenshot snapshots or arbitrary event-order equality.

- [x] 4.0 Capture and reproduce the selected reference.
  - [x] 4.1 Reuse the existing multiplayer capture/verify and contract-delta helpers where they fit. Inspect current API/CLI/probe limitations before adding the smallest focused profile wiring. Preserve historical M0/production contracts. Do not create a second general test framework or make native/Linux/model dependencies mandatory for unrelated checks.
  - [x] 4.2 Freeze a clean committed reference after accepted fixes. Record source/build identity, selected commands/scenario IDs, assertion/helper/fixture hashes, normalization version, dependencies, runtime/platform, browser and applicable QMD/model identity. Use disposable roots; keep bulky evidence ignored with checksummed references and compact tracked manifests.
  - [x] 4.3 Execute the unchanged reference twice with independent fixture roots and compare stable observations. Investigate drift; unavailable dependencies, skips, missing scenarios, changed assertions or failed checks cannot count as passing evidence. Keep latency and semantic-quality claims separate from deterministic equivalence.
  - [x] 4.4 Prove the comparison itself: unchanged candidate passes; controlled negative fixtures fail for changed canonical content, lost private draft/incorrect Saved, and omitted/weakened required assertions. Review normalization so it cannot hide these failures.
  - [x] 4.5 Document exact reproducible reference→candidate-worktree commands, evidence locations/hashes and expected decision output. Require unchanged contract inputs or reviewed old/new contract deltas with reasons; never auto-accept candidate snapshots. No actual app refactor is needed to validate this workflow.

- [x] 5.0 Judge readiness and finalize this task.
  - [x] 5.1 Record a go/no-go for one bounded pilot: editor-session facade or backend operation descriptors. State the duplication/ownership it removes, frozen scenario coverage, remaining limits and rollback point. “No refactor justified” is a valid result; a passing snapshot is only evidence for its selected scenarios.
  - [x] 5.2 If justified, create a separately scoped refactor task with the baseline pins and affected checks. Keep QMD policy extraction, route/hub splitting and desktop rewrites deferred unless new evidence changes the judgment. Do not execute that future task as part of this list.
  - [x] 5.3 Update owning docs and this list with tested snapshot, commands/results, negative controls, measured check duration and unresolved limits. Update changelog/release notes only for qualifying completed outcomes; do not claim the assessment alone hardened behavior.
  - [x] 5.4 Follow [task completion](../../docs/task-workflow.md): archive this list only when its required contracts and reference evidence are complete, repair references, and commit scoped work. Preserve unrelated changes; no push/release/install is implied.

## Acceptance and stop rule

- Each selected high-risk seam has one explicit owner/agreement and linked executable evidence; existing assertions are reused rather than copied.
- Two independent unchanged-reference runs agree under declared normalization. Controlled regressions and oracle weakening are rejected.
- The same pinned selection runs in a candidate checkout with readable differences and no silent baseline rewrites.
- Editor evidence includes canonical effects, drafts, own Undo, scope and visible states; static imports and final Markdown alone are insufficient.
- No requirement to stabilize every internal function, cover every platform, or run every test on each future change. Stop once these acceptance conditions support a scoped pilot or an evidence-backed no-go.

## Related owners and implementation entrypoints

- [Architecture rules](../../src/architecture.docs.md), `test/architecture-boundaries.test.js`, `test/source-graph-helpers.js` — source-layer enforcement.
- `src/cli/local-transport.ts`, `src/app/backend-rpc.ts`, `src/adapters/http-server/index.ts` — private operation agreement.
- `src/adapters/http-client/index.ts`, `src/adapters/live/index.ts`, `src/adapters/http-server/collaboration-client.ts` — wire/receipt agreement.
- [Browser ownership](../../src/adapters/http-server/browser.docs.md), [collaboration app](../../src/app/collaboration/collaboration.docs.md), [live protocol](../../src/adapters/live/live.docs.md) — editor/publication boundaries.
- `scripts/multiplayer-verify.mjs`, `scripts/multiplayer-verification/`, `scripts/ux-uncertain-save-smoke.mjs` — existing evidence machinery; current CLI does not yet expose a lightweight arbitrary profile.
- [Retrieval evaluation](../todo/tasks-workspace-retrieval-evaluation.md) owns ranking/quality experiments; [desktop hygiene](2026-11-08_tasks-desktop-runtime-hygiene.md) owns installation/owner issues; [release testing at scale](../todo/tasks-release-testing-at-scale.md) remains deferred.

## Execution evidence

- HTTP malformed-success regressions first failed (six cases), then HTTP/client/real-board checks passed 23/23. Intentional fix committed separately as `9aee38f`.
- Real serialized live protocol rejection first failed. Selective validation preserves batch-only splice compatibility; live wire/editor/real-WS checks passed 33/33. Fix committed separately as `735931b`.
- Source scanner/unknown-layer checks and real caller/backend conformance pass. The RPC fixture verifies canonical hash against actual published bytes, preserving the existing metadata reserialization rule.
- Existing verifier plus observation negative controls passed 27/27. Focused profile and owning agreements are documented in [the contract guide](../../docs/architecture-contracts.md). All selected browser observations and the independent-checkout comparison are now complete; see the retained evidence below.

## Completion and frozen evidence

- Reference source: `a3e5f00eb428f194d59c77f8d18e9ab83350ec88`; product fixes are isolated in `9aee38f` (HTTP receipts) and `735931b` (live supplied fields). Subsequent finalization changes only documentation/task/evidence records.
- [Compact baseline record](../../deep-dives/architecture-contracts/baseline-v1.json) pins the contract, source, runtime, assertion and harness inventories plus tool environment and actual checkpoints.
- Reference: `.local-pack/architecture-contracts/reference-3`, manifest SHA-256 `3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c`.
- Independent unchanged checkout: `.local-pack/architecture-contracts/repeat-2`, manifest SHA-256 `4a3a852214985346d92a4cb46a9c0a41fbd2751c0a55f5e876a9c9186de199e8`. Fresh roots, matching source/tool identities, **identical runtime bytes and ten checkpoint records**. The temporary candidate checkout is disposable; frozen artifacts/logs remain in those evidence directories.
- Each retained run passed all six profile steps: build, 165 Node checks (zero failures/skips/cancellations/TODOs), editor/intent/own Undo, lost confirmation, retained restoration, and credential transitions. Command time was 56.485 seconds for capture and 56.717 seconds for comparison, inside the ten-minute budget; these are local observations, not capacity benchmarks.
- Negative controls executed in both runs: changed canonical content, lost private draft, incorrect Saved, changed scope, missing/duplicate/malformed checkpoints, mutated or removed frozen assertions, baseline tampering and an actual committed synthetic behavior regression. Unchanged candidates pass. Synthetic verifier controls are not deliberate corruption of real product memory.
- Exact entrypoints: `npx --no-install --package=playwright node scripts/multiplayer-verification/architecture.mjs capture --out NEW_REFERENCE`; then `verify --root CANDIDATE_CHECKOUT --baseline ABSOLUTE_REFERENCE --baseline-sha256 PIN --out NEW_COMPARISON`, through the same provisioned invocation. The guide provides the complete forms.
- Setup attempts remain honest: `reference-1` blocked because the profile was initially classified as an assertion helper; moving it inside the pinned verifier boundary fixed this. `reference-2` failed because the expected completion marker had the wrong whitespace, despite passing scenario assertions; corrected before freezing. `repeat-1` passed behavioral comparison with symlinked dependencies but produced changed bundler/license artifacts; it is not the retained artifact-equivalence proof. Checkout-local copied dependencies fixed the environment without modifying product source.
- No product algorithm/controller refactor, installation, release, deployment, personal/global-memory write or semantic-model evaluation was performed. Optional live fields outside the selected validator, legacy HTTP endpoint schemas, native Keychain/login/signing, public VPS behavior, physical accessibility and power-loss durability remain outside this evidence. The source import scanner is deliberately scoped to literal TypeScript imports.

## Refactor decision

**Go for one bounded pilot:** [backend operation contract consolidation](2026-11-08_tasks-backend-operation-contract-refactor.md), recommended first because duplicated method/argument/admission knowledge is concrete and the real caller/owner agreement is now protected. Existing admission, preconditions, cancellation and no-retry behavior are the rollback/reference boundary.

Also created [editor-session contract refactor](2026-11-08_tasks-editor-session-contract-refactor.md), with its four Chromium journeys and the same baseline pin. It should remove redundant persistence/state ownership, not introduce another state mirror. Start one pilot at a time. Core/retrieval/desktop rewrites and size-only file splitting remain no-go on current evidence.

Finalization checks: 56 relative links in the owning guide/assessment/task records resolve; archive references were repaired. `git diff --check` passed. The temporary candidate worktree was removed after confirming no tracked/untracked changes and no live fixture runtime pins; frozen reference/comparison evidence remains. Finalization changes no tested runtime/assertion/harness files.
