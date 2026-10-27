# Clear Mac installation and updates

## Goal

Give Mac users one clear installation path and explain how Desktop and CLI updates work together.

## Notes

- Source: [feedback received 2026-10-20](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=5db6a117-b137-4611-83be-8161eeaded55); triaged 2026-10-27.
- Installation guidance and paired updates already changed after this report: [guidance](../done/2026-10-22_tasks-installation-confidence.md), [paired updates](../done/2026-10-22_tasks-unified-mac-cli-update-experience.md). Validate remaining confusion first. Coordinate with [update speed](tasks-desktop-update-speed.md) and [portable installation](tasks-portable-installation-project-integration.md).
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`README.md`, `docs/{install,install-for-agents,faq}.md`, `integrations/electron/README.md`; existing installer/update smoke tooling.

## Tasks

- [ ] Walk the current public install instructions from a new Mac user perspective; identify confusing GitHub steps, duplicate code paths and unclear Desktop/CLI ownership.
- [ ] Make the recommended path and update behavior consistent across entry docs, including CLI-only and custom/pinned exceptions; explain that both interfaces can use the same Markdown folder.
- [ ] Verify advertised install/update commands against current implementation and disposable fixtures where behavior changes; route distribution/updater redesign to its existing list and record any unresolved user friction.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
