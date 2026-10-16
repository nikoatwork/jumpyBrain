<p align="center">
  <img src="docs/assets/jumpyBrain.png" alt="jumpyBrain logo" width="220" />
</p>

<h1 align="center">jumpyBrain: one memory for all your agents. Just yours, or shared with your team.</h1>

<p align="center">
  A Markdown workspace with a calm editor and visual memory explorer for you—and search and recall for your AI agents. Run it locally for yourself, or self-host it for your team.
</p>

<p align="center">
  <strong><a href="https://demojumpybrain.juttu.co/">Try the public demo</a></strong>
  ·
  <a href="#try-the-demo-in-two-minutes">Try it in two minutes</a>
  ·
  <a href="docs/install.md">Start locally</a>
  ·
  <a href="docs/cloud-shared-memory.md">Share with your team</a>
</p>

## Two ways to use jumpyBrain

### 1. Your local memory, across agents

You use Claude, Codex, Pi, or other agents, but your context should not be trapped inside any one of them. Keep decisions, preferences, discoveries, and project knowledge in one local brain. Switch agents or start a new chat without explaining everything again.

It is not just storage for agents. Write and edit notes in the browser, search your memory, and explore connections on the visual map. You and your agents work with the same Markdown files, on your machine.

[Start locally](docs/install.md), or use the [macOS app (beta)](integrations/macos-companion/README.md) to open the editor from your menu bar.

### 2. Your team's agent-first knowledge workspace

Take that same editor, explorer, and agent memory, and share it with your team. Think **an agent-first Notion**: a place where people write and browse knowledge, and their agents can remember, search, and recall it too.

A decision captured by one teammate becomes discoverable by another teammate's agent. Project context, research, and handoffs live beyond any one person's chats. Self-host one shared brain on infrastructure you control—not a separate product or a sync layer over everyone's local files.

[Run a shared brain](docs/cloud-shared-memory.md), or [explore the public demo](https://demojumpybrain.juttu.co/). This is shared knowledge, not Notion feature parity or real-time collaborative editing.

## A calm place to write

Give a thought some room. Write naturally in the browser, format as you go, and connect related notes with `[[page references]]`. Changes save automatically to Markdown.

<p align="center">
  <a href="docs/assets/jumpybrain-writing.webp">
    <img src="docs/assets/jumpybrain-writing.webp" alt="Detail of the jumpyBrain writing page with spacious serif typography, a quiet formatting toolbar, and linked notes about engineering culture and product strategy" width="100%" />
  </a>
</p>

## See how your knowledge connects

The memory map brings notes, decisions, findings, and conversations into view. Follow a connection to open its source and keep writing. Your agents can search and recall the same Markdown through the CLI.

<p align="center">
  <a href="https://demojumpybrain.juttu.co/graph">
    <img src="docs/assets/jumpybrain-memory-map.webp" alt="The jumpyBrain memory map with softly shaded colored nodes and highlighted connecting strands, linking 24 fictional team notes across strategy, engineering culture, and weekly reflection" width="100%" />
  </a>
</p>

<p align="center"><em>Screenshots use fictional notes. Click the map to explore the public demo.</em></p>

## Try the demo in two minutes

The public demo is a shared brain for a fictional startup called Northbound AI. Explore its strategy, meetings, funding, engineering culture, and unusually detailed coffee decisions—no account or graph key required.

Install jumpyBrain and recall a real topic from that brain with one command:

```bash
curl -fsSL https://demojumpybrain.juttu.co/try | bash
```

The demo command delegates installation to the canonical [`master/install.sh`](https://raw.githubusercontent.com/nikoatwork/jumpyBrain/master/install.sh), then connects the installed CLI to the disposable sandbox for the recall.

Prefer to ask your coding agent? Paste this:

> Set up jumpyBrain against the public demo by fetching and following `https://demojumpybrain.juttu.co/agent`. Then recall what the fictional company remembers about fundraising struggles and summarize it for me. Treat the demo as public and disposable: do not send secrets or private information.

The [demo homepage](https://demojumpybrain.juttu.co/) also provides copyable `remember`, `search`, and `tree` commands. The sandbox is public, writable, rate-limited, and reset hourly. Do not put private information in it.

## Why use jumpyBrain?

- **Use the agent you want.** Claude, Codex, Pi, and other CLI-capable agents can work from the same memory.
- **Stop repeating yourself.** Remember a decision once instead of explaining it again in every chat and tool.
- **Carry knowledge forward.** Find past decisions in your next session—or make them available to teammates through search and recall.
- **Turn notes into knowledge.** The optional [how-to-dream skill](skills/how-to-dream/SKILL.md) helps an agent connect bounded UTC evidence windows into concise topic pages, preserving dates and source notes. Relevant dream maps are preferred in normal/shallow recall; deep recall keeps raw evidence accessible.
- **Own the brain.** Memory stays in readable Markdown files on your machine or on infrastructure you control.

## Use it with your own work

The installer creates a local brain and adds integrations for detected assistants such as Codex, Claude Code, and Pi. Restart an assistant that was already open, then ask it naturally:

> Use jumpyBrain to remember that we chose weekly releases because smaller changes are easier to review.

Later, from any supported agent:

> Use jumpyBrain to recall what we decided about the release process.

That is the core loop: **remember what should last, recall it when it becomes relevant.**

Good memories—for yourself or your team—include:

- decisions and the reasons behind them
- project or company conventions
- solved problems and known gotchas
- customer insights and research findings
- handoffs, meeting outcomes, and open questions

Do not store passwords, credentials, secrets, or private chat noise.

## macOS app (beta)

Prefer a menu-bar app? The [macOS app (beta)](integrations/macos-companion/README.md) runs your local brain and opens its Markdown editor in Chrome. It shares the CLI’s installed runtime and memory, so `jumpybrain update` updates both.

The beta is built locally, not a downloadable app yet. See [requirements and setup](integrations/macos-companion/README.md#install).

## Your memory stays yours

Whether your brain is personal, project-local, or shared with a team:

- Markdown files are the source of truth.
- Search indexes and other generated state can be rebuilt.
- Recall is explicit by default; your entire memory is not silently injected into every prompt.
- You can inspect, edit, back up, move, and version your memory with ordinary tools.

To host a shared brain, start with the [operator quickstart](docs/cloud-shared-memory.md), then choose the [VPS guide](docs/vps-deploy.md) or [Coolify guide](docs/coolify-deploy.md). Implementers can open the separate [protocol and API reference](docs/shared-memory-protocol.md).

## Documentation

- [Product vision](docs/product-vision.md)
- [Installation and updates](docs/install.md)
- [macOS app (beta)](integrations/macos-companion/README.md)
- [Using jumpyBrain with agents](docs/agent-workflows.md)
- [Optional how-to-dream skill installation](docs/install.md#optional-how-to-dream-skill)
- [CLI command reference](docs/cli-commands.md)
- [Shared-memory operator quickstart](docs/cloud-shared-memory.md)
- [Shared-memory protocol and API reference](docs/shared-memory-protocol.md)
- [Memory file format](docs/memory-format.md)
- [Technical design](docs/technical.md)
- [Vercel deployment status](docs/vercel-deploy.md)

jumpyBrain is open source under the [MIT License](LICENSE).

Release policy: [patch releases by default; major releases require user approval](docs/releases.md). The app is currently in beta.
