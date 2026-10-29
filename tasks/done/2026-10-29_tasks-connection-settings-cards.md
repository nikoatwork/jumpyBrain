# Mac connection settings cards

- [x] Replace separator rows with individual cards, type/active badges, and a compact + disclosure.
- [x] Present add/edit fields in a separate card and preserve connection safeguards.
- [x] Verify build, companion tests, responsive smoke and rendered layout; archive and commit scoped changes.

Scope: Mac companion settings only. Preserve concurrent note-board work.

Verification: build and 20 companion unit tests passed; production-shell companion smoke passed after final layout changes at 1280/390/320px in light/dark. Inspected desktop light and narrow dark captures in `/tmp/jumpybrain-connection-cards`. Tested working tree included concurrent board edits, excluded from this commit. The fixture shows an unrelated board-load notice. Native installed-app and assistive-technology checks were not run; no installation or release performed.
