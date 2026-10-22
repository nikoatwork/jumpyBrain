# Clear local installation and agent guidance

## Goal

Make local installation understandable for people and agents: one Markdown brain, optional desktop and CLI interfaces, and explicit data boundaries.

## Notes

- The reported onboarding repeatedly asked for approval, proposed a second checkout, and left users unsure whether the app duplicated their brain.
- Verified public repository access, installer defaults, desktop setup reuse, local search, remote targeting, and the in-progress explicit feedback flow.
- Local storage/search does not make a cloud assistant local. Feedback and user-chosen file sync are additional outbound paths; do not promise that only a memory server can send data.
- Preserve existing unrelated changes, including feedback delivery and glossary work. Distribution redesign remains in `tasks-portable-installation-project-integration.md`.

## Relevant Files

- `README.md`, `docs/install.md`, `integrations/electron/README.md` — entry points and copyable installation paths.
- `docs/faq.md` — privacy, app/CLI relationship, search, updates, and removal.
- `docs/install-for-agents.md`, `skills/jumpybrain-memory/SKILL.md`, `AGENTS.md` — installation assistance and accurate explanations.
- `docs/agent-workflows.md` — discoverability for agent users.

## Tasks

- [x] 1.0 Verify installation and data-flow claims against implementation.
- [x] 2.0 Update installation entry points and write the FAQ and agent installation guide.
- [x] 3.0 Check commands, links, and consistency; record results and completion.

## Completion and verification

- Updated README, installation and Mac guides, workflow entry point, shipped memory skill, and local-only `AGENTS.md`; added the privacy FAQ and focused agent installation guide.
- Corrected outdated private-repository/SSH setup guidance, documented default installed-source reuse, same-folder onboarding, and separate app/CLI updates.
- Two existing targeted installer tests passed: canonical public install URLs and a disposable global install with rendered Codex/Claude/Pi integrations.
- Checked 72 local documentation links/anchors and shell syntax for 29 examples. Existing angle-bracket placeholders were substituted for syntax checking; commands were not executed.
- `git diff --check` passed. Desktop commands were checked against implementation, not a fresh end-to-end Mac install. No real installation, remote memory write, or global skill refresh was performed.
- Recorded the completed documentation result in the repository changelog as required by repository instructions. Finalized for the user-requested v0.3.3 patch release; unrelated existing edits preserved. Full release validation and artifact publication run through `npm run release` from a clean checkout.
