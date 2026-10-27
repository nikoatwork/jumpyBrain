# Simple command search results

## Goal

Keep the command search popup compact, without technical result-count prose or page-replacement navigation.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=79c47e4d-f625-4942-b631-07ba2a234bc8); triaged 2026-10-27.
- Build on [the popup copy cleanup](../done/2026-10-25_tasks-search-popup-copy.md). If Load more is retained, append within the list; removing additional loading is acceptable if simpler. Preserve actual errors and actionable stale-index status.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/notes-browser.ts`, search controller/presentation and `browser.docs.md`; `scripts/search-recognition-smoke.mjs`.

## Tasks

- [ ] Remove the ranked-candidate/coverage paragraph from the ordinary popup, keeping necessary failure/degraded-status feedback concise.
- [ ] Choose the smallest coherent result behavior: append additional matches in place or retain a bounded initial list without Load more; remove page-replacement behavior from this popup.
- [ ] Verify keyboard selection, scrolling, query changes, empty/error/stale states and any retained Load more behavior in desktop/narrow layouts; keep backend ranking unchanged.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
