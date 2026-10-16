# Easy Installation and Agent Onboarding

## Goal

Make jumpyBrain usable within minutes without npm publication: a copy-paste installer sets up a machine-global memory root by default, installs/verifies the CLI and QMD, and installs the right agent integration for Codex, Claude Code, and Pi when those harnesses are available.

## Completion Summary

Completed on 2026-06-26. Added installer/uninstaller scripts, portable Codex/Claude skill, Pi extension, QMD binary resolution hardening, `jumpybrain doctor`, installer docs, README top install prompt, deterministic installer tests, and validation (`npm run validate`) passing with 60 tests.

## Notes

- Default install path should be machine-global memory and machine-global integrations.
- Users must be able to choose project-local memory and project-local skills/integrations for the current directory.
- Do not modify global `AGENTS.md`, `CLAUDE.md`, or other broad instruction files automatically. Rely on skills/extensions and show optional instructions instead.
- Pi should default to a real Pi extension because it gives tools/slash commands; portable Agent Skills remain the default for Codex and Claude Code.
- Installer should auto-detect available harnesses and install all matching integrations by default.
- Uninstall should remove the CLI/app shims and installed integration files only by default. It may delete Markdown memory roots only when the user explicitly passes `--delete-memory`.
- Keep Markdown canonical and derived QMD state rebuildable. Do not add hidden prompt injection.
- Deterministic validation should not require paid model calls.

## Decisions

- Use an install script rather than npm publication for the first public try-it path.
- Global memory default: `~/.jumpybrain/memory` unless implementation research finds a better XDG-compatible path.
- Global integration default; project-local option for both memory and integration install.
- Pi default integration: extension under Pi’s extension location.
- Codex/Claude integration: portable Agent Skill copied into their supported skill locations.
- No automatic global agent-instruction edits.
- Uninstall keeps memory files by default; `--delete-memory` is an explicit destructive opt-in.

## Relevant Files

- `package.json` - Current package is private, has CLI bin, requires Node >=22, and includes installer assets in package files.
- `src/cli.ts` - Existing commands and `instructions`; likely place for `doctor`, setup helpers, or installer-facing verification output.
- `src/cli/targets.ts` - Existing local/remote target selection seam; should not be collapsed by installer work.
- `src/cli/local-transport.ts` - CLI local runtime boundary; installer should not bypass runtime semantics.
- `src/qmd/qmd-cli.ts` - QMD invocation and missing-binary error; install work depends on stronger QMD resolution.
- `src/setup/project-config.ts` - Memory root discovery/config behavior; may need global-root support or installer-friendly status checks.
- `scripts/pack-local.mjs` - Existing verified tarball packaging; useful reference for install artifact checks.
- `scripts/install-local-cli.mjs` - Existing dogfood installer; likely not the public installer but useful reference.
- `docs/install.md` - Needs the new one-liner/current install flow.
- `docs/agent-workflows.md` - Needs agent skill/extension workflow docs.
- `docs/local-cli-builds.md` - Keep as maintainer/dogfood docs, separate from user installer docs.
- `install.sh` - Copy-paste installer wrapper that runs the versioned Node installer script.
- `uninstall.sh` - Copy-paste uninstaller wrapper that preserves memory by default.
- `scripts/public-install.mjs` - Installer implementation for source clone/local source, memory init, QMD verification, and integration install.
- `scripts/public-uninstall.mjs` - Uninstaller implementation using installer manifest and optional `--delete-memory`.
- `skills/jumpybrain-memory/SKILL.md` - Portable Agent Skill template for Codex and Claude Code.
- `integrations/pi/jumpybrain-memory.ts` - Pi extension template with tools and slash commands.
- `test/install-scripts.test.js` - Deterministic installer/uninstaller/doctor/QMD-resolution tests.
- `docs/technical.md` - Documents installer path, doctor command, and QMD resolution order.
- `tasks/todo/tasks-post-ralph-architecture-hardening.md` - QMD binary resolution task overlaps with installer reliability.
- `test/memory-cli.test.js` - Existing CLI integration tests; add installer-facing command tests here or nearby.
- `test/local-pack-scripts.test.js` - Existing script/package validation patterns for deterministic installer tests.

## Tasks

- [x] 1.0 Define the public install UX and support matrix
  - [x] 1.1 Pick the first canonical command shape, e.g. `curl -fsSL <raw-install-url> | bash`, with a second command only if verification requires it.
  - [x] 1.2 Define supported platforms for MVP: macOS/Linux shell first; explicitly defer Windows or document manual steps.
  - [x] 1.3 Define flags: `--scope global|project`, `--memory-root <path>`, `--integrations auto|all|none`, `--dry-run`, `--yes`, and `--ref <git-ref>` if installing from GitHub source.
  - [x] 1.4 Decide the install artifact strategy before coding: source clone/build now; release tarballs/checksums can follow tags.
  - [x] 1.5 Ensure the chosen strategy does not require publishing to npm and does not require sudo by default.

- [x] 2.0 Add installer-owned shared assets
  - [x] 2.1 Add a portable Agent Skill under a repo-owned path such as `skills/jumpybrain-memory/SKILL.md`.
  - [x] 2.2 The skill should instruct agents to use visible, bounded CLI recall/remember/wrapup against the configured memory root.
  - [x] 2.3 Add a Pi extension asset under a repo-owned path such as `integrations/pi/jumpybrain-memory.ts`.
  - [x] 2.4 Update the Pi extension to use `remember`, not the old `note` command.
  - [x] 2.5 Keep integration assets parameterizable by memory root and CLI path without hardcoded developer-machine paths.
  - [x] 2.6 Add a small manifest of installer-owned files so uninstall can remove only files jumpyBrain installed.

- [x] 3.0 Implement the install script
  - [x] 3.1 Add `install.sh` as the copy-paste entrypoint; keep it small and delegate complex logic to a versioned script where practical.
  - [x] 3.2 Verify Node >=22 and install or clearly fail with actionable instructions if missing.
  - [x] 3.3 Install/verify QMD for local runtime use; coordinate with QMD binary resolution work instead of assuming global PATH forever.
  - [x] 3.4 Install/verify the `jumpybrain` CLI without npm publication.
  - [x] 3.5 Initialize the memory root: default `~/.jumpybrain/memory`; project option `./memory` in the current directory.
  - [x] 3.6 Install all detected harness integrations by default.
  - [x] 3.7 For Codex global scope, install the portable skill to `~/.agents/skills/jumpybrain-memory/SKILL.md`.
  - [x] 3.8 For Claude Code global scope, install the portable skill to `~/.claude/skills/jumpybrain-memory/SKILL.md`.
  - [x] 3.9 For Pi global scope, install the Pi extension to `~/.pi/agent/extensions/jumpybrain-memory.ts`; optionally also install the portable skill only if useful.
  - [x] 3.10 For project scope, install project-local skills/extensions into the current repo’s supported locations without touching global files.
  - [x] 3.11 Print a concise success summary: memory root, CLI path, integrations installed/skipped, and one recall command to try.

- [x] 4.0 Implement uninstall
  - [x] 4.1 Add `uninstall.sh` or `jumpybrain uninstall` instructions matching the install artifact strategy.
  - [x] 4.2 Remove only installer-owned CLI/app files, shims, manifests, and integration files.
  - [x] 4.3 Do not delete `~/.jumpybrain/memory`, `./memory`, or any Markdown memory root by default.
  - [x] 4.4 Add an explicit destructive `--delete-memory` flag that removes only configured jumpyBrain memory roots after clear confirmation/acknowledgement.
  - [x] 4.5 Print preserved memory root paths by default, and print deleted memory root paths when `--delete-memory` is used.
  - [x] 4.6 Make uninstall idempotent and safe when some harnesses or files are already absent.

- [x] 5.0 Add installer-facing verification and diagnostics
  - [x] 5.1 Add a `jumpybrain doctor` command or equivalent script output that checks CLI version, Node, QMD, memory root status, and integration file presence.
  - [x] 5.2 Make diagnostics readable for users and machine-checkable with `--json`.
  - [x] 5.3 Ensure missing QMD errors mention local runtime install/server install context and `JUMPYBRAIN_QMD_BIN` if that override is added.
  - [~] 5.4 Add a first-run memory smoke test path that writes a harmless finding and recalls it, gated by explicit user consent or a test flag. Skipped: `doctor` plus existing remember/recall CLI tests cover diagnostics without writing surprise memory; add a consented smoke command later if dogfood shows need.

- [x] 6.0 Update docs and first-run guidance
  - [x] 6.1 Replace README quick start with the installer-first path while keeping source install as contributor guidance.
  - [x] 6.2 Update `docs/install.md` with global default, project-local option, harness integration behavior, and uninstall behavior.
  - [x] 6.3 Update `docs/agent-workflows.md` with what each harness receives: Codex skill, Claude Code skill, Pi extension.
  - [x] 6.4 Add a short troubleshooting section for PATH issues, QMD install failures, Node version, and agents needing restart/reload.
  - [x] 6.5 Keep `docs/local-cli-builds.md` framed as maintainer dogfood flow, not the public user install flow.

- [x] 7.0 Test install behavior deterministically
  - [x] 7.1 Add tests that run installer logic against a temporary `HOME` and temporary project directory.
  - [x] 7.2 Mock harness detection for Codex, Claude Code, and Pi and assert the expected files are installed for global and project scopes.
  - [x] 7.3 Test that install creates or initializes the expected memory root without deleting existing Markdown.
  - [x] 7.4 Test uninstall removes only installer-owned files and leaves memory roots intact by default.
  - [x] 7.5 Test uninstall `--delete-memory` removes only configured jumpyBrain memory roots and never follows broad/unowned paths.
  - [x] 7.6 Test idempotent re-run: installer updates owned files without duplicating or corrupting memory config.
  - [x] 7.7 Add a smoke test for `jumpybrain doctor --json`.
  - [x] 7.8 Keep real QMD execution optional or isolated; core installer tests should not depend on network, paid calls, or a model.

- [x] 8.0 Validate with real harnesses
  - [x] 8.1 Run the installer on a clean temp user profile or disposable machine account.
  - [~] 8.2 Verify Codex sees and can use the installed skill, or document required restart/enablement steps. Skipped direct interactive verification; Codex skill path is documented and deterministic file install is tested.
  - [~] 8.3 Verify Claude Code sees and can use the installed skill, or document required restart/reload steps. Skipped direct interactive verification; Claude skill path is documented and deterministic file install is tested.
  - [~] 8.4 Verify Pi loads the extension, exposes tools/slash commands, and uses the configured memory root. Skipped direct interactive verification; Pi extension path is documented and deterministic file install is tested.
  - [x] 8.5 Run a real end-to-end flow: remember one durable test memory, recall it with provenance, and run uninstall while preserving memory.

- [x] 9.0 Release and cleanup
  - [x] 9.1 Decide whether the installer should target `main`, tagged releases, or a stable install branch.
  - [~] 9.2 Add checksum or pinned-ref guidance if installing from release artifacts. Skipped: MVP clones source from `main`; checksums belong with tagged release artifacts.
  - [x] 9.3 Update `tasks/CHANGELOG.md` only when the installer milestone is completed or a structural distribution decision is finalized.
  - [x] 9.4 Archive this task list to `tasks/done/` after the install path is validated and documented.

## Non-Tasks

- Do not publish to npm as part of this task list.
- Do not build hosted/cloud memory here.
- Do not add automatic hidden prompt injection.
- Do not modify global `AGENTS.md`/`CLAUDE.md` by default.
- Do not delete user memory during uninstall unless the user explicitly passes `--delete-memory`.
