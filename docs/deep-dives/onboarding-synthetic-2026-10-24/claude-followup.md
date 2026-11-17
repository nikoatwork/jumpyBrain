# Claude onboarding follow-up

Date: 2026-10-24. Tested checkout base: `695bae9ef15f9bc7bd2408ee14651a37f27d0639`, with this follow-up's skill/workflow changes and concurrent unrelated working-tree edits. This is synthetic validation, not a human usability study or a release-candidate certification. [Original persona](user-1-claude-nontechnical.md) and [original judgment](judgment.md) remain historical evidence and were not rewritten.

## Result

**PASS:** current generated Claude/Codex integration commands, isolated source installation using existing baseline `dist`, real QMD lexical save/recall, preserved uncertain year, literal Pi defaults, and focused guidance regressions.

**BLOCKED:** actual Claude model activation and a fresh Claude conversation. A read-only `claude auth status` returned exit **1**, `loggedIn: false`, `authMethod: none`. Only these allowlisted fields were printed; account details and raw auth output were suppressed. No credentials were inspected/copied, no login was attempted, and no real Claude settings were changed.

One bounded real Claude invocation was attempted with the current generated project skill, an isolated HOME/config/cache/project and explicit temporary personal memory root. Its output matched an authentication-required diagnostic. The exact raw model-attempt output/exit was not retained after a later test-harness assertion failed; do not infer a more specific quoted diagnostic from this report. The preceding auth-status result is the retained exact blocker. The model attempt was not repeated or replaced with Codex.

## Scope and isolation

- Node `v26.7.0`; macOS arm64; existing `/opt/homebrew/bin/qmd`, `qmd 2.8.3 (facd35e)`.
- Public installer called with `--source /Users/monkey/dev/jumpyBrain --scope project --cwd <temporary-project> --home <temporary-home> --install-root <temporary-home>/.jumpybrain --memory-root <temporary-base>/personal\ brain --integrations all --skip-build --skip-qmd-install`.
- All runtime copies, skills, root, HOME, Claude config and XDG cache were temporary. Final successful run used `jb-claude-followup-na7C5W` under the OS temporary directory; that tree was removed afterward. Paths contained spaces.
- The installer copied the current skill/Pi assets and reused baseline compiled CLI output. Shared `dist` was neither rebuilt nor modified. These checks do **not** validate concurrent CLI source changes.
- Child environments were constructed from an allowlist: PATH plus temporary HOME/TMPDIR/XDG cache/Claude config, explicit QMD binary and disabled updater/telemetry settings. Parent model/auth/remote environment variables were not forwarded. The real Claude invocation used project-only settings and strict MCP config; no real personal-memory paths were supplied.
- No global package/skill installation, app launch/configuration, real notes, shared memory, feedback submission, authentication, commit, push or release. Only owned guidance, a new focused test and this report were edited. Parent owns final task/changelog/release-note work and commit.

## Validation evidence

| Check | Observed result | Limit |
| --- | --- | --- |
| Actual installer dry-run | Exit 0; `No changes made`; temporary project remained empty | Source-copy route, not GitHub bootstrap |
| Actual isolated installation | Exit 0; completion and restart/reload reminder present; real QMD initial index succeeded | Existing Node/QMD and baseline dist; no clean-machine dependency test |
| Generated files | Claude `.claude/skills/jumpybrain-memory/SKILL.md` and Codex `.agents/skills/jumpybrain-memory/SKILL.md` byte-identical; no unresolved placeholders | Structural generation, not host discovery or model selection |
| Pi defaults | Parsed generated JS literal defaults equal the same absolute temporary CLI and memory root | No native Pi host/extension activation or model interpretation tested |
| Install/check without capture | Generated CLI `doctor --root <temporary-root> --json`: exit 0, `ok:true`; executed the installer's printed recall command: exit 0, no matches; no findings before capture | Not evidence that Claude performed these steps |
| Claude auth status | Exit 1, `loggedIn:false`, `authMethod:none` | No authentication attempted |
| Real Claude install/check request | One invocation reached an authentication-required block; no sample note created | Model activation, tool use and natural-language completion blocked |
| Explicit fictional remember | Executed the generated skill's complete `printf … \| … remember` example, replacing only its body/title placeholders; exit 0 | CLI command execution, not a model deciding to invoke the skill |
| Fresh-process recall | Executed the generated skill's precise-question example in a new shell and different working directory; exit 0, lexical/fresh, no retrieval warnings | Fresh CLI process, not a fresh Claude session |
| No duplicate/spontaneous capture | Exactly one fictional finding after remember/recall; no extra session wrapup | Deterministic command scope, not proof of model compliance |

The remembered body was exactly:

```text
The community event is on 18 November. The year was not specified.
```

The generated example specifies `--type finding`, so canonical output was `findings/2026-10-24-community-event-date.md`. Its body retained both clauses and had no invented frontmatter `date`. Compact recall returned the same text with `pathBasis: canonical_root`, lines **12–14**, and `date.basis: written` from `created_at`. Writing time was not treated as the event year. An expansion handle was available, but the retrieved passage already answered the question; no expansion was needed.

The first harness wrongly asserted the result would be in `notes/`; after fixing the bucket assertion, a second run exposed one remaining hard-coded `notes/` read. The final run corrected both and passed. These were test-harness errors, not observed product failures. The only real Claude attempt occurred in the first run, before the assertion error. All run-specific temporary trees were removed.

### Real CLI invocation shape

The actual isolated Claude attempt used:

```sh
claude -p 'Install jumpyBrain for me if needed and check that local search works. Use the configured personal local brain. Do not save a sample memory.' \
  --no-session-persistence --strict-mcp-config --setting-sources project \
  --tools Read,Skill,Bash --output-format json
```

It ran from the temporary project containing the actual generated `.claude/skills/jumpybrain-memory/SKILL.md`, with a separate `CLAUDE_CONFIG_DIR` and a 25-second subprocess timeout. No permission bypass flag was used. Since authentication failed, the subsequent nontechnical remember and fresh-session question could only be exercised through their generated CLI examples. Claiming these as successful Claude conversations would be incorrect.

### Deterministic regression command

```sh
node --test test/onboarding-guidance.test.js test/recall-guidance.test.js test/onboarding-install.test.js
```

**15 tests passed, zero failed/skipped.** No build ran. The existing installer regression uses a fake QMD fixture to test emitted shell commands, generated Claude/Codex examples, Pi defaults and paths with shell metacharacters. This fixture result is separate from the real QMD run above. The new four guidance contracts check authorization wording and loading-result limits; static assertions cannot prove that a model follows the guidance. Scoped `git diff --check` also passed.

## Guidance improvements

- The skill description now covers recall of saved personal facts without explicitly naming jumpyBrain.
- An explicit “remember” request authorizes the configured **personal local** save without repeating consent. A machine-wide `--scope global` install is distinguished from a shared-memory destination.
- Setup/check alone authorizes no sample; ordinary conversation, useful findings and a single-fact remember request authorize no spontaneous capture or extra wrapup.
- Shared/global/team/remote memory still requires explicit destination authorization, including shared roots physically on the local machine. This is guidance, not a new storage ACL.
- Existing authorization remains usable; the agent should ask only when shared destination authorization is actually missing.
- Workflow docs separate file generation, host discovery, model activation and fresh-session evidence. They explain the explicit-skill fallback and warn against reinstalling/repeating a saved write merely because skill activation failed.
- Pi remains a separate extension asset. Its generated local defaults target the same temporary personal root, while `jumpybrain_global_*` routes remotely with explicit global/team-write guidance. Its tool text was inspected, not changed or certified through a native host.

## Public entrypoint reachability

On 2026-10-24 the public [GitHub project](https://github.com/nikoatwork/jumpyBrain#start-your-own-brain), [raw README](https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/README.md), and [agent installation guide](https://github.com/nikoatwork/jumpyBrain/blob/master/docs/install-for-agents.md) were fetched without authentication. The public README has **Instructions for your agent** under **Start your own brain**, linking to the guide, and links to agent workflows. The guide contains the local/privacy explanation, reuse/check instructions, setup authorization and no-sample rule. This establishes reachable public instructions, not observed first-time human success.

The fetched public README did **not** contain the checkout's newer “Using Claude Code without wanting to learn terminal commands?” copyable prompt. That improvement exists locally but should not be described as verified live publication. No publishing action was authorized here.

One bounded web query, `jumpyBrain Claude Code install memory nikoatwork`, returned unrelated products before the directly opened project. It did not establish that jumpyBrain is the first web result; search ranking is not reproducible product onboarding evidence. Once on the public project, the installation guide is reachable. Owned workflow guidance now links that project entrypoint and gives a concrete first-memory/fresh-session check.

## Parent handoff and remaining limits

1. **Real model gate remains blocked:** authenticated Claude discovery/activation, no redundant personal-save permission question, unbranded recall and a fresh Claude conversation require a usable authorized Claude session. No Codex substitute was used.
2. **Adjacent source wording remains outside ownership:** `src/cli/instructions.ts` still says “At session end, recall likely duplicates/conflicts, then pipe a strict wrapup…” without the owned skill's explicit local-wrapup guard. Parent should align this generated CLI guidance if claiming consistency across all entrypoints. It was read but not edited here. The current focused regression does not certify that source text.
3. **Pi host behavior remains untested:** parsed defaults and tool guidance do not establish native extension discovery or model compliance. No shared-destination authorization-denial conversation was run.
4. No physical/native app, human onboarding, minimum Node, clean machine, semantic embedding, network bootstrap, or cloud-isolation pass is claimed. Installed user integrations were not refreshed; managed updates preserve them, so new repository guidance does not silently update existing skills.
