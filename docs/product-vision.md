# Product vision

## Mission

Build the most efficient semantic, temporally aware, high-relevance memory system for agents: useful shared knowledge with the smallest sufficient context, running either locally on one machine or self-hosted on a shared VPS.

“Most efficient” is our ambition, not a demonstrated benchmark claim. Optimize for correct, source-supported answers per retrieved token, while keeping latency, indexing cost, and operations small. Shorter output is not progress if it loses the qualification that makes an answer correct.

## Two first-class use cases

### 1. Personal memory across agents

A private, local memory system that follows you across agents, rather than locking context inside one assistant. Keep decisions, preferences, discoveries, and project knowledge available when you switch tools or start a new session.

The human experience is part of the product: a calm editor, search, and a visual memory explorer over the same Markdown that agents remember and recall through the CLI. It should be useful to write and browse even when no agent is running. Agent independence is the goal; current integrations and CLI access determine which agents can connect today.

### 2. An agent-first knowledge workspace for teams

The same experience, shared: people write and explore knowledge, and their agents contribute and retrieve it with explicit authorization. A decision remembered by one teammate's agent should be discoverable by another without copying chat histories or switching agent providers.

Think of this as an **agent-first Notion** for shared knowledge, not a promise of Notion feature parity, real-time co-editing, or a general-purpose project-management suite. The value is durable team context that both humans and agents can use.

Local and shared deployment are equally central, not separate products: the same memory app runs on one machine or against a server-local Markdown root on a self-hosted VPS. Remote agents use the CLI transport; a shared server is not an implicit sync system for personal brains.

## Product principles

- **Relevant before voluminous.** Retrieve the smallest sufficient evidence set, not entire histories or a fixed context dump. Expand when detail, ambiguity, or conflicting evidence requires it.
- **Semantic and exact.** Find paraphrases while preserving identifiers, names, quotations, and exact-title navigation.
- **Time is meaning, not just sorting.** Distinguish when something happened or was true from when a note was written or edited. Answer current-state and historical questions without treating “newest” as “correct.” Present chronological evidence when the question calls for it.
- **Compression with a route back.** Concise topical pages help agents orient quickly; dated source evidence and provenance remain available. Synthesis must preserve uncertainty, changes, and disagreements rather than overwrite history.
- **Agent-independent.** Keep the CLI the supported local/remote agent interface; integrations should remain thin. The ambition covers all kinds of agents, not only coding assistants.
- **One small app.** Reuse the same local engine on a VPS. Prefer bounded, deterministic mechanisms and existing backend capabilities over mandatory model orchestration or additional infrastructure.
- **Owned and inspectable.** Markdown is canonical. Indexes, embeddings, and retrieval state are rebuildable. Users can inspect, edit, back up, move, and version their memory.
- **Explicit and trustworthy.** Recall is visible by default, not automatic whole-memory prompt injection. Global/team/remote writes require explicit authorization. Report stale indexes and degraded retrieval rather than implying complete knowledge.

## How to judge progress

Compare changes at matched answer quality and context budgets:

- supporting-evidence coverage and source-backed answer correctness;
- temporal correctness, knowledge-update handling, and appropriate abstention;
- total agent-visible tokens across recall and follow-up reads, including metadata;
- cold/warm retrieval latency, indexing work, and shared-server resource use;
- ease of deployment, recovery, and use across different agents.

Maintain a focused, reproducible knowledge-workspace evaluation in this repository: a fictional Markdown workspace, realistic human search and agent recall tasks, a versioned protocol, and a frozen baseline before retrieval experiments. This scope was explicitly requested on 2026-10-28 and supersedes the earlier external-only evaluation decision for this product suite; see the [baseline and experiments plan](../tasks/todo/tasks-workspace-retrieval-evaluation.md). Keep broad cross-vendor research benchmarks, private corpora, credentials and bulky raw run artifacts outside the repository. Retain small deterministic regressions in the normal test suite. Do not publish efficiency or quality superlatives without reproducible evidence.

## Keep out of the critical path

No mandatory graph database, provider-specific agent framework, always-on LLM planner, or automatic transcript injection. Add complexity only when a measured failure justifies it. A browser or native companion is a convenience surface over the same memory, not a second engine or an implicit sync system.

## Vision versus current support

These principles describe direction, not a promise that every capability is implemented. Current behavior belongs in the [technical design](technical.md), [CLI reference](cli-commands.md), and [shared-memory guide](cloud-shared-memory.md).

The [2026-10-10 retrieval and deployment review](../deep-dives/retrieval-product-review/findings.md) separates existing capabilities, deployment caveats, external evidence, and proposed improvements.
