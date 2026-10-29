# Subtle search focus

- [x] Replace the search input's bright 2px ring with a thin, muted palette-derived ring, flush with the input.
- [x] Run the build and existing browser tests; record limits and finalize.

Scope: only the global search input focus style in `src/adapters/http-server/notes-browser.ts`. Preserve visible keyboard focus and unrelated in-progress page-action changes.

## Outcome and verification

Replaced the 2px accent outline and inherited 3px offset with a 1px outline blending 45% focus color with the theme’s strong separator color, at zero offset. Keyboard focus remains indicated; other controls keep their existing treatment.

Verified the working-tree snapshot on 2026-10-29 with `npm run build` and `node --test test/notes-browser.test.js`: build passed, all 75 tests passed. No running-app visual or assistive-technology check was performed. Unrelated in-progress page-action edits were present during validation and are excluded from this commit.
