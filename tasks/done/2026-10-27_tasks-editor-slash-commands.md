# Editor formatting slash commands

## Outcome — 2026-10-27

Relevance checked against current editor/actions: toolbar operations existed, but no slash menu or invocation path existed. Added a filtered, caret-anchored listbox with ArrowUp/ArrowDown, Enter, Escape and pointer acceptance, retaining editor focus and revalidating the current selection on acceptance.

Aliases: `/text` (`/paragraph`), `/h1`, `/h2`, `/h3`, `/bold`, `/italic`, `/checkbox` (`/task`), `/code` (`/inline-code`), `/code-block` (`/codeblock`). Trigger requires a collapsed caret after a slash token at plain-paragraph/heading start (optional leading whitespace); selection, middle-of-text slashes, URLs, task/literal/table/code blocks and composition stay inert. Accept consumes only the token before the caret, preserving suffix text, and invokes the toolbar's shared formatting operation as one history transaction. Inline commands format subsequent typing. Read-only/session locks, document replacement, blur and stale ranges cannot apply a command. No Command-F work is included.

## Goal

Offer the existing editor formatting actions through keyboard-friendly slash commands such as /h1 and /checkbox.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=c9f9de1c-9709-41b5-8002-809c5c055ac8); triaged 2026-10-27.
- Reuse existing formatting operations and canonical Markdown, autosave and history. Cover Text, H1/H2/H3, bold, italic, checkbox, inline code and code block; do not create a separate document model.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{lexical-editor,editor-slash-commands}.ts`, `browser.docs.md`; `scripts/editor-feedback-smoke.mjs` and existing lexical/reference runners.

## Tasks

- [x] Define aliases for current toolbar actions, the slash trigger context and selection behavior; leave literal slashes and code content untouched.
- [x] Add a small filtered command menu with keyboard navigation, Enter selection and Escape dismissal, preserving caret and undo behavior.
- [x] Invoke the existing formatting operations and consume only the chosen command token; honor read-only, composition input and session/save guards.
- [x] Verify each action, cancellation, literal slash typing, empty/nonempty blocks and save/reopen; check menu placement, keyboard access and narrow layouts.
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
