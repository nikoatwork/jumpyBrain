# Authenticated Claude onboarding follow-up

Date: 2026-10-24. Checkout base: `695bae9ef15f9bc7bd2408ee14651a37f27d0639`, with concurrent working-tree changes. This is a synthetic authenticated CLI-model check, not a human usability study or release certification. Earlier reports remain historical evidence: [Claude follow-up](claude-followup.md), [original persona](user-1-claude-nontechnical.md), [judgment](judgment.md).

**Overall: FAIL on the required no-invented-year answer.** Authentication, actual project-skill discovery and activation, model-driven readiness checks, explicit personal capture, fresh-conversation retrieval, source citation, and no duplicate/summary all passed. The final answer still inferred “most likely 18 November 2026” from writing time, even though the retrieved note explicitly says no year was given. This is an observed model-guidance failure, not an indexing/storage failure or an authentication gate.

## Tested runtime and skill

- macOS arm64; Node `v26.7.0`; Claude Code `2.1.310`; actual model reported by stream-json: `claude-opus-5-5`; installed jumpyBrain `0.3.8`; existing `/opt/homebrew/bin/qmd`, version `2.8.3`. No global QMD installation or model download.
- Real installer output, from an allowlisted snapshot of current local source. The snapshot copied `dist`, `scripts`, `skills`, `integrations`, `docs`, package manifests, README and LICENSE, excluding dependency/build caches. Checkout `.env`, real memory, `.git`, tasks and old private artifacts were not copied. This avoids blindly copying the checkout's ignored credential file.
- `--skip-build` reused the freshly supplied shared `dist`; this subtask did not build or mutate shared output. Installed `dist/cli.js` matched the supplied entry byte-for-byte. Entry SHA-256: `c7f140475299559b647d454c5bbf47381315267a1f3d5a999149b92cd167c797`. This is entry-file provenance, not a complete dist-tree fingerprint or independent source-to-build certification.
- Skill template SHA-256: `45a4c6610314cf4b2eabe3819e119ec4a5dd99f9b3dd9a499dad0554526d559a`.
- Final run's installer-generated project Claude skill SHA-256: `ca8acce141c3629e02e4b9f836da517e8e716d31cf6beee34d4065b0b5f4f5f7`. Its CLI/root were the temporary installation and personal brain, with no unresolved placeholders. No template was manually substituted for installer output.
- All runtime copies, generated integrations, settings supplied by the harness, canonical notes and derived indexes were temporary and removed after each run. Sanitized evidence remains outside the checkout at `/tmp/jb-claude-authenticated-evidence-v4.json`; earlier attempt evidence is described below. The report embeds the decisive evidence so this temporary file is not required to understand the outcome.

## Safety and authentication boundary

The actual Claude CLI used its normal authenticated default account; no credential files, tokens, Keychain APIs or credential exports were accessed by the harness. It retained normal `HOME` plus ordinary login-identity environment variables for account discovery. Only allowlisted auth status fields were retained: exit **0**, `loggedIn:true`, `authMethod:claude.ai`. Raw account status output was discarded.

The final three conversations used `--no-session-persistence`, `--setting-sources project`, an explicit temporary settings file disabling hooks and auto-memory, strict empty MCP config, tools limited to `Read,Skill,Bash`, explicit allow rules, `--permission-mode dontAsk` and `--permission-prompts none`. No dangerous permission-bypass flag was used. The settings denied file-tool access to the real home. Every observed CLI Bash command prefixed `env HOME='<TEMP>/Disposable home'`, so doctor and subprocesses used the disposable home. QMD's derived state lived under the temporary brain. MCP servers were `[]`; each result reported no permission denials and no spawned subagents.

The appended instructions explicitly designated the configured root PERSONAL LOCAL, prohibited all real/default/home memory access and real skills/settings/authentication-file inspection, required the generated project skill and temporary CLI/root, and forbade additional capture, summaries, reinstallations, feedback and subagents. They supplied no event answer, event year or previous conversation. No shared/team/remote destination was used.

The harness did not inspect or alter real skill/settings contents or address real notes. The CLI used its default account through its normal authentication implementation. This test does not claim a filesystem audit of automatic Claude host caches or configuration bookkeeping; it deliberately did not inspect the real account directory. Standard tool permissions and explicit scopes are not an OS sandbox.

## Final run: three independent real model invocations

All three were separate `claude -p` processes, without resume/continue/session history. Each returned exit **0**, real API output tokens and model-generated tool calls. No manually executed save/recall was substituted for a model action. Their stream timestamps were approximately **20:01:47–20:02:19 UTC**.

1. **PASS — readiness with no sample capture.** Exact user prompt:

   ```text
   Use the jumpybrain-memory project skill to check my jumpyBrain installation and that local search is ready. Do not save a sample memory. Run doctor with --check --json and bounded recall on the configured brain.
   ```

   The stream init listed `jumpybrain-memory` in both `skills` and `slash_commands`. Claude called `Skill` with `{"skill":"jumpybrain-memory"}`; the tool returned `Launching skill: jumpybrain-memory` and `{"success":true,"commandName":"jumpybrain-memory"}`. This is actual activation, beyond doctor/file-presence or settings discovery. The loaded skill and every command referenced the generated project CLI/root, establishing the project configuration won over any same-name real-home configuration without inspecting the latter.

   The tool's expanded skill message explicitly began `Base directory for this skill: <TEMP>/First project/.claude/skills/jumpybrain-memory`, followed by configuration `CLI: <TEMP>/Disposable home/.jumpybrain/bin/jumpybrain` and `Memory root: <TEMP>/First project/memory`. This confirms the actual loaded skill's origin and configuration.

   Claude executed doctor `--check --json` and bounded compact recall. Doctor returned `ok:true`, compatible root, fresh lexical readiness, optional project integration files present, and disposable-home global files absent. Recall returned no passages, no warnings, fresh readiness. **Zero canonical Markdown memory files** existed afterward.

2. **PASS — explicit natural personal capture without repeated permission.** Exact user prompt:

   ```text
   Remember that the community event is on 18 November
   ```

   The new process independently discovered and successfully activated the project skill. Claude generated the stdin write itself; it did not ask for the same personal-write permission again. It saved **one** canonical `note`, with no frontmatter evidence `date` and no invented event year. It added a qualified statement of when the fact was stated. Exact canonical content is below. There was no additional session/wrapup/page capture.

3. **PASS for retrieval/citation; FAIL for temporal answer.** Exact new-conversation user prompt:

   ```text
   When is the community event?
   ```

   This process independently discovered and successfully activated the project skill, then executed `recall --query "When is the community event?" --limit 10 --compact`. Recall returned the one saved passage, `pathBasis:canonical_root`, lines **12–14**, `date.basis:written`, `date.field:created_at`, and the explicit unknown-year body. No expansion was needed. The answer cited that exact source and line range. Canonical files/bytes were unchanged by recall; still exactly one note, no spontaneous summary.

   Exact final model answer:

   ```text
   The community event is on **18 November**.

   Source: `memory/notes/2026-10-24-community-event-date.md:12-14`. That note was saved on 2026-10-24 and says no year was given, so it's most likely 18 November 2026, but the note doesn't confirm that.
   ```

   The uncertainty caveat does not satisfy the requirement to preserve an unspecified year: the model still supplied an unsupported event-year estimate from writing metadata.

### Exact canonical note

Path relative to the temporary personal root: `notes/2026-10-24-community-event-date.md`.

```markdown
---
id: "mem_cf5502a0-dcfd-4003-a5a8-e86cd07485df"
type: "note"
title: "Community event date"
source: "jumpybrain-remember"
created_at: "2026-10-24T20:02:06.696Z"
updated_at: "2026-10-24T20:02:06.696Z"
confidence: "user-reviewed"
tags: []
---

# Community event date

The community event is on 18 November. (Stated on 2026-10-24; the user did not give a year.)
```

### Exact model-generated CLI commands

`<TEMP>` sanitizes the disposable base. These were model tool calls, not harness reenactments:

```sh
env HOME='<TEMP>/Disposable home' '<TEMP>/Disposable home/.jumpybrain/bin/jumpybrain' doctor --root '<TEMP>/First project/memory' --check --json
env HOME='<TEMP>/Disposable home' '<TEMP>/Disposable home/.jumpybrain/bin/jumpybrain' recall --root '<TEMP>/First project/memory' --topic "jumpyBrain installation check" --limit 5 --compact
printf '%s\n' "The community event is on 18 November. (Stated on 2026-10-24; the user did not give a year.)" | env HOME='<TEMP>/Disposable home' '<TEMP>/Disposable home/.jumpybrain/bin/jumpybrain' remember --root '<TEMP>/First project/memory' --type note --title "Community event date"
env HOME='<TEMP>/Disposable home' '<TEMP>/Disposable home/.jumpybrain/bin/jumpybrain' recall --root '<TEMP>/First project/memory' --query "When is the community event?" --limit 10 --compact
```

## Harness corrections and earlier evidence

No failures were retried unchanged.

- **Initial isolation attempt:** a stripped process environment yielded `Not logged in · Please run /login`, error `authentication_failed`, exit **1**, zero API tokens, and no saved memory. Removing XDG overrides alone did not resolve it. Normal inherited auth status remained signed in. Bounded auth-status comparisons showed the minimal `PATH,HOME` environment failed while preserving ordinary login identity (`USER,LOGNAME,SHELL,LANG,LC_ALL,TERM`, where present) restored `loggedIn:true` / `authMethod:claude.ai`. No token copying or new login was used. Initial sanitized logs: `/tmp/jb-claude-authenticated-evidence.json` and `...-v2.json`.
- **Restricted-mode model run:** after the auth correction, three real model invocations succeeded, saved one note and retrieved it. However, stream init omitted the project skill and the attempted Skill call returned exactly `<tool_use_error>Unknown skill: jumpybrain-memory</tool_use_error>`. Claude read the generated project file directly and used its temporary CLI. This is real model-driven fallback behavior, **not successful skill activation**. Evidence: `/tmp/jb-claude-authenticated-evidence-v3.json`.
- **Discovery correction:** the final run removed only `--restricted` from that invocation design, retaining project-only settings, strict MCP, no persistence, scoped tools/permissions and the same safety instructions. All three init messages then listed the project skill and all three Skill calls returned success. Thus restricted-mode discovery is a host/harness compatibility limit observed here, not a demonstrated installer-generation failure. Repeating a normal unchanged restart was not presented as a fix.
- **Temporal failure reproduced across both model runs:** restricted fallback recall said “It was written today (2026-10-24), so it most likely means 18 November 2026, but the note doesn't say that.” Successful Skill activation in the final run still produced the unsupported estimate quoted above. Neither run wrote a guessed event year into canonical memory. No further unchanged model retries were performed.

## Reproduction and retained gate

The owned opt-in harness is [scripts/claude-onboarding-smoke.mjs](../../scripts/claude-onboarding-smoke.mjs). It creates a safe source snapshot, invokes the actual installer, runs each model process with a **150-second timeout**, retains sanitized stream evidence and canonical snapshots, and removes the disposable installation. It never runs a shared build or a manual memory write. The invocation used for the final run was:

```sh
node scripts/claude-onboarding-smoke.mjs /tmp/jb-claude-authenticated-evidence-v4.json
```

The installer command shape was:

```sh
node '<TEMP>/source/scripts/public-install.mjs' --source '<TEMP>/source' --scope project --cwd '<TEMP>/First project' --home '<TEMP>/Disposable home' --install-root '<TEMP>/Disposable home/.jumpybrain' --memory-root '<TEMP>/First project/memory' --integrations all --skip-build --skip-qmd-install
```

Each independent Claude invocation had this common argument shape, with the exact prompt appended after `--`:

```sh
claude -p --no-session-persistence --strict-mcp-config --mcp-config '<TEMP>/empty-mcp.json' --setting-sources project --settings '<TEMP>/claude-settings.json' --tools Read,Skill,Bash --allowedTools 'Skill(jumpybrain-memory)' 'Read(<TEMP>/**)' "Bash(env HOME='<TEMP>/Disposable home' '<TEMP>/Disposable home/.jumpybrain/bin/jumpybrain' *)" 'Bash(printf *)' --permission-mode dontAsk --permission-prompts none --output-format stream-json --verbose --append-system-prompt '<isolation boundary implemented in harness>' --add-dir '<TEMP>' -- '<exact prompt above>'
```

The generated temporary settings were `disableAllHooks:true`, `autoMemoryEnabled:false`, allow rules matching the command-line tool rules, and `Read/Edit/Write` deny rules for `<REAL_HOME>/**`. The MCP file was exactly `{"mcpServers":{}}`. Full exact argument arrays and the isolation prompt remain in sanitized evidence and the harness.

After inspecting the final response, the harness summary was tightened to include successful API completion, discovery, activation, citation and the no-speculative-year gate. Evidence-only validation does not invoke Claude again:

```sh
node --check scripts/claude-onboarding-smoke.mjs
node scripts/claude-onboarding-smoke.mjs --inspect-evidence /tmp/jb-claude-authenticated-evidence-v4.json
```

Syntax check passed. Evidence validation intentionally exits **1**: all eight other recorded checks are `true`, while `noSpeculativeEventYear:false`. The original model run exited 0 because the earlier harness checked process completion and canonical counts only; it was not treated as a complete product pass. The evidence gate uses a narrow detector for this exact scenario and still requires human review of the saved fact, retrieval and answer.

**Parent follow-up:** strengthen temporal guidance against estimating a missing event year from `created_at`, the note filename, current date or an explicitly labeled “stated on” date; then rerun the three fresh conversations. A compliant final answer is “18 November; no year was specified,” with the retrieved citation. Production/skill fixes, parent task/changelog completion and any commit remain with the parent. No other product defect was established here.

No production source, previous reports, real integration, real memory, shared/team destination, feedback inbox, commit, push or release was changed by this subtask. No full regression suite, native app, clean-machine installation, semantic retrieval, network bootstrap or other agent host was certified.
