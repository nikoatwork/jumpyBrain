# Let web viewers stay signed in to a shared brain

Priority: proposed, to confirm. Status: planned 2026-11-25, nothing started. Sibling list: [install profiles](../done/2026-11-25_tasks-install-profiles.md).

## Goal

Many people only read a shared brain in the browser. They should get there with one click from an invite, stay signed in on their own device indefinitely while they keep using it, and move around notes without dealing with keys, installs or the Mac app. Revocation, read-only roles and write protection must keep working as they do now.

## Today (investigated 2026-11-25)

- Browser sign-in: the person pastes an access key into **Connect**. `GET /session` then sets `jumpybrain_session_v2_<hash>`, a cookie that **contains the raw access key**. It is HttpOnly, SameSite=Strict, Secure behind HTTPS and fixed at `Max-Age=86400`. Nothing renews it and there is no "stay signed in". [index.ts:78-144](../../src/adapters/http-server/index.ts#L78-L144), [cloud-shared-memory.md:89](../../docs/cloud-shared-memory.md#L89).
- Every request re-checks the key, so revoking a key takes effect immediately. Cookie-based writes require a matching Origin. [index.ts:118](../../src/adapters/http-server/index.ts#L118).
- Roles are reader, writer and admin. A reader is already view-only (403 `read_only` on writes). Keys never expire. [access-keys.ts:5-28](../../src/adapters/http-server/access-keys.ts#L5-L28), [access-control.docs.md](../../src/adapters/access-control/access-control.docs.md).
- **Copy invite** produces plain text: the address plus the key. There is no invite link. [access-keys.ts:38-44](../../src/adapters/http-server/access-keys.ts#L38-L44).
- Shared note links open **Connect**, then the original note. [browser.docs.md:51](../../src/adapters/http-server/browser.docs.md).
- Earlier work deferred this: "Longer login retention needs a separate design" ([Nov feedback fixes](../done/2026-11-25_tasks-november-feedback-fixes.md), [feedback.md:18](../feedback.md), [release-next.md:4](release-next.md)).
- Sign-in and permissions are **heavy** under the skill's effort rules. Plan a `jumpy-loop` review before finalizing.

## Relevant files

- `src/adapters/http-server/index.ts`, `access-keys.ts`, `routes.ts`, `http-protocol.ts`: session cookie, key checks, invites
- `src/adapters/http-server/notes-browser.ts` (Connect dialog around 1165-1230), `graph-page.ts:581`, `access-keys-view.ts`
- `src/adapters/access-control/`: roles and capabilities
- `src/adapters/live/live.docs.md`: live socket revalidation after revocation
- `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md`, `docs/vps-deploy.md`, `docs/faq.md`

## Tasks

- [ ] 0.0 Quick win: stay signed in for as long as browsers allow
  - [ ] 0.1 Raise the session cookie from `Max-Age=86400` to the browser maximum: 400 days, the limit Chrome enforces and RFC 6265bis recommends. Longer values are silently cut to 400 days, so a cookie that never expires is not possible.
  - [ ] 0.2 Re-issue the cookie on use (at most once a day) so the 400 days restart. Someone who opens the brain at least once a year never sees Connect again.
  - [ ] 0.3 Check Safari: a first-party, server-set HttpOnly cookie should keep the full lifetime. ITP's 7-day cap applies to cookies set by script or through third-party/CNAME-cloaked setups. Confirm on the shared VPS playground and record the result.
  - [ ] 0.4 Revocation stays immediate because every request re-checks the key. Note the trade-off: until 2.0 lands, a copied cookie is a copied key for up to 400 days.
- [ ] 1.0 Decide the session model
  - [x] 1.1 Decided 2026-11-25 by the owner: sessions last as long as possible ("like cookie doesn't expire"). No hard cap. A session ends only on sign-out, key revocation, or a year of inactivity.
  - [ ] 1.2 **Clarify:** should an invite link sign the person in with one click (one-time code exchanged for a session), or still ask them to paste a key? A one-click link becomes a credential if it is forwarded, so it needs expiry and single use.
  - [ ] 1.3 **Clarify:** do viewers keep one personal key each (current model), or can an admin create one link for many readers? A shared reader link cannot be revoked for one person alone.
  - [ ] 1.4 Record the decisions and threat notes (stolen cookie, forwarded link, lost device, revoked key) in this list and in `access-control.docs.md`.
- [ ] 2.0 Replace the key-in-cookie with server-side sessions
  - [ ] 2.1 Add a session store under the server's derived state (not in the Markdown brain): an opaque random id, the key id it came from, role, created/last-seen/expiry times, and a short device label. Store only a hash of the id.
  - [ ] 2.2 Issue the opaque id from `GET /session` instead of the raw key. Keep HttpOnly, SameSite=Strict, Secure and the Origin check.
  - [ ] 2.3 Keep the 400-day cookie that renews on use from 0.0. The server-side session has no expiry of its own beyond the inactivity limit. Write last-seen to the store at most once a day, not on every request.
  - [ ] 2.4 Revoking a key ends all of its sessions and live sockets immediately, as revocation does today. Add per-session sign-out and "sign out everywhere" for a key.
  - [ ] 2.5 Migrate existing `v2` cookies: accept them once, exchange them for a new session, then retire the `v2` path in a later release. Old cookies already expire within 24 hours, so a forced reconnect is acceptable if migration turns out costly.
- [ ] 3.0 One-click invites for viewers
  - [ ] 3.1 Admin UI: **Copy invite link** next to each key (reader by default), with a visible expiry. The link carries a one-time invite code, never the key.
  - [ ] 3.2 Opening the link exchanges the code for a session and lands on Home, or on the shared note if the link pointed at one. Used or expired links show a short, friendly "ask for a new link" page.
  - [ ] 3.3 Keep **Copy invite** (address plus key) for CLI and agent setup, and label which one is for people and which for agents.
- [ ] 4.0 A calm reading experience for readers
  - [ ] 4.1 Audit the hosted shell signed in as a reader: hide or explain write actions (New note, rename, drawings create, board edits) instead of failing with 403 after the click. Reuse the existing blocked-action explanations.
  - [ ] 4.2 Show who you are signed in as and a **Sign out** action.
  - [ ] 4.3 Check mobile width (390 px) for invite landing, Home, note reading and search.
- [ ] 5.0 Verify, document, finish
  - [ ] 5.1 Tests: session issue, renewal on use, inactivity expiry, revocation ending sessions and sockets, invite single use and expiry, reader write refusal, Origin check, `v2` migration.
  - [ ] 5.2 Chromium smoke of the full viewer path: open invite link → Home → open note → reload after the clock moves past 24 hours and past 30 days, still signed in → admin revokes → next action shows Connect. Extend `scripts/server-role-access-smoke.mjs` or `scripts/shared-note-entry-smoke.mjs` where practical.
  - [ ] 5.3 Exercise the path once against the shared VPS playground (add/edit only, never delete; see memory note).
  - [ ] 5.4 Update `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md`, `docs/faq.md` (what a session cookie holds and how long it lasts), `access-control.docs.md`, `browser.docs.md`. Add a short user-facing note to `release-next.md`.
  - [ ] 5.5 `jumpy-loop` review of the session and invite code before finalizing.
