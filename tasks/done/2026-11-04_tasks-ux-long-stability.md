# Long-lived UX stability evidence

Verification tranche of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md).

- [x] Build an explicit opt-in disposable coauthoring/off-note-search probe with a frozen runtime and retained inputs/canonical receipts.
- [x] Preserve invalid pilot 1; fix its too-short budget, foreground-search observer effect and provenance field assumption.
- [x] Pilot 2: six confirmed cycles, including cancel and observed reconnect, with automatic indexing and accumulated contribution checks.
- [x] Complete the 45-minute run with 35-second idle intervals against frozen build `3b7fa7d720f00267` (`435f9cb`).
- [x] Fix the separately observed doctor fixture teardown: the case's mutable target root must be stopped before removing its logs. Eight doctor follow-up cases pass.
- [x] Align nested-board sidebar failed-save fault with actual live title RPC and retain its navigation/layout assertions.
- [x] Verify accepted/lost body/title and rejected private-body recovery through peer updates at desktop/mobile widths.
- [x] Record outcome, exact artifact/runner evidence and limits; archive/commit the verification tranche.

The soak does not run with npm test/install/release. It uses only its own temporary Markdown/server/browser/config, freezes runtime bytes for both app and CLI, records source hashes/confirmed outcomes and checks all accumulated human/agent/peer contributions. No model download, remote shared-memory mutation, product installation or benchmark/user-timing claim. Its earlier artifact does not prove subsequent interruption-delivery changes.

Outcome: retained diagnostic evidence. The 45-minute run completed 60 cycles
(40 finished, 20 explicitly cancelled) in 2,700,342 ms, preserving all 180
accumulated human/agent markers plus 60 peer contributions. Automatic indexing,
independent no-refresh CLI search, UI discovery/Back and observed reconnects
passed throughout. This is elapsed fixture observation, not human task timing.

Frozen artifact: build `3b7fa7d720f00267`, HEAD `435f9cb`, runtime SHA-256
`6ac010d34ee15a1dfdf4f791e4c57fea2500bc12773d98632643d06bf612978b`.
Private receipt `.local-pack/ux-soak/long-01-435f9cb/report.json` SHA-256
`a3527d9e98a8c48d81dda210050d69094a51e98880de1aed7edbf4352e7b6380`;
frozen runner SHA-256 `ba9fe4628ff5573db6cdcecb10624c8567e2092fa99e7097830371a8e4edfdb3`.
The checked-in runner was formatted after this run; its original bytes remain
in `inputs/`. The artifact stayed immutable despite subsequent checkout builds.

The nested-board sidebar journey passed after faulting the live title RPC and
recovering through visible reviewed publication, retaining focus, navigation,
preferences, canonical preservation and responsive/theme checks. Its old HTTP
fault timeout also reproduced on pristine `6d06cb9`. Six new uncertain-save cases
passed at 1280/390: accepted body/title with both acknowledgment channels lost,
and a rejected private body, each followed by a peer edit. Exact copy, blocked
Home, explicit saved acceptance and no duplicate/replayed canonical writes pass.
The title pilot missed its separate broadcast; the original failed receipt is
retained, and the corrected fixture holds both channels.

The broader stable `d68bf75` compiled snapshot passed 1,901 tests with 17 skips,
zero failures (1,918 total) using isolated pinned QMD 2.8.3. The doctor root
cleanup correction was present and passed there, plus two focused eight-case
runs. Log `/tmp/jumpybrain-ux-full-d68bf75.log`. Pending later source candidates
are not covered by this green result. Earlier-artifact soak evidence does not
establish abandoned-stream notice delivery or later read-only UI changes. No
native Mac, public VPS, manual accessibility or independent usability score.
