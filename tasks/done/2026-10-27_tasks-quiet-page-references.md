# Quieter page references

## Outcome — 2026-10-27

Relevance checked against current rendering: markers were already softened, but all brackets remained visible during reading. Active reference brackets are now transparent outside editor focus and faint during editing; link text has a quiet underline and the existing focus ring.

CSS Custom Highlights preserve the original single text leaf, exact `[[title]]` Markdown, selection/copy, editing, undo and pointer/Tab+Enter activation. Code/inert contexts keep literal brackets; unsupported browsers retain visible brackets. Fixed the pre-existing literal-bullet completion gap exposed by the existing autocomplete runner: the internal shortcut-suppression code flag no longer blocks the shared source scanner from allowing valid references. Actual inline/fenced code remains inert. Reference and slash popups retain their own ARIA active descendant.

## Goal

Make page references easy to read without distracting bracket syntax in ordinary note reading.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=f9af6356-e336-474f-8e5f-43a4813c9983); triaged 2026-10-27.
- Keep canonical [[reference]] Markdown and existing reference navigation/insertion semantics. Improve the existing editor presentation rather than introducing a second storage representation.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/lexical-editor.ts`, page-reference styling and `browser.docs.md`; existing page-reference editor smoke.

## Tasks

- [x] Inspect reference presentation in reading, focus and editing states; hide or visually soften brackets while keeping linked text discoverable.
- [x] Preserve reference editing, caret/selection, missing-page behavior, accessible activation and literal bracket text inside code.
- [x] Check dense-reference notes in both themes, plus mouse/keyboard navigation and save/reopen round trips without source changes.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.

## Tested snapshot and verification

- Source base `56c8fe0` plus this task group's scoped changes; package version stays `0.3.9`. Production build fingerprint `ea86897a349b1485`; editor bundle 544,227 bytes minified / 179,642 bytes gzip (181,000-byte reviewed gate, no new dependency). `npm run build` passes.
- Focused `node --test` over `editor-markdown`, `lexical-bundle`, `architecture-boundaries`, `notes-browser`, `document-edit-smoke`, `reference-ranges`, `reference-policy`, `reference-creation`, `companion-browser` and `external-document-updates`: **187 passed, 0 failed**. Log: `/tmp/jumpybrain-editor-feedback-focused.log`.
- Real-server disposable-root `scripts/editor-feedback-smoke.mjs`: **PASS at 1280/390/320px**, both themes; exact source/CRLF/no-final-newline saves, table edits/invalid fallback/undo/refresh, reference edit/reopen, every slash action/token-only replacement/undo/cancellation, code/literal/composition/read-only and failed-save retry. Log: `/tmp/jumpybrain-editor-feedback-smoke.log`; 12 inspected reading/menu screenshots: `/tmp/jumpybrain-editor-feedback-qa/{1280,390,320}-{light,dark}-{reading,slash}.png`.
- Existing production editor regressions: `page-reference-editor-smoke.mjs` **66 passed**; `reference-autocomplete-smoke.mjs` **36 passed**; `lexical-editor-smoke.mjs` **PASS 1280/390px**; `markdown-formatting-smoke.mjs` **PASS 1280/390/320px** (uncertain/lost-response and conflicting saves included). Logs: `/tmp/jumpybrain-editor-feedback-{reference-editor,autocomplete-final,lexical,formatting}.log`.
- Existing `external-document-updates-smoke.mjs` **PASS 1280/390px** and `companion-browser-smoke.mjs` **PASS**, including session/read-only/two-tab freeze/flush/conflict guards. Logs: `/tmp/jumpybrain-editor-feedback-{external,companion}.log`.
- `JUMPYBRAIN_REFERENCE_SCENARIO=hydrate-activate-edit-reload` with `missing-reference-pages-smoke.mjs`: **2 passed, 0 failed**, real companion gateway, desktop 1280px and touch 390px; existing/missing target navigation, create/edit/reload. Log: `/tmp/jumpybrain-editor-feedback-missing-activation.log`. Added this optional scenario selector to isolate checks without changing default coverage.

## Remaining verification limits

- Broad `node --test`: **1,394 tests, 1,391 passed, 2 failed, 1 skipped**. Desktop install regression lacks repository-local `integrations/electron/node_modules/esbuild/package.json`; extension total-deadline test observed two calls instead of one under parallel load and **passed on isolated rerun (1/1)**. Logs: `/tmp/jumpybrain-editor-feedback-node-tests-final.log` and `/tmp/jumpybrain-editor-feedback-extension-rerun.log`. Neither failure was silently marked green or changed outside this editor scope. This broad run preceded final conservative table-container and modified-key/menu-position hardening; focused/editor checks above were rerun on the final build.
- Full optional missing-page smoke passed desktop activation, then repeated `scenario tab did not unregister` cleanup failures and a read-only 409. The run was stopped after the repeated failures; `/tmp/jumpybrain-editor-feedback-missing.log` retains the evidence. Baseline equivalence of that cleanup failure was not established. The isolated activation/reload scenario above passes at both widths; the full runner is **not** claimed green.
- Chromium synthetic keyboard/touch and disposable Markdown only; physical Mac/IME, OS clipboard, assistive technology, Safari/Firefox, large-table performance and combined integration with the other ticket groups remain separate checks. No personal notes, installed app, real email, push, release or version bump.

Owning browser docs, pending release notes and the selective task changelog are updated. All required implementation and focused checks in this list are complete; limits above remain explicit for integration.
