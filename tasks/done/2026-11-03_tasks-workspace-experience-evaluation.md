# Native workspace experience evaluation

## Goal

Set up and execute a reusable T3 computer-use evaluation of the real Mac app and CLI against the existing local and VPS destinations. Preserve first-attempt failures, canonical evidence and separate UX judgments.

## Scope and authorization

- Owner requested implementation and execution on 2026-11-03 after reviewing the proposal and explicitly including the existing VPS and local connections.
- Create/edit/link/organize only run-owned synthetic notes and boards. Record exact IDs. Cleanup is limited to that ledger with current-hash checks; unexpected changes stop cleanup. No broad deletion, installation, deployment, shared-server fault injection or credential changes.
- Private target configuration, credentials, raw screenshots, traces and ledgers remain ignored. Sanitized compact reports are tracked.
- Test the installed app/runtime, identifying checkout and component version skew. Computer use drives native UI; helpers use supported CLI operations and record evidence, never substitute for UI completion.

## Tasks

- [x] 1.0 Implement the protocol, journeys, fixture, rubric and small lifecycle/evidence helpers.
- [x] 2.0 Configure private existing local/VPS targets and run read-only compatibility checks.
- [x] 2.1 At the owner's subsequent instruction, install the newest published runtime/app and prune obsolete installations/files after reference/ownership inspection.
- [x] 3.0 Execute native core journeys and bounded state probes on both targets; record pass/fail/blocked/unverified honestly.
- [x] 4.0 Validate helper guards and evidence/report integrity, retain evidence and record cleanup.
- [x] 5.0 Record findings/limits, update owning docs, archive this task and commit scoped work.

## Evidence and limits

- Initial inventory: installed Mac/runtime 0.3.16 (build 2458dac642b34a59), default CLI 0.3.15, checkout 0.3.19. No upgrade is implied by the eval.
- Native computer use is available. The initial app accessibility tree exposes only the outer window, so screenshot/coordinate and keyboard execution may be necessary; record this tool limitation rather than claiming accessible navigation.

## Outcome — 2026-11-03

- Implemented the opt-in `eval:experience` routine: five native journeys, two bounded probes, orthogonal state model, separate ordinal UX judgments, fictional fixture, private target configuration, CLI receipts, frozen input copies, guarded ownership/hash cleanup and checksummed run archives. No runtime/product code, default test/release gate or schedule changed.
- The installed 0.3.16 pilot exposed a missing `collaborate` command. At the owner's explicit direction, used the supported published-release installer to align the real app, bundled runtime, default CLI and local backend at 0.3.19. Official archive digest was verified by the installer. Its first desktop replacement met the running-app guard; normal native Quit and the supported rerun completed installation. Existing same-target VPS Keychain access required the documented re-entry flow after the ad-hoc app update; the existing private credential was reused without exposing it or broadening permission.
- Pruned 39 validated obsolete software/staging/backup entries after checking completed transactions, current installation, runtime pins, processes and open handles. Allocated footprint removed: 12,161,957,888 bytes; observed free-space increase: 12,216,725,504 bytes. All 1,661 canonical local Markdown files hashed identically before/after pruning. Retained the fresh app/login rollback archive, credentials, profiles, recovery/drafts, historical server backup and small preservation metadata. Old software binaries were intentionally pruned, so the historical 0.3.16 pilot is observational evidence, not a retained executable comparison arm.
- Actual 0.3.19 local native execution covered creation/edit/reopen, search/handoff/link/Back, board movement/add/removal/editor/Back, paced CLI generation, disjoint human editing with actor-specific Undo/Redo, off-note updates, producer cancellation and independent fresh lexical discovery. Board keyboard focus required an executor correction, retained separately from eventual completion. Feedback findings: own/opened notes say Updated elsewhere; an append-only supported CLI update raises a retained replacement warning, although the native comparison shows only an addition.
- Existing VPS native execution verified Search, canonical CLI writes/reads, board movement/add/removal and editor/Back, off-note read/navigation and independent fresh lexical discovery. Live editor and CLI collaboration could not connect; the editor remained noneditable and falsely called existing, readable notes unavailable. This is a measured blocker, not a passed writing/streaming result. Hosted release/version and exact proxy/server cause remain unknown. No VPS deployment, service fault or permission change occurred.
- Guarded cleanup removed every run-owned canonical note/board: 5 local pilot records, 4 VPS pilot records, 6 final-local records (including one post-run harness regression note) and 4 final-VPS records. Original local brain and original note were restored through native UI. Synthetic retained recovery copies remain operational data, not deleted as cache.

## Verification and operational corrections

- `npm run build` and `npm run desktop:pack` passed for repository 0.3.19. Main native baseline used the installed published 0.3.19 artifact (build `08ac34405d41bcb9`), not the development candidate copies. Actual installation verified doctor/recall and desktop/shared-root startup; final deep/strict app signature verification passed.
- `node --test test/workspace-experience.test.js`: 5/5 pass. Includes target/ID/write guards, changed-hash/reference cleanup guards, escaped/missing evidence and real concurrent subprocess ledger updates with parseable atomic reads.
- A real fresh `prepare` verified input copying; intentional mutation of that engineering run's frozen `RUN.md` was detected, restoration passed the input check, and unexecuted journeys correctly remained incomplete. No fake native passes were added.
- Cleanup caught stale hashes because a long-running producer had overwritten newer ledger verification snapshots. Original CLI receipts and captures remained intact. Fixed helper bookkeeping with locked current-state updates and atomic publication. A real paused producer plus concurrent CLI note creation verified that the new record survives producer finalization; guarded cleanup then removed all six local records. The original executed helper/protocol bytes were preserved against the original preparation hashes; current helper/doc differences are disclosed rather than rewriting the run.
- Native REPL capture closure initially filed VPS images under the local directory. Corrected before hosted outcome recording by moving the distinctly named files unchanged and rebuilding action indexes from timestamped capture metadata. The correction record is private and archived; destination identity remains in AX evidence. Missing hosted evidence was rejected before any pass could be recorded.
- Main local/VPS frozen-input/evidence/artifact verification passed with no missing/changed evidence and zero remaining canonical fixture records. Compact reviewed findings live in `evals/workspace-experience/reports/2026-11-03-baseline.md`; private archives and full correction/maintenance records are ignored.

## Remaining limits

- This is a same-author, same-executor diagnostic baseline with prior source/pilot knowledge, not independent human usability evidence or a performance benchmark. No composite UX percentage is reported.
- Uncertain human-save recovery was not induced on the real brains. Producer cancellation does not establish it. Pending-to-fresh transitions were sampled rather than continuously timed. Semantic retrieval, physical IME/assistive technology and other platforms/layouts were not evaluated.
- Hosted live writing remains blocked and needs a separately authorized server/proxy investigation/fix. The eval setup/run is complete despite those product/environment findings; no product fixes are implied by the baseline.

## Relevant files

- `evals/workspace-experience/` — reusable instructions, fixture, helpers and reviewed reports.
- `docs/release-testing.md` — optional selected experience evidence; existing lean gates remain.
- `docs/cli-commands.md`, `docs/collaboration.md`, `docs/boards.md` — product behavior used by the eval.
