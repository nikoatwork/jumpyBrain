# Shared Mac app system messages

## Goal

Encapsulate app-wide warnings and notifications behind one message dispatcher and presentation component in the shared Mac editor shell.

## Outcome

Implemented one shared system-message component with a typed dispatcher, shared markup/styles and a validated data-only native event. Graph warnings/selection failures, search maintenance/index results, companion/session notices, native operational failures, updater outcomes and existing confirmations now share its lifecycle. Native startup fallback and contextual recovery/validation retain their owning workflows. Persistent warnings sit inside the workspace and cannot cover sidebar navigation.

## Decisions and scope

- Reuse the shared browser shell so Mac and hosted views cannot drift. Keep messages tab-local and brain/credential-scoped, with an explicit app scope for desktop updates.
- Centralize severity, keyed replacement/deduplication, expiry, dismissal, action/focus handling, bounded pending messages and cleanup. Producers dispatch data rather than manipulate notification DOM.
- Migrate existing confirmations, desktop updater notices, graph warnings, companion session/connection notices and index outcomes. Keep contextual field validation, document save/recovery controls, onboarding and startup recovery in their owning flows; native startup fallback and destructive-close decisions still require native presentation.
- Persistent warnings anchor inside the workspace so they cannot cover sidebar navigation; narrow layouts retain the 16px inset.
- Preserve remote write approval, draft/save barriers and the sandboxed fixed native action seam.

## Tasks

- [x] Inspect current warnings, architecture and previous notification work.
- [x] Implement the encapsulated message component and public dispatch contract.
- [x] Migrate system-message producers and centralize native notification delivery with a startup fallback.
- [x] Verify message lifecycle, overlapping sources, deduplication, stale scope/action fencing and production Mac/browser flows.
- [x] Update owning docs and pending release notes, record validation/limits, archive and commit scoped work.

## Relevant files

- `src/adapters/http-server/browser-toast.ts` — existing compatibility surface for note confirmations.
- `src/adapters/http-server/browser-system-messages.ts` — message ownership and public event contract.
- `src/adapters/http-server/graph-page.ts`, `map-controller.ts`, `companion-browser.ts` — system producers.
- `integrations/electron/update-inline.mjs`, `system-messages.mjs`, `application.mjs`, `window.mjs` — native producers and fallback.

## Verification and limits

- Tested base: `ee8af34` plus this task's scoped changes on 2026-10-24. The two unrelated active planning files were preserved.
- `npm run build` passed. Final ordinary browser bundle: 172,686 bytes gzip (~1.6 KB over the previously reviewed 171,068 bytes); reviewed the shared queue/lifecycle cost and adjusted the explicit gate to 174 KB, with no added dependency or polling.
- Full `node --test`: 1,321 passed, one skipped, zero failures. After the final workspace anchoring/selection refinements, the focused browser/message/desktop/graph/notes/bundle suite passed all 148 tests. Lifecycle cases include priority, bounded pending/deduplication, separate operation revisions, expired/dismissed polling outcomes, hover/focus, discarded callbacks, app/brain scope and data-only event validation.
- Production sandboxed Electron `smoke-inline-updates.mjs` passed: real shared native/renderer dispatch, one component, priority, scope/action fencing, text safety, native update restrictions, retained draft/selection, both themes and 1200/390/320 widths. Persistent notices leave navigation clickable. Desktop light/narrow dark warning screenshots were visually inspected under `.local-pack/update-inline-ui/`.
- Production `companion-browser-smoke.mjs` passed registration, settings/index feedback, two-tab save/freeze, conflicts, read-only/generation/session recovery and uncertain creation checks.
- Production `graph-warning-smoke.mjs` passed with 501 disposable notes at 1280/390/320 widths: safe warning text, refreshing, superseded responses, failure and recovery all use the shared component. The check distinguishes graph warnings from independent search-maintenance notices.
- Production `note-attention-smoke.mjs` passed real Snooze/Copy expiry, Undo, failed-save recovery, draft/caret/metadata stability, themes and desktop/narrow layouts.
- `git diff --check` passed. Updated browser/desktop/design docs, glossary, pending release note and the architectural changelog highlight. Archived this task under `tasks/done/2026-10-24_tasks-shared-system-messages.md`.
- Limits: no installed-app replacement, publication, physical-device or real assistive-technology validation. Startup/unavailable-renderer fallback is covered by deterministic delivery tests; production native tests use an inert updater and disposable profile. Canonical Markdown, CLI configuration and personal/team memory were not changed. Native destructive-close/onboarding/startup recovery and contextual form/save instructions remain separate workflows by design.
