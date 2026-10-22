# Graph topic exploration

Status: proposed, 2026-10-22. Analysis and implementation suggestions only; no graph behavior changed by this task list.

## Goal

Make the graph a quiet way to recognize and open knowledge about a topic. Typing `health` should progressively reveal relevant notes and their actual connections; as the view narrows or the user zooms in, readable titles should make choosing a note easy. The full-brain view should include all notes within measured resource limits.

## User direction and proposed experience

- Keep one search field, the existing secondary filters, and zoom/reset. Preserve the removal of count summaries, limit banners, and filter hints in `640ae50`.
- Empty search: show the whole knowledge landscape when it fits the measured budget. Include journal/session notes and disconnected notes in the configured memory scope; do not privilege only highly linked pages.
- While typing: respond to each committed edit, including one/two-character terms and deletion. Give immediate lightweight title feedback where available, then refine with the shared body/semantic search after a short idle delay. This does not require an expensive semantic request for every keypress.
- Topic view: emphasize direct search matches and retain a bounded set of their immediate linked neighbors in a quieter style. Edges always mean actual Markdown links. Semantic search can discover notes without implying that they link to each other.
- Recognition: expose more titles when projected screen space allows; prioritize direct matches and the hovered/focused note. At a small enough result set, aim to make every visible note identifiable without hovering.
- Movement: retain positions for surviving notes and avoid resetting the camera on each letter. Use restrained, brief transitions, respect reduced motion, and stop work when the scene settles or leaves the screen.
- Opening: keep click/tap and keyboard activation into the existing full-page editor, with guarded saves and Back restoring search/camera context. Do not insert a mandatory preview step.

These are recommendations to validate, not settled implementation contracts. No persistent graph database, automatic synthesis, new embedding model, always-running simulation, or host migration is proposed.

## Findings from the current implementation

1. **The search view is much smaller than the graph cap.** `browser-transport.ts` requests 24 normal-depth hits; `recent-write-search.ts` also bounds its merged results to 24; `normalizeNoteResults` reduces these to 12. The graph receives those files and discards edges to other notes. This can hide useful connected context even when the graph could render more.
2. **One/two-character typing does not refresh automatically.** `map-controller.ts` waits for three characters and 250 ms of idle input; Enter/blur can still submit shorter terms. Requests already have cancellation and late-response fencing worth preserving.
3. **The layout does not express relationships.** Nodes are degree/title sorted and placed on a golden-angle spiral, with one central node. Links are drawn afterward. Proximity therefore does not currently indicate connected groups.
4. **Labels do not adapt to zoom.** Only the first 5 mobile/12 desktop nodes are label candidates. Collision checks run at layout time, and zoom only transforms the SVG group. Zooming into free space does not reveal more labels; existing titles grow with the scene.
5. **Search rebuilds the scene and resets the camera.** Ordinary successful query loads replace the SVG tree and reset pan/scale. Small changes can move surviving notes and make a known target harder to track.
6. **The 500-node limit is not a measured browser capacity.** App assembly sorts document nodes by path before truncation. The renderer then creates roughly six SVG elements and three listeners per node, and three lines per edge. Dense edge sets, labels, effects, packet size, and repeated rebuilds matter alongside node count.
7. **Rendering is not the only cost.** Each graph assembly scans canonical metadata and reads note contents for link extraction, then reads returned notes for snippets. Recent 10,000-note backend diagnostics reported about 1.25 seconds per graph operation after optimization, under their particular test conditions. Whole-desktop savings and numeric RAM budgets remain unverified. Repeating that scan after every letter is a separate bottleneck from drawing nodes.
8. **Freshness and transport constrain larger views.** Markdown stays canonical; cached graph data must account for external writers and brain/credential changes. The companion currently caps decoded responses at 16 MiB. Raising the node limit alone can run into payload and resource limits.

Evidence: [map controller](../../src/adapters/http-server/map-controller.ts), [browser composition](../../src/adapters/http-server/graph-page.ts), [search normalization](../../src/adapters/http-server/notes-browser.ts), [search request](../../src/adapters/http-server/browser-transport.ts), [recent-save projection](../../src/adapters/http-server/recent-write-search.ts), [graph assembly](../../src/app/local-memory/graph.ts), [connection extraction](../../src/app/local-memory/connections.ts), [RAM findings and limits](../../deep-dives/desktop-ram/first-iteration.md).

## Recommended scope and acceptance

Start with topic selection, readable labels, stable transitions, and a measured full-brain path. Treat Canvas, workers, persistent caching, and more elaborate layouts as conditional follow-ups, chosen only when profiles identify a problem.

Use disposable fixtures at 100, 500, approximately 1,650, and 10,000 notes. Include sparse/disconnected graphs, dense hubs, long/duplicate titles, journal notes, missing targets, and body-only/semantic matches. Approximately 1,650 reflects the reported brain size, not a benchmark of the user's private notes.

Initial performance goals to validate on a recorded reference machine: local typing feedback within 100 ms; no single browser interaction task over 50 ms; ordinary pan/zoom frames within 33 ms. Measure settled authoritative search separately from immediate local feedback, including hosted latency and model-cold/model-warm behavior. These are proposed targets, not existing guarantees. Adopt a measured incremental renderer/whole-app RAM budget in task 1 rather than inventing a total-memory promise.

## Tasks

- [ ] 1.0 Establish focused graph baselines and resource budgets.
  - [ ] 1.1 Extend existing disposable graph/RAM fixtures with the corpus sizes and link densities above; record source snapshot, browser/Electron, machine, viewport, theme, and index/model readiness.
  - [ ] 1.2 Measure graph scan/link assembly, shared search, response bytes/parse, layout, DOM construction, label work, pan/zoom, and graph exit separately. Compare 500 versus all approximately 1,650 nodes; use 10,000 as the scaling case.
  - [ ] 1.3 Record renderer heap/DOM/listeners, server memory, attributed whole-app footprint, CPU, long tasks and interaction latency. Compare matched runs and recovery after leaving/reopening; do not use forced production GC or equate JS heap with total RAM.
  - [ ] 1.4 Set measured node/edge/byte/work ceilings and a scoped RAM regression allowance. Decide whether existing SVG meets the first release's needs before authorizing a renderer rewrite. Coordinate with the [RAM follow-up](tasks-desktop-ram-follow-up.md); do not duplicate its entire desktop/model acceptance program.
- [ ] 2.0 Define the topic-view contract and component seams.
  - [ ] 2.1 Specify direct-match versus linked-context presentation, rank retention, stable identity, short-query behavior, no-hit/error states, query clearing, and when automatic fitting yields to manual pan/zoom.
  - [ ] 2.2 Start with one-hop neighbors of direct matches, in either link direction. Bound neighbors/edges and prioritize direct matches before context; do not let a hub consume the entire view. Decide the actual budgets from task 1.
  - [ ] 2.3 Separate reusable result normalization/deduplication from the global search modal's 12-row presentation limit. Keep the same shared retrieval/ranking and recent-write/tombstone rules; make the graph candidate budget explicit at every capped layer.
  - [ ] 2.4 Define a transient view model carrying matched/context roles, rank, graph identity/revision and positions. Preserve API/CLI compatibility; choose an opt-in graph protocol extension if needed. Keep pure layout/label policy separate from request orchestration and DOM rendering so frontend tasks can run independently.
- [ ] 3.0 Supply topic matches with their real neighborhood.
  - [ ] 3.1 Reuse shared authenticated search, with explicit graph-sized candidate limits and preserved ordering. Do not claim all relevant notes are present just because all graph nodes were loaded.
  - [ ] 3.2 Add seed-plus-neighborhood selection in app graph assembly. Expand against the original eligible link graph before reducing to the selected view; applying today's exact `files` filter first removes the neighbors this feature needs. Keep existing exact-file behavior for callers that request it.
  - [ ] 3.3 Preserve missing-target, duplicate-title/ID, exclusion, orphan and permission semantics. Missing targets never masquerade as saved notes or become editable; disconnected matches remain usable.
  - [ ] 3.4 Choose the cheapest fresh graph delivery supported by measurements: reuse one tab-scoped topology for query projection, or add a bounded server-side derived snapshot if scans dominate. Specify write/delete/rename/external-edit invalidation, refresh/revalidation, brain generation and credential fencing, and release/eviction. A cache remains rebuildable; stale links must not look authoritative.
  - [ ] 3.5 Support complete overview data within task 1's budgets. Avoid fetching snippets/body text for every overview node when the view only needs identities/titles/links. Evaluate a lean opt-in packet and bounded delivery before simply increasing `limit`; preserve the companion response cap and disclose any incomplete view compactly on demand.
- [ ] 4.0 Make typing feel continuous without multiplying expensive work.
  - [ ] 4.1 Update immediate title-prefix feedback from the already-loaded scoped graph on each committed edit, including short terms, backspace and clear. Treat it as provisional title feedback, never a substitute for shared body/semantic search or a newly persisted search index.
  - [ ] 4.2 Debounce authoritative shared search; retain composition handling, one latest intent, cancellation and generation fencing. Verify actual backend work is bounded when aborted browser requests have already started server work.
  - [ ] 4.3 Preserve the last useful scene while a newer query resolves, with a small pending indication only when needed. Old nodes must not appear to be confirmed matches for the new query; errors/no hits must not silently restore the whole brain.
  - [ ] 4.4 Reconcile nodes/edges by stable identity rather than replacing the entire tree. Keep surviving positions, selection and focus; define camera fitting for entering a topic/clearing search separately from manual camera movement and history restoration.
- [ ] 5.0 Make titles readable at the point of recognition.
  - [ ] 5.1 Replace the fixed 5/12 label candidate rule with projected screen-space density and collision checks. Prioritize hovered/focused/selected nodes, direct matches by relevance, then useful context. Recompute on zoom/pan/resize/query changes without graph refetches.
  - [ ] 5.2 Keep label text at a comfortable screen size as the camera zooms. Try alternate anchors and bounded wrapping before truncating; preserve the full accessible title. Account for viewport edges and node hit targets as well as label-label overlap.
  - [ ] 5.3 Validate a sparse-view goal of all visible titles readable for up to about 12 desktop/6 narrow-screen notes; adjust from actual geometry rather than forcing overlapping text. Dense overview stays quiet; zooming into an area reveals more of its titles.
  - [ ] 5.4 Cache text measurements with bounded lifetime, batch reads/writes, and run collision work only for visible candidates. Coalesce interaction updates into one frame and avoid a perpetual loop. Preserve accessible focus and touch access without requiring hover.
- [ ] 6.0 Give the graph a coherent, restrained visual structure.
  - [ ] 6.1 Compare the current spiral with a deterministic connection-aware layout on identical fixtures. Start with connected components and bounded local refinement; define placement for isolated notes and multiple disconnected topic matches. Proximity is a visual aid, not proof of semantic agreement.
  - [ ] 6.2 Keep component and surviving-node positions stable across adjacent queries. Run any relaxation for a bounded duration/work budget and freeze; avoid naive all-pairs work and continuous force animation. Consider a worker only if profiles show main-thread layout work warrants its lifecycle cost.
  - [ ] 6.3 Emphasize matches with the existing theme palette and soften context/irrelevant links. On hover/focus, reveal the local connections/title while quieting competing edges. Avoid new legends/panels or category colors that require explanation.
  - [ ] 6.4 Reduce decorative SVG copies/effects where measured cost exceeds their visual value. If SVG still misses task 1's budgets, prototype Canvas for bulk nodes/edges with a small accessible label/focus overlay; compare interaction, hit testing, accessibility, memory and redraw cost before adopting it.
- [ ] 7.0 Integrate and verify the end-to-end exploration flow.
  - [ ] 7.1 Walk through `h → he → health → health sleep → backspace → clear`, slow responses and composition. Confirm body-only matches, semantic availability, linked neighbors and unlinked matches remain distinguishable and searchable.
  - [ ] 7.2 Verify label visibility at several zoom levels, long/duplicate titles, crowded hubs, light/dark themes and 1280/390/320 px layouts. Confirm labels remain clickable, touch gestures do not open accidentally, keyboard activation works, and reduced motion removes transitions.
  - [ ] 7.3 Exercise note opening, saves, Back, rename/delete, external edits, stale/missing index, read-only access, credential changes and companion brain switching. Check that no previous brain's graph/cached query can reappear.
  - [ ] 7.4 Repeat task 1's measurements on the agreed snapshot, including settled idle, repeated search/zoom and graph exit/reopen. Require bounded retained packets/caches, no hidden scene/listener/timer accumulation, and no continuously active layout work. Record tested and untested limits here.
  - [ ] 7.5 Update owning browser/local-memory/protocol docs and glossary for changed semantics; add release notes only for delivered behavior. Reassess a changelog highlight for the implemented result. Archive this list when complete.

## Parallel execution and ownership

Proposed work allocation for implementing this list:

- **Preparation:** task 1's measurement work and task 2's interaction/contract design can start in parallel. Final budgets and contract decisions must meet before changes to candidate limits, packet scope or renderer choice.
- **Data lane:** task 3 owns `src/app/local-memory/{graph,connections}.ts`, server-memory graph composition, graph option/result types, route/protocol changes and backend tests. Task 3.5 follows task 1; it can run alongside frontend policy work after task 2's contract is stable.
- **Interaction lane:** task 4 owns `map-controller.ts`, shared search transport/projection changes and request/history integration tests. One integrator owns shared edits to `graph-page.ts`, `notes-browser.ts`, `browser-transport.ts` and `recent-write-search.ts`; do not assign independent edits to those same seams.
- **Label lane:** task 5 can proceed in parallel with tasks 3/4 using fixtures and a separate pure label-policy module established in task 2. It owns label measurement/collision policy and focused tests. The interaction owner wires it into `map-controller.ts`.
- **Layout/style lane:** task 6 can proceed in parallel with data and label work using a separate pure layout module and fixed view-model fixtures. It owns position policy and visual styling; integration into shared controller/shell stays with the integrator. Renderer replacement remains conditional and waits for task 1.
- **Final sequence:** merge the data contract, interaction wiring, labels and layout through the integrator, then execute task 7. Share the disposable fixture builder rather than creating competing benchmark or browser-smoke frameworks. Each lane preserves unrelated concurrent edits.

## External implementation references

These support implementation options, not jumpyBrain performance claims. [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) describes frame-aligned callbacks and background pausing; scene exit still needs explicit cleanup. [MDN Canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) describes redraw/caching tradeoffs if profiling justifies the conditional renderer experiment. Neither establishes a safe node count or that Canvas will use less RAM here.
