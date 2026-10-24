# Synthetic first-time onboarding

Completed 2026-10-24. Three independent synthetic-user reports informed three implemented improvements: literal-path executable examples, truthful agent-assisted install handoff and same-brain Desktop guidance. End-to-end source-install/search and production welcome/editor smoke passed; actual Claude activation and installed native first launch remain untested.

## Goal

Run three independent synthetic first-time user journeys, including a nontechnical Claude Code user; judge their suggestions, implement the top three improvements, and validate the resulting flows end to end.

## Scope and decisions

- Baseline: `a50598f5f4538fa8ea5cbafa3cb6a3a9f0327fd0`, with unrelated extension/desktop edits already present. Preserve and exclude those edits from this task's commit.
- Three delegated test personas own separate reports in `deep-dives/onboarding-synthetic-2026-10-24/`: nontechnical Claude Code user, Desktop with an existing brain, project-local CLI/agent user.
- Use isolated temporary homes/roots and fictional notes. No actual personal/global/team memory writes, release, push, or installed-app changes.
- Judge observed first-value blockers ahead of speculative features; consider severity, common-path reach, confidence, and implementation cost. Preserve larger portable-installation work as a separate task.

## Tasks

- [x] 1. Run three journeys and retain individual evidence and ranked suggestions.
- [x] 2. Judge findings and select three concrete improvements with acceptance checks.
- [x] 3. Implement all three, updating owning documentation and regression coverage where useful.
- [x] 4. Validate the improved journeys end to end and run appropriate repository checks.
- [x] 5. Record outcomes and limits, update release notes/changelog, archive this list, and commit only scoped work.

## Relevant files

- `deep-dives/onboarding-synthetic-2026-10-24/` — individual user reports and final adjudication.
- `docs/install-for-agents.md`, `docs/install.md`, `README.md` — discoverable onboarding routes.
- `scripts/public-install.mjs`, `skills/jumpybrain-memory/SKILL.md` — literal-path launcher, printed commands, generated skills/Pi defaults and truthful handoff.
- `test/onboarding-install.test.js` — isolated dry-run/real install and executable examples with special-character paths (fake pinned QMD).
- `integrations/electron/onboarding{.html,.css,-renderer.js,.mjs}`, `electron.docs.md` — same-brain guidance, compact layout and public recovery.
- `scripts/electron-smoke.mjs`, `integrations/electron/smoke-app.mjs` — production welcome existing/new-brain activation and recovery checks.

## Verification

- Initial full baseline: 1,346 tests; 1,344 passed, one skipped, one pre-existing extension cache compatibility failure. Other extension work is changing concurrently; preserve its scope.
- `node --test test/onboarding-install.test.js`: passed. This additionally reproduced and fixed JSON-as-shell quoting in the managed launcher, beyond the reported unquoted summary command.
- Build passed. Full post-build suite: 1,350 tests; 1,349 passed, one skipped, zero failures. Concurrent extension work resolved the initial unrelated failure; that fix is excluded from this task's commit.
- Final `node --test test/onboarding-install.test.js test/install-scripts.test.js`: 34 passed, zero failures, including final literal `$&` replacement hardening after the full-suite run.
- Real-QMD 2.8.3 isolated source install, emitted shell command, healthy doctor, generated Claude skill save, fresh-process recall and hash-checked expansion passed on macOS arm64 / Node v26.7.0. One synthetic note only; uncertainty about the event year preserved. Temporary installation and notes removed.
- `node scripts/electron-smoke.mjs`: passed after final compact-layout change, including existing/new-brain welcome, safe invalid-folder rejection, public recovery, canonical save and tab cleanup. Picker and feedback sender are fixture seams; no actual user app or inbox used.
- Visual review: 960×720 and minimum 680×620 welcome screenshots. Initial narrow clipping was corrected with a one-column layout; native smoke asserts primary-action visibility and no horizontal overflow at minimum size.
- `git diff --check` passed. Detailed [judgment and remaining limits](../../deep-dives/onboarding-synthetic-2026-10-24/judgment.md); [Claude persona](../../deep-dives/onboarding-synthetic-2026-10-24/user-1-claude-nontechnical.md), [Desktop persona](../../deep-dives/onboarding-synthetic-2026-10-24/user-2-desktop.md), [project persona](../../deep-dives/onboarding-synthetic-2026-10-24/user-3-project-cli.md).

## Limits and complexity review

- Synthetic evidence does not prove human usability or actual Claude skill activation. No installed-app first launch, physical native chooser, Gatekeeper/Keychain, clean-machine prerequisites, Linux or semantic-model validation.
- Existing system QMD/tools were reused; source install was local rather than the network bootstrap. Existing installed integrations remain preserved and require explicit refresh for new template rendering.
- Doctor exit-status compatibility, raw absent-root/QMD-override diagnostics and broader portable distribution remain deferred as explained in the judgment. Setup never creates a sample memory or retargets agents automatically.
- Reused existing installer renderer/quoting, welcome bridge and smoke harness. No new service, permission, config registry or architecture boundary. Preserved all unrelated work. No release, push or user installation.
