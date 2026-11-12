# M1 design decision: source operations over canonical Markdown

Status: M1 design gate passed for its recorded conservative scope, 2026-11-01. Protected M0 parity also passed. Shared backend implementation is task 3.0; full M1 and production collaboration remain incomplete.

## Decision

Use one server-owned, versioned source-operation coordinator as the next implementation direction. Keep exact published Markdown authoritative. Preserve current editor/source behavior through a lossless binding; reject unsupported or ambiguous operations with both sides retained.

The dependency-free bounded source model is a successful design experiment, not a general-purpose OT implementation to copy into production unchecked. Its supported leaf splices, stale-read validation, ordered agent chunks and explicit recovery fit the chosen online/coordinated workflow. Full structural binding, production undo, offline draft storage, root ownership, authorization and transport are still later gates.

Do not adopt the released Lexical/Yjs native binding as currently wired. The [native comparison](lexical-native-findings.md) reproduced seven counterexamples, including untouched source normalization and concurrent text loss during block deletion. This rejects the measured adapter, not the library's ability to support a more substantial custom integration.

See the executable [source findings](source-model-findings.md) and [durability proof](durability-findings.md). They use the actual current editor/custom nodes and canonical publisher, rather than generic text demos.

## Preservation rules

- A live/admitted edit is not Saved until canonical publication completes.
- Every supported write joins the coordinator; a disk hash alone cannot authorize replacing pending live work.
- Source operations carry a read revision/epoch; offsets from an old read are never applied directly to current text.
- Agent chunks stream, deduplicate and cancel independently of concurrent human work.
- Rebuild from Markdown starts a new epoch. Obsolete operations resynchronize; binary state never overwrites newer canonical files.
- Raw files remain external inputs. Preserve observed overlapping/unstable versions and drafts; do not claim transactional safety for uncooperative writers.
- Newlines/structural editor changes are not enabled through the limited leaf adapter. M3 must supply the complete tested binding before claiming smooth multiplayer.

## Breaking changes and upgrade

The user explicitly authorizes breaking CLI/API/integration contracts for current internal users, with all clients updating together. Do not build permanent V1 or mixed-client emulation. Version-fence incompatible clients before they mutate data.

Core behavior and data preservation remain regression requirements. An intentional interface/structural assertion change is an explicit reviewed contract delta, not permission to remove content/durability/permission assertions or regenerate expected output from the candidate.

[README's agent upgrade instruction](../../README.md#upgrade-with-your-agent) is available now for existing supported installation paths. Before the architecture cutover ships, add its exact executable migration steps and source/target versions there: drain edits, back up Markdown/boards/configuration/unique recovery data, update server/app/CLI/integrations, migrate only necessary operational state, reset sessions, and verify existing notes/search plus disposable-copy editing. Retain retry/recovery information without printing credentials. No migration or app update was run by this design task.

## Executable integration rule

[premerge.mjs](../../prototypes/multiplayer/premerge.mjs) requires an already prepared, clean integration commit containing the current target. It runs the independently pinned M0 baseline verification and reviewed M1 design contract, checks exact source/tree identity, then checks that HEAD and target did not move. It produces an attestation for that tree only. It never merges or pushes.

The current master advanced to 7bcbadeb39397e54be7329d5e4ccb8f2013b5627 with file-explorer actions. This worktree does not yet contain it. The actual-target preflight therefore blocks, as intended. Incorporating that work and its new behavioral assertions is required before an integration merge; a passing prototype on this branch does not override it.

Run the fixed gate entrypoint from the reviewed commit and compare the recorded checker/contract hashes before relying on it. A changed checker or contract requires review. This is an explicit local procedure, not installed branch protection; the owner must retain that procedure or configure an external required check before merging architecture changes.

## Prototype resource budgets

No root runtime dependency or production bundle budget changes. The source experiment caps 64 KiB documents, 128 retained operations, 129 text versions, 32 actors and 16 streams; these are tested experiment limits, not final product capacities. Snapshot retention cost must be addressed before larger production limits.

Report candidate bundle sizes as prototype/harness measurements, not application-size deltas. Timing from the bounded 60 KiB/1,000-edit workload is advisory. Define and measure the production latency/memory/retention budget before M3 enablement.

## Verify

Reviewed input digests (SHA-256):

- Design contract: 1cd72b59b1a3ea7745c2bf5dae8a3f75ff4b22aedaa119a325bf57929840411d.
- Design verifier: 5ac43d62f21068c7e6146886806e92cc99c4d6a6adba4293f2e0247d1a13caf6.
- Local pre-merge entrypoint: 06ad35657ab0a11f56b4f622bd60e89de46d81a446520efd8753f47efd4011c5.

The 20 evidence/contract checks and nine integration-guard checks passed. They include omitted/duplicate/skipped/error cases, stale corpus, missing property coverage/resource bounds, missing/wrong trusted digest, target movement, dirty inputs and output alias protection.

The [design contract](../../prototypes/multiplayer/design-contract.json) requires all source/durability/composition cases and the complete native comparison, including its expected negative controls. Missing, duplicated, skipped, errored or stale-corpus reports fail the gate. A rejected native candidate is preserved as rejected; it is not counted as a successful implementation.

    npm ci --prefix prototypes/multiplayer/lexical-native --ignore-scripts
    npx --package=playwright@1.64.1 node prototypes/multiplayer/verify.mjs --out .local-pack/multiplayer/NEW-M1 --contract-sha256 1cd72b59b1a3ea7745c2bf5dae8a3f75ff4b22aedaa119a325bf57929840411d

For development only, --development permits explicitly recorded dirty inputs. It cannot substitute for authoritative evidence or pre-merge approval. Full reports, source/dependency hashes and native counterexamples remain in the ignored output directory.

Pre-merge procedure for an authorized prepared integration commit:

    node prototypes/multiplayer/gate-checks.mjs
    node prototypes/multiplayer/premerge-checks.mjs
    npx --package=playwright@1.64.1 node prototypes/multiplayer/premerge.mjs --target master --baseline .local-pack/multiplayer/M0-baseline-accepted-2026-11-01 --baseline-sha256 739838b444bbe9525c21b895c1ba3ad10c40a3312a6f82789b334c7d3ec0bff2 --design-contract-sha256 1cd72b59b1a3ea7745c2bf5dae8a3f75ff4b22aedaa119a325bf57929840411d --out .local-pack/multiplayer/NEW-integration

Only an explicitly authorized merge may follow, and only for the exact attested tree while the target remains unchanged. No merge or client/server rollout is authorized by a design-gate result.

## Recorded design evidence

The clean-source design run used commit d787ce2be10962bc40a7fbee2ecffb1dd56948fd, tree 7a2ae5b7c7a160e6e1d49de8022d85c5595e5744. It ran the reviewed contract above and retained 712 input file hashes plus root/isolated dependency identities.

Evidence directory: .local-pack/multiplayer/M1-design-accepted-2026-11-01. Report SHA-256: e7f2452ff66b54bd16ea256d1a6e6fc2b945b2a249f510ae9dc9637335239a62.

- Native comparison: 31 scenarios, 24 passed and seven retained counterexamples; candidate rejected.
- Selected source experiment: 33 scenarios passed, including 2,304 independent-splice arrival orders and real two-context human/stream interaction.
- Canonical publication/reconciliation: 23 scenarios passed, including six process fault boundaries.
- Composed model/publication and bounded workload: three scenarios passed.

The selected prototype/harness bundle is 463,880 minified bytes / 152,259 gzip bytes, with zero new model dependencies. These are experiment measurements rather than a production bundle delta or capacity promise. Full structural binding remains an explicit later blocker.

Protected M0 verification passed on the same committed input: all 1,566 tests, zero failures/skips/TODOs, and all four real browser smokes. Candidate M0 manifest SHA-256 is 311679498aa887854ba4d957e7041bd54cdfefa7445f53c0c0ccde098effeafd in .local-pack/multiplayer/M1-M0-parity-2026-11-01.

The parent independently validated that manifest against its recorded digest and original pinned baseline, compared the 438-file runtime map byte-for-byte, and rechecked all 712 M1 inputs plus the original frozen assertions after the rebuild. No product runtime or root dependency manifest changed.

Full artifacts/logs remain ignored locally; preserve them before removing the worktree. Final documentation-only evidence commits do not replace d787ce2be10962bc40a7fbee2ecffb1dd56948fd as the exact tested implementation snapshot. Actual integration into the advanced master remains blocked until its changes and behavior are incorporated.
