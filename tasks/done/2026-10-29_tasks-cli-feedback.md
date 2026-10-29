# CLI feedback and release inbox review

## Goal

Give agents an explicit CLI feedback path using the existing UI relay, and make live feedback review part of preparing a new version.

## Decisions

- Support message flag or bounded stdin, dry-run preview, JSON receipts and an optional stable report ID for deliberate retries. Send supplied text only; no automatic diagnostics or memory access.
- Share the existing validated HTTPS delivery adapter across CLI and UI, preserving the packaged relay configuration and existing server imports.
- Document feedback in generated/distributed agent guidance. External sending requires user authorization; this task does not send a live test.
- Require the release agent to run the existing read-only inbox command and record scope, triage and any verification failure. No mail credentials in the release build and no scheduled polling.
- Preserve unrelated checkout work; no release, install or push requested.

## Tasks

- [x] Share the feedback transport and implement strict CLI arguments, bounded input, preview and honest delivery receipts.
- [x] Update CLI/agent guidance and release preparation instructions.
- [x] Verify focused CLI, delivery, packaging configuration and architecture regressions; record limits.
- [x] Archive this task and commit scoped changes with release notes and changelog.

## Outcome and verification

- Added strict `feedback` with flag/stdin text, network-free preview, JSON receipts and explicit same-report retry IDs. Shared UI/CLI transport preserves installed endpoint configuration and the HTTP host compatibility exports.
- Added agent guidance to CLI instructions, the distributed skill template and agent workflows. Added live inbox review to versioned release/check-feedback guidance and the ignored local `AGENTS.md` (local rule intentionally not committed).
- Tested on 2026-10-29 against base `543ba599f6951ab33df0f8652a401087fc6ae8a2` plus this task's working changes. Unrelated page-action/board edits were present and excluded from this commit.
- `npm run build`: passed.
- Focused CLI/delivery/configuration/dialog/diagnostics/inbox/architecture/baseline/onboarding suite: 48 passed.
- Additional delivery (including bundled-config resolution) and package-manifest suites: 40 passed; eight existing delivery checks overlap the first run.
- Companion gateway direct-feedback regression: 1 passed.
- `npm run cli:pack`: passed; all 235 required files, including the shared feedback adapter and CLI command, verified with the packaged relay configuration and package budget. This local test artifact is not a published release.
- `git diff --check`: passed after cleanup.

## Remaining limits

- All sends used mocks/local test receivers. No live support email, inbox read, UI smoke or installed-app change was performed; service acceptance is distinct from inbox receipt.
- Release feedback review is an agent instruction, not enforced by `scripts/release.mjs`; missing credentials or incomplete reads must remain explicitly unverified. Product builds never load inbox credentials.
- Existing installed agent skills are not rewritten by this repository change. Refresh them explicitly using the updated template when installing the new CLI.
- Full repository/release test matrix was not run; focused regressions and packaging cover the changed boundaries. No version bump, installation, push or release.
