# Calm note writing journey

## Outcome

Implemented B — Folding desk after three independent proposals and a unanimous three-agent panel. The default note is quieter, formatting is explicit, linking stays direct and section navigation is discoverable. The complete writing/consult/return journey and recovery guards passed browser and production Electron checks.

## Goal

Create three distinct Mac note-page designs inspired by Linear, Coda and Notion, have an independent agent panel judge every option, and implement the highest-ranked option end to end.

## Context

- Work starts at `3ed8a67`; preserve unrelated retrieval/evaluation work in this checkout.
- User authorizes design subagents, judging subagents, autonomous implementation and testing. Routine implementation choices use the existing architecture and design system.
- Markdown, concurrency, save guards and remote permissions retain their existing owners. No installation, push or release requested.

## Tasks

- [x] Develop three concrete design proposals and judge each with a three-agent panel.
- [x] Record the winning design and implement its complete writing/navigation journey.
- [x] Test canonical editing, keyboard/focus, recovery, themes/responsive layout and real Electron behavior; inspect captures.
- [x] Update owning docs and release notes; archive and commit only this task's changes.

## Artifacts

- [Design proposals and judging](../../deep-dives/calm-note-journey/)

## Verification

- Full stable-build `node --test`: 1,444 tests, 1,443 passed, one existing skip, zero failures (build `9a59722614d4d8fd`, version 0.3.11).
- `npm run build`: passed. Final build `adf450369a2851cf`; editor 186,396 bytes gzip under the existing 187,000-byte gate, 15 bundled packages, no new dependencies.
- Final targeted controller/shell/companion/bundle/architecture rerun: 118 passed after the permission-focus refinement.
- `scripts/note-workspace-smoke.mjs`: passed the actual create → title/body → pointer/keyboard Format → reference insertion → section jump → linked note/Search → Back → continue → failed-save navigation block/Retry → canonical reopen journey. Checks exact selected formatting/undo, stable editor DOM, zero writes from presentation controls, scoped Escape, duplicate headings/code exclusions, empty hints, read-only remote and current unsaved draft copy.
- Visual QA: 20 details open/closed captures at 1280/1180/900/390/320px light/dark plus 18 expanded-toolbar captures across Ember/Ocean/Mono light/dark at 1280/390/320px. Inspected desktop, rail, narrow and native captures for writing hierarchy, wrapping, controls and overflow. Captures remain in ignored `.local-pack/desktop/note-workspace/`.
- `scripts/electron-smoke.mjs`: passed actual sandboxed production window/gateway, native Enter/Escape disclosure, direct Link, section caption, immutable folding, typing/autosave, native Find, saved facts, focus return, unload protection and tab cleanup. Theme/expansion captures now wait for paint before capture; native captures live under ignored `.local-pack/desktop/`.
- Existing Lexical, editor-feedback, note-find, note-lifecycle, companion-browser and external-document-updates smoke runners passed, including table/source preservation, slash commands, search/reference navigation, conflicting edits/recovery, failed saves, read-only/session/brain fences and external refresh/caret/undo. Disposable data only.
- Final companion permission-revocation/focus regression: passed against final build `adf450369a2851cf`; changing live fixture permissions hides formatting, moves focus to visible Copy draft, preserves canonical content and restores the trigger when writing is allowed again.
- `git diff --check`, staged whitespace checks and `npm run guard:staged`: passed. Scoped implementation, tests, docs, designs/judging and this archived list are finalized together.

## Remaining limits

- The panel scores are independent agent design judgments, not observed user research. Product references are conceptual inspirations.
- Physical assistive technologies, IME, OS clipboard and other browsers remain separate manual checks. Electron uses disposable user data and a production window/gateway; the installed app and personal brain were not changed.
- No installation, version bump, push or release performed. Unrelated retrieval/evaluation/QMD edits remain outside this task; full-suite results refer to the recorded stable compiled snapshot, and final scoped behavior was revalidated separately.

## Decision

B — Folding desk won unanimously (138/150; C 128, A 122). See [selection and refinements](../../deep-dives/calm-note-journey/decision.md). Implemented explicit Format disclosure, one direct Link action and live supported-heading captions. Existing canonical editing, transport and permissions stay with their current owners.

## Relevant files

- `src/adapters/http-server/note-workspace.ts` — disclosure state, count, focus and lifecycle.
- `src/adapters/http-server/notes-browser.ts` — note markup, styles and existing insertion/permission wiring.
- `scripts/note-workspace-smoke.mjs`, `scripts/companion-browser-smoke.mjs`, `integrations/electron/smoke-app.mjs` — extended end-to-end coverage.
- `scripts/editor-smoke-helpers.mjs`, Lexical/editor-feedback/note-find runners — explicit formatting discovery in existing checks.
- Browser/design-system/desktop owning docs, pending release notes and task changelog — current behavior and completion record.
