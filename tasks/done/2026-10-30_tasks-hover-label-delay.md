# Delayed hover explanations

Completed 2026-10-30: shared control explanations wait 350 ms on pointer hover, with immediate focus help and cancellation of pending labels.

## Goal

Keep the Mac interface calm while moving the pointer, with a short pause before explanatory control labels appear.

## Tasks

- [x] Inspect shared label behavior, prior hover work and owning docs; bounded local recall found no matches.
- [x] Add a 350 ms pointer delay, retaining immediate focus help and canceling stale/pending labels.
- [x] Verify timing, dismissal, dynamic controls and existing responsive label flows.
- [x] Record results/limits, update docs and pending release notes, archive and commit scoped changes.

## Scope

Shared control-label presenter used by Mac and hosted mode. Existing subtle hover colors, dedicated Feedback help and heading previews retain their own behavior. No installation or release.

## Verification and limits

- Tested baseline `5973dc1ea511629920f0a07ec0e1b8c72eefce2a` plus this task's changes.
- Production build passed; editor bundle is 189,455 bytes gzip with no new dependency.
- All 86 focused browser/theme tests passed.
- Feedback integration smoke passed: brief hover, delayed reveal, pending cancellation on leave/press/click/Escape/scroll/blur/resize/action change/removal, immediate focus, disabled controls, dynamic native update labels, unchanged polling and BFCache restoration.
- Note-find smoke passed at 1280/390/320 px in light/dark, including modal bounds, disabled hover and unchanged editing/find behavior. Initial 320 px runs exposed automation's post-pointer toolbar scroll canceling the dwell; event tracing confirmed the scroll. The harness now finishes its auto-scroll before moving back onto the disabled control.
- Logs: `/tmp/jumpybrain-hover-delay-{build,tests,integration,find}.log`. `git diff --check` passed.
- Full native app lifecycle, physical assistive technology and non-Chromium browsers were not exercised. Mac-injected update controls were checked in the real bundled browser presenter. No installation, personal-memory writes, push or release.
