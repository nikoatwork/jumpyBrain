# Broader release testing when usage warrants it

Status: deferred. Create the plan now; do not execute it or make it a default release prerequisite during the current small beta.

## Goal

Bring back broader, repeatable release testing when the product's usage or observed bugs justify the cost, building on [the lean beta release workflow](tasks-lean-beta-releases.md).

## Activation trigger

- Review/activate when **either** the owner judges that observed bugs warrant more release testing **or** distribution reaches a few hundred downloads (roughly 200+ as a provisional review point, not a newly fixed product threshold).
- Owner judgment is sufficient; do not wait for download volume after concerning bugs. Reaching the download threshold opens a review, not an automatic all-or-nothing testing rollout.
- At review, confirm the threshold and how downloads are counted. GitHub asset downloads include repeat updates, test downloads and automation; they are not unique users or active installations. Reuse existing distribution counts rather than adding telemetry for this task.
- A specific regression can earn a focused test immediately under the lean workflow. This deferred plan must not delay a needed bug fix.

## Preserve for later

- Keep the existing core-flow inventory, updater recovery fixtures, semantic smoke and browser/device scenarios accessible during release simplification. Archive/relabel broad instructions when necessary rather than discard their useful coverage.
- Use v0.3.5's QA evidence as a starting inventory, not a requirement to restore every command or repeat its ceremony. Prefer tests that have caught real regressions and cover important failure modes.
- Keep small releases, reusable artifacts, one build owner and short operator-facing results even after coverage grows. Broader validation should become easier to run, not demand more manual coordination.

## Tasks

- [ ] 1.0 Activate from evidence.
  - [ ] 1.1 Record the triggering owner decision/bug pattern or download observation, with date and counting limits. Confirm which user journeys now need stronger confidence.
  - [ ] 1.2 Review escaped bugs and retained tests; prioritize data safety, update integrity and retrieval failures over broad permutations without a demonstrated need.
- [ ] 2.0 Restore useful coverage incrementally.
  - [ ] 2.1 Add repeatable installed old→new Mac/CLI updates from both entry points, including save barriers, version agreement, rollback and interrupted-update recovery using disposable installs.
  - [ ] 2.2 Expand write/edit/reopen, conflict recovery, CLI↔app, reference/map, brain switching, deletion and protected hosted access coverage where real usage or failures justify it. Add semantic retrieval and stale-index repair coverage with provisioned models when those paths warrant it.
  - [ ] 2.3 Select relevant light/dark, narrow-screen, keyboard, OS/architecture and accessibility checks. Distinguish automated fixtures from physical device, Keychain/login and real public-release upgrade evidence.
  - [ ] 2.4 Automate slower suites outside the routine operator path where practical and publish concise results tied to the tested source/artifact. Reuse passing evidence; rerun only when changes invalidate it. Choose CI or another existing runner at activation, rather than designing infrastructure now.
- [ ] 3.0 Set and maintain the next release standard.
  - [ ] 3.1 Agree which checks block releases, which are triggered by changes and which are periodic/manual. Set an explicit duration/operator-effort budget and prevent a return to unconditional exhaustive checks.
  - [ ] 3.2 Update release docs/scripts and the active task state together. Record demonstrated coverage and remaining limits; preserve the lean path for small, low-risk changes where justified.
  - [ ] 3.3 Review whether each added check catches distinct failures. Consolidate overlapping fixtures and retire brittle presentation-only assertions as behavior evolves.

## Acceptance after activation

- The activation reason and owner-approved scope are recorded.
- Added checks cover the risks that justified them, have reproducible commands/results, and fit a stated time budget.
- Broader testing is automated/reusable where practical; normal releases do not require repeating the whole v0.3.5 manual process.

## Relevant files

- `docs/{releases,release-testing}.md`, `scripts/release.mjs`, `package.json` — future release standard and opt-in test entry points.
- `scripts/{desktop-update,semantic-index,note-lifecycle,companion-gateway,graph-editor,page-reference,external-document-updates}-smoke.mjs` — retained candidate suites.
- `integrations/electron/smoke-updater-ui.mjs`, `test/`, `tasks/todo/tasks-page-reference-manual-qa.md` — focused regressions and device limits.
- `tasks/done/releases/v0.3.5.qa.md` in the published history — original broad verification inventory.
