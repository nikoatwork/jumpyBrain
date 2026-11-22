# v0.3.27 beta release

Published November 22 at 22:57 Europe/Berlin from release commit `cc8eb7f5`. The release includes the full pending scope and the sidebar template change that brought the editor below its size ceiling. [Exact published notes](releases/v0.3.27.md) · [Verification and limits](releases/v0.3.27.qa.md).

## Scope and decision

The patch addressed shared-brain permissions, migration and installer feedback since [v0.3.26](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.26), published November 18 at 09:34 UTC. This was the first November 22 release in Europe/Berlin. The starting snapshot `de5cd7ae` was ahead of `origin/master` by 25 commits with no remote-only commits. The final pre-bump snapshot was `ca076d78`.

The owner chose publication after automated checks. `npm run dogfood:status` found only a superseded v0.3.21 candidate at `ace92efa`. This snapshot has no recorded normal-use window on the owner’s Mac. The older migration-only app exercise does not cover final profile compatibility.

## Tasks

- [x] Review feedback and curate the [release notes](releases/v0.3.27.md).
  - Proof: live inbox checked `2026-11-22T21:44:01.107Z`, received/non-spam, no date bounds, two pages, 77 scanned and two synthetic tests excluded. All 75 genuine messages dated October 20 through November 20 match exact IDs in the [feedback index](../feedback.md). Scope includes the reviewed server-role access, headless installation, shared-server migration and drawing reports. Org MCP and index-free search stay with existing follow-ups. No new triage was needed.
- [x] Run core-flow and change-specific release checks with disposable fixtures.
  - Source build and fresh signed desktop package passed on macOS 15.7.7 ARM64, Node 26.7.0 and QMD 2.8.3. Core note lifecycle, 12-stage permission explanations and sidebar layout passed in Chromium.
  - The first focused run passed 81 of 82. The app access diagnostic test compared the entire app directory and raced with the gateway’s asynchronous diagnostic log creation. The fixture now compares the paths and exact bytes of files outside the diagnostics store on either side of access checks, including after the deliberate connection switch. All 82 passed on rerun.
  - `npm run cli:pack` and `node scripts/agent-install-smoke.mjs --with-app` passed with the candidate package in a disposable home: private QMD, three integrations, actual recall, repeat-install note preservation and authenticated Desktop start on the same root.
  - The first Electron connection smoke timed out during the dirty local switch, reproduced at the same step against clean `v0.3.26` source. The fixture now pastes through the live editor and verifies the captured body including the new note’s starting text. The full rerun passed switching from a reader to a writing key, local and remote save-before-switch, canonical isolation, and removal at native widths. Both test changes leave production code untouched.
- [x] Dry-run, then run the full versioned release workflow.
  - Dry run passed. The first full run stopped before the version commit at 2,175 passes, two opt-in skips and one failure. The editor was 186,912 gzip bytes against the 186,500-byte ceiling. Restored only the four version files written by the release script.
  - Rendered the sidebar row, action icons and last-editor glyphs as inert templates so they no longer need separate bundled DOM construction. The rebuilt bundle was 186,344 gzip bytes with the existing ceiling. Full hosted and companion HTML also compressed smaller. Rebuilt and signed the desktop package and reran the core note lifecycle and 113 focused tests successfully.
  - Proof: sidebar layout, note attention and the human/agent SVG checks passed after the template change. The retry passed 2,176 tests with two opt-in skips and zero failures. The versioned editor was 186,345 gzip bytes. The full workflow packed the CLI and both Mac helpers and published the annotated tag and GitHub prerelease.
- [x] Verify GitHub publication, all public asset digests and package version alignment. Archive exact notes and QA, and reset the shipped pending notes.
  - Proof: the remote annotated tag peels to `cc8eb7f5`; the public body equals the tagged notes byte for byte. Downloaded and compared all three assets with GitHub digests and local builds, verified both native binary architectures, and checked package and lockfile versions against the tag and distribution. The exact notes are archived and the pending note has no remaining bullets.
