# Synthetic onboarding: Claude Code, nontechnical knowledge worker

Date: 2026-10-24. Persona: “Install jumpyBrain for me so you can remember my project decisions”; “Remember that the community event is on 18 November”; new session: “When is the community event?”

## Outcome

**PASS for an isolated agent-assisted install and CLI remember → fresh-process recall. UNTESTED for actual Claude skill discovery, activation and conversation continuity.** The answer supported by retrieved evidence is **18 November; no year was specified**. No model, account, desktop app, or shared server was needed for this example. The agent can handle the commands using the public docs; the person need not type them.

Two directly observed diagnostic issues deserve fixes: dry-run falsely reports completed installation, and an unhealthy doctor returns exit 0. The main conversation risk is ambiguous “global” write-permission wording in the generated skill, not a demonstrated failed Claude conversation.

## Scope and environment

- Started at `README.md`; followed `docs/install-for-agents.md`, `docs/install.md`, `docs/faq.md`, `docs/agent-workflows.md`, linked `skills/jumpybrain-memory/SKILL.md`, public installer help and CLI help. Also read required `AGENTS.md` and `docs/product-vision.md`.
- macOS Darwin arm64; Node `v26.7.0`, npm `11.19.0`, Git `2.43.0`; tested installed jumpyBrain `0.3.8`. Checkout HEAD observed: `a50598f5f4538fa8ea5cbafa3cb6a3a9f0327fd0`. Checkout was dirty and other agents continued editing it; this is a local working-copy test, not proof of the published release snapshot.
- `command -v jumpybrain` found the real user's existing launcher; **did not execute it**. Used only a new temporary installation. Existing `/opt/homebrew/bin/qmd` supplied exact `@tobilu/qmd@2.8.3` CLI + SDK. Existing repository `node_modules`/`dist` were present; installation built a separate runtime and reported installing 25 packages. No globally installed packages were added.
- Temp base: `/tmp/jumpybrain-user1-gbS7U1`; home: `<base>/home`; cache: `<base>/cache`; workspace: `<base>/workspace`. `/private/tmp/...` in runtime output is macOS's resolved alias of the same root, not another brain.
- Used documented `--source <local-checkout>` instead of the README's network bootstrap. This avoids testing a moving remote source and limits install-tooling time. **GitHub bootstrap/download, a machine lacking Node/QMD, npm-global permissions and minimum Node 22 compatibility remain untested.** npm did access dependencies; no network packet audit was performed.
- Only synthetic content was written. No real notes, credentials, feedback, real agent configuration, app state, source/docs/tasks, global install, commit, release or publication was changed by this test. Temporary artifacts were retained for reproduction. This report is the only owned checkout edit.

## Reproduction and observed steps

Commands below use these reproducible shell shorthand definitions (the test executed their equivalent absolute command lines):

```sh
B=/tmp/jumpybrain-user1-gbS7U1
CLI="$B/home/.jumpybrain/bin/jumpybrain"
ROOT="$B/home/.jumpybrain/memory"
E() { env HOME=/tmp/jumpybrain-user1-gbS7U1/home XDG_CACHE_HOME=/tmp/jumpybrain-user1-gbS7U1/cache JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd "$@"; }
BAD() { env HOME=/tmp/jumpybrain-user1-gbS7U1/home XDG_CACHE_HOME=/tmp/jumpybrain-user1-gbS7U1/cache JUMPYBRAIN_QMD_BIN=/tmp/jumpybrain-user1-gbS7U1/missing-qmd "$@"; }
```

1. **PASS — discover prerequisites and local/privacy explanation.** Read the public docs above. Read-only commands: `node --version`, `npm --version`, `git --version`, `uname -sm`, `command -v jumpybrain`, `command -v qmd`, `ls -ld node_modules dist`. Outputs are recorded above. CLI prerequisites are grouped together; desktop prerequisites are separate and optional. The guide tells the agent to report missing prerequisites together, reuse an existing install, and complete authorized setup without repeated confirmations. Actual missing-prerequisite aggregation was not exercised.

2. **PASS — public installer help.** From checkout: `node scripts/public-install.mjs --help` (exit 0). Advertised `--source`, `--scope global|project`, `--memory-root`, `--install-root`, `--integrations auto|all|none`, `--dry-run`. Created temporary home/cache/workspace using `mktemp -d /tmp/jumpybrain-user1-XXXXXX` and `mkdir -p "$B/home/.claude" "$B/workspace" "$B/cache"`. Empty `.claude` simulated Claude configuration presence; inherited PATH also contained installed harness tools.

3. **FAIL — dry-run truthfulness.** `E node scripts/public-install.mjs --source /Users/monkey/dev/jumpyBrain --dry-run` (exit 0). Output included:

   ```text
   [jumpybrain] Installing jumpyBrain (global)
   [jumpybrain] QMD available: @tobilu/qmd@2.8.3 (CLI + SDK)
   jumpyBrain install complete.
   Integrations installed:
   - claude:/tmp/jumpybrain-user1-gbS7U1/home/.claude/skills/jumpybrain-memory/SKILL.md
   ```

   Codex and Pi paths were also listed. This was a preview, yet the output described completed changes and supplied a runnable recall command. Source inspection **after observing this** confirmed writes are guarded by `!options.dryRun` but the completion summary is unconditional (`scripts/public-install.mjs:98`, `:112`, `:550`).

4. **PASS — real isolated install.** `E node scripts/public-install.mjs --source /Users/monkey/dev/jumpyBrain` (exit 0). Observed stages: copying app; installing dependencies; building CLI/editor; initializing memory; checking compatible QMD; initial index. Key output:

   ```text
   added 25 packages, and audited 26 packages in 2s
   found 0 vulnerabilities
   Initialized memory root: /private/tmp/jumpybrain-user1-gbS7U1/home/.jumpybrain/memory
   Indexed 0 Markdown documents into QMD collection 'jumpybrain'
   Readiness: fresh; modes: lexical; embeddings: disabled
   jumpyBrain install complete.
   ```

   Final summary printed the correct root and absolute CLI, `CLI policy: not configured`, and all three integrations. npm also warned that esbuild's install script was not covered by `allowScripts`, and offered an npm major upgrade; build still succeeded. No approval or npm upgrade was attempted. Installation completion did **not** print the restart/reload instruction, although README/install docs do.

5. **PASS — installation verification without writing a sample.** From `$B/workspace`: `E "$CLI" doctor` and `E "$CLI" recall --root "$ROOT" --topic 'installation check' --limit 5` (both exit 0). Doctor reported CLI/Node/QMD/root/all integration files `ok`, lexical/fresh/embeddings disabled. Recall printed:

   ```text
   Prior memory scan for: installation check
   No memory matches found.
   ```

   This is a normal empty brain, consistent with the docs.

6. **PASS for generation; UNTESTED for host loading.** Read `cat "$B/home/.claude/skills/jumpybrain-memory/SKILL.md"`; searched `rg -n '__JUMPYBRAIN_' <that-file>` (no matches). CLI and root placeholders were replaced with the exact temp paths. Frontmatter description triggers on requests to remember/recall durable context and tasks dependent on prior decisions. The skill supplies bounded recall and stdin remember commands, privacy boundaries, citations, evidence-date caution, and instructions not to retry uncertain writes. `doctor` only checks integration-file presence; its `claude: ok` is not a real Claude discovery/activation test (`src/cli/doctor.ts:65`). No authenticated Claude session or restart was run.

7. **PASS — explicit synthetic remember.** Simulated the user's authorized request without inventing a year:

   ```sh
   printf '%s\n' 'The community event is on 18 November. The year was not specified.' |
     E "$CLI" remember --root "$ROOT" --type note --title 'Community event date'
   ```

   Exit 0:

   ```text
   Remembered memory: notes/2026-10-24-community-event-date.md
   Saved document ID: mem_34e8c33c-48f6-450d-99c2-aa6987721b09
   ```

   Canonical Markdown contained the exact body; `created_at` was `2026-10-24T19:00:24.780Z`. No `--date` was used: the event date belongs in the body, not as an invented writing/evidence date.

8. **PASS — separate-process recall, including a different working directory.** From `$B/workspace`, launched a new CLI process:

   ```sh
   E "$CLI" recall --root "$ROOT" --query 'When is the community event?' --limit 10 --compact
   ```

   Exit 0; JSON reported `freshness:"fresh"`, `modes:["lexical"]`, `retrieval.status:"complete"`, `warnings:[]`, and one passage:

   ```text
   notes/2026-10-24-community-event-date.md:12-14
   # Community event date The community event is on 18 November. The year was not specified.
   ```

   It included the saved document ID and a hash-checked expansion handle. This passage suffices; no expansion was needed. Later, from `$B`, `E "$CLI" recall --root "$ROOT" --query 'When is the community event?' --limit 5` returned the same cited answer in plain text. This verifies disk-backed continuity across CLI processes and directories, **not a fresh Claude conversation**.

9. **PASS for clear recall failure; FAIL for doctor exit-status signaling; recovery is partial.** Deliberately selected a nonexistent executable using BAD. `BAD "$CLI" doctor` printed `jumpyBrain doctor: attention needed` and `QMD: missing`, **but exited 0**. It also printed `Readiness: fresh; modes: lexical; embeddings: disabled`, describing saved index readiness despite unavailable runtime dependency. `BAD "$CLI" recall --root "$ROOT" --query 'When is the community event?' --limit 10 --compact` exited 1:

   ```text
   qmd CLI is required. Install with `npm install -g @tobilu/qmd@2.8.3` or set JUMPYBRAIN_QMD_BIN.
   ```

   Existing valid QMD was already installed; the problem was the explicit override. Text did not name its value or recommend correcting/removing it. Public install docs do explain resolution priority. Restoring E recovered the successful plain recall above. `rg --files "$ROOT/notes"` showed one note; no reinstallation or duplicate remember was needed.

10. **UNTESTED — native desktop, models and actual permissions denial.** This persona needs only Claude + CLI. Did not build/open/change the user's app, start a UI service, download models, access a remote brain, send feedback, or manufacture a tool-policy denial. No native UI pass is inferred. `E "$CLI" --help` exited 0 and exposed supported setup/remember/recall/index commands; it is agent-facing command documentation, not a human onboarding wizard.

## Persona expectations, confusing terms and limits

- **One local brain:** absolute CLI/root configuration supports this across projects. Docs correctly warn that desktop folder choice does not retarget agents. “Global” means machine-wide personal installation here, while “global/team/remote memory” can sound like shared online memory. “CLI policy: not configured” and “embeddings: disabled” are explained in the docs, but the completion output leaves the agent to translate them.
- **Permission ambiguity (hypothesis):** generated skill says “Only write global/team/remote memory when the user explicitly asks for global/team/remote memory to be updated.” The default local root is also described as global. A literal agent might unnecessarily ask whether “Remember that…” authorizes writing to the default personal brain. I treated the explicit remember request as authorizing this synthetic local write. No actual Claude permission loop was observed.
- **Natural-language activation (untested):** the description should cover “When is the community event?”, but README examples explicitly name jumpyBrain; the persona does not. File presence and CLI success cannot establish host selection or behavior.
- **Privacy:** public docs are clear and appropriately qualified: local Markdown/search; no account/server needed; installation downloads software; recalled excerpts can enter Claude's cloud context; feedback, remote targets and file sync are separate outbound choices. No claim of verified cloud isolation or packet-level privacy is made.
- **Simple confirmation:** an assisting agent can truthfully say “Saved locally: the community event is on 18 November; the year wasn't specified,” then in a fresh session cite the note. The raw CLI confirms file/ID; the agent must translate that rather than require the person to understand QMD, lexical mode, compact JSON, or a memory root.

## Ranked improvements

1. **Medium — observed misleading dry-run success.** Impact: an installing agent/person can believe the brain and skill exist after only previewing changes. Minimal fix: explicitly label dry-run at start and finish, use “would install,” and never print “install complete”/“Integrations installed” for a preview. E2E validation: with a clean temp HOME run the public bootstrap `--dry-run`; assert no runtime/root/skills exist and all reported actions are conditional; then perform a real install and require doctor + empty recall to pass.

2. **Medium — observed unhealthy doctor exit 0.** Impact: automation that checks only command success can hand back a broken installation. Minimal fix: return nonzero for failed required checks (or provide a documented strict mode if compatibility requires it); retain structured `ok` reporting. E2E validation: valid isolated install → doctor exits 0; nonexistent QMD override → doctor exits nonzero and recall fails; restore override → doctor and recall pass without rewriting the note. Agent docs should require interpreting findings, not only exit status.

3. **Medium — observed generic dependency recovery.** Impact: an agent may reinstall global QMD while the overriding bad path remains selected. Minimal fix: name the selected binary and source (`JUMPYBRAIN_QMD_BIN`) in the error and suggest correcting/unsetting a bad override before installation. E2E validation: retain valid PATH QMD, set nonexistent override, verify actionable diagnosis; remove override and recall the same saved note without reinstalling or remembering again.

4. **Medium — hypothesized personal/global permission confusion.** Impact: unnecessary follow-up approval disrupts the requested natural-language flow. Minimal fix: explicitly distinguish a machine-wide personal local brain from shared/global/team/remote destinations; state that an explicit “remember X” request authorizes the configured personal local save while setup alone authorizes no sample writes. Preserve explicit authorization for shared destinations. E2E validation: real fresh Claude sessions with these exact three persona prompts, checking no redundant consent for personal remember, one canonical note, and sourced November answer; separately verify unauthorized team writes remain blocked.

5. **Low — observed missing restart reminder in install completion.** Impact: the agent may return success before the running Claude host can discover its new skill. Minimal fix: add restart/reload guidance and a short user-facing completion summary (“one local folder; text search ready; semantic model optional”). E2E validation: install while Claude is already open, capture completion guidance, restart Claude, ask the unbranded remember question and fresh-session recall; distinguish integration generation from proven host activation.

No fixes were implemented. After public-path testing, source investigation was limited to the installer and CLI diagnostic explanation, preceded by `src/architecture.docs.md` and `src/cli/cli.docs.md`. Other checkout edits were preserved.
