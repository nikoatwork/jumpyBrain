# Upgrade older managed installations without losing their settings

Priority: P2. Status: investigated and planned on 2026-11-14; implementation remains open. This list owns the focused legacy-upgrade report; [portable installation](tasks-portable-installation-project-integration.md) retains its broader distribution, platform and project-integration work.

## Goal

Give an installer-owned older CLI one reliable route to a current verified release and, when requested, the matching Mac app. Preserve the existing Markdown folder, connection/settings data and customized integrations; explain incompatible or unowned installations before making changes.

## Evidence and current behavior

Inspected source at `bfeb0a1533e1ac60ae8b24eaa1fdc7090ea8b3da`. The [November 10 report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=33d8a434-f0d9-4b9b-8844-9820c4a41dfc) describes upgrading an older managed source installation to v0.3.22. Its full body was read on November 14. The historical checkout, manifest and logs are unavailable; the reported rewritten Git history and exact original failures have not been reproduced.

Current source confirms several general compatibility gaps:

- The [public installer](../../scripts/public-install.mjs#L75) preserves a previous source/ref, which is appropriate for intentional development installs. Its `reuseApp` condition at line 103 also reuses **any** non-installing manifest on an add-app rerun without explicit source/ref, without first proving that the old CLI supports current verification or Desktop setup. An old CLI can consequently be verified instead of upgraded. This source path supports the report's explanation; it does not establish the exact historical execution.
- `verificationCommand` in the [same installer](../../scripts/public-install.mjs#L605) requires modern doctor/recall fields and reports a generic readiness error when they are absent. It does not identify installed/candidate versions or distinguish an incompatible result schema from an actual retrieval-readiness failure.
- [Install validation](../../scripts/public-install.mjs#L695) and [native migration validation](../../integrations/macos-companion/lifecycle.py#L70) accept an absent legacy `cliConfigPath`. [Uninstall validation](../../scripts/public-uninstall.mjs#L156) requires that field, so the tools disagree about the same older manifest. Missing metadata must not become authority to delete an existing config file.
- [Desktop configuration](../../integrations/electron/desktop-install.py#L50) uses recorded QMD or PATH and does not read `JUMPYBRAIN_QMD_BIN`. [Standalone setup](../../scripts/setup-desktop.mjs#L25) reuses an existing manifest before packaging. The combined installer already uses [engine selection](../../scripts/install-support.mjs#L50), honoring an explicit external override and validating CLI plus SDK; when the old manifest has no QMD, it tries PATH before a matching private engine. The report therefore exposes inconsistent selection paths rather than a need for another engine manager.
- [Runtime replacement](../../scripts/public-install.mjs#L404) already stages a fresh source clone or verified release; it does not pull or reset the installed Git checkout. [Software storage](../../docs/installation-storage.md) already provides protected previous generations and recovery receipts. Rewritten Git ancestry need not be repaired to replace eligible owned software.

The [product vision](../../docs/product-vision.md) favors one small app, inspectable Markdown and deterministic setup. An upgrade compatibility boundary serves old managed installations generally; it should not recognize one user's paths, old version string or machine configuration.

## Recommended direction and boundaries

Use the existing public bootstrap and explicit `--source release` choice as the migration route. Before reusing an older CLI for `--with-app`, inspect its capabilities and installation ownership. If it cannot satisfy the current contract, report the installed version, the required capability and a concrete migration command. Do not silently convert a source/ref policy on an ordinary rerun. A capable current CLI remains reusable when adding Desktop.

An explicit release migration should stage a verified release, normalize inherited default-branch metadata into release policy, and retain the old runtime/manifest until verification completes. Detect dirty/custom checkouts and unsafe ownership before replacement. Preserve explicit pins and custom source choices unless the user deliberately selects a supported conversion; ambiguous cases fail with a useful plan. A fresh clone makes unrelated ancestry irrelevant, so neither `git reset --hard` nor automatic history repair belongs here.

Share a small, bounded compatibility classification across installer, Desktop setup and uninstaller; reuse existing manifest validation and shim recognition rather than introducing an installation registry. Accept only demonstrated historical shapes with the installer marker, supported schema, expected owned paths and a safe independent memory root. Optional missing fields can be normalized for installation, but must never broaden uninstall deletion authority. Unknown/corrupt/unowned layouts remain protected.

Make Desktop setup consume the same validated engine selection as the managed installer. Honor an explicit external QMD override, then a compatible recorded engine, then an ownership-verified matching private engine before PATH; a known incompatible explicit choice fails visibly. Reuse the existing private-engine recipe and version check, with no arbitrary recursive discovery. Keep engine policy changes limited to eliminating this setup disagreement.

Use existing staging, installation locks, generation receipts and paired-app transaction boundaries. Record previous software/configuration for recovery; do not copy, move or delete the brain as the migration mechanism. Markdown preservation is verified by byte hashes in disposable tests. An optional independent backup can be documented without making a new automatic backup subsystem. Running or legacy runtimes that cannot safely hand off remain a named stop/retry condition.

Non-goals: arbitrary directory adoption, a force-legacy deletion flag, Git dependency/npm publication, project-root discovery, new updater channels, compiler-free installation, platform support expansion, model downloads, root/profile retargeting, global npm changes or hosted-server upgrades. This plan authorizes no change to the user's installed software.

## Acceptance criteria

- A supported older managed installation either migrates through the documented route or exits before replacement with an actionable compatibility/ownership explanation. Missing readiness fields are never reported as an unexplained search failure or installation success.
- A default add-app rerun preserves a capable installed CLI; it does not reuse a demonstrably incompatible older runtime. Ordinary reruns preserve source/ref policy. Explicit release migration produces matching CLI/app release versions and coherent release metadata.
- Historical missing optional fields work consistently across setup and uninstall. No absent field permits deletion of an unrecorded config/integration; malformed, transplanted, linked, overlapping or unowned paths remain refused.
- Local migration retains the exact configured root and canonical bytes, credentials, profiles and customized integrations. Failure/rollback preserves a working predecessor or an explicit recoverable state; retry never repeats a completed note operation or initializes a second brain.
- The chosen QMD CLI/SDK is identical across setup, verification and native configuration; an older PATH binary cannot shadow the selected compatible private engine. Diagnostics name selected/required versions and the selection source without note bodies or credentials.
- Remote-only CLI migration creates neither QMD/model state nor a local memory folder. Dry runs make no installation, manifest, engine or retention changes.

## Tasks

- [ ] 1.0 Freeze the supported compatibility boundary in disposable fixtures.
  - [ ] 1.1 Recover representative historical installer manifest/shim shapes from repository history; add sanitized synthetic fixtures with missing `distribution`, `qmd`, `cliConfigPath`, state and modern readiness fields. Record which shapes are supported; do not encode one reported version as the discriminator.
  - [ ] 1.2 Reproduce add-app reuse of an incompatible old CLI and the install/uninstall validation mismatch. Include a capable current CLI, an explicit pin, a custom source, dirty/untracked checkout content and unowned/malformed layouts as negative controls.
  - [ ] 1.3 Define a bounded read-only capability/ownership plan before writes: installed version, requested distribution/candidate version when known, preserved root/policy, engine source, eligible action and blockers. Use existing JSON result fields where possible; missing output/schema and failed readiness must be distinct.
- [ ] 2.0 Make the existing bootstrap a safe explicit migration path.
  - [ ] 2.1 Restrict add-app reuse to a validated compatible runtime; otherwise return the concrete bootstrap migration guidance before replacing software. Direct legacy `desktop:setup` through the same compatibility gate before dependency builds.
  - [ ] 2.2 Support intentional `--source release` migration for eligible managed installs, clearing inherited default-branch metadata coherently while preserving ordinary pinned/custom behavior. Validate ownership and dirty-checkout policy before staging; never reset or merge installed Git history.
  - [ ] 2.3 Stage and verify the candidate through the current release/digest, lock and retention mechanisms. Preserve old runtime/manifest and existing integration hashes/settings; require safe stopped-app/runtime handoff where existing transactions need it. Specify failure/retry and rollback outcomes for each publication boundary.
- [ ] 3.0 Unify compatibility and dependency diagnosis at the existing entry points.
  - [ ] 3.1 Reuse a narrow manifest compatibility classifier in setup/install/uninstall. Normalize only proven optional omissions; retain deletion allowlists and do not remove a config whose ownership cannot be established. If a helper is added, include it in pinned bootstrap downloads and distribution manifests.
  - [ ] 3.2 Reuse the existing engine selector/check in Desktop setup; validate override/recorded/private/PATH precedence without duplicating Python discovery. Preserve external-engine and remote-only policies; reject replaceable-app-local engine dependencies.
  - [ ] 3.3 Emit concise structured compatibility and dependency failures: installed/candidate or required version/capability, failing check, selection source and exact next command. Mark failed checks false even when output is malformed or lacks modern fields; avoid private paths/bodies in tracked evidence and keep runtime stderr bounded.
- [ ] 4.0 Verify the migration and document its supported contract.
  - [ ] 4.1 Extend installer recovery/install-script tests with byte-identical external roots, refusal of install-overlapping roots, old manifest omissions, compatible/old/wrong QMD, explicit overrides, pins/custom installs, dirty trees, dry runs, remote-only, unsafe ownership, interrupted verification/publication, retry and protected predecessor checks. Use fake engines/releases for deterministic failures.
  - [ ] 4.2 Run `node --test test/installer-recovery.test.js` and the relevant cases in `test/install-scripts.test.js`; build once before tests importing `dist/`. Run `python3 integrations/electron/test_desktop_install.py` for changed native configuration/lock behavior. Select affected `test/installation-storage.test.js` and `test/desktop-updater.test.js` cases only when their contracts change.
  - [ ] 4.3 Exercise one disposable default-managed legacy CLI → verified-release plus matching packaged Mac app migration, including real local doctor/recall and exact shared-root/profile verification. Add an induced failure/recovery at the changed transaction boundary. Reuse the existing Desktop installation/updater fixture; document any fixture-only shortcuts, real-download and hardware limits. Do not install into the user's actual home.
  - [ ] 4.4 Update [installation](../../docs/install.md), [agent installation](../../docs/install-for-agents.md), the relevant Desktop/installation-storage docs and pending release notes with one canonical migration path and explicit unsupported cases. Check links/commands and `git diff --check`; update feedback outcomes, then finalize through [task workflow](../../docs/task-workflow.md) when implementation and required gates are complete.

## Investigation verification and limits

- Full selected email read through the documented read-only inbox command; source and existing fixtures reviewed at the snapshot above. No historical raw manifest, actual legacy installation, published download or packaged upgrade was exercised.
- `node --test --test-name-pattern='JSON preflight failure and dry run' test/installer-recovery.test.js` passed **1/1** on November 14. This confirms existing disposable preflight/dry-run/remote-only coverage; it does not verify the proposed migration or the historical report.
- No implementation, user-install changes, global dependency changes, model download, remote mutation or feedback reply occurred. Parent integration owns feedback-index and broader-task crosslinks. Keep this list active until its implementation/validation tasks finish.

Planning integration review checked local document links, referenced command targets and unchanged open feedback outcomes; `git diff --check` passed. Implementation and its required verification remain open.
