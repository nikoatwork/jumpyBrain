# Diagnostic follow-up — 2026-10-24

Implementation sub-agent evidence for the follow-up “well test them all and improve.” Based on HEAD `695bae9`, with concurrent unrelated checkout work preserved. Original [judgment](judgment.md), [Claude persona](user-1-claude-nontechnical.md), and [project CLI persona](user-3-project-cli.md) remain historical evidence; they were not rewritten as post-fix passes.

## Reproduction against shared baseline dist

Used fresh child processes, an isolated temporary HOME/project, fictional integration files, an explicit absent QMD override, and explicit temporary memory roots. No real notes, app configuration, global installation or remote target was accessed/changed.

- **Confirmed:** unhealthy `doctor --root <absent-root> --json` exited **0** with `ok:false`; root message was `Unable to inspect memory root readiness.`
- **Confirmed:** recall at the absent explicit root exited **1**, exposed `ENOENT`, and supplied no same-root init hint.
- **Confirmed:** after explicit temporary initialization, index with an absent `JUMPYBRAIN_QMD_BIN` exited **1**, but neither identified the selected override value nor advised unsetting it.
- **Confirmed as file-presence coverage only:** a project-only Claude skill file existed at the installer-owned project path; baseline doctor reported only its absent global counterpart and supplied no project evidence. This was a fictional file fixture, not an installed/activated Claude host test.

## Implemented behavior

- `doctor --check` is a strict valueless Boolean. Required CLI/Node/QMD-version/root-compatibility failure exits **1** after printing the same report; `--json` stays parseable and stderr stays empty for reported health failures. Legacy unhealthy doctor retains exit **0**. Index freshness and optional integrations remain separate information, so missing/stale index or absent integration alone does not fail strict doctor. No sample note, root initialization or index work is added.
- Doctor's scoped parser rejects unknown/repeated flags, valued Boolean flags, missing/empty root values, unexpected positionals and remote flags before policy/filesystem/probe work. QMD version probes now have a five-second/64-KiB bound and do not expose raw backend output.
- CLI dispatch and doctor share safe root-inspection formatting in `targets.ts`. Only `realpath` ENOENT for the selected root gets an executable POSIX-shell-quoted same-root initialization hint. Config parsing/access, directory permission failure, and a missing configured index source remain distinct. No alternate root or implicit initialization is selected. Config matching accommodates realpath/symlink aliases such as macOS `/var` versus `/private/var`.
- QMD setup failures retain the existing engine resolver and now identify explicit override values plus correction/`unset JUMPYBRAIN_QMD_BIN` guidance before installation advice. Doctor identifies the override through its `qmd.binary` field and labels the failed override in its message. This does not implement the deferred portable-distribution/resolution project.
- Doctor labels existing `integrations` as `integrationsScope: "global"`. Explicit roots add `projectRoot` and `projectIntegrations` for the selected root itself, or its parent for a conventional `memory` directory. Checks use the actual Codex/Claude/Pi project paths; global Pi's `agent` segment is omitted for project Pi. Output explicitly states file presence and that host activation is unchecked. No cwd/ancestor target inference is introduced; without explicit root, project evidence is labeled uninspected.
- Updated CLI reference and owning CLI/QMD module docs. No parent-owned task/changelog/release notes were edited.

## Verification

All source compilation went to disposable output, with copied tests and the existing dependency directory linked for compilation. Shared `dist` was never rebuilt or replaced. No install, commit, push, release, feedback send, or real personal/team/global note write was performed.

Final focused source snapshot compiled successfully with `tsc -p tsconfig.json --outDir <temporary-build>/dist`.

1. **42/42 passed, zero skips/failures:** temporary-build copies of `test/cli-doctor-followup.test.js`, `test/cli-error-contracts.test.js`, `test/cli-baseline-contracts.test.js`, and `test/semantic-index-lifecycle.test.js`.
2. **5/5 passed:** selected `test/semantic-index-seams.test.js` cases matching `doctor|CLI index forwards|CLI rejects remote|state mutators|overlapping rebuild` against the temporary build.
3. **16/16 passed:** `node --test test/architecture-boundaries.test.js` against the checkout source. CLI still imports no QMD internals, and core/runtime/server dependency boundaries remain intact.
4. **Passed:** `git diff --check` at verification time.

The eight new regressions cover legacy/strict unhealthy JSON and no-write behavior; 12 malformed-option variants with a probe-execution sentinel; literal same-root recovery under spaces, apostrophes, quotes, dollar/shell metacharacters and command substitution; bad-override failure and unset/PATH recovery with exactly one fictional note; malformed config; project-only file evidence for all three integrations; actual POSIX permission denial on a disposable folder; and a missing configured index root that must not get an init hint. Healthy/unhealthy doctor snapshots compare fixture directory entries and file bytes. Invalid flags neither run the probe nor change the fixture. Permission denial ran under this non-root macOS user without skipping. No claim is made about filesystem access times or arbitrary third-party executable side effects. Final focused test processes also used a temporary outer HOME so existing direct doctor seam tests inspected no real integration directories.

**Real QMD 2.8.3 local end-to-end: passed**, macOS arm64 / Node `v26.7.0`, using already-provisioned `/opt/homebrew/bin/qmd`, a temporary HOME and explicit root. No dependency/model download or install was performed. Sequence:

1. Explicit init → strict doctor JSON `ok:true` before the first note.
2. Saved/indexed exactly one fictional finding: “The fictional community event is on 18 November. The year was not specified.”
3. Absent override → strict doctor exit **1**, parseable JSON naming the selected override and unset advice; compact recall exit **1** with the selected value and correction advice.
4. Removed the override → strict doctor `ok:true` through normal resolution; fresh-process rich recall preserved both date and uncertainty clauses.
5. Confirmed exact same canonical note bytes, exactly one finding, and a healthy doctor's unchanged fixture HOME/root filenames and bytes. All disposable real-QMD notes/runtime state were removed afterward.

## Initial failures corrected / remaining limits

The first temporary-build test run exposed a malformed-config classification failure caused by macOS realpath aliases. That implementation issue was corrected and its final regression passes.

An unfiltered first run of the existing semantic seam file also hit an unrelated **temporary-build harness prerequisite**: `tsc` alone does not produce `dist/adapters/http-server/extensions-bundle.js`, so the HTTP-route case could not import its browser bundle. That case was excluded from the subsequent focused seam run. It is **not recorded as a passing HTTP case**. Parent owns the coordinated full build/browser bundling and complete suite; neither final full build nor full suite is claimed here.

Project integration checks prove only exact file presence/absence in disposable fixtures, not actual installation or Claude/Codex/Pi discovery/activation. No physical/native/human onboarding pass is claimed. Semantic models, clean-machine prerequisites, Linux/Windows execution, portable QMD consumer resolution, Desktop/native permissions, hosted read-only behavior and remote writes are outside this subtask's executed coverage. Existing remote policy dispatch was preserved; no remote command was sent. Doctor remains an inexpensive version/compatibility/readiness observation, not proof of SDK completeness, SQLite integrity, semantic retrieval or agent activation.

## Handoff

Owned changes: `src/cli/{args,commands,doctor,targets,usage}.ts`, `src/cli/cli.docs.md`, `src/adapters/qmd/qmd-cli.ts`, `src/adapters/qmd/qmd.docs.md`, `docs/cli-commands.md`, `test/cli-doctor-followup.test.js`, and this report. Concurrent changes elsewhere, including `src/cli/instructions.ts`, belong to others and were preserved. Parent should run its final coordinated build/full suite, review this additive CLI contract, consolidate task/release/changelog notes, and make the final commit. This sub-agent did not commit.
