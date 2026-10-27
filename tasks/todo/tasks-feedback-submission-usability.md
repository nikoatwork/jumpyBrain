# Lean feedback submission

## Goal

Let ordinary users send feedback directly from the Mac app without configuring Mail or handling a downloaded message file.

## Notes

- Source: [feedback received 2026-10-20](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=5db6a117-b137-4611-83be-8161eeaded55); triaged 2026-10-27.
- Direct sending and a compact dialog were delivered after this report: [direct feedback](../done/2026-10-22_tasks-direct-feedback.md), [release configuration repair](../done/2026-10-23_tasks-feedback-release-configuration.md). Verify the current distribution before adding another transport. Success-close behavior belongs to [the toast task](tasks-feedback-success-toast.md).
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/feedback.ts`, `docs/feedback-delivery.md`, distribution feedback configuration; existing feedback smoke/packaging checks.

## Tasks

- [ ] Inspect the current packaged feedback flow and compare it with the reported Mail/download friction; record which parts are already resolved and any remaining gaps.
- [ ] Keep message entry and direct Send primary, with concise optional-diagnostics consent; remove any remaining mandatory Mail/download steps and give a short actionable failure message.
- [ ] Verify success, failure/draft retention, retry and diagnostics opt-out using fixture delivery plus packaged endpoint checks. If no gap remains, record the verified outcome instead of adding a new mail integration.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
