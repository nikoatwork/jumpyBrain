# Feedback improvements: Markdown, collaboration guidance and updater readiness

Completed 2026-11-05. All three selected lanes are integrated and verified. Normal Markdown bullets render with safe inline content, guidance supports authorized concurrent edits, and failed update checks no longer resurrect stale offers. Final combined suite passed 1,946 tests with two optional skips; production browser/Mac/update checks and original budgets pass.

Authorized 2026-11-05: use tab agents for a sensible session scope, improve CLI guidance and Markdown rendering, investigate/fix updater-readiness errors where evidence supports a change, and test end to end. No release, installation, push, personal-note edit or demo deployment requested.

- [x] Reproduce and fix the Markdown rendering report with fictional source; preserve Markdown/canonical bytes and unsupported-syntax fallback.
- [x] Align CLI, shipped skill and generated/recommended agent instructions for authorized concurrent editing, with actual read-base and uncertain-write safeguards; verify real CLI collaboration.
- [x] Investigate updater check/install state transitions, retain a concrete fix with controlled end-to-end verification if reproduced; leave historical uncertainty explicit.
- [x] Integrate isolated lane commits, inspect scope, verify the combined snapshot with build/full suite/package caps and relevant production journeys.
- [x] Update per-email outcomes, remaining follow-ups, pending notes/changelog; archive and commit scoped final records.

Each isolated tab owns its implementation/tests/module docs and one focused lane record. Parent owns this integration record and shared feedback index/follow-ups/release-next/changelog. Shared bookkeeping is completed during integration, avoiding competing checklists. No broader retrieval, historical conflict, OS relaunch, signing or platform work is included by default.

Evidence: [residual follow-ups](../todo/tasks-feedback-follow-ups.md), [email index](../feedback.md). Three selected messages were already reviewed; selected full bodies are read again only as implementation evidence. No replies, tests or inbox label changes.

## Guidance integration

- Child commit `9f5a67efecd85b1575d9f0f702351f6b032bb808` integrated as `a4c532f`; exact equality checked for all 11 changed paths.
- [Completed lane](../done/2026-11-05_tasks-feedback-concurrent-guidance.md): initial/write/help/managed/recommended instructions prefer authorized source operations, with actual UTF-16 read-base, stable client ID, resync and uncertain-write rules. Corrected obsolete wait/handover/reload advice. No user-authored instructions or installed integrations overwritten.
- Lane validation: 21 unique focused tests; production browser typing plus CLI insertion from revision 0 rebased over typing, continued through resync, and matched exact canonical source at revision 4. Build and original package budgets passed. Parent rebuilt the integrated root successfully (editor 222,231 gzip bytes); parent focused instruction/help/read-base checks passed **13/13** after integration (`/tmp/jb-feedback-session-guidance-checks.log`). Combined full suite remains pending the other lane results.

## Markdown integration

- Child commit `3b49dc82e952b91b2022b05820df291c6744cc96` integrated as `b282f6c`; exact equality checked for all 13 changed paths.
- [Completed lane](../done/2026-11-05_tasks-feedback-markdown-rendering.md): ordinary top-level bullets use supported rich inline labels; simple relative Markdown paths stay visible/editable/inert instead of forcing the whole line literal. Structural Enter/Backspace and hidden-list fence context preserve source intent.
- Parent reviewed parser/node/map changes and rebuilt the combined Markdown+guidance snapshot: **222,776 editor gzip bytes** under the unchanged 223,250 cap. Parent focused set **84/84 passed**; production actual CLI creation/update plus shell edit/Undo/live caret/reopen/paste passed at **1280/390px** (`/tmp/jb-feedback-session-markdown-{build,checks,smoke}.log`).
- Combined pre-doc package checkpoint passed: 1,448,021 archive / 4,579,641 unpacked / 3,068,602 runtime bytes, 648 files. Original ceilings unchanged; final shared-doc/combined snapshot package verification remains parent-owned.
- Parent clarified normal Markdown display limits in `docs/memory-format.md` without discouraging ordinary authoring, and scoped the old whole-document contract/raw-writer pause language to intentional replacement and raw-file maintenance. No runtime policy changes from these doc corrections. Parent broad production collaboration regression passed, including two-context convergence, source/actor Undo, streams, IME, offline drafts/storage, exact positional history, visible carets and 132 CLI actors (`/tmp/jb-feedback-session-collaboration.log`). Full combined suite waits for updater integration.

## Updater integration and final combined verification

- Child commit `3dcbf4d232bf60f7c7f8f5169a814bd8277b6d76` integrated as `0536210`; exact equality verified for all five changed paths. [Completed lane](../done/2026-11-05_tasks-feedback-updater-readiness.md) records the controlled reproduction and final-source packaged update/preservation/rollback evidence.
- Failed manual/startup discovery no longer reloads an old transaction offer; preparation requires a newer target and stale prepare actions preserve the current state. Live prepared workers keep their verified target; recovery/ownership fences remain unchanged. This fixes a reproduced path with the reported error, without asserting the historical network cause.
- Parent reviewed the narrow updater state changes and rebuilt the complete integrated runtime (implementation head `0536210`, build `eee6bdc44382ff97`). Editor **674,971 minified / 222,776 gzip**, optional extension UI **5,669 gzip**; all original ceilings retained.
- Final root `node --test`: **1,948 tests; 1,946 passed, two optional skips, zero failures** (96.3 seconds). Source/runtime code stayed unchanged after build; subsequent edits only extend test fixtures and shared records.
- Parent reran real sandboxed production updater/sidebar/recovery-window bridges against controlled loopback HTTP dropped connections, rate limit/no release/current/new release, retries, concurrent checks, controlled worker failure/retry, restored live readiness and restart acknowledgement/cancel. Passed (`/tmp/jb-feedback-session-updater-ui.log`). Expected denied-IPC and fixture cache-cleanup diagnostics remain in the log. This runner simulates worker protocol rather than installing software; lane packaged success and forced-relaunch rollback establish real worker/replacement/preservation separately.
- Parent extended the existing real Mac/Electron link smoke with ordinary bullets, bold labels and inert relative-link source. Real disposable production gateway + sandboxed window passed rendering, system-opener seam restrictions and unchanged canonical bytes (`/tmp/jb-feedback-session-mac-markdown.log`). No external browser or installed app touched. An initial test-only nested-selector quoting error failed evaluation; corrected the fixture expression and retained `/tmp/jb-feedback-session-mac-markdown-before-selector.log`. No runtime fix was needed.
- Combined package budgets passed: **1,448,377 archive / 4,580,820 unpacked / 3,068,602 runtime bytes**, 648 files (`/tmp/jb-feedback-session-package-final.log`). Existing 1,450,000 / 4,600,000 / 3,100,000 / 660 caps unchanged.
- Final scope: three selected emails gain covered source/verification outcomes, with explicit syntax/history limits. Other historical recovery causes, deferred UI/date requests and existing platform/systemd/evaluation owners remain open. No release, push, user installation, personal-note edit, remote-memory write, inbox mutation or demo deployment occurred.

Parent validation logs use `/tmp/jb-feedback-session-{build-final,full-final,package-final,updater-ui,mac-markdown,collaboration}.log`; earlier guidance/Markdown focused/build/smoke checkpoints remain in their named logs above. No private report bodies, notes, credentials or attachments were copied to Git.

Final bookkeeping validation: 98 local file links resolved, all 50 indexed message IDs remained unique, the three selected IDs point to covered outcomes, JavaScript fixture syntax and whitespace checks passed. Obsolete pending copy about acknowledging retained-version notices was consolidated under the already-completed quiet-recovery note. All lane records are archived; the residual follow-up list remains active for its unrelated open work.
