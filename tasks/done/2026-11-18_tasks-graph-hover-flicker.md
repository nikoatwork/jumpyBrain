# Remove graph flicker on hover in large graphs

Priority: P2. Implemented against `950fd6a` and integrated on 2026-11-18. Pending release.

## Goal

Moving the pointer across a large graph in the Mac app is steady: no flashing labels, halos or layout jumps. Hover, focus and selection still highlight the node.

## Evidence

- [Nov 17 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=48819ee7-2e46-4c70-aa72-2a0ca853fabd) (Mac app, diagnostics attached): "a lot of flicker" when hovering over a big graph. The diagnostic attachment reports macOS v0.3.25 build 756ca2369761cc07, Graph view, four successful graph operations; no node/edge or brain-size counts present.
- The `.node:hover text` styles in `graph-page.ts` were dead code — a node group only ever contains `<title>` and `<circle>`; labels live in the separate `.graph-labels` layer. The real cause was in `map-controller.ts`:
  - `paint()` gave the pointer-hovered node priority -100 in `placeGraphLabels`, so every hover flip re-ran label placement for the whole visible candidate set, reshuffling which labels were visible and churning the dense-mode SVG node overlays.
  - `pointermove` hover used `closest("[data-node-id]")`, and `.graph-title` labels carry `data-node-id` with `pointer-events: auto`, so a label laid across neighbouring nodes stole hover from the node beneath the pointer.

## Reproduction (2026-11-17, disposable Chromium fixture)

- Fixture: disposable QMD root with 420 linked notes (886 connections; above the 250-node dense SVG limit), lexical index only, hosted server on an ephemeral port, Chromium via Playwright at 1280x820. Script and recording under `/tmp/jumpybrain-flicker/` (ephemeral): `repro.mjs`, sweep video in `videos/`, `baseline.png`/`fixed.png`.
- Protocol: mouse sweeps — a horizontal band, a zigzag through label-dense regions, a ±12px jiggle on a label, then a stationary hold — with a MutationObserver plus rAF sampling of the visible label set and overlay node churn.
- Baseline (before fix): zigzag sweep changed the visible label set 48 times per 170 frames with 42 node-overlay `<g>` elements added and 41 removed; the ±12px jiggle alone produced 18 label flashes over 95 frames; a stationary hold was stable (0). This matches the reported flashing labels and layout jumps; a short recording is captured in `videos/`.
- After fix: band, zigzag and jiggle all 0 label flashes and 0 overlay churn; hold 0.

## Tasks

- [x] 1.0 Reproduce
  - [x] 1.1 Read the attached diagnostics for brain size and app version. (Sanitized by parent: macOS v0.3.25 build 756ca2369761cc07, Graph view, four successful graph operations, no size counts. Private attachment accessed only by the parent.)
  - [x] 1.2 Build a disposable brain with a few hundred linked notes. In Chromium, move the pointer across dense areas and record whether labels, halos or layout flicker. Capture a short recording or performance trace. (420 notes, sweeps, metrics above; recording in `/tmp/jumpybrain-flicker/videos/`.)
- [x] 2.0 Fix
  - [x] 2.1 Fix the cause found, for example by keeping hover labels out of hit-testing so they cannot steal the pointer, and avoiding layout-affecting hover styles. (`map-controller.ts`: pointer hover resolves through a node-only identity (`.node[data-node-id]`) plus the geometric hit grid, so labels never capture hover; `paint()` no longer lets hover influence label priority, so placements stay steady while the pointer moves. The dead `.node text` label rules named by the hypothesis were removed from `graph-page.ts`; the real label layer keeps its click handling.)
  - [x] 2.2 Keep keyboard focus, selection and label click behavior working. (Focus still gets priority -100 and selection -90 in label placement; click/pointerup keep the full `[data-node-id]` identity, so clicking a label opens its note.)
- [x] 3.0 Verify and finalize
  - [x] 3.1 Re-run the large-graph check in Chromium (both themes, 1280px and narrow), and in the packaged Mac app if Chromium did not reproduce it. Run the existing graph tests and smoke. (Chromium reproduced it, so the Mac app is not required by this item; a native Mac run remains open QA anyway. Combinations verified at light/dark × 1280/390px: 0 label flashes, 0 overlay churn, hover ring reaches 4px stroke, label click opens the note, Back preserves selection, arrow keys move focus with the 4px focus ring and keep the focused node's label visible, no page errors. `node --test` on the graph test files: 80 passing (graph-presentation, graph, graph-search, graph-topic, graph-topic-preview, source-graph-contracts, semantic-graph, graph-exploration-report). `npm run smoke:graph-editor`: PASS (includes the graph UI smoke at 1280px and 390px). `scripts/graph-topic-smoke.mjs`: PASS at 1280/390/320px on a 1650-note lexical fixture, including label clicks.)
  - [x] 3.2 Updated the [email index](../feedback.md), pending release notes and changelog. Archived under the [task workflow](../../docs/task-workflow.md).

The integration build and all 80 focused graph tests passed. An independent rerun of the 420-note fixture at 390px in dark mode showed zero label changes during both sweeps and confirmed hover, label clicks, Back selection and arrow-key focus.

## Limits

- The packaged Mac app could not be run (no Mac on this Linux host); Chromium reproduced and verified the visible symptom in the shared renderer. Native Mac verification remains outstanding.
- The fixture used a lexical index only (no semantic model provisioned in this environment), which does not affect hover behavior.
- Recordings and the reproduction scripts live under `/tmp/jumpybrain-flicker/` and are ephemeral; the durable evidence is the metric table above and the repository tests/smokes.
- Hover in a non-dense map still dims the edges of unrelated nodes (existing design for the hover emphasis); this was not part of the reported flicker and is unchanged.
