# Beta feedback

## Goal

Add shared browser/Electron feedback addressed to `jumpybrain@agentmail.to`, with inspectable diagnostic logs included by default. No mail credentials or automatic sending.

## Tasks

- [x] Add an accessible shared feedback dialog, bounded session diagnostics, attached email draft, and email-app fallback.
- [x] Permit only feedback email links and feedback downloads through the isolated Electron host.
- [x] Verify privacy, attachment encoding, dialog/draft behavior, and browser/Electron integration; document delivery limits.

## Decisions

- Email drafts remain user-sent. Standard mailto cannot attach files; an `.eml` export carries the diagnostic attachment, with a mailto fallback containing diagnostics inline.
- Diagnostics capture allowlisted browser request outcomes and environment/version details, never raw exceptions, note content, searches, credentials, paths, or backend log files.

## Verification

- Build and 99 focused browser/companion/Electron/bundle tests passed.
- Production Chromium smoke passed at desktop/narrow sizes in light/dark mode: Unicode feedback, safe diagnostic preview, real attachment export, opt-out, shortcut isolation, focus restoration, retained message.
- Production Electron + companion gateway smoke passed: attachment saved to a disposable fixture, fixed-recipient email handoff intercepted without opening/sending real email, other downloads denied, existing navigation/edit/save/close guards and tab cleanup intact.
- Python's independent standard-library MIME parser confirmed the UTF-8 body and named diagnostic attachment without parser defects.
- Final full suite: **1,016 passed, 0 failed, 1 skipped** (1,017 total; existing opt-in provisioned-QMD skip). Updated old test fixtures for the new feedback dependency and modal list. Build and `git diff --check` passed.

## Delivery limits

- `.eml` compose/edit support and long `mailto:` bodies vary by mail client. The UI explains both paths and the visible address supports manual email if no client is configured. Actual email-client composition/delivery is not claimed by the smoke tests.
- Diagnostics are tab-local, not backend/OS log collection. No personal memory, installed runtime/app, mail account, or credentials were changed. The installed runtime and Electron wrapper need an update to expose the feature there.
