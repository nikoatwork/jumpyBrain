# Page-reference navigation and inline autocomplete — integration

Status: pending implementation. The feasibility investigation is finalized; neither feature is shipped. This list owns its unfinished rollout gates.

## Context and scope

- [Archived feasibility task](../done/2026-10-07_tasks-clickable-page-references.md) — agreed behavior, boundaries, inspection findings, and historical verification.
- [Feasibility findings](../../deep-dives/page-reference-feasibility/findings.md) — reproducible prototypes, measured tradeoffs, and limitations.
- Carry forward the agreed scope: normal-click title-only navigation through existing save/history protection; missing/ambiguous/unopenable targets retain the current draft. No target creation, filename fallback, graph-semantic changes, stable-ID links, or rename propagation.
- Inline suggestions reuse existing indexed search/ranking; Cmd/Ctrl+K remains global search. Suggestions insert literal exact-title references, never navigate or mutate targets. Fresh canonical resolution is separate from potentially stale indexed search.
- No new framework, parser/positioning dependency, editor replacement, or DOM-rewriting overlay. Read architecture and co-located module docs before source changes.

## Relevant Files

- `deep-dives/page-reference-feasibility/` — disposable evidence; port reviewed pieces and remove the editor fork when implementation proceeds.
- `src/adapters/http-server/lexical-editor.ts` — recognition, literal-block preservation, live selection/range, history, and caret geometry.
- `src/adapters/http-server/notes-browser.ts`, `src/adapters/http-server/graph-page.ts` — search presentation/transport, guarded navigation, and save/session lifecycle.
- `src/core/canonical/markdown-store.ts`, `src/core/canonical/links.ts` — title normalization/document identity and intentionally separate graph semantics.
- `src/app/server-memory/`, `src/adapters/http-server/routes.ts`, `src/adapters/http-protocol.ts` — canonical lookup orchestration and authenticated protocol.
- `scripts/{lexical-editor,graph-editor,daily-capture}-smoke.mjs` — real app browser regression fixtures.
- `test/canonical-document-{read,update}.test.js`, `test/server-http.test.js`, `test/lexical-bundle.test.js` — existing identity/protocol/bundle contracts.
- Affected co-located `*docs.md`, `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md` — owning implementation/user contracts.

## Tasks

- [ ] 1.0 Implement the canonical title lookup seam (feasibility 3.1).
  - [ ] 1.1 Share rename's title normalization; resolve from fresh canonical Markdown at the editor root, independent of the index. Port tests for missing/duplicate titles, ID-less matches, invalid/duplicate IDs, renamed/unindexed/deleted pages, scan errors, and root isolation.
  - [ ] 1.2 Add the server-memory use case and thin authenticated HTTP route with minimal remote-safe found/missing/ambiguous/unopenable results. Preserve explicit scan/read race limitations; do not imply atomic uniqueness against external writers.
- [ ] 2.0 Port reviewed navigation behavior and prove app integration (feasibility 2.2–2.3, 3.2).
  - [ ] 2.1 Accept or refine conservative fallbacks before porting: unsupported quote/list/indented fences suppress the remaining document; cross-format references stay inert; unfinished autocomplete only operates at logical block end. Preserve exact-Markdown and delimiter-reclassification regressions.
  - [ ] 2.2 Wire live title activation into existing guarded ID navigation; verify authenticated lookup, save failure/retry, delayed responses, repeated clicks, target deletion, and Back/Forward. Never lose the current draft on resolution/save failure.
  - [ ] 2.3 Verify real save/reload after typed, pasted, picker-inserted, and edited references in paragraphs/headings/bullets; editing/copying/drag selection, undo/redo, keyboard activation, and no-change hydration/click preservation. Check double-click selection tradeoffs and OS clipboard behavior.
- [ ] 3.0 Integrate autocomplete and its lifecycle (feasibility 4.1–4.4).
  - [ ] 3.1 Reuse independent search-controller state and authenticated transport; evaluate real indexed partial-query relevance, empty/loading/auth/error feedback, and freshness after actual autosaves. Do not add a new fuzzy engine.
  - [ ] 3.2 Port the live range/update seam with acceptance-time revalidation and undoable exact replacement. Explicitly cancel on document/credential/modal/read-only transitions; verify stale responses cannot reopen or insert in another draft and Cmd/Ctrl+K coexists.
  - [ ] 3.3 Complete editor/listbox/active-option ARIA and accessible announcements; implement tap-versus-scroll rather than accepting immediately on touch pointerdown. Keep editor focus, Escape non-destructive, and ordinary Enter/editing intact outside popup ownership.
  - [ ] 3.4 Validate physical IME, assistive technology, touch scrolling, mobile keyboard/visual viewport, zoom, wrapped-line/scroll/edge geometry, and Safari/Firefox. Synthetic composition and narrow Chromium are not substitutes; explicitly document any blocked validation.
- [ ] 4.0 Verify and document actual shipped behavior (feasibility 5.3).
  - [ ] 4.1 Run affected unit/boundary/bundle tests and disposable-root Lexical, graph-editor, and daily-capture integration smokes. Recheck large-note recognition/autocomplete performance; existing benchmark numbers predate conservative context changes.
  - [ ] 4.2 Update owning docs for title matching/outcomes, graph differences, rename/title-reuse limitations, inline suggestions versus global search, and index freshness. Remove the prototype editor fork rather than maintaining two editors.
  - [ ] 4.3 Record separate navigation/autocomplete rollout decisions and remaining limitations; only describe validated, integrated behavior as shipped.

## Blockers

- None for starting canonical lookup implementation. Physical-device/assistive-technology validation and acceptance of conservative false negatives remain explicit rollout gates.
