# Remove graph flicker on hover in large graphs

Priority: proposed P2, to confirm. Status: planned 2026-11-17 from feedback; not reproduced yet.

## Goal

Moving the pointer across a large graph in the Mac app is steady: no flashing labels, halos or layout jumps. Hover, focus and selection still highlight the node.

## Evidence

- [Nov 17 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=48819ee7-2e46-4c70-aa72-2a0ca853fabd) (Mac app, diagnostics attached): "a lot of flicker" when hovering over a big graph.
- Unproven hypothesis: in `graph-page.ts`, `.node:hover text` switches a hidden label to visible with `pointer-events: auto`. In a dense graph the newly shown label can cover neighbouring nodes and steal the hover, which hides it again, so it toggles rapidly. The hover stroke width change and halo may add repaint cost.

## Relevant files

- `src/adapters/http-server/graph-page.ts` - graph styles (around lines 100–105) and interaction
- `src/adapters/http-server/graph-labels.ts`, `graph-layout.ts` - label visibility and layout
- `src/adapters/http-server/browser.docs.md` - graph contracts

## Tasks

- [ ] 1.0 Reproduce
  - [ ] 1.1 Read the attached diagnostics for brain size and app version.
  - [ ] 1.2 Build a disposable brain with a few hundred linked notes. In Chromium, move the pointer across dense areas and record whether labels, halos or layout flicker. Capture a short recording or performance trace.
- [ ] 2.0 Fix
  - [ ] 2.1 Fix the cause found, for example by keeping hover labels out of hit-testing so they cannot steal the pointer, and avoiding layout-affecting hover styles.
  - [ ] 2.2 Keep keyboard focus, selection and label click behavior working.
- [ ] 3.0 Verify and finalize
  - [ ] 3.1 Re-run the large-graph check in Chromium (both themes, 1280px and narrow), and in the packaged Mac app if Chromium did not reproduce it. Run the existing graph tests and smoke.
  - [ ] 3.2 Update the [email index](../feedback.md) row, add a pending release note, and finalize under [task workflow](../../docs/task-workflow.md).
