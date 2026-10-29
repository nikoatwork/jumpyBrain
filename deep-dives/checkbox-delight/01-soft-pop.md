# Soft pop

A tactile, local completion: the checkbox compresses, springs just past its resting size, and settles while a short halo releases around it. A crisp tick draws in. The filled success-colored box and its quiet surrounding tint remain, with full-contrast text so the completed item feels accomplished and still readable.

- Spring: 420 ms, peak scale 1.12.
- Tick reveal: 220 ms after a 60 ms delay.
- Halo: 560 ms, entirely gone at rest.
- No particles, row sweep, strike-through, layout movement, or new content.
- Success fill mixes the palette's connected/status color with its ink; Mono stays grayscale. Reduced Motion removes all animations and transitions while retaining the final filled check.

This CSS is a review prototype, scoped to `html[data-delight="soft-pop"]`. The screenshot harness adds `delight-celebrate` only on a new unchecked-to-checked transition; existing checked notes do not animate on load.
