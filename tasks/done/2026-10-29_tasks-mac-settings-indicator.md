# Mac Settings indicator

- [x] Remove the Settings connection badge in the Mac companion sidebar; retain active-connection health above it and the standalone browser control.
- [x] Verify and finalize the scoped change.

Verification: `npm run build` and `node --test test/companion-browser.test.js` passed (20 tests) against the implementation committed with this record. No native visual smoke was run; the installed app was not updated.
