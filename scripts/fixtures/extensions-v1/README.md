# Frozen API v1 consumer

Captured from API v1 at repository baseline `9bf6c59736f1ad6ee516e12e976a365dee6bee56` (2026-10-24), with a representative external package added for this review. `sdk.d.ts` is that public contract; `cache/*.txt` contain its prepared Node/browser assets, captured once through `installExtension()` / `prepareExtension()` in an isolated `git archive` of that baseline, including the production `createRequire` banner. The text suffix prevents Node's test discovery from executing assets as tests.

Keep this baseline unchanged when modifying the host or compiler. Add another versioned baseline when introducing a new API. A candidate must accept these old author types, activate these already-installed assets, and recompile these sources. `compatibility.ts` is the bridge to the candidate SDK, not a replacement for the frozen definitions.

`test/extensions-compatibility.test.js` checks the public SDK, registry/cache/state, UI registration/cleanup, writes and enablement. `scripts/desktop-update-smoke.mjs` seeds the same external installation and checks it after the real installed updater transaction. These are bounded representative contracts; they do not prove every third-party extension, operating-system API, app-profile preference or dependency works after every upgrade.
