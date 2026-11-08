# Consolidate private backend operation agreements

Status: active; operation inventory complete, implementing the typed private agreement against the original pinned baseline.

## Goal

Remove repeated method names, argument positions, cancellation-option positions
and publication-hook knowledge across the CLI caller, app dispatcher and HTTP
host. Keep the existing private protocol and all observable behavior unchanged.

## Reference and scope

- [Contract guide](../../docs/architecture-contracts.md), [assessment](../../deep-dives/architecture-contracts/assessment.md), and [baseline v1](../../deep-dives/architecture-contracts/baseline-v1.json).
- Current ownership: `src/cli/local-transport.ts`, `src/app/backend-rpc.ts`, `src/adapters/http-server/index.ts`; [private operation agreement](../../src/app/app.docs.md#private-backend-operation-agreement).
- Canonical publication and derived-index admission are deliberately different. Index/search work must not acquire the typing queue. Host authentication supplies root and cancellation authority; JSON never supplies a live AbortSignal or a new root.
- This task does not redesign public HTTP, change command output, add automatic retries, change permissions, migrate canonical data or introduce a general service/schema framework.

Reference source: `a3e5f00eb428f194d59c77f8d18e9ab83350ec88`. Reference evidence: `.local-pack/architecture-contracts/reference-3`. Independently recorded manifest pin: `3ccde0a0c72f5930f2d9e45650e0bbca1c1b510ad080b8bd51dad19f76f2be4c`. The same source passed from a separate checkout with identical runtime bytes and selected observations. Use checkout-local dependency files and the guide's absolute-baseline verify command.

## Tasks

- [x] 1.0 Confirm the smallest dependency-valid contract surface.
  - [x] 1.1 Read current owning docs and pinned hardening evidence. Inventory repeated knowledge in all three consumers; state exactly which repetition will disappear.
  - [x] 1.2 Choose typed operation names/arguments/results and minimal admission/precondition metadata. Keep domain implementation imports out of protocol-neutral types, and preserve package/runtime isolation. Do not broadly relax the architecture guard to make placement convenient.
- [x] 2.0 Consolidate one complete operation family first.
  - [x] 2.1 Route guarded document update/attention/delete through the shared agreement, preserving If-Match/contentHash compatibility, pre-write settlement, notification and domain error codes.
  - [x] 2.2 Verify real caller→owner behavior, stale hash, pre-dispatch cancellation and committed-but-lost reply with the original assertions. Preserve supported trailing optional argument serialization.
  - [x] 2.3 Migrate remaining supported operations only if the same small design removes duplicate assumptions. Retain conservative process admission, derived index deadlines and saved/indexing separation. Do not expand the operation surface.
- [/] 3.0 Prove the structural benefit and behavioral equivalence.
  - [x] 3.1 Remove obsolete dispatch/position lists; document where each operation's signature and admission are now owned. If duplicated knowledge merely moved, revise or stop the pilot.
  - [ ] 3.2 Run focused RPC, creation, host-policy and architecture checks after a single build. At integration, verify the full selected contract profile against the original absolute baseline path and pinned digest. Assertion adaptations require reviewed exact deltas; never overwrite the reference.
  - [ ] 3.3 Record changed ownership, tested commit, before/after duplication, verification and limits. Update relevant co-located docs, release notes if behavior-facing guidance changes, and changelog for the completed structural result.
  - [ ] 3.4 Archive and commit through [task completion](../../docs/task-workflow.md), preserving unrelated work. No push, installation or release is implied.

## Acceptance

Operation additions/changes have one typed agreement for caller/dispatcher/host
knowledge; ad-hoc signature-erasing casts and method/argument-position branches
are removed where the pilot claims consolidation. Existing canonical effects,
output/error shapes, cancellation, permission and no-retry behavior reproduce the
reference. A smaller no-adoption result is valid if this abstraction costs more
than the duplicated knowledge it removes.

## Implementation decisions — 2026-11-08

- Baseline artifact exists at `.local-pack/architecture-contracts/reference-3`; preserve its original manifest pin. Starting repository snapshot: `0550eba`, clean `master`.
- Replace the CLI index-position/preflight branches, app read-set/signal-slot map and host guarded-method/argument branches with one private `adapters/backend-protocol.ts` table. Its type-only imports stay within core/types; domain handlers stay in app. Add an explicit protocol layer with only the three necessary consumer edges, preserving all existing forbidden edges.
- All existing operations fit the same agreement. Each declares typed positional arguments/results and canonical/read/derived admission; only relevant operations declare signal/deadline/preflight/guard hooks. A compiler-checked exhaustive app binding owns use-case adaptation. Unknown methods retain conservative queue admission and `method_not_found`; domain owners retain validation.
- Keep existing compatibility details: optional trailing arguments are omitted, legacy document guard precedence is unchanged even for extra arguments, process remains serialized, only host signals/root are authoritative, and dispatch is never retried.

## Verification checkpoint

- `npm run build`: passed; ordinary editor bundle 676,185 bytes / 223,140 gzip, unchanged budget.
- Initial focused selection: 38/38 passed (original RPC, creation outcomes, architecture and package entrypoint checks plus five supplemental tests). Final supplemental selection after adding the private HTTP/live publication case and protocol-layer negative controls: 25/25 passed.
- The new live fixture initially assumed one maintenance callback per private write. Existing collaboration refresh plus host publication can both notify; corrected the new test to require no additional callback on stale failure and a positive notification on success. No production behavior or frozen assertion changed for this assumption.
- Before: app maintained a separate 17-name read set, six signal positions, an ordinary dispatch map plus nine special branches; CLI repeated two index deadline positions and three preflight names; host repeated three guarded methods and their hash positions. After: 31 typed descriptors own those policies, one exhaustive app binding adapts use cases, and all three consumers use shared metadata. Domain implementations/validators and local observational transport choices remain their owners. Removed arbitrary result generics in attention/board callers and the signature-erasing dispatch cast; only a documented unknown-JSON-to-tuple assertion remains.
- Full original profile verification and final archive/commit remain pending. It requires a committed runtime snapshot first; create a scoped implementation checkpoint, then record the pinned comparison and finalize.
