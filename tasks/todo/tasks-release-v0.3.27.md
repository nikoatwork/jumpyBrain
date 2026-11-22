# v0.3.27 beta release

## Scope and decision

Publish the next patch because the pending changes address shared-brain permissions, migration and installer feedback since [v0.3.26](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.26), published November 18 at 09:34 UTC. The November 22 Europe/Berlin publication window is clear. The source snapshot is `de5cd7aea1c57d4053303661e4944b32bc284e8e`, ahead of `origin/master` by 25 commits with no remote-only commits. Include the release preparation and any release-check fixes.

The owner chose publication after automated checks. `npm run dogfood:status` found only a superseded v0.3.21 candidate at `ace92efa`. This snapshot has no recorded normal-use window on the owner’s Mac. The older migration-only app exercise does not cover final profile compatibility.

## Tasks

- [x] Review feedback and curate [pending release notes](release-next.md).
  - Proof: live inbox checked `2026-11-22T21:44:01.107Z`, received/non-spam, no date bounds, two pages, 77 scanned and two synthetic tests excluded. All 75 genuine messages dated October 20 through November 20 match exact IDs in the [feedback index](../feedback.md). Scope includes the reviewed server-role access, headless installation, shared-server migration and drawing reports. Org MCP and index-free search stay with existing follow-ups. No new triage was needed.
- [x] Run core-flow and change-specific release checks with disposable fixtures.
  - Source build and fresh signed desktop package passed on macOS 15.7.7 ARM64, Node 26.7.0 and QMD 2.8.3. Core note lifecycle, 12-stage permission explanations and sidebar layout passed in Chromium.
  - The first focused run passed 81 of 82. The app access diagnostic test compared the entire app directory and raced with the gateway’s asynchronous diagnostic log creation. The fixture now compares the paths and exact bytes of files outside the diagnostics store on either side of access checks, including after the deliberate connection switch. All 82 passed on rerun.
  - `npm run cli:pack` and `node scripts/agent-install-smoke.mjs --with-app` passed with the candidate package in a disposable home: private QMD, three integrations, actual recall, repeat-install note preservation and authenticated Desktop start on the same root.
  - The first Electron connection smoke timed out during the dirty local switch, reproduced at the same step against clean `v0.3.26` source. The fixture now pastes through the live editor and verifies the captured body including the new note’s starting text. The full rerun passed reader/writer changes, local and remote save-before-switch, canonical isolation, and removal at native widths. Both test changes leave production code untouched.
- [/] Dry-run, then run the full versioned release workflow.
  - Dry run passed. The first full run stopped before the version commit at 2,175 passes, two opt-in skips and one failure. The editor was 186,912 gzip bytes against the 186,500-byte ceiling. Restored only the four version files written by the release script.
  - Rendered the sidebar row, action icons and last-editor glyphs as inert templates so they no longer need separate bundled DOM construction. The rebuilt bundle was 186,344 gzip bytes with the existing ceiling. Full hosted and companion HTML also compressed smaller. Rebuilt and signed the desktop package and reran the core note lifecycle and 113 focused tests successfully.
- [ ] Verify GitHub publication, all public asset digests and package version alignment. Archive exact notes and QA, and reset the shipped pending notes.
