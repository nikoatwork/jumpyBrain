# Documents, editor, and an agent sidebar

Status: deferred exploration, recorded 2026-10-16. No implementation decision or provider access has been verified by running an agent.

## Goal

Explore a jumpyBrain workspace with documents on the left, the existing editor in the middle, and an agent conversation/activity panel on the right. Prefer the user's installed agent and eligible subscription access. Keep the memory engine agent-independent and Markdown canonical.

## Conversation log

- Initial idea: borrow T3 Code's approach to controlling Codex or Claude Code from a custom interface, including streamed activity and reviewable document changes.
- The immediate preference is to keep agents in their terminal and make the open editor reflect their changes smoothly. Prioritize [external document updates](../todo/tasks-live-external-document-updates.md) before embedding an agent.
- Useful later actions: attach a current note or selection, ask questions across notes, find source decisions, propose page updates, and run explicitly scoped consolidation.
- An embedded agent would be optional. Writing, browsing, search, and shared memory must remain useful without it.

## Findings and uncertainty

- T3 Code controls agents on the user's machine. Its source uses Codex app-server and the Claude Agent SDK; lifecycle hooks alone are not the conversation-control interface.
- Codex app-server exposes structured conversation events, approvals, history, and session operations. A local child process using stdio is a plausible integration seam. OpenAI recommends Sign in with ChatGPT for plan access; paid/remote hosting has a separate access path. Recheck access conditions before building.
- Claude offers an Agent SDK and a programmatic CLI with streamed JSON. Its subscription help currently permits SDK/CLI/third-party usage against subscription limits, while SDK overview wording retains restrictions on third-party subscription login. Verify the exact distribution/authentication model rather than treating a working wrapper as sufficient evidence.
- Codex and Claude CLI executables were found locally. Login, model access, subscription accounting, and an end-to-end integration were not tested.
- Existing foundations: browser editor, companion loopback gateway, local/remote profiles, CLI memory transport, and an Electron prototype tracked separately. Browser UI needs a host process to operate local agent executables.
- A local agent accessing a shared VPS brain through the CLI is distinct from running agents on the shared server. Neither browser connection credentials nor companion write approval automatically configure or authorize an agent.
- Start with sessions owned by this integration. Attaching to an already-running desktop chat is a separate unverified capability.

## Proposed boundary

Existing browser editor -> optional local agent bridge -> provider adapter -> installed agent runtime.

The agent uses the jumpyBrain CLI against an explicit memory root/remote target. Keep provider orchestration outside core and ordinary hosted memory routes. Bind sessions to their original brain, retain explicit recall, and require explicit authorization for global/team/remote memory writes. Account for editor drafts and external updates before enabling mutations.

## Later tasks

- [ ] Recheck provider protocols, authentication, eligibility, distribution conditions, and version compatibility using current primary sources.
- [ ] Sketch the three-pane workspace and compact layouts; validate whether inline chat improves real document workflows.
- [ ] Prove one provider with a read-only local experiment: send, stream activity, expose sources, cancel, resume, and report usage-limit/authentication failures.
- [ ] Define session lifecycle, brain switching, approval routing, and conflict behavior before adding document writes.
- [ ] Add another provider only after the first integration establishes a useful shared interface.
- [ ] Update owning architecture/browser/host docs only if implementation changes their contracts.

## Sources checked during the investigation

- [T3 Code](https://github.com/pingdotgg/t3code), [Codex adapter](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts), [Claude adapter](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts).
- [Codex app-server](https://learn.chatgpt.com/docs/app-server), [ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source).
- [Claude programmatic CLI](https://code.claude.com/docs/en/headless), [subscription usage](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [product integration conditions](https://code.claude.com/docs/en/legal-and-compliance).
- Local context: `docs/product-vision.md`, `src/architecture.docs.md`, `integrations/macos-companion/gateway.docs.md`, and `tasks/todo/tasks-electron-local-prototype.md`.
