# Pastel Pride sidebar

- [x] Apply selected concept A: continuous pastel rainbow sidebar, neutral text, clean lavender-tinted editor.
- [x] Remove the top stripe; provide a muted dark-mode counterpart and matching Appearance swatches.
- [x] Verify readability across gradient stops and theme switching; update docs and pending release note.

Verified completed working tree: build passed; 30 theme/companion tests passed, then 11 theme tests passed including the new sidebar contrast regression. All-theme browser smoke passed across four palettes, two schemes and 1280/390/320px, including draft/caret preservation. Inspected actual light/dark desktop note captures in `/tmp/jumpybrain-pride-pastel-qa`. `git diff --check` passed.

Limits: no installed Mac app or physical assistive-technology check; no installation, push or release.
