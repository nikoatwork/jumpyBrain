# Let web viewers stay signed in to a shared brain

Priority: owner-confirmed 2026-11-25. Status: done 2026-11-25 on branch `t3/viewer-access-sessions` (unattended). Sibling list: [install profiles](2026-11-25_tasks-install-profiles.md).

## Completion summary (2026-11-25)

People who read a shared brain in the browser now click a one-click invite link once and stay signed in for as long as browsers allow. The cookie holds an opaque session ID instead of the access key; the server stores only its hash in `.jumpybrain/sessions.json`, re-reads the key on every request and live-socket check, and renews the 400-day cookie at most once a day on use. Admins copy **Invite link** per key (single use, 7 days, tied to that key), see each key's signed-in browsers, and sign one or all of them out; revoking a key still ends everything at once. Readers see who they are signed in as, **Sign out**, and **View only** on notes. Existing 24-hour `v2` cookies are exchanged once on the next visit.

Tested snapshot: working tree on `t3/viewer-access-sessions` at base `7c8b8c66` plus this change (the committed content), built with `npm run build`. Review: `jumpy-loop`, approved after 5 rounds (see Verification).

## Goal

Many people only read a shared brain in the browser. They should get there with one click from an invite, stay signed in on their own device indefinitely while they keep using it, and move around notes without dealing with keys, installs or the Mac app. Revocation, read-only roles and write protection must keep working as they do now.

## Today (investigated 2026-11-25)

- Browser sign-in: the person pastes an access key into **Connect**. `GET /session` then sets `jumpybrain_session_v2_<hash>`, a cookie that **contains the raw access key**. It is HttpOnly, SameSite=Strict, Secure behind HTTPS and fixed at `Max-Age=86400`. Nothing renews it and there is no "stay signed in". [index.ts:78-144](../../src/adapters/http-server/index.ts#L78-L144), [cloud-shared-memory.md:89](../../docs/cloud-shared-memory.md#L89).
- Every request re-checks the key, so revoking a key takes effect immediately. Cookie-based writes require a matching Origin. [index.ts:118](../../src/adapters/http-server/index.ts#L118).
- Roles are reader, writer and admin. A reader is already view-only (403 `read_only` on writes). Keys never expire. [access-keys.ts:5-28](../../src/adapters/http-server/access-keys.ts#L5-L28), [access-control.docs.md](../../src/adapters/access-control/access-control.docs.md).
- **Copy invite** produces plain text: the address plus the key. There is no invite link. [access-keys.ts:38-44](../../src/adapters/http-server/access-keys.ts#L38-L44).
- Shared note links open **Connect**, then the original note. [browser.docs.md:51](../../src/adapters/http-server/browser.docs.md).
- Earlier work deferred this: "Longer login retention needs a separate design" ([Nov feedback fixes](../done/2026-11-25_tasks-november-feedback-fixes.md), [feedback.md:18](../feedback.md), [release-next.md:4](../todo/release-next.md)).
- Sign-in and permissions are **heavy** under the skill's effort rules. Plan a `jumpy-loop` review before finalizing.

## Tasks

- [x] 0.0 Quick win: stay signed in for as long as browsers allow
  - Proof: `test/browser-session.test.js` asserts `Max-Age=34560000` and a re-issue after 25 h but not after 12 h; `scripts/viewer-access-smoke.mjs` sees a Chromium cookie expiring in 399–400 days and the re-issued cookie after the server clock moves 25 h; the VPS check saw `Secure`, 400.0 days.
  - [x] 0.1 Raise the session cookie from `Max-Age=86400` to the browser maximum: 400 days, the limit Chrome enforces and RFC 6265bis recommends. Longer values are silently cut to 400 days, so a cookie that never expires is not possible.
  - [x] 0.2 Re-issue the cookie on use (at most once a day) so the 400 days restart. Someone who opens the brain at least once a year never sees Connect again.
  - [~] 0.3 Check Safari: a first-party, server-set HttpOnly cookie should keep the full lifetime. ITP's 7-day cap applies to cookies set by script or through third-party/CNAME-cloaked setups. Confirm on the shared VPS playground and record the result.
    - Skipped: no Safari or Playwright WebKit available here (only Chromium is provisioned; installing WebKit was out of scope). The VPS serves the cookie first-party from `Set-Cookie` with `Secure; HttpOnly; SameSite=Strict; Max-Age=34560000`, which is the case ITP leaves alone, but this is unconfirmed on a real Safari. Follow-up below.
  - [x] 0.4 Revocation stays immediate because every request re-checks the key. Note the trade-off: until 2.0 lands, a copied cookie is a copied key for up to 400 days.
    - 2.0 landed in the same change, so no build ever shipped a 400-day key cookie.
- [x] 1.0 Decide the session model
  - Proof: owner decisions recorded below and in `access-control.docs.md` (threat notes).
  - [x] 1.1 Decided 2026-11-25 by the owner: sessions last as long as possible ("like cookie doesn't expire"). No hard cap. A session ends only on sign-out, key revocation, or a year of inactivity.
  - [x] 1.2 Decided 2026-11-25 by the owner: one-click links. **Was:** should an invite link sign the person in with one click (one-time code exchanged for a session), or still ask them to paste a key? A one-click link becomes a credential if it is forwarded, so it needs expiry and single use.
  - [x] 1.3 Decided 2026-11-25 by the owner: one personal key per person; each invite link is tied to one key; no shared multi-reader link. **Was:** do viewers keep one personal key each (current model), or can an admin create one link for many readers? A shared reader link cannot be revoked for one person alone.
  - [x] 1.4 Record the decisions and threat notes (stolen cookie, forwarded link, lost device, revoked key) in this list and in `access-control.docs.md`.
- [x] 2.0 Replace the key-in-cookie with server-side sessions
  - Proof: `node --test test/browser-session.test.js` (5 tests: opaque cookie and hash-only storage, restart, not a bearer key; renewal/inactivity with injected clock; revocation closes HTTP and WS (1008); sign-out/admin sign-out/everywhere; v2 exchange); VPS: cookie session over Traefik HTTPS and WSS.
  - [x] 2.1 Add a session store under the server's derived state (not in the Markdown brain): an opaque random id, the key id it came from, role, created/last-seen/expiry times, and a short device label. Store only a hash of the id.
  - [x] 2.2 Issue the opaque id from `GET /session` instead of the raw key. Keep HttpOnly, SameSite=Strict, Secure and the Origin check.
  - [x] 2.3 Keep the 400-day cookie that renews on use from 0.0. The server-side session has no expiry of its own beyond the inactivity limit. Write last-seen to the store at most once a day, not on every request.
  - [x] 2.4 Revoking a key ends all of its sessions and live sockets immediately, as revocation does today. Add per-session sign-out and "sign out everywhere" for a key.
  - [x] 2.5 Migrate existing `v2` cookies: accept them once, exchange them for a new session, then retire the `v2` path in a later release. Old cookies already expire within 24 hours, so a forced reconnect is acceptable if migration turns out costly.
- [x] 3.0 One-click invites for viewers
  - Proof: `scripts/viewer-access-smoke.mjs` (admin copies link from the dialog; link has `#invite=jbi_…`, no key; lands on Home or `?note=`; reused/expired links show the friendly dialog); `test/browser-session.test.js` (single use, 7-day expiry, exact Origin, revoked key); `scripts/access-keys-smoke.mjs` (agent setup copy still works, hosted and app).
  - [x] 3.1 Admin UI: **Copy invite link** next to each key (reader by default), with a visible expiry. The link carries a one-time invite code, never the key.
  - [x] 3.2 Opening the link exchanges the code for a session and lands on Home, or on the shared note if the link pointed at one. Used or expired links show a short, friendly "ask for a new link" page.
  - [x] 3.3 Keep **Copy invite** (address plus key) for CLI and agent setup, and label which one is for people and which for agents.
- [x] 4.0 A calm reading experience for readers
  - Proof: `scripts/viewer-access-smoke.mjs` at 390 px (identity line, Sign out, View only, New note explained with no request, no horizontal scroll on invite landing, Home, note, search); `scripts/ux-readonly-affordances-smoke.mjs`, `scripts/blocked-action-explanations-smoke.mjs` pass.
  - [x] 4.1 Audit the hosted shell signed in as a reader: hide or explain write actions (New note, rename, drawings create, board edits) instead of failing with 403 after the click. Reuse the existing blocked-action explanations.
  - [x] 4.2 Show who you are signed in as and a **Sign out** action.
  - [x] 4.3 Check mobile width (390 px) for invite landing, Home, note reading and search.
- [x] 5.0 Verify, document, finish
  - Proof: see Verification.
  - [x] 5.1 Tests: session issue, renewal on use, inactivity expiry, revocation ending sessions and sockets, invite single use and expiry, reader write refusal, Origin check, `v2` migration.
  - [x] 5.2 Chromium smoke of the full viewer path: open invite link → Home → open note → reload after the clock moves past 24 hours and past 30 days, still signed in → admin revokes → next action shows Connect. Extend `scripts/server-role-access-smoke.mjs` or `scripts/shared-note-entry-smoke.mjs` where practical.
  - [x] 5.3 Exercise the path once against the shared VPS playground (add/edit only, never delete; see memory note).
  - [x] 5.4 Update `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md`, `docs/faq.md` (what a session cookie holds and how long it lasts), `access-control.docs.md`, `browser.docs.md`. Add a short user-facing note to `release-next.md`.
  - [x] 5.5 `jumpy-loop` review of the session and invite code before finalizing.

## Decisions

Owner (2026-11-25, given in the brief): maximum session lifetime with renewal on use and no hard cap; one-click invite links (single use, 7 days, tied to one key, landing on Home or the linked note, friendly page for used/expired links); one personal key per person; do 0.0 and 2.0 together; migrate `v2` cookies if cheap.

Made unattended on the owner's behalf:
- 0.0 and 2.0 shipped as one change, so no build ever held a 400-day cookie containing the key (0.4's trade-off never shipped).
- Session store is `.jumpybrain/sessions.json` beside `access.json` (private, locked, atomically replaced), not under the rebuildable index: sessions must survive index rebuilds. The lock/atomic-write code was extracted from `AccessStore` into `access-control/state-files.ts` and shared.
- Server-side inactivity limit = cookie lifetime = 400 days; last use and cookie re-issue at most once per 24 h. Session role is stored for display only; authorization always comes from the key's current state.
- Bounds: 32 sessions per key (that key's least recently used ends first), 4096 in all (503 `session_limit`, no cross-key eviction), 1024 open invites (409 `invite_limit`).
- `v2` migration: `v2` cookies still authenticate (as before) until they expire within 24 h; the shell's `GET /session` exchanges one for a `v3` session and clears it. Removing the `v2` path is a follow-up for a later release.
- Invite code travels in the URL fragment (`/#invite=jbi_…`) so it never reaches server/proxy logs or `Referer`; `POST /session/invite` needs the exact Origin.
- A browser that is already signed in never redeems an invite link (keeps its identity, shows a toast, leaves the code unused; the server also refuses with 409). A signed-out browser redeems automatically: that is the one-click feature.
- Connect commits a new key only after the server accepts it; a mistyped key keeps the dialog open with the reason and leaves the current sign-in alone (before, a wrong key signed the browser out). Two existing smokes were updated for this.
- Signing in again with the same key keeps the current session, so other tabs stay connected.
- A 401 does not clear the session cookie (a late reply could otherwise erase a newer session from another tab); sign-out clears it, sign-in overwrites it.
- Admin UI puts **Invite link** on every active key row (any role; viewers should get reader keys) rather than changing the key form's default role. The new-key panel labels **Copy invite link** (people) and **Copy agent setup** (agents/CLI; it is the old **Copy invite**, same element id).
- Admin links land on Home; a link with `?note=<id>` before the fragment lands on that note (supported and tested, but the dialog does not compose note links).
- Per-session **Sign out** and **Sign out everywhere** are admin actions in the Access keys dialog and the Mac app's Settings (gateway allowlist extended). A reader can sign out only their own browser.
- 4.1: kept the existing offer-then-explain design for write controls (they explain instead of failing with 403); added **View only** in place of Saved and the signed-in identity line. No controls were hidden.
- New smoke `scripts/viewer-access-smoke.mjs` instead of extending an existing one, per `docs/testing.md` (one standalone file per scenario).
- The VPS check used a hardlinked copy of the running 0.3.23 release with only `dist/` replaced (runtime lockfile packages identical), then rolled back.

## Verification

- `npm run build`: pass (final build after review fixes).
- `node --test test/browser-session.test.js test/notes-browser.test.js test/access-keys.test.js test/collaboration-live.test.js test/companion-live-gateway.test.js test/macos-companion-gateway.test.js test/server-http.test.js test/browser-access.test.js test/companion-browser.test.js test/architecture-boundaries.test.js test/source-graph-contracts.test.js` on the final build: 218 pass, 0 fail. `test/browser-session.test.js` (7 tests) covers session issue, opaque cookie and hash-only storage, restart, session secret not a bearer key, renewal once a day (one winner among parallel requests, no rewrite when nothing changed), still signed in after 30/200/399 idle days, expiry after 400 idle days, revocation ending HTTP and WS (1008), sign-out and admin sign-out, signing out one browser leaving another socket of the key connected, invites (single use, deleted on redeem, 7-day expiry, exact Origin incl. scheme, revoked key, refused with 409 over a live v3 or v2 sign-in and left usable), reader write refusal, Origin check, same-key sign-in keeping the session, `v2` migration, per-key session bound without cross-key eviction. `test/notes-browser.test.js` covers refused sign-out and refused keys changing nothing.
- Chromium (`npx --package=playwright node scripts/<name>.mjs`) on the final build, all pass: `viewer-access-smoke` (new: invite → Home → note → server clock +25 h (cookie re-issued) and +30 days still signed in → used and expired link page → signed-in browser not switched and code left unused → fragment-only link in an open tab → note link → admin revokes in the UI → Connect → Sign out kills a copied cookie; 390 px with no horizontal scroll on invite landing, Home, note and search), `browser-session-smoke`, `access-keys-smoke`, `shared-note-entry-smoke`, `recent-notes-smoke`, `ux-credential-draft-smoke`, `blocked-action-explanations-smoke`, `server-role-access-smoke`, `ux-readonly-affordances-smoke`. Assertions updated in five existing smokes for intended changes (v3 cookie name, 400-day expiry, "View only", named row buttons, refused key keeps the dialog open, "Could not sign out").
- Shared VPS playground (dev build on a hardlinked 0.3.23 copy, `dist/` replaced, then rolled back to 0.3.23 and restarted; test release removed; health OK): invite → Home → note opened view-only over Traefik HTTPS + WSS → reload still signed in → identity line → reused link shows the friendly page → revoke → Connect. Cookie seen as `HttpOnly; Secure; SameSite=Strict`, 400.0 days, no key. Five test reader keys created by me, all revoked; no sessions left active. No notes created, edited or deleted. A leftover empty `sessions.json` (54 bytes, no sessions) stays on that brain; 0.3.23 ignores it. The run found and fixed a startup race (connected set before the first page after an invite).
- Review: `jumpy-loop`, one independent read-only reviewer from another provider, 5 rounds, final verdict APPROVE. Fixed: sign-out of one browser revoked the whole key's live presence; sign-out and Connect changed local state before the server confirmed; parallel renewals rewrote state; an invite could replace a live sign-in (now refused client- and server-side, v2 included); fragment-only invite links were ignored; replacing a session was two transactions; a reader could evict other keys' sessions at the global limit (now per-key bound, 503 at the global limit, dead keys pruned first); spent invites held places; 401s cleared a newer cookie; same-key sign-in ended the session; invite route Origin ignored the scheme; Sign out everywhere hidden for one browser. Declined with reasons: Origin scheme on pre-existing routes and v2 socket lifetime (pre-existing, follow-ups); a once-a-day renewal-vs-sign-in race (fail-safe); `#apiKey` fixture fallback; editor cancel order on Update key (pre-existing, drafts flushed first); two test-depth nits.

## Remaining limits

- Safari ITP behaviour untested: no Safari or Playwright WebKit here. The cookie is first-party and server-set, which ITP's 7-day script-cookie cap does not target, but unconfirmed.
- Chromium's cookie jar clock was not moved: the 24 h / 30 day checks move the server clock and assert the browser cookie's 400-day expiry attribute instead.
- `v2` browser sockets opened before the upgrade keep the raw key captured at upgrade until they close (pre-existing; key revocation still closes them).
- Origin checks accept `http://` and `https://` for the same host (pre-existing).
- Operator/setup-key browser sessions are listed by `GET /access/sessions` but have no key row in the UI.
- No CLI command creates invite links yet.

## Follow-ups

- Remove the `v2` cookie path in a later release.
- Confirm Safari (macOS and iOS) keeps the session past 7 days on the playground.
- Consider a single trusted public origin for Origin checks.
- CLI `jumpybrain access invite` and showing operator sessions in the dialog, if wanted.

## Relevant files

- `src/adapters/access-control/index.ts`, `sessions.ts` (new), `state-files.ts` (new), `access-control.docs.md`
- `src/adapters/http-server/index.ts`, `graph-page.ts`, `notes-browser.ts`, `access-keys.ts`, `access-keys-view.ts`, `http-server.docs.md`, `browser.docs.md`
- `src/adapters/live/index.ts`, `live.docs.md`
- `integrations/macos-companion/gateway.mjs`
- `test/browser-session.test.js`, `test/notes-browser.test.js`
- `scripts/viewer-access-smoke.mjs` (new), `scripts/access-keys-smoke.mjs`, `scripts/recent-notes-smoke.mjs`, `scripts/shared-note-entry-smoke.mjs`, `scripts/ux-readonly-affordances-smoke.mjs`
- `docs/shared-memory-protocol.md`, `docs/cloud-shared-memory.md`, `docs/collaboration.md`, `docs/faq.md`, `tasks/todo/release-next.md`, `tasks/done/2026-11-25_tasks-install-profiles.md` (links)
