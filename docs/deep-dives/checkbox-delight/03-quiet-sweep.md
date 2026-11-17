# Quiet sweep

A small wash travels beneath the completed line, then dissolves. A fine success-colored baseline remains, together with a filled checkbox and a crisp hand-drawn tick. The writing stays at full reading contrast and is never crossed out.

- Wash: 780 ms; underline reveal: 520 ms; checkbox settle: 300 ms (1 px movement).
- Theme-derived success blends `--status-connected` with `--ink`; the tick uses `--surface`. Mono therefore stays monochrome.
- The wash and baseline are bounded to the label's width and at most 18 em. They do not alter the document or its layout.
- Reduced Motion removes the wash and movement, retaining the filled check and static baseline. Focus remains a separate theme-colored ring.
- Intended screenshot moment: approximately 300 ms after completion; also capture the resting state after 850 ms.

This is an exploration CSS overlay. The parent harness owns user-triggered celebration, screenshots and browser verification; no production editor behavior is changed.
