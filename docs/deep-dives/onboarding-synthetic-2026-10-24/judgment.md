# Onboarding judgment and implementation

These are three synthetic users, not a human usability study. All tested the dirty local checkout based on `a50598f`; individual reports distinguish observed failures from hypotheses and untested host/native steps.

- [Nontechnical Claude Code user](user-1-claude-nontechnical.md): isolated installation, first memory and fresh-process recall passed; misleading setup signals and dependency recovery friction.
- [Desktop user with an existing brain](user-2-desktop.md): writing, search, reload and same-root CLI recall passed; important folder/recovery instructions were missing from the welcome screen.
- [Project-local CLI/agent user](user-3-project-cli.md): save, nested discovery, recall and guarded expansion passed; emitted command broke with a spaced path and dry-run falsely claimed completion.

## Top three

1. **Executable onboarding examples work for actual paths.** Highest confidence: reproduced first-command failure; affects custom paths and users whose home/project names contain spaces. Quote CLI/root/PATH shell arguments and generated skill examples; escape Pi's JavaScript string literals separately. Validate emitted commands and installed agent examples using an actual isolated install under paths with spaces, apostrophes, quotes and shell metacharacters.
2. **Truthful installation handoff.** Two personas independently observed a preview claiming installation. Label planned changes throughout dry-run, reserve completion wording for actual changes, and give real installs a restart/reload reminder plus natural-language first-memory prompts and expected empty-brain behavior. Validate preview leaves no installation/skills/notes, then complete installation and fresh-process save/recall. Never create a sample note merely for installing.
3. **Same-brain guidance at Desktop folder selection.** Observed UI omissions, with wrong-folder/abandonment impact still hypothetical. Put the default memory path, hidden-folder shortcut, software-folder distinction and agent-target independence on the welcome screen. Replace private-checkout recovery with existing-install reuse and public setup directions. Validate production sandboxed welcome rendering, existing/new folder activation and readable missing-helper recovery, alongside preserved separate app/CLI targets.

All are bounded changes to existing onboarding surfaces. No new wizard, target registry, automatic root selection, permission grant, network service, or distribution channel.

## Deferred findings

- **Doctor exit status:** existing CLI tests explicitly accept exit 0 with `ok:false`; the third report correctly flags the absence of a documented failure-status contract. Do not silently change that behavior in this onboarding pass. Agents must inspect `ok`/diagnostics. A stricter command contract can be considered separately.
- **Missing-root and QMD-override diagnostics:** observed, useful follow-up; lower reach than the selected common-path handoff and folder guidance. Reads remain noninitializing. No claim that they are fixed here.
- **Personal/global permission terminology and real Claude activation:** potential conversation friction, not a reproduced host failure. Preserve explicit shared/global/team/remote-write authorization. Actual fresh Claude sessions remain an external validation gate.
- **Signed installer, portable artifact, QMD consumer resolution, project target policy:** substantial work already tracked in the portable-installation task; outside these three improvements.

## Final verification

- **Build:** `npm run build` passed on macOS arm64 / Node v26.7.0.
- **Full regression suite:** `node --test` after the build passed: 1,350 tests, 1,349 passed, one skipped, zero failures. The initial baseline's extension-cache failure was resolved by concurrent extension work, not by these onboarding fixes. This is a tested dirty working-tree snapshot, not an isolated release candidate.
- **Installer regression:** `test/onboarding-install.test.js` performs a dry-run and actual isolated project installation with a fake pinned QMD; executes emitted verification/PATH commands, generated Claude/Codex skill save/recall examples, checks canonical saved text and literal Pi defaults, and checks shell-substitution sentinels remain absent. Paths include spaces, apostrophe, double quote, `$&`, `$()` and backticks. The test additionally exposed JSON-as-shell quoting in the actual launcher; that is fixed along with printed examples. Installer-specific final rerun is recorded in the archived task.
- **Real QMD 2.8.3 end to end:** actual isolated source installation (including dependency install and build), printed verification command, healthy doctor, generated Claude-skill remember command, fresh-shell recall and guarded expansion all passed. Saved exactly one fictional memory: “The community event is on 18 November. The year was not specified.” Both clauses survived recall/expansion. HOME contained spaces, apostrophe, double quote, command substitution and backticks; no substitution sentinel appeared. All test runtime/notes were removed afterward.
- **Production Electron smoke:** `node scripts/electron-smoke.mjs` passed with the production sandboxed welcome/preload/runtime/gateway and injected picker. It opens the existing fixture brain without changing note bytes, creates a separate new brain, verifies recovery text and target-independence guidance, then exercises editor save/close and tab cleanup. Feedback is captured by an injected local sender, never submitted. After visual inspection exposed a clipped primary action, the compact layout uses one column. A final smoke passed its minimum 680×620 primary-action visibility and horizontal-overflow assertions. Screenshots at 960×720 and 680×620 were inspected.
- **Scope review:** no new domain policy, permissions, service or setup registry; Markdown, explicit capture and separate agent targeting remain intact. Existing installed integrations remain preserved by managed updates; literal-path rendering applies to newly generated integrations. No user installation, release or push was performed.

Native installed-app first launch, physical folder chooser, Gatekeeper/Keychain, clean-machine prerequisites, Linux execution, semantic-model behavior and actual Claude skill activation remain untested. Source installation reused existing system tools/QMD; it did not test the GitHub network bootstrap. The original persona reports retain pre-fix observations rather than being rewritten as passing after the fact.
