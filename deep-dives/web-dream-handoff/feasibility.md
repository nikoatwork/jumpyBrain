# Web Dream handoff — feasibility investigation

Status: research complete; copy-prompt-only handoff with immediate authorized consolidation is implemented. See the task list for verification and remaining environment limitations.

**Canonical plan:** [Dreaming from the memory map](../../tasks/todo/tasks-web-dream-handoff.md). That active task list owns defaults, implementation work, and acceptance criteria.

Repository initially inspected: `63462ca`. Research used source inspection, official documentation, and limited local executable/app metadata checks—not an end-to-end launch prototype or observed usability testing. No agent/model requests or memory writes were initiated for this investigation.

## Verdict and final scope

**Go for a small browser-to-agent handoff.** The CLI already supports the workflow; model compute stays in the user's existing agent.

User decisions supersede the earlier proposal-only and multi-action hypotheses:

- One **Consolidate notes (Dream)…** button in the graph/memory-map toolbar, not on individual nodes.
- Copy a self-contained prompt; no terminal launch, launcher command, provider/agent picker, or native integration.
- Submitting the prompt explicitly authorizes bounded dream-page creation/updates and indexing on the displayed target. The agent should proceed without asking for the same approval again. Sources remain untouched.
- No orphan workflow and therefore no dropdown. No further planning questions needed.
- Copying itself does not run anything. Show paste-to-start feedback, not running/completed status.

The task list chooses a small default evidence window and budget. Authorization is visible in the dialog and explicit in the copied user instruction; it is not inferred from graph access or authentication. It never overrides read-only policy, actual server permissions, or harness safeguards.

## Existing CLI capability

- `jumpybrain dream` is a **read-only evidence window**, not an AI call. The external agent follows up through `recall`, `search`, and `show`, then uses normal CLI writes.
- Dreaming **is** the agent-led consolidation workflow. There is no separate `consolidate` command or `run memory:dream` recipe.
- `process --mode synthesize --apply` is deterministic topical synthesis, not agent reasoning. Processing is local/server-filesystem-only, not exposed through the remote CLI; it is not a second equivalent hosted action.
- New dream pages use body-only `remember --type page --dream`; existing pages use `show` and full-Markdown `update --if-match`, then authorized indexing.
- `--from` is the newest included UTC date. Pin it to an absolute date in the handoff so delayed execution does not change scope. Evidence-date and modified-date selection are distinct.
- Dream windows exclude dream-marked pages as primary evidence; retrieve existing maps separately. Empty windows and no-op runs are valid. Warnings, truncation, missing IDs, and budget limits must be reported.
- No stateless-dream completion ledger, scheduler, or overdue signal exists. Do not revive deprecated batch status/complete commands to manufacture one.

Evidence: `docs/cli-commands.md:111–158`, `skills/how-to-dream/SKILL.md`, `src/cli/commands.ts`, `src/cli/recipes.ts`, `src/app/processing/processor.ts`.

## Why copy prompt is sufficient

The optional Dream skill is not automatically installed, so “run /how-to-dream” alone is inadequate. A short self-contained instruction can carry the explicit target, UTC window, budget, authorization, supported CLI command sequence, source-preservation rules, and requested result report. It works in an existing agent session without choosing a model or provider in jumpyBrain.

Browser clipboard writes require a suitable context and may fail. A visible selectable preview provides a manual-copy fallback. No evidence-body export is necessary: the agent retrieves evidence through the CLI with its own configured credentials.

The graph is a useful entry point because users are already considering connections. It is not the workflow's scope: current graph filters/visible nodes must not imply that Dream operates on that selection. Missing edges are not proof of missing knowledge or a reason to force more links.

## Important integration boundaries

**Target and credentials.** Browser requests are same-origin. Use one validated explicit `--target-url`, including for a localhost server; never infer a filesystem root. Browser login does not provision `JUMPYBRAIN_API_KEY` for the agent. Never include the browser key, credential-bearing URL parts, note bodies, or server filesystem paths in the handoff. A container/remote agent's localhost may not be the browser's localhost; stop on target ambiguity rather than guessing.

**Permission.** The final user choice is immediate scoped application, not proposal-only. Instructions authorize dream pages and indexing on the named target, not deletion, source-note edits, ID maintenance, or policy changes. Such instructions are not an enforced write ACL or sandbox. Pi in particular does not promise approval before every tool call. Actual prerequisites and permission failures remain valid reasons to stop.

**Prompt ownership.** The HTTP adapter currently excludes all prompt construction (`src/adapters/http-server/http-server.docs.md`). The implementation plan narrowly permits explicit client-side copyable workflow instructions in a focused browser-facing adapter module. Server-side orchestration, scheduling, model calls, and CLI parsing imports remain excluded. The adapter contract now explicitly permits this narrow browser-presentation responsibility.

**Concurrent edits.** `graph-page.ts:562–581` retries a 412 once using last-write-wins. A stale browser draft in another tab can overwrite an agent update. The graph entrypoint benefits from existing guarded navigation out of the editor, but does not solve cross-tab concurrency. Advise against concurrent edits to affected dream pages and reopen/refetch after external work. No new lock or conflict-editor redesign is promised.

**Demo access.** Existing memory routes authenticate. The public sandbox plan keeps Dream authenticated or disabled (`tasks/todo/tasks-public-sandbox-hardening.md`). A visible graph does not prove write capability. The new handoff must not weaken these restrictions or bypass protected-target guards.

**UI coordination.** `tasks/done/2026-09-30_tasks-memory-map-ux-refresh.md` records the completed toolbar/map cleanup. The handoff adds one restrained action without restoring clutter or duplicating navigation.

## Investigated alternatives — outside selected scope

| Option | Finding |
| --- | --- |
| Copy terminal command with initial prompt | Claude Code, Codex, and Pi document positional prompts. Requires shell/version-specific quoting and testing; unnecessary for selected copy-prompt UX. |
| Open in iTerm2 | Official `iterm2:/command?c=…` handler documents command review and execution choices. Version/Chrome behavior requires validation; not universally available. |
| Open in Warp | Official URLs open tabs/windows or existing local launch/tab configurations. Not an equivalent arbitrary-prompt handoff without setup. |
| Open in default terminal | No portable browser API identified for choosing a terminal and supplying a command. Native integration or terminal-specific adapters required. |
| Custom jumpyBrain URI handler | Technically feasible with an installed native handler, but adds installer, validation, confirmation, platform, and uninstall scope. |
| Chrome native messaging | Requires an extension and a registered native host; disproportionate scope. |
| Localhost launcher service | Adds a service, pairing/auth/origin/replay controls, and browser-policy concerns. Avoid a generic local shell endpoint. |
| Download executable script | OS/shell-specific execution and trust friction; unnecessary. |
| Server launches agent | Runs on the server, not the user's machine; outside the requested compute boundary. |

`navigator.registerProtocolHandler()` registers a website as a scheme handler; it does not install a native terminal bridge.

Local research checks:

- `claude --help` confirmed positional `[prompt]` and interactive-by-default behavior.
- Codex official documentation confirms `codex [PROMPT]`; local `codex --help` was killed with signal 9. Cause uninvestigated, local operability not verified.
- Installed Pi docs confirm positional messages and interactive operation when stdin/stdout are terminals. Piping a prompt can select print mode, so it is not a reliable interactive-launch recipe.
- Installed iTerm2 metadata reported **3.4.22** and did not declare the `iterm2` URL scheme. Current online documentation does not establish support in that installed version.
- No launch URLs were opened, terminal settings changed, applications upgraded, credentials printed, or paid/model launch tests run.

Orphan review was explored and then explicitly dropped. The existing Orphans visibility toggle and filtered zero-degree nodes do not establish global orphan status; there is no approved orphan action or command extension in this plan.

## Sources

Repository sources above define jumpyBrain behavior. External references establish documented capability, not tested compatibility:

- [iTerm2 URL scheme](https://iterm2.com/documentation-url-scheme.html).
- [Warp URI scheme](https://docs.warp.dev/terminal/more-features/uri-scheme/).
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference); also checked local help.
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference).
- Installed Pi `docs/cli.md`, `docs/cli-integration.md`, and `docs/security.md`; public project: [Pi](https://github.com/earendil-works/pi).
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
- [MDN Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).
- [MDN registerProtocolHandler](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/registerProtocolHandler).
