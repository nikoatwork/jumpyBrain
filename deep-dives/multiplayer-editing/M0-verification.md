# M0: reproducible current-behavior gate

Status: M0 passed for the recorded automated scope, 2026-11-01. The [task list](../../tasks/todo/tasks-multiplayer-editing-architecture.md) owns later stages; the [inventory](current-behavior-inventory.md) identifies P01–P12, and the [architecture proposal](architecture-and-verification.md) defines later levels.

## What this gate establishes

Capture the existing semantic assertions and built runtime before changing backend ownership, transports, or collaboration. Verify candidates against an independently pinned baseline manifest digest. An unchanged runtime must reproduce the required deterministic suite and four real browser/server/file flows.

The contract lives in [contract.json](../../test/fixtures/multiplayer-parity/contract.json); the implementation is [multiplayer-verify.mjs](../../scripts/multiplayer-verify.mjs). Its [focused tests](../../test/multiplayer-verification.test.js) exercise false-green cases, including an actual committed behavior regression rejected by an unchanged assertion, while an equivalent implementation change is accepted.

Capture/verify refuse dirty runtime inputs, missing prerequisites, skipped/zero/failed required tests, missing completion markers, weakened or removed frozen assertions, mismatched controlled tools, changed artifacts, invalid/empty evidence inventories, and unsafe output aliases. Verification never refreshes its baseline expectations.

The CLI returns nonzero on blocked/failed verification. This first gate does not install branch protection or a Git merge hook. Before architecture implementation merges, wire it and the stage checks into the actual integration workflow; the task list requires that separately.

Root and Mac Electron installed dependency versions are checked against their lockfiles; actual installed package content identities are recorded and checked again after execution. This does not establish registry tarball authenticity. QMD CLI/SDK and Playwright/core package hashes exclude their nested dependencies, and external transitive native/browser executable bytes are not fully fingerprinted by the runner. Keep those limits with the report.

## Reproduce

Start with the exact recorded source/harness commit in a clean worktree. Provision the supported QMD CLI and SDK from one installation, matching Node/npm, Playwright and Chromium, and the locked development dependencies:

    npm ci
    npm ci --prefix integrations/electron --ignore-scripts

The second command is required for the Mac fixture compiler; it does not download Electron's app binary. Provision the browser separately if absent. The runner itself installs no packages or models and does not access a personal brain.

Set both QMD environment variables to the same supported provisioned executable:

    export JUMPYBRAIN_QMD_BIN=/absolute/path/to/qmd
    export JUMPYBRAIN_TEST_QMD_BIN=/absolute/path/to/qmd

For the recorded Playwright version, expose that package through the established npx loader:

    npx --package=playwright@1.64.1 node scripts/multiplayer-verify.mjs capture --out .local-pack/multiplayer/M0-baseline

Capture runs npm test with explicit TAP output/concurrency, then external-file/editor, note-lifecycle, formatting, and companion gateway smokes sequentially. Those flows assert actual canonical content; printed markers supplement their frozen assertions.

After a successful reviewed capture, pin its manifest digest separately from the mutable evidence directory. Use a new output directory for verification:

    npx --package=playwright@1.64.1 node scripts/multiplayer-verify.mjs verify --baseline .local-pack/multiplayer/M0-baseline --baseline-sha256 <independently-pinned-digest> --out .local-pack/multiplayer/M0-verify

Outputs are exclusive. Existing evidence is never replaced. Missing or mismatched baseline artifacts block verification; do not recapture from a refactor candidate to bypass that condition. Preserve or export the entire baseline directory before deleting a worktree. A future integration gate needs access to the artifact as well as its pinned digest.

## Evidence layout and review

- report.json: commands, P01–P12 mappings, passed/failed/blocked/untested outcomes, timing and explicit limits.
- logs/: bounded complete command output, including semantic assertion failures and TAP summaries.
- runtime/: immutable copy of the built dist file set used by the successful checks.
- assertions/: frozen test, helper, fixture and smoke source copies.
- manifest.json: source/tree/runtime-file identities, tool/dependency identities, required checks, assertion/harness fingerprints and all evidence digests.

The manifest is published only after all required checks pass and input/artifact stability is rechecked. A report without an accepted manifest is diagnostic evidence, not a successful baseline.

Frozen implementation-shape assertions are not eternal architecture requirements. A deliberate refactor can propose a separately reviewed contract version and equivalent coverage mapping; retain the original and keep behavioral/durability/permission expectations. Never silently replace expected results with candidate observations. New candidate tests can be additive.

## Execution result

The authoritative capture used committed source be5493ba9a3c5aa796d371043e56d6539d6dabf4, tree 33ee3e60b90eca9d6ee5226a941cd4592b2d971f. It changed no production runtime behavior from the planning seed; the setup commit adds this gate/plan and corrects the explicitly recorded stale smoke assumptions.

- Baseline directory: .local-pack/multiplayer/M0-baseline-accepted-2026-11-01.
- Independently pinned baseline manifest SHA-256: 739838b444bbe9525c21b895c1ba3ad10c40a3312a6f82789b334c7d3ec0bff2.
- Contract SHA-256: 27603e7296338f633f73a75f39a255ec2b886602ad92d67ac78d7781e45cee5a.
- Harness SHA-256: 50101c3fa239ecbcc37b66edb98e3fbe42fd70e0382f2b3056d8758a8997980a.
- Frozen runtime: 438 files; runtime-path/file-hash map digest d35e75584036021f788fbd7a804fee3c74d05e17338d6d3ced5931d214a8ffdb. This is SHA-256 over UTF-8 JSON.stringify of the manifest integrity entries whose keys start with runtime/, retaining their lexicographically sorted order, without indentation or a trailing LF. It is not an archive digest.
- Environment: Darwin arm64, macOS 15.7.7, Node v26.7.0, npm 11.19.0, QMD 2.8.3, Playwright 1.64.1, Chromium 156.0.8078.4. No semantic model was used.
- Root and Electron lockfile identities and actual dependency package content hashes are in the manifest; 25 root and 53 Electron packages were validated.

Capture passed all 1,566 tests with zero failures/cancellations/skips/TODOs, including the 17 verifier unit/negative tests. All four real browser flows passed. Command durations were 93.084 s for the suite, 65.840 s external-file/editor, 6.758 s note lifecycle, 28.877 s formatting and 33.788 s gateway; complete capture took 230.344 s.

Repeat verification passed against that independently pinned baseline digest into .local-pack/multiplayer/M0-parity-verified-2026-11-01. Its manifest SHA-256 is c00ae75c658677275730acb5415e01fa90580209f469ac22c6f2c684d3a54ba4.

Verification again passed all 1,566 tests with zero failures/cancellations/skips/TODOs and all four real browser flows, including 14 gateway cases. It took 233.724 s: suite 96.580 s, external-file/editor 65.996 s, note lifecycle 6.829 s, formatting 28.867 s and gateway 33.645 s. Both runs used the same source/tree and all 438 runtime files were byte-identical with the map digest above.

After execution, the parent independently validated both pinned manifests and their evidence, checked runtime file-map equality, and checked that the frozen assertion/harness bytes still match the checkout. The baseline remained unchanged. No product runtime source was changed.

The compact local evidence summary is .local-pack/multiplayer/M0-summary-2026-11-01.json. Full manifests, copied runtime/assertions and logs remain in the two ignored evidence directories. Preserve/export them before removing this worktree; the committed digests alone cannot replace missing artifacts.

Preliminary failures/corrections remain in the task list and ignored diagnostic output rather than being erased from history. The final evidence commit changes documentation only; be5493ba9a3c5aa796d371043e56d6539d6dabf4 is the exact tested implementation snapshot.

## Boundaries

This gate establishes the named automated scope on its recorded environment. It does not establish live collaboration, CRDT/editor choice, recovered offline drafts, new reader/writer credentials, actual VPS/TLS/proxy operation, real semantic-model quality, physical Keychain/IME/accessibility, or installed-app update behavior.

The existing full suite includes controlled adapter/model/lifecycle fixtures; the note-lifecycle flow uses the real provisioned lexical QMD engine. Both kinds of evidence matter, and they are not interchangeable. Changed deployment/native/semantic paths need their own later-stage evidence before enablement.

All checks use disposable roots/configuration. No personal notes, installed app, live VPS, deployment credentials or release are modified.
