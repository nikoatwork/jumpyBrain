# Helpful button hover labels

## Completed — 2026-10-27

**Implemented: shared hover and focus labels.**

Relevance: navigation, note actions and Settings generally had accessible names/native titles, but native titles did not provide visible keyboard-focus help; Text/H1/H2/H3/B/I lacked titles. The shared label presenter now consumes existing control titles/accessibility names, uses theme/type tokens and one viewport-clamped top-layer tooltip, and supports dynamically inserted Settings/native controls and disabled hover. Formatting controls gained concise titles. No action or disabled/tab policy changed.

Audit: Home/New note/Search and sidebar navigation, Copy/Delete/reference, formatting, Graph/Settings/Feedback/theme, profile Test/Edit/Use/Remove, index/extension refresh, and injected Updates use their existing names/title hints. Textual buttons already explain their action. Existing Feedback information help remains owned by Feedback; no changes to that flow.

## Tested snapshot

Base `56c8fe075508a6392417de275856a5190af29b55` plus this commit’s scoped working tree; built on 2026-10-27 with Node v26.7.0. Editor bundle: 540,252 bytes / 178,797 bytes gzip, SHA-256 `e95e3e65e9dcbab2d9e592881c9c8ff84ba2328c9bf7d447209332d758bd2873` (reviewed 180 KB gate, no new dependency).

## Verification

- `scripts/note-find-smoke.mjs`: PASS hover/focus Bold, disabled hover, modal Close search tooltip bounds, unchanged actions, both themes at 1280/390/320px. Inspected `/tmp/jumpybrain-note-find-qa/label-1280-dark.png` and narrow captures.
- `scripts/companion-browser-smoke.mjs`: PASS named Settings controls, focus retained across polls, permissions and both-theme 1280/390/320px layout; `/tmp/jumpybrain-ux-companion-smoke.log` and `/tmp/jumpybrain-note-find-qa/settings-*.png`.
- `scripts/electron-smoke.mjs`: PASS sandboxed native window and both-theme 1200/480px layouts; `/tmp/jumpybrain-ux-electron-smoke.log`.
- Full suite: 1,392 pass, 1 skipped, 0 fail; `/tmp/jumpybrain-ux-all-tests-final.log`.

## Remaining limits

Native-disabled controls remain outside keyboard tab order; their accessible names/disabled semantics and pointer help remain. Popover-capable Chromium/Electron were exercised; older browsers retain native titles. Physical screen-reader/IME testing remains separate.

Owning browser/design-system/desktop docs and pending release notes updated. The changelog records the new find capability; routine copy/label/search refinements do not receive separate highlights. No glossary term was needed. No personal installation, real notes, live email, push, release or version change.

## Goal

Help people understand icon buttons through short labels on hover and keyboard focus.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=1198d00d-7cf3-4adb-ad43-e2112560a950); triaged 2026-10-27.
- Existing icon controls already have some labels. Audit gaps and reuse the shared tooltip/accessibility pattern rather than adding another component. Preserve the quiet paper-like design.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{browser-icons,browser-design-system,notes-browser,lexical-editor}.ts`, `docs/design-system.md`.

## Tasks

- [x] Audit visible Mac app controls, including editor formatting, navigation, note actions and Settings; identify missing, unclear or hover-only labels.
- [x] Add concise action names using existing shared styling, accessible names and focus behavior; include shortcut hints only where useful.
- [x] Verify hover/focus labels in both themes and narrow layouts, including disabled controls, clipping and unchanged click/keyboard actions.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.

## Combined verification

See [the integrated feedback result](2026-10-27_tasks-feedback-integration.md) for merged-snapshot testing and the cross-feature fixes found after this group was integrated. The measurements above describe this group’s original tested snapshot.
