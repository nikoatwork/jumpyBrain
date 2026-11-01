# M0: reproducible current-behavior gate

Status: execution in progress. The [task list](../../tasks/todo/tasks-multiplayer-editing-architecture.md) owns stage completion; the [inventory](current-behavior-inventory.md) identifies P01–P12, and the [architecture proposal](architecture-and-verification.md) defines later levels.

## What this gate establishes

Capture the existing semantic assertions and built runtime before changing backend ownership, transports, or collaboration. Verify candidates against an independently pinned baseline manifest digest. An unchanged runtime must reproduce the required deterministic suite and four real browser/server/file flows.

The contract lives in [contract.json](../../test/fixtures/multiplayer-parity/contract.json); the implementation is [multiplayer-verify.mjs](../../scripts/multiplayer-verify.mjs). Its [focused tests](../../test/multiplayer-verification.test.js) exercise false-green cases, including an actual committed behavior regression rejected by an unchanged assertion, while an equivalent implementation change is accepted.

Capture/verify refuse dirty runtime inputs, missing prerequisites, skipped/zero/failed required tests, missing completion markers, weakened or removed frozen assertions, mismatched controlled tools, changed artifacts, invalid/empty evidence inventories, and unsafe output aliases. Verification never refreshes its baseline expectations.

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

Final capture/verify source, digest, command results and timing are pending. Preliminary failures and corrections are recorded in the task list. No accepted M0 baseline is claimed by this document yet.

## Boundaries

This gate establishes the named automated scope on its recorded environment. It does not establish live collaboration, CRDT/editor choice, recovered offline drafts, new reader/writer credentials, actual VPS/TLS/proxy operation, real semantic-model quality, physical Keychain/IME/accessibility, or installed-app update behavior.

The existing full suite includes controlled adapter/model/lifecycle fixtures; the note-lifecycle flow uses the real provisioned lexical QMD engine. Both kinds of evidence matter, and they are not interchangeable. Changed deployment/native/semantic paths need their own later-stage evidence before enablement.

All checks use disposable roots/configuration. No personal notes, installed app, live VPS, deployment credentials or release are modified.
