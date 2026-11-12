# Reliable deletion of existing text

Completed 2026-11-02: reproduced the reported source-range error on ordinary word deletion in the current packaged Mac app, and fixed word/line command proof capture. Idle time is not required. The user clarified that the original action may simply have been deleting existing characters; the exact historical shortcut remains unknown.

## Outcome

Option+Backspace at the end of an existing word reached Lexical's word-delete command on keydown without `beforeinput`. The proof layer captured one character, while Lexical removed a word; the exact-source check correctly rejected that mismatch and retained the draft. Mac line deletion has the same command seam.

A high-priority command observer now measures the browser's native word/line boundary, clones the range, restores the original caret and leaves the default Lexical command in control. Existing exact before/after splice checks, repeated-occurrence identity, removed-node checks and private-draft behavior are unchanged. No generic text diff, whole-document replacement, automatic conflict publication or model work.

## Completed work

- [x] Record source/build, canonical epoch/revision, selection, actual operations and reproduction in disposable notes.
- [x] Exercise existing characters, selected/cross-paragraph text, empty blocks, backward/forward word deletion, repeated words and Mac line deletion.
- [x] Repair the proven command-level input range; retain default command behavior and fail closed when proof is unavailable.
- [x] Verify idle/reconnect/restart/disjoint external change, exact canonical bytes/reload, actor Undo/Redo and private-draft retention after genuine overlap.
- [x] Verify the actual packaged native host/gateway/editor, update owning docs/release notes, archive and commit scoped work under [task completion](../../docs/task-workflow.md).
- [~] Require the original report's exact idle duration as a completion gate — the user withdrew the idle premise; an ordinary input failure is now independently reproduced and fixed. Physical sleep/IME and the reporter's exact historical sequence remain limits, not claims of coverage.

## Reproduction and prior evidence

- [Original report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=c85a4812-1f2f-4e79-bdc9-73c5684890f0), 2026-11-02 09:32 UTC: deleting existing text produced “This input could not be mapped to its actual source range.” The prior investigation inspected its diagnostic attachment through the read-only API: package 0.3.17, Electron 44.10.0 and source-input fingerprint `6c0762ec59d5751f`, consistent with release `24fdb90`. It lacks the failed selection/input, mapping event, revision and precise lifecycle. Raw diagnostics/private notes remain outside Git.
- The original 20-case Chromium idle/reconnect/restart/external matrix passed and did not classify the report. The current complete-package baseline (`b8e66d2e84809ada`) also passed selected deletion after 35 seconds idle, 65 seconds of CDP renderer suspension and short-idle empty-paragraph deletion. This demonstrated that idle alone did not establish a cause.
- After the user's clarification, `scripts/desktop-launch-smoke.mjs --app <baseline-app> --editing` failed on Option+Backspace, after ordinary/repeated Backspace and selected deletion passed. The exact reported source-range error was observed in the real packaged editor. The final same-case package passes; trace confirms word/line keyboard commands emit no `beforeinput` here.
- A disposable `git archive 24fdb90` build reproduces source fingerprint `6c0762ec59d5751f`. Its original 20-case stale-note matrix passes, while `fresh-note-feedback-smoke.mjs` fails on rapid Backspace step 17 with the same mapping message. That separate empty-paragraph bug is already fixed by [fresh-note deletion](2026-11-02_tasks-fresh-note-edit-feedback.md). Neither result proves which historical shortcut the reporter used.

## Verification

Tested baseline `29e10f8` plus this scoped implementation, macOS 15.7.7 ARM64 / Node 26.7.0 / Python 3.14.7 / Electron 44.10.0. Final package/runtime version 0.3.17; source fingerprint `84b47efa01f765db`; editor SHA-256 `3baeb4d928c600daf2e633e66e43539632ce3df0f5205bde31c6c43c9ef94f92`.

- `npm test`: 1,848 tests, 1,846 passed, zero failed, two provisioned-QMD opt-in skips, 111.756 s on the final source. QMD behavior is unchanged.
- `scripts/stale-note-editing-smoke.mjs`: all 40 lifecycle/input cases plus genuine-overlap draft retention pass. It asserts outgoing source intervals, canonical bytes, reload and actor Undo/Redo. Repeated-word deletion targets the second occurrence exactly. Mac word/line keys cover both directions.
- `scripts/fresh-note-feedback-smoke.mjs`: desktop/mobile rapid/delayed/held-ack and selected clearing, replacement/reload and retained-draft feedback pass.
- `scripts/collaboration-editor-smoke.mjs`: production two-context convergence, actual positional intent, agent/external writes, selective Undo, IME paths, offline body/title recovery and actor churn pass.
- Fresh complete ad-hoc signed Mac bundle `.local-pack/desktop-input-fixed/jumpyBrain.app`: native preparation, fuse application and deep/strict signature validation pass. `scripts/desktop-launch-smoke.mjs --app <that-app> --editing` passes 17 checks: ten deletion variants plus real launch/Quit/open/service/signature checks. Cases include ordinary/repeated Backspace, selected deletion, word deletion over collapsed/selected/formatted/repeated text, forward Delete and both line directions; every edited body saves and reloads.
- A first expanded matrix reached all 40 passing cases but its overlap fixture reused an ID now occupied by the larger case set. Changed that fixture to a disjoint ID; the final complete matrix including overlap passes. An earlier packaged assertion wrongly expected frontmatter to stay byte-identical despite legitimate attribution metadata; final checks compare the acknowledged prefix plus exact expected body.
- Before editor implementation, one full-suite run intermittently failed the existing uninstall `--delete-memory` assertion. Its isolated retry and the unchanged full-suite rerun passed. The final editor suite passes too; no installer fix or causal explanation is claimed.
- Editor gzip is 220,116 bytes, +167 from the 219,949-byte baseline. The measured 220,250-byte allowance is documented in [build footprint](../../docs/build-footprint.md); source-validation checks and editor dependencies remain unchanged. Other package budgets remain enforced.
- Package manifest/size, syntax, whitespace, new/updated local links and staged guard pass. [Launch fix](2026-11-02_tasks-desktop-shell-launch.md) records shared artifact and packaging evidence.

## Limits

This fixes a proven everyday deletion path producing the same error; it does not prove every detail of the original report. The reporter used macOS 26; this host runs macOS 15.7.7. Physical keyboard/IME, real OS sleep, other browser engines, Linux/X11 clipboard behavior and arbitrary wrapped/bidirectional line boundaries are not exhaustively tested. Unknown/unprovable inputs still retain a private draft for review. No personal/team memory, installed app, real login preference, version, release or remote service was changed; no push or feedback message.
