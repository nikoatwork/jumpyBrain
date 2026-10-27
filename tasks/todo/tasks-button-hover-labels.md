# Helpful button hover labels

## Goal

Help people understand icon buttons through short labels on hover and keyboard focus.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=1198d00d-7cf3-4adb-ad43-e2112560a950); triaged 2026-10-27.
- Existing icon controls already have some labels. Audit gaps and reuse the shared tooltip/accessibility pattern rather than adding another component. Preserve the quiet paper-like design.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{browser-icons,browser-design-system,notes-browser,lexical-editor}.ts`, `docs/design-system.md`.

## Tasks

- [ ] Audit visible Mac app controls, including editor formatting, navigation, note actions and Settings; identify missing, unclear or hover-only labels.
- [ ] Add concise action names using existing shared styling, accessible names and focus behavior; include shortcut hints only where useful.
- [ ] Verify hover/focus labels in both themes and narrow layouts, including disabled controls, clipping and unchanged click/keyboard actions.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
