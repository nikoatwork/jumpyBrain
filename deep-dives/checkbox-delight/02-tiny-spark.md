# Tiny spark

A crisp drawn tick gets one tiny four-point glint at the checkbox's upper right. The glint rises just five pixels and disappears, leaving a confident, filled check without crossing out the accomplishment.

- Tick reveal: 260 ms. Glint: 620 ms. Color transition: 160 ms.
- Lasting state: filled checkbox, strong tick, fully readable label. No row movement or text changes.
- Success ink derives from `--status-connected` and `--ink`, retaining each palette's character and Mono's grayscale. Check ink uses `--surface`.
- Reduced Motion: immediate checked state; no glint, reveal or color transition.
- Replay: the parent harness applies `delight-celebrate` only on a new user completion. Initial loaded checked rows stay quiet.
- This is an exploration stylesheet for the real editor DOM; the app is unchanged until an option is selected.
