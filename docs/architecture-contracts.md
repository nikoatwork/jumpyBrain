# Focused architecture contracts

This opt-in profile prepares selective refactors of editor composition and
private backend dispatch. It uses the existing multiplayer capture/verify gate;
it is not a full release gate or a proof of whole-app equivalence.

## Agreements and decisions

| ID | Owner and contract | Classification |
| --- | --- | --- |
| C0/C1 | [Layer direction](../src/architecture.docs.md#boundary-verification), complete source classification and scanner scope | Preserve direction; fix silent unknown-layer bypass. |
| C2 | [Private RPC](../src/app/app.docs.md#private-backend-operation-agreement), positional arguments, owner root, canonical/derived admission, hash guards, cancellation and no replay | Preserve behavior; [typed private consolidation](../tasks/done/2026-11-08_tasks-backend-operation-contract-refactor.md) implements the bounded pilot. |
| C3 | [HTTP receipts](../src/adapters/http-client/http-client.docs.md), [live wire](../src/adapters/live/live.docs.md), canonical save distinct from index outcome | Intentional fixes: reject invalid successful JSON/critical receipts and malformed supplied live protocol/operation/stream fields. Preserve additive fields and batch/splice compatibility. |
| C4 | [Host-policy matrix](../src/adapters/http-server/http-server.docs.md#selected-host-policy-agreement) | Preserve distinct CLI/server/companion policies. |
| E-editor/uncertain/retained/credentials | [Editor session](../src/adapters/http-server/browser.docs.md#editor-session-consumer-agreement) | Preserve canonical effects, private drafts, own Undo, scope and recovery; implementation/controller layout may change. |

No unresolved expectation is silently goldenized. More comprehensive optional
live-field/legacy HTTP schemas and retrieval policy extraction remain outside
this selected agreement. HTTP malformed-success handling was reproduced with
failing tests before its separate fix; invalid supplied live protocol was also
reproduced. A full batch splice with no legacy single-range coordinates remains
valid. Ordinary non-JSON/array/null successes now fail `invalid_response`; a
mutation can still have committed and must not be automatically retried.

## Selection and prerequisites

`test/fixtures/architecture-contracts/profile.json` is the machine-readable
selection and assertion/helper inventory. It builds once, runs focused Node
contracts, then four existing Chromium scenario runners. Per-check deadlines are
finite; the initial operational budget is ten minutes per reference run. If
exceeded, diagnose the selected runner rather than silently dropping checks.

Use locked root dependencies, provisioned Playwright and Chromium (or the
existing Chrome fallback). The profile does not install tools or download models.
Use checkout-local dependency files (normally `npm ci`), not a symlink to another
checkout's entire `node_modules`: the current bundler resolves that layout
differently, including license collection. Behavioral parity alone does not
establish distribution completeness. The retained unchanged-worktree proof uses
checkout-local copies of the exact fingerprinted dependencies.
Tests use disposable roots and fake QMD where needed; real semantic quality,
native Keychain/login/signing, public VPS operation and physical accessibility
are not established. Ordinary focused testing remains governed by
[testing.md](testing.md); do not run this profile for unrelated edits.

## Capture and compare

Commit source/harness changes before capture. From the reference checkout:

```sh
npx --no-install --package=playwright node scripts/multiplayer-verification/architecture.mjs capture --out .local-pack/architecture-contracts/reference
```

Record the printed manifest SHA-256 independently in the completed task/evidence
record. Reproduce in an independent run (the scenarios create fresh roots):

```sh
npx --no-install --package=playwright node scripts/multiplayer-verification/architecture.mjs verify --baseline /absolute/reference --baseline-sha256 PINNED_SHA256 --out .local-pack/architecture-contracts/repeat
```

From a candidate worktree with matching dependencies, use the same verify
command with the same **absolute baseline path and pinned hash**, and a new
output directory. `--root /absolute/candidate` is also supported when invoking
the trusted profile from the reference checkout. Outputs are exclusive and the
baseline cannot be overwritten. Do not run concurrent builds in a tested checkout.
No worktree creation, installation, merge or publication is performed by this
command.

The gate records source/build, assertions/helpers/fixtures, dependency/tool
identity and required scenario outcomes. It rejects missing/skipped checks,
weakened/removed assertions, environment drift, mutable build artifacts and
changed checkpoints. Assertion adaptations use the existing reviewed
`--delta FILE --delta-sha256 DIGEST` workflow with exact old/new hashes and
scenario mappings. Never change the baseline to bless a candidate. Historical
M0 and production contract files retain their original selection and pins.
The legacy `contract-delta.mjs` draft CLI still defaults to the M0 selection;
prepare this profile's declaration from its frozen inventories using the
exported `proposeContractDelta` API or explicit reviewed entries. Do not assume
that running the legacy draft command selects this profile.

## Stable observations and limits

Opt-in `JUMPYBRAIN_CONTRACT` lines contain selected actual state from existing
scenario assertions. Comparison requires exact checkpoint IDs/order and values.
Records contain canonical/editor body, title, draft, source selection, actual
edit splices, save/permission status and preservation relationships. Original
assertions additionally verify complete canonical bytes within each run,
protected metadata, valid content hashes, scoped identity, revision/history and
controlled delivery. Their bytes are frozen too.

Checkpoint projections exclude incidental timestamps, temp roots, ports, PIDs,
tokens and random IDs. They do not erase differences inside body/title/draft or
reorder retrieval/source operations. Exact hash/identity relationships remain
checked against actual canonical files rather than normalized into constants.
Concurrent full event traces are not required to have one arbitrary ordering.
The complete command logs remain hashed evidence; compact observations are not
a substitute for their assertions.

`test/contract-observations.test.js` deliberately changes canonical content,
loses a private draft, claims Saved prematurely, changes scope and omits or
duplicates observations. Existing multiplayer gate/delta tests additionally
exercise unchanged candidates, actual committed regressions and weakened or
removed oracles. These are synthetic negative controls of the verifier; they do
not claim deliberate corruption of a real product brain.

Large logs and frozen runtimes stay under ignored `.local-pack/`; retain their
manifest pins and compact review evidence in the repository. Missing local
artifacts require reconstructing a reference from its recorded commit and
rerunning capture; a new capture gets a new explicit pin, never an assumed old
digest.

The first retained reference and independent-checkout comparison are recorded in
[baseline v1](../deep-dives/architecture-contracts/baseline-v1.json). Use its
reference manifest pin, not the comparison run's pin, for the backend pilot and planned editor
refactor. The record separately identifies tools, scenario outcomes and limits.
