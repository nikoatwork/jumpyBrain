# Memory map UX refresh

Status: completed and archived 2026-09-30 with user approval.

Delivered a quieter home-style memory map, anchored zoom, simplified controls, and shared-detail history restoration. Verified 404 tests and desktop/narrow browser flows; physical trackpad and Safari checks remain unverified.

## Goal

Lightly polish the graph so it feels like part of the clean, white, Notion-like home and note experience. Preserve the interaction that already works, fix zoom anchoring, and remove unnecessary controls and decoration. A non-technical person should see their work and connections and open notes through the existing shared detail view.

## Decisions and assumptions

- User confirmed direct navigation to the shared detail view; browser Back is the return mechanism. Do not introduce a graph-specific preview, side panel, editor, or custom back stack.
- **Correction from user:** mouse drag-to-pan already works. The remaining observed interaction problem is mouse-wheel zoom shifting the view unintuitively rather than zooming toward the intended area. Do not frame working mouse panning as broken.
- User explicitly narrowed the request to a light touch and less clutter, including removing the depth inspector. A broad gesture, layout, or filter redesign is not required.
- User approved making remaining planning assumptions without more clarification questions.
- Match the existing home's restrained typography, white/light-neutral surfaces, spacing, and quiet controls. Refresh the graph, not the home or editor.
- Preserve existing graph inclusion defaults and real link semantics. Do not change which notes appear as part of a cosmetic cleanup or imply unconnected notes are errors.
- Use “Memory map,” “Notes,” and “Connections” in primary copy rather than graph terminology. Present counts as the displayed map, not a productivity score or a claim to show every memory.
- Preserve mouse drag-to-pan and ordinary wheel-to-zoom. Fix wheel zoom to keep the graph point under the pointer stationary; +/− buttons zoom around the visible canvas center. This addresses the current origin-anchored drift without replacing familiar gestures. Verify trackpad behavior, but defer a new trackpad-pan/pinch interaction model unless a reproducible issue warrants it.
- Keep camera, filters, and selected-note context on Back/Forward within the current tab's navigation. Persisting camera state across reloads or sharing camera URLs is not required.
- Keep the framework-free, locally served browser architecture and existing graph/document protocols. No new frontend framework, graph service, inference of relationships, or canonical Markdown changes.

## Investigation findings

Evidence is source inspection, including an independent interaction/navigation review, not a live-browser reproduction or screenshot review. Bounded memory recall returned no relevant prior UI decisions.

- `graph-page.ts` adds a separate branded header, dense toolbar, textured/gradient canvas, overlay headings, status pill, legend, and boxed statistics beneath the shared navigation. Home in `notes-browser.ts` uses a much quieter layout. Shared color tokens alone have not made the screens consistent.
- Background pointer dragging already updates `state.pan`, but node `pointerdown` stops propagation. Wheel input always zooms from `deltaY`; horizontal movement is ignored. Pointer cancellation, active-pointer ownership, button filtering, and touch-action handling are incomplete, but those observations do not establish a user-visible failure. The user subsequently confirmed mouse dragging works; broader gesture hardening is deferred.
- Zoom changes only scale, without compensating pan to keep the point under the cursor stationary. This explains the unintuitive zoom direction: scaling is anchored to the SVG origin, not the pointer or canvas center. Reset returns to scale 1 / pan 0; replacing it with a new fit algorithm is not necessary for this light-touch scope.
- `selectNode()` already routes valid document nodes to `/?note=<canonical-id>`. The full-page Lexical detail view is shared with search/home; old slide-in controls are already absent and their absence is tested.
- Shared navigation already guards autosave and Back/Forward. Returning to the graph reuses in-memory data and preserves camera during layout, but focuses the filter rather than the originating node. Explicit graph reload resets camera; graph state is not stored per history entry.
- `renderMarkdown()`, `inline()`, and `escapeHtml()` remain in the shell as a legacy preview renderer. Repository search found renderer calls in tests, not a live UI caller: concrete cleanup candidates, subject to confirming callers at implementation time. The document codec/save controller in the same file is still shared and must remain.
- Layout is deterministic degree-ordered placement, not relationship-based clustering. Label density and emphasis can improve readability, but proximity must not be described as semantic similarity.
- Existing graph smoke coverage checks filtering, direct detail navigation, browser Back, and non-navigable unresolved links. It does not assert pan gestures, zoom anchoring, drag-versus-click behavior, or camera/focus restoration.

## Relevant files

- `src/architecture.docs.md`, `src/adapters/http-server/http-server.docs.md` — architecture and browser ownership contracts.
- `src/adapters/http-server/graph-page.ts` — graph markup/styles, layout, gestures, node activation, shared transport/save controller, legacy renderer.
- `src/adapters/http-server/notes-browser.ts` — home design reference, shared detail, navigation/history, search, connection UI.
- `src/adapters/http-server/lexical-editor.ts` — existing shared editing surface; preserve behavior rather than adding a second viewer.
- `src/app/local-memory/graph.ts`, `src/types.ts` — existing filter, link, limit, and warning contracts; reference only unless a demonstrated gap requires a scoped change.
- `test/graph.test.js`, `test/notes-browser.test.js`, `test/server-http.test.js` — shell, navigation, graph, and protocol regression coverage.
- `scripts/graph-ui-smoke.mjs`, `scripts/graph-editor-smoke.mjs`, `scripts/playwright-runtime.mjs` — browser validation and disposable fixture server.

## Tasks

- [x] 1.0 Investigate the current experience and record the intended outcome.
  - [x] 1.1 Compare home/graph presentation in source and trace graph → shared detail → browser Back.
  - [x] 1.2 Inspect pan/zoom handlers, test coverage, and cleanup candidates.
  - [x] 1.3 Record user decisions and reasonable defaults above; no further planning questions required.

- [x] 2.0 Establish a small visual and interaction baseline.
  - [x] 2.1 Re-read owning docs and current source before editing; these UI files have concurrent working-tree changes. Preserve unrelated work and verify findings against the current revision.
  - [x] 2.2 Use a disposable fixture to capture home, graph, and detail at desktop/narrow widths. Reproduce wheel-zoom drift before and after panning; confirm existing mouse dragging works. Never write real local/team memory for QA.

Baseline: disposable six-note fixture at 1280×820 and 390×844. Background drag moved the camera by the requested (60, 35) pixels. One wheel step after panning displaced the intended anchor by 83.23 px desktop / 41.06 px narrow. Screenshots and measurements: `/tmp/jumpybrain-map-before/`. Initial post-fix rerun: under 0.06 px drift at both sizes (input-coordinate rounding).

- [x] 3.0 Remove clutter and lightly align the graph with home.
  - [x] 3.1 Keep shared app navigation and one compact “Memory map” heading. Remove redundant branding/headings and reduce the textured/gradient background, boxed overlays, and heavy toolbar styling in favor of home's quiet light surfaces.
  - [x] 3.2 Reuse shared typography, spacing, buttons, and focus styles. Preserve readable node accents and connection lines; simplify copy to “Notes” and “Connections” where appropriate.
  - [x] 3.3 Remove the depth input from the browser UI and its DOM dependencies. Retain the existing backend depth capability/default for CLI/API callers; do not remove protocol functionality just to simplify the screen.
  - [x] 3.4 Keep title filtering, refresh, zoom, and reset easy to find. Move the technical focus field and inclusion toggles behind a compact optional filters disclosure if needed to unclutter the default toolbar. Preserve their behavior/defaults and use plain-language labels; do not build a new inspector.
  - [x] 3.5 Preserve existing graph layout and data semantics. Check empty/error messages, long labels, and narrow-screen control overflow; make only small readability fixes needed by the simplified layout.

- [x] 4.0 Fix zoom anchoring without changing working gestures.
  - [x] 4.1 Introduce a small shared zoom operation that adjusts both scale and pan so an anchor remains stationary. Convert pointer coordinates to the SVG's local viewport coordinates, accounting for its page offset.
  - [x] 4.2 Use the wheel event's pointer location as the anchor and the visible canvas center for +/− buttons. Preserve current zoom limits, use the actual clamped scale ratio, and ignore wheel events with no vertical zoom delta rather than accidentally zooming out.
  - [x] 4.3 Preserve background drag-to-pan, node activation, and reset behavior. Do not switch ordinary wheel scrolling to panning or add node dragging/pinch handling as part of this fix.
  - [x] 4.4 Verify zoom in/out after arbitrary panning and at scale limits; the intended point must remain stable instead of drifting toward the SVG origin.

- [x] 5.0 Keep one detail experience and remove genuinely unused code.
  - [x] 5.1 Retain the existing canonical-ID detail route for click/keyboard activation and browser Back/Forward for return. Verify camera/filter context is retained; fix only demonstrated restoration gaps using the existing controller. Restore focus to the originating node where practical.
  - [x] 5.2 Preserve serialized autosave, failed drafts, auth recovery, and guarded history replay. Direct note loads must still work without fetching the graph.
  - [x] 5.3 Confirm and remove unused legacy preview renderer/helpers, obsolete styles, and tests that only exercise dead UI. Keep live transport, Markdown codec, shared save controller, and Lexical behavior. No broad module rewrite or new history persistence layer.

- [x] 6.0 Verify the light-touch changes.
  - [x] 6.1 Add deterministic zoom tests for pointer/center anchors, nonzero pan, canvas offset, min/max scale, and zero vertical delta.
  - [x] 6.2 Extend browser smoke coverage: wheel zoom → background drag → note detail → browser Back. Assert stable zoom anchoring, working pan, restored camera/filter context, and unchanged keyboard activation. Check +/− and reset too.
  - [x] 6.3 Update shell tests for the removed depth control and legacy renderer. Re-run save-failure/history/auth/deep-link regressions; preserve graph API depth tests.
  - [x] 6.4 Review before/after screenshots beside home/detail at desktop/narrow widths, including empty and denser maps. Check focus visibility, contrast, long titles, and control overflow.
  - [x] 6.5 Run `npm test` and `npm run smoke:graph-editor` with disposable fixtures. Manually check mouse/trackpad in Chrome and Safari where available; record unverified device/browser behavior rather than claiming synthetic events prove it.

- [x] 7.0 Update the owned contracts and record results.
  - [x] 7.1 Update `src/adapters/http-server/http-server.docs.md` for zoom anchoring, simplified controls, and removed legacy rendering. Update architecture docs only if ownership changes; glossary only if a genuinely reusable new term is introduced.
  - [x] 7.2 Record verification, screenshots, remaining limitations, and any adjusted assumptions here. Leave `tasks/CHANGELOG.md` untouched during planning; assess a concise user-facing highlight when the refresh is implemented and finalized.

## Results and verification

- Delivered quiet home-style map chrome, one heading, secondary Filters disclosure, no depth input, and plain-language counts/feedback. Inclusion defaults, backend depth, node placement, mouse dragging, and reset are unchanged. Missing-note placeholders no longer inflate the note count.
- Anchored wheel zoom under the pointer and +/− around the canvas center; tests cover canvas offsets, nonzero pan, reversibility, clamping, and horizontal-only input. Repeated baseline measurement shows less than 0.06 px drift at both widths (browser input rounding), versus 83.23/41.06 px before.
- Shared note detail/autosave remains the only detail path. Browser Back/Forward restores the camera and applied focus filter; originating-node focus is restored without scrolling the canvas. Removed the unused preview renderer and its renderer-only tests, not the shared editor/save machinery.
- Narrow-screen controls no longer require horizontal toolbar scrolling. Long labels are bounded with full SVG/accessibility titles retained; at most five labels are featured on narrow maps, twelve on desktop, with hover/focus revealing others. Dense graph overlap remains possible; layout/physics redesign was deliberately excluded.
- `npm test`: **404 passed**, final full run. `npm run smoke:graph-editor`: passed; reran its browser script after the final UI changes. Coverage includes desktop/narrow graph interactions, empty/filter-empty/single/dense/missing-note states, untrusted titles, filter stacking, shared editor saves, failed-save/history recovery, and home/direct-detail navigation. `git diff --check`: passed.
- Screenshots reviewed: `/tmp/jumpybrain-map-before/`, `/tmp/jumpybrain-map-after/` (home/map/detail at 1280×820 and 390×844), and `/tmp/jumpybrain-map-smoke/` (including empty/single/60-note maps and filters at 1280/390 widths). All fixtures were disposable; no live local/team memory or installed application was changed.
- Independent review found status feedback could cover the filter panel. Fixed panel stacking and added a browser hit-test assertion with visible missing-note feedback.
- Existing connection-state work was preserved. Its new wrong-key verification request exposed a stale mobile smoke expectation; updated that check to allow exactly one expected GET `/recent` 401, alongside the existing PUT 401, rather than suppressing errors generally.
- Owning adapter docs updated. No architecture/glossary change was needed. Added a concise changelog highlight for the delivered visual/zoom improvement.
- **Verification limits:** automated Chromium/installed Chrome mouse and wheel events plus viewport/mobile emulation were exercised. Physical mouse/trackpad, Safari/Firefox, and a full screen-reader audit were not available/tested. No new trackpad-pan/pinch model, camera persistence across reloads, or graph layout engine is claimed.

## Acceptance criteria

- Home, map, and detail read as one quiet, light application rather than separate products.
- A person can understand that dots are notes and lines are connections without knowing graph terminology; isolated notes remain valid work, not error states.
- Wheel zoom stays anchored under the pointer; button zoom stays anchored to the canvas center, including after panning. Existing mouse dragging and reset continue to work.
- The depth input and redundant visual chrome are gone; useful controls remain discoverable without changing backend graph capabilities.
- Opening a note uses the existing shared detail; browser Back restores where the person was exploring, with unsaved-change protection intact.
- There is less graph-specific presentation code, no duplicate detail experience, and no new canonical data or backend dependency.
