# Synthetic onboarding: user 3, project-local CLI

Date: 2026-10-24. Persona: CLI-capable developer/agent adopting project memory, then starting a fresh session. Repository HEAD: `a50598f`; CLI reports `0.3.8`. The checkout was already dirty and other agents continued editing during the run; existing `dist` was used without rebuilding or freezing its hashes, so HEAD alone does not identify the tested runtime snapshot. Investigation bounded to roughly ten minutes. Report only; no fixes, commits, global installation, actual agent configuration changes, feedback, release, or subagents.

## Outcome and evidence boundary

**PASS for the already-built local CLI flow:** initialize a project brain in a path containing spaces, save one synthetic decision, recall from a separate process, discover the same brain from a nested workspace, and expand its hash-checked source. The “only Aurora” qualification survived retrieval and expansion. Missing-QMD failure was actionable and reversible. An initialized empty brain correctly returned no matches.

**NOT a fresh-install or real cross-agent-loading pass.** Public installer was exercised in dry-run only. Existing repository `dist` and installed `/opt/homebrew/bin/qmd` CLI/SDK 2.8.3 were reused; no npm link, model download, dependency install, global shim, or generated integration was installed. The session switch is independent Node processes and changed working directories, not a restarted Codex/Claude/Pi host. Native Desktop, browser UI, semantic retrieval, hosted client, remote permissions, clean network bootstrap, and QMD SDK absence/incompatibility are untested. The bad-QMD test uses an explicitly nonexistent executable override, not removal of the machine's QMD.

Public discovery order: `README.md` → `docs/install-for-agents.md` and `docs/install.md` (project-local section, installer options, basic use) → `docs/agent-workflows.md` and `docs/cli-commands.md` → CLI help/instructions. Also read `AGENTS.md`, `docs/product-vision.md`, and the existing portable-installation task. `docs/local-cli-builds.md` was discoverable but explicitly calls itself a maintainer workflow, so I did not bump/package/install. Source inspection began only after reproducing the dry-run/quoting and diagnostic failures; architecture and co-located CLI, memory-root, and QMD docs were consulted before source explanations.

The README's default path is a machine-wide personal brain; project scope requires following Installation. The docs correctly distinguish “global on this machine” from hosted/team memory and say local search needs no account. This synthetic project used explicit authorized capture; no inference that installation grants remote/global write permission.

## Isolation and reproducibility

Temporary base: `/tmp/jumpy user3.T04f3d`; HOME: `/tmp/jumpy user3.T04f3d/isolated home`; project: `/tmp/jumpy user3.T04f3d/Synthetic Project`. macOS resolves `/tmp` to `/private/tmp`; both spellings in output identify the same brain, not a second root.

Every execution below used a fresh child process with the same isolated environment: `HOME` as above, `XDG_CONFIG_HOME=$HOME/config`, `XDG_CACHE_HOME=$HOME/cache`, `XDG_DATA_HOME=$HOME/data`, `JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd`. Inherited `JUMPYBRAIN_*`, `QMD_*`, `XDG_*`, `CODEX_*`, `ANTHROPIC_*`, and `OPENAI_*` variables were removed before these explicit settings. PATH was retained, but the real installed jumpyBrain launcher was never executed. Bad-dependency steps override only `JUMPYBRAIN_QMD_BIN` as recorded below.

Read-only prerequisites: `node --version` → `v26.7.0`; `npm --version` → `11.19.0`; `git --version` → `git version 2.43.0`; `command -v qmd` → `/opt/homebrew/bin/qmd`; `command -v jumpybrain` → `/Users/monkey/.jumpybrain/bin/jumpybrain`. Existing `node_modules` and `dist` present. `node dist/cli.js --help` succeeded and exposed `init`, recipes, explicit roots, compact recall and guarded expansion. `node scripts/public-install.mjs --help` exposed project scope, source/install-root overrides and dry-run. Neither help run installed anything.

Only one decision was written, into temporary project memory. Its body was:

> We chose weekly releases for the synthetic Aurora project because smaller changes are easier to review. This applies only to Aurora, not every project.

After testing, the isolated default personal memory and dry-run CLI shim still did not exist. Temporary synthetic artifacts/logs remain under the base for reproduction. Only this report was added to the checkout; pre-existing edits were preserved.

## Ranked small improvements

1. **P2 — Broken copy/paste command when installation path contains spaces (observed).** Installer's `Try:` line quotes the memory root but leaves the executable unquoted. Copying the emitted line into zsh exits 127: `zsh:1: no such file or directory: /tmp/jumpy`. This blocks a path-with-spaces user's first recall. In this dry-run no shim exists, so this is not evidence of a broken installed launcher; the error's truncated executable and `scripts/public-install.mjs` `printSummary` confirm a command-formatting defect independently. **Minimal fix:** shell-quote both executable and arguments using the repository's established shell-quoting convention. **End-to-end validation:** actual isolated install under a HOME/install-root with spaces; execute the emitted `Try:` line verbatim in a shell and obtain the expected empty-brain result. Also test a quoted apostrophe/path metacharacter without execution side effects.

2. **P2 — Dry-run claims actual installation success (observed).** `--dry-run` prints `jumpyBrain install complete.` and `Integrations installed:` with three paths, while no shim or integrations were created. An agent can falsely report completion or tell the user to restart a nonexistent integration. Source explains this: writes are guarded by `!options.dryRun`, but planned integrations enter the common summary and `printSummary` always uses completion wording. **Minimal fix:** render “Dry run: planned installation” / “Would install integrations” and distinguish the proposed verification command. **End-to-end validation:** capture a dry-run in an empty temporary HOME/project, assert explicit dry-run wording and no created installation/integration files; run a real installation separately and require completion language only there.

3. **P2 — New explicit brain path lacks useful recovery guidance (observed).** `recall --root "…/Brand New Brain"` on an absent path returns raw `ENOENT … realpath`; the initial doctor only says `Unable to inspect memory root readiness.` A first-time user must return to reference docs to discover initialization. Running documented `init` then repeating recall succeeds in under a second. Missing project discovery already has the better pattern: “Run jumpybrain init --root memory or pass --root …”. Source explanation: core resolves the path with `realpath`; doctor's catch replaces the cause with generic wording. **Minimal fix:** preserve a safe missing-directory diagnosis and print a correctly quoted `jumpybrain init --root <same-path>` hint, without initializing during a read. **End-to-end validation:** absent spaced root → clear diagnostic/nonzero recall/no new root; explicit init → empty recall success; permission-denied and malformed-config cases remain distinct and do not redirect writes.

4. **P3 — Make project CLI/root instructions easier to reach (observed UX, documented behavior).** Default README onboarding emphasizes agent natural language; project scope lives deeper in Installation. Top-level `recall` inside a correctly initialized project returns only `--root is required.`, while `run memory:recall` discovers it. This is currently documented behavior, not a root-selection bug. **Minimal fix:** add one project-local first-result example or a help hint pointing to recipes, with explicit paths for cross-session use. **End-to-end validation:** a reader starting at README reaches project install/init, remember, fresh-process recall and expansion without implementation knowledge; nested recipe and explicit alternate-root checks pass.

## Broader scope and hypotheses

The active `tasks/todo/tasks-portable-installation-project-integration.md` already owns supported artifacts, consumer dependency resolution, effective-target precedence, project/personal coexistence and trusted capture policy. These results do not justify declaring that work complete or adding an npm publication workaround. Keep the small summary/diagnostic fixes above separate from that distribution effort.

Source-supported follow-up, **not reproduced as an installed-project failure**: doctor checks HOME integration paths even with `--root` pointing at a project (`src/cli/doctor.ts`, `integrationChecks`). Here no integrations were actually installed, so its “not installed” results were truthful. Validate a real project-only integration install before claiming doctor misdiagnoses it. Doctor also exits 0 for `ok:false`; this is observed, but not classified as a bug without a documented exit-status contract. Consumers should inspect JSON `ok` today.

Terminology: “root” (memory folder versus install/source folder), “global” (machine-local versus shared service), “recipe” (`run memory:*`), “lexical” versus semantic, and compact packet `partial:true` all require learning. Documentation explains these, but the first useful result would benefit from one concrete project walkthrough. Empty compact output had `partial:true` while `retrieval.status` was `complete`; that field describes selected evidence scope, so it is not classified as a failed search.

Privacy expectations were clear: local Markdown and derived search state, no automatic account/sync/whole-brain injection; cloud assistants may receive recalled excerpts, with feedback and chosen synced folders separate. No network trace was taken, so this report makes no network-isolation guarantee. `remember` auto-indexed; new-brain recall built lexical derived state without requiring a model. Strict zero-write reads are a separate documented mode.

## Step-by-step command evidence

Commands are exact argv rendered as shell text; all use the isolated environment above. Unless a different cwd is shown, cwd is `/tmp/jumpy user3.T04f3d/Synthetic Project`. Output below is an exact relevant excerpt, not a full transcript where labeled. Times are local single-run observations, not performance benchmarks.
### 1. project installer dry-run — FAIL wording/copyability; PASS no installation performed

```sh
node /Users/monkey/dev/jumpyBrain/scripts/public-install.mjs --scope project --integrations all --source /Users/monkey/dev/jumpyBrain --install-root '/tmp/jumpy user3.T04f3d/isolated home/.jumpybrain' --dry-run
```

Exit 0; 0.22 s. Observed output:

```text
[jumpybrain] Installing jumpyBrain (project)
[jumpybrain] Install root: /tmp/jumpy user3.T04f3d/isolated home/.jumpybrain
[jumpybrain] Memory root: /private/tmp/jumpy user3.T04f3d/Synthetic Project/memory
[jumpybrain] CLI remote-access policy: not configured
[jumpybrain] QMD available: @tobilu/qmd@2.8.3 (CLI + SDK)

jumpyBrain install complete.
Memory root: /private/tmp/jumpy user3.T04f3d/Synthetic Project/memory
CLI: /tmp/jumpy user3.T04f3d/isolated home/.jumpybrain/bin/jumpybrain
CLI policy: not configured
Integrations installed:
- codex:/private/tmp/jumpy user3.T04f3d/Synthetic Project/.agents/skills/jumpybrain-memory/SKILL.md
- claude:/private/tmp/jumpy user3.T04f3d/Synthetic Project/.claude/skills/jumpybrain-memory/SKILL.md
- pi:/private/tmp/jumpy user3.T04f3d/Synthetic Project/.pi/extensions/jumpybrain-memory.ts

Try:
/tmp/jumpy user3.T04f3d/isolated home/.jumpybrain/bin/jumpybrain recall --root "/private/tmp/jumpy user3.T04f3d/Synthetic Project/memory" --topic "what should I remember?" --limit 5

Tip: add the CLI bin directory to PATH if desired:
export PATH="/tmp/jumpy user3.T04f3d/isolated home/.jumpybrain/bin":$PATH
```

### 2. version — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js --version
```

Exit 0; 0.08 s. Observed output:

```text
0.3.8
```

### 3. doctor before setup — FAIL actionable root diagnosis; observed unhealthy JSON with exit 0

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js doctor --root '/tmp/jumpy user3.T04f3d/Synthetic Project/memory' --json
```

Exit 0; 0.21 s. Relevant fields/excerpt:

```text
{
  "ok": false,
  "qmd": {
    "ok": true,
    "binary": "/opt/homebrew/bin/qmd",
    "message": "QMD 2.8.3 is available."
  },
  "memoryRoot": {
    "root": "/tmp/jumpy user3.T04f3d/Synthetic Project/memory",
    "ok": false,
    "message": "Unable to inspect memory root readiness."
  }
}
Integrations: Codex, Claude, Pi all "not installed" (HOME paths).
```

### 4. init project — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js init --root '/tmp/jumpy user3.T04f3d/Synthetic Project/memory'
```

Exit 0; 0.09 s. Observed output:

```text
Initialized memory root: /private/tmp/jumpy user3.T04f3d/Synthetic Project/memory
Config: jumpybrain.json (schema v1, written)
Memory dirs: notes, sessions, findings, decisions, preferences, pages
Derived state ignored: updated .gitignore
```

### 5. empty recall — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --topic 'release cadence' --limit 5 --compact
```

Exit 0; 0.6 s. Observed output:

```text
{"version":1,"kind":"recall","query":"release cadence","depth":"normal","readiness":{"freshness":"fresh","modes":["lexical"],"embedding":"disabled"},"retrieval":{"status":"complete","warnings":[]},"maxBytes":8192,"scope":"selected_passages","partial":true,"passages":[],"omitted":{"results":0,"passages":0}}
```

### 6. save decision — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:remember --type decision --title 'Synthetic release cadence' --json
```

Stdin: the synthetic decision body quoted above.

Exit 0; 0.23 s. Observed output:

```text
{
  "id": "mem_24937a0e-7fca-4e6d-9bc6-97942eabc912",
  "file": "decisions/2026-10-24-synthetic-release-cadence.md",
  "saved": true,
  "indexed": true,
  "indexing": {
    "status": "indexed"
  }
}
```

### 7. new process recall — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --topic 'release cadence' --limit 5 --compact
```

Exit 0; 0.47 s. Observed output:

```text
{"version":1,"kind":"recall","query":"release cadence","depth":"normal","readiness":{"freshness":"fresh","modes":["lexical"],"embedding":"disabled"},"retrieval":{"status":"complete","warnings":[]},"maxBytes":8192,"scope":"selected_passages","partial":true,"passages":[{"filePath":"decisions/2026-10-24-synthetic-release-cadence.md","pathBasis":"canonical_root","startLine":12,"endLine":14,"text":"# Synthetic release cadence We chose weekly releases for the synthetic Aurora project because smaller changes are easier to review. This applies only to Aurora, not every project.","scope":"excerpt","partial":true,"date":{"basis":"written","value":"2026-10-24T19:00:28.664Z","field":"created_at"},"expansion":{"available":true,"id":"mem_24937a0e-7fca-4e6d-9bc6-97942eabc912","expectedContentHash":"sha256:5e141abcfd8f9a293a52a50ba26a5a46a29649b251130687cf19cbc7ce9d1b0c","startLine":12,"endLine":14},"documentId":"mem_24937a0e-7fca-4e6d-9bc6-97942eabc912"}],"omitted":{"results":0,"passages":0}}
```

### 8. expand source from nested new process — PASS

Cwd: `/tmp/jumpy user3.T04f3d/Synthetic Project/src/nested workspace`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:expand --id mem_24937a0e-7fca-4e6d-9bc6-97942eabc912 --if-match sha256:5e141abcfd8f9a293a52a50ba26a5a46a29649b251130687cf19cbc7ce9d1b0c --start-line 12 --end-line 14
```

Exit 0; 0.05 s. Observed output:

```text
{"version":1,"kind":"expansion","id":"mem_24937a0e-7fca-4e6d-9bc6-97942eabc912","filePath":"decisions/2026-10-24-synthetic-release-cadence.md","contentHash":"sha256:5e141abcfd8f9a293a52a50ba26a5a46a29649b251130687cf19cbc7ce9d1b0c","scope":"lines","requestedStartLine":12,"requestedEndLine":14,"startLine":12,"endLine":14,"totalLines":14,"text":"# Synthetic release cadence\n\nWe chose weekly releases for the synthetic Aurora project because smaller changes are easier to review. This applies only to Aurora, not every project.\n","partial":false,"omittedLines":0,"maxBytes":8192}
```

### 9. nested recipe discovery — PASS

Cwd: `/tmp/jumpy user3.T04f3d/Synthetic Project/src/nested workspace`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:status --json
```

Exit 0; 0.06 s. Observed output:

```text
{
  "root": "/private/tmp/jumpy user3.T04f3d/Synthetic Project/memory",
  "configFile": "jumpybrain.json",
  "initialized": true,
  "schemaVersion": 1,
  "compatible": true,
  "message": "Memory root is compatible with schema v1.",
  "readiness": {
    "freshness": "fresh",
    "modes": [
      "lexical"
    ],
    "embedding": "disabled"
  }
}
```

### 10. top-level without root — EXPECTED failure; UX gap

Cwd: `/tmp/jumpy user3.T04f3d/Synthetic Project/src/nested workspace`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js recall --topic 'release cadence' --limit 5
```

Exit 1; 0.05 s. Observed output:

```text
--root is required.
```

### 11. missing dependency diagnostic — PASS useful guidance; exit 0 with ok:false

Environment override: `JUMPYBRAIN_QMD_BIN=/tmp/jumpy user3.T04f3d/missing search/qmd`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js doctor --root '/tmp/jumpy user3.T04f3d/Synthetic Project/memory' --json
```

Exit 0; 0.07 s. Relevant fields/excerpt:

```text
{
  "ok": false,
  "qmd": {
    "ok": false,
    "binary": "/tmp/jumpy user3.T04f3d/missing search/qmd",
    "message": "QMD 2.8.3 is required for local/server indexing and recall. Install with `npm install -g @tobilu/qmd@2.8.3` or set JUMPYBRAIN_QMD_BIN."
  },
  "memoryRoot": {
    "root": "/private/tmp/jumpy user3.T04f3d/Synthetic Project/memory",
    "initialized": true,
    "compatible": true,
    "readiness": {
      "freshness": "fresh",
      "modes": [
        "lexical"
      ],
      "embedding": "disabled"
    },
    "ok": true,
    "message": "Memory root is compatible."
  }
}
Integrations: Codex, Claude, Pi all "not installed" (HOME paths).
```

### 12. missing dependency recall — PASS expected failure

Environment override: `JUMPYBRAIN_QMD_BIN=/tmp/jumpy user3.T04f3d/missing search/qmd`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --topic 'release cadence' --limit 5
```

Exit 1; 0.08 s. Observed output:

```text
qmd CLI is required. Install with `npm install -g @tobilu/qmd@2.8.3` or set JUMPYBRAIN_QMD_BIN.
```

### 13. recovered dependency recall — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --topic 'release cadence' --limit 5
```

Exit 0; 0.3 s. Observed output:

```text
Prior memory scan for: release cadence

1. decisions/2026-10-24-synthetic-release-cadence.md:12-14 score=1.79
   Title: Synthetic release cadence | Type: decision | Written date: 2026-10-24T19:00:28.664Z
   # Synthetic release cadence We chose weekly releases for the synthetic Aurora project because smaller changes are easier to review. This applies only to Aurora, not every project.
```

### 14. never initialized root recall — FAIL actionable recovery diagnosis

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js recall --root '/tmp/jumpy user3.T04f3d/Brand New Brain' --topic 'release cadence' --limit 5
```

Exit 1; 0.05 s. Observed output:

```text
ENOENT: no such file or directory, realpath '/tmp/jumpy user3.T04f3d/Brand New Brain'
```

### 15. init new brain — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js init --root '/tmp/jumpy user3.T04f3d/Brand New Brain'
```

Exit 0; 0.06 s. Observed output:

```text
Initialized memory root: /private/tmp/jumpy user3.T04f3d/Brand New Brain
Config: jumpybrain.json (schema v1, written)
Memory dirs: notes, sessions, findings, decisions, preferences, pages
Derived state ignored: updated .gitignore
```

### 16. new brain text empty result — PASS

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js recall --root '/tmp/jumpy user3.T04f3d/Brand New Brain' --topic 'release cadence' --limit 5
```

Exit 0; 0.38 s. Observed output:

```text
Prior memory scan for: release cadence

No memory matches found.
```

### 17. explicit alternate empty root wins — PASS

Cwd: `/tmp/jumpy user3.T04f3d/Synthetic Project/src/nested workspace`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --root '/tmp/jumpy user3.T04f3d/Brand New Brain' --topic 'release cadence' --limit 5
```

Exit 0; 0.26 s. Observed output:

```text
Prior memory scan for: release cadence

No memory matches found.
```

### 18. new workspace without project config — PASS expected safe failure

Cwd: `/tmp/jumpy user3.T04f3d/isolated home`.

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js run memory:recall --topic 'release cadence' --limit 5
```

Exit 1; 0.05 s. Observed output:

```text
Could not find a jumpyBrain memory root from "/private/tmp/jumpy user3.T04f3d/isolated home". Run jumpybrain init --root memory or pass --root <memory-root>.
```

### 19. copy installer Try command — FAIL emitted shell command

```sh
zsh -c '/tmp/jumpy user3.T04f3d/isolated home/.jumpybrain/bin/jumpybrain recall --root "/private/tmp/jumpy user3.T04f3d/Synthetic Project/memory" --topic "what should I remember?" --limit 5'
```

Exit 127; 0.04 s. Observed output:

```text
zsh:1: no such file or directory: /tmp/jumpy
```

### 20. doctor after successful local setup — PASS runtime health; integrations uninstalled

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js doctor --root '/tmp/jumpy user3.T04f3d/Synthetic Project/memory' --json
```

Exit 0; 0.15 s. Relevant fields/excerpt:

```text
{
  "ok": true,
  "qmd": {
    "ok": true,
    "binary": "/opt/homebrew/bin/qmd",
    "message": "QMD 2.8.3 is available."
  },
  "memoryRoot": {
    "root": "/private/tmp/jumpy user3.T04f3d/Synthetic Project/memory",
    "initialized": true,
    "compatible": true,
    "readiness": {
      "freshness": "fresh",
      "modes": [
        "lexical"
      ],
      "embedding": "disabled"
    },
    "ok": true,
    "message": "Memory root is compatible."
  }
}
Integrations: Codex, Claude, Pi all "not installed" (HOME paths).
```

### 21. portable source instructions — PASS discoverable guidance

```sh
node /Users/monkey/dev/jumpyBrain/dist/cli.js instructions
```

Exit 0; 0.05 s. Relevant fields/excerpt:

```text
# jumpyBrain memory hint for coding agents

If jumpybrain is installed and the task may benefit from project memory, use visible recall before acting. Good triggers include architecture decisions, prior bugs, user/project preferences, handoffs, or continuing earlier work.

- Prefer explicit, bounded recall; do not silently inject memory into prompts.
- Remember writes memory; recall reads memory.
- If this repo has memory/jumpybrain.json, run: jumpybrain run memory:recall --topic "<current task/topic>" --limit 5 --compact
- For a specific question, run: jumpybrain run memory:recall --query "<question>" --limit 10 --compact
- Use --depth shallow|normal|deep to shape recall from compressed pages/decisions toward raw session evidence.
- If recipes cannot discover the root, pass --root <memory-root> for local memory or --target-url <url> for hosted/shared memory.
- Answer from sufficient snippets and cite their source lines. Preserve uncertainty, qualifications, and conflicts; do not infer a decision from a title/type.
```
