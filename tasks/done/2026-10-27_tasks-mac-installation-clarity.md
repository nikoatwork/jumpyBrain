# Clear Mac installation and updates

## Completed outcome — 2026-10-27

Relevance: **narrowed to documentation drift**. The current entry docs already give CLI-first app+agents reuse, a public HTTPS app-only setup, explicit prerequisites, one Markdown folder, paired updates, and CLI-only/custom/pinned exceptions. Two passages still described an Updates screen/details view removed by the current UI.

- Corrected `docs/install.md` to describe sidebar icon/tooltip progress, shared failure notifications and the dedicated startup recovery/log surface. Corrected `docs/faq.md` to describe the update icon, app-only exception and actual Settings/CLI version locations. README, agent setup and Desktop guide already agree on install ownership; no additional installer or updater changes were necessary.
- Reviewed advertised `desktop:setup`, `desktop:setup -- --check`, installer, doctor/recall and paired `jumpybrain update` commands against current scripts and disposable behavior fixtures. Standard managed, custom/pinned/foreign/missing CLI policies, preservation, rollback and preflight behavior are covered.
- `node scripts/setup-desktop.mjs --check`: **PASS**, prerequisites ready, no installation/settings changes; `/tmp/jb-install-preflight.log`. Installer/onboarding/preflight/lifecycle/updater tests are included in the final 197-test focused pass. A targeted installation/browser rerun passed **82/82**, `/tmp/jb-browser-install-regression.log`, after installing the worktree's Electron build dependencies.
- Updated pending release notes. Minor documentation correction/verification alone does not meet the selective changelog gate.

## Verification and remaining limits

- `scripts/electron-smoke.mjs`: **PASS**, `/tmp/jb-feedback-electron-smoke.log`, including production onboarding, invalid/canceled folders, explicit disposable creation, prerequisite recovery and existing-brain reopening. Native welcome artifact: `.local-pack/desktop/welcome.png`.
- Dependencies were installed only in this isolated checkout; no personal application, notes, Keychain or live agent configuration was changed. A fresh public release install, live published paired upgrade, notarization and Intel hardware were not tested here. Local build complexity remains accurately documented; distribution redesign and updater speed remain with their existing tickets.

## Tested snapshot and shared verification

- Base `56c8fe075508a6392417de275856a5190af29b55` plus this task's scoped commit in the isolated worktree; jumpyBrain 0.3.9, Node 26.7.0, macOS arm64. Final generated runtime/editor build: `23cc2c2dfa532d81`. No version bump, personal installation, live mail, push or release.
- Final focused run: **197 passed, 0 failed**, `/tmp/jb-final-focused.log` (related pages, feedback dialog/delivery/configuration/privacy, shared toasts, notes navigation, installation/preflight/lifecycle/updater and companion gateway tests).
- `node --test test/qmd-execution.test.js`: **15 passed, 0 failed**, `/tmp/jb-qmd-execution-rerun.log`. An earlier unrestricted-concurrency full run had 7 failures in that file; isolated rerun passed.
- `node --test --test-concurrency=4`: **1,397 passed, 0 failed, 1 skipped**, `/tmp/jb-related-feedback-full-final.log`. Reduced concurrency avoids the earlier process/deadline fixture instability.
- `git diff --check`: passed. Browser checks use the repository Playwright runtime and disposable real engines/gateway, never personal notes.

## Goal

Give Mac users one clear installation path and explain how Desktop and CLI updates work together.

## Notes

- Source: [feedback received 2026-10-20](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=5db6a117-b137-4611-83be-8161eeaded55); triaged 2026-10-27.
- Installation guidance and paired updates already changed after this report: [guidance](2026-10-22_tasks-installation-confidence.md), [paired updates](2026-10-22_tasks-unified-mac-cli-update-experience.md). Validate remaining confusion first. Coordinate with the parent-owned update-speed work (absent from this clean base) and [portable installation](../todo/tasks-portable-installation-project-integration.md).
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`README.md`, `docs/{install,install-for-agents,faq}.md`, `integrations/electron/README.md`; existing installer/update smoke tooling.

## Tasks

- [x] Walk the current public install instructions from a new Mac user perspective; identify confusing GitHub steps, duplicate code paths and unclear Desktop/CLI ownership.
- [x] Make the recommended path and update behavior consistent across entry docs, including CLI-only and custom/pinned exceptions; explain that both interfaces can use the same Markdown folder.
- [x] Verify advertised install/update commands against current implementation and disposable fixtures where behavior changes; route distribution/updater redesign to its existing list and record any unresolved user friction.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
