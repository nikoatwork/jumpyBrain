# Checkbox completion delight

Completed visual exploration, 2026-10-29. Three subagents independently produced
the CSS variants. The user subsequently selected variant 3, Quiet sweep, for
production integration; see the [implementation task](../../tasks/done/2026-10-29_tasks-checkbox-quiet-sweep.md).
The results and limits below describe the original exploration snapshot.

| Variant | Completion moment | Persistent success |
| --- | --- | --- |
| Soft pop | 420 ms spring, tick draw, 560 ms halo | Filled tick with a quiet rim |
| Tiny spark | 260 ms tick draw, one 620 ms four-point glint | Crisp filled tick |
| Quiet sweep | 780 ms wash, 520 ms baseline reveal, 300 ms settle | Filled tick and fine baseline |

All keep the completed words fully readable instead of crossing out or fading
the writing. Success colors derive from each palette's semantic tokens; Mono
remains grayscale. Reduced Motion keeps the success state without animation.
Soft pop is the recommended starting point for a tactile completion feeling;
Tiny spark is more playful and Quiet sweep is more reserved.

## Reproduce

```sh
npm run build
npx --package=playwright node deep-dives/checkbox-delight/capture.mjs
npx --package=playwright node deep-dives/checkbox-delight/build-review.mjs
```

The default output is `/tmp/jumpybrain-checkbox-delight/` (override with
`JUMPYBRAIN_DELIGHT_OUTPUT`). `comparison.html` is an interactive review with
palette/scheme controls, replay and real editor screenshot views. Prototype CSS
is reused with only its root/editor selectors adapted to allow three demos on
one page. `comparison-{ember,ocean,mono}.png` are actual editor contact sheets.
The capture harness uses a disposable Markdown root, ordinary task buttons and
the existing editor input path. Its observer celebrates only completions armed
by a pointer/keyboard action, never initially loaded checks or theme changes.

## Verification

Tested parent `ec560fa` with prototype files and the existing unrelated working
tree changes; browser/editor production sources were unchanged by this task.

- Build passed.
- All 18 variant × palette × scheme combinations passed with zero page errors.
- 54 screenshots: representative animation moment, settled state and 390 px
  layout per combination. All three six-theme contact sheets visually inspected.
- Pointer, Space and Enter completion preserve actual Markdown checked state;
  keyboard focus remains visible. The completion does not change row geometry.
- All six themes retain Reduced Motion behavior. Two prototype selector
  specificity issues were found and corrected before the passing rerun.
- Minimum measured tick/fill contrast: 4.37:1; label/surface: 11.20:1.
- Interactive review checked for pointer/Space, replay, all six theme switches,
  loaded screenshot images and 390 px overflow in both review modes.
- Inline HTML preview: 728 px, 615 px content height, no console messages.

## Limits

These are presentation prototypes, not integrated production lifecycle code.
The standalone review reproduces task DOM/CSS and uses simple demo toggles;
the screenshots and capture checks exercise the actual Lexical editor. Observer
disposal, document switching, undo/save concurrency and read-only integration
would need production verification after a variant is selected. No personal
memory, installed app, release, remote server or product preference was changed.
Checks use Chromium, not physical macOS/Safari/Firefox. The full unit suite was
not repeated for this exploration-only change.
