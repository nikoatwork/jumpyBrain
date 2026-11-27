# Serve hosted brains under a path prefix

## Outcome (2026-11-27)

One hostname now serves several internal brains under their own paths, e.g. `https://brain.example.com/sherpa`. Set the brain's existing `--public-base-url` / `JUMPYBRAIN_PUBLIC_BASE_URL` with the path; the reverse proxy strips it. The web UI builds every URL under the prefix, the session cookie is scoped to it (Path and name), and the CLI, named brains, CLI connections and the Mac app (connections, gateway, live gateway, first-run setup) accept and keep `https://host/prefix`. Brains served at `/` behave as before.

Tested snapshot: working tree on top of `efd24826`. Focused tests ran on the final build; the VPS run used the build after review round 2 (round 3 only tightened startup validation of the base path, covered by tests). Verification summary:

- Focused tests: 288/288 (`browser-app-urls`, `browser-session`, `server-http`, `electron-setup`, `http-client`, `cli-named-brains`, `cli-connections`, `env-file-credentials`, `macos-companion-connections`, `macos-companion-gateway`, `companion-live-gateway`, `dream-handoff`, `graph`, `drawings`, `architecture-boundaries`, `collaboration-cli`, `cli-help-validation`, `browser-*`).
- Local Chromium, two brains on one origin (`/sherpa`, `/vladimir`) behind a prefix-stripping proxy with real `serve --public-base-url`: both signed in at once, live edits isolated per brain on disk, `[[link]]`, graph, deep-link reload, bare `/sherpa`, sign-out of one keeps the other; 147 requests and 8 sockets, none outside their tab's prefix. CLI named brains isolated; key of one brain gets 401 on the other.
- Shared VPS test host (Traefik `stripPrefix`, disposable brain at `/pathtest` next to the existing root brain, both on one hostname): CLI add/status/remember/index/search/recall over HTTPS; key isolation 401/200; Chromium signed in to both brains in one profile, cookies `Path=/` and `Path=/pathtest` with different names, live edit over `wss://…/pathtest/ws` landed only in the disposable root, link/graph/deep link/bare prefix, sign-out of `/pathtest` kept the root brain signed in; 47 requests, none outside `/pathtest`. All temporary VPS resources (route file, firewall rule, service, release copy, root, user) were removed afterwards and the root brain verified healthy; the test browser session on the root brain was signed out.
- No-prefix regression: `note-link-smoke` and `browser-session-smoke` pass. `collaboration-editor-smoke` times out at `scripts/collaboration-intent-proof.mjs:136` identically on clean HEAD; `drawings-smoke` (line ~318) and `companion-browser-smoke` (line ~250) fail identically on clean HEAD. Not caused by this change.
- Independent review: four rounds with GPT Sol (high effort), approved in round 4; ledger under Decisions.

Limits: the packaged Mac app was not run against a prefixed brain (gateway, live gateway and first-run setup are covered by tests only). The device read-only allowlist stays per origin, so marking a host read-only covers all its prefixes. `--target-url` stays as lenient as before (strict prefix checks apply to named brains and app connections). Brains on one hostname are one browser trust zone (documented).

## Goal

One hostname can serve several internal brains, e.g. `https://brain.example.com/sherpa` and `https://brain.example.com/vladimir`. Each brain works fully under its prefix: web UI, live editing over WebSocket, note links, drawings, sign-in/invites, CLI named brains and the Mac app. Brains without a prefix behave exactly as before.

## Notes

- Source: beta feedback 2026-11-27 (path prefixes on one hostname), follow-up to 2026-11-26 (more than one brain per hosted server). See [feedback index](../feedback.md).
- Scope is internal use: brains on one hostname share one browser origin, so they are one trust zone. Different teams/companies still get separate hostnames. Documented; same-origin brains are not isolated from each other.
- Contract: the reverse proxy strips the prefix. The server learns its public prefix from the existing, previously unused `--public-base-url` (its path becomes the base path). Server routes stay root-relative.
- The Mac app serves its own UI on a local gateway and forwards API calls, so its UI base stays `/`; only the gateway's upstream URL carries the remote prefix.

## Relevant Files

- `src/server/config.ts`, `src/cli/usage.ts` - base path from `--public-base-url` (validated as typed; `/graph` reserved)
- `src/adapters/http-server/index.ts`, `src/adapters/http-server/routes.ts`, `src/adapters/http-server/http-server.docs.md` - cookie Path/name per prefix, shell gets the base path
- `src/adapters/http-server/browser-app-url.ts` (new), `graph-page.ts`, `notes-browser.ts`, `drawings-view.ts`, `drawing-assets.ts`, `drawing-frame-assets.ts`, `dream-handoff.ts`, `browser.docs.md` - `appUrl`/`appRoute` for every browser-built URL; per-brain identity channel and sidebar history
- `src/adapters/http-client/index.ts`, `src/adapters/http-client/access.ts`, `src/adapters/http-client/http-client.docs.md`, `src/cli/collaborate.ts`, `src/cli/named-brains.ts`, `src/cli/connections.ts`, `src/cli/args.ts`, `src/cli/instructions.ts`, `src/cli/cli.docs.md` - `remoteRouteUrl` join rule; prefixed brain URLs
- `integrations/macos-companion/connections.mjs`, `gateway.mjs`, `live-gateway.mjs`, `connections.docs.md`, `gateway.docs.md`, `integrations/electron/setup.mjs` - `upstreamUrl`; prefixed connections and first-run setup
- `test/browser-app-urls.test.js` (new, includes a source scan guard), `test/prefix-proxy-helpers.js` (new), `test/browser-session.test.js`, `test/server-http.test.js`, `test/electron-setup.test.js`, `test/http-client.test.js`, `test/cli-named-brains.test.js`, `test/cli-connections.test.js`, `test/env-file-credentials.test.js`, `test/macos-companion-connections.test.js`, `test/macos-companion-gateway.test.js`, `test/companion-live-gateway.test.js`, `test/browser-shell-helpers.js`, `test/graph.test.js`, `test/dream-handoff.test.js`, `test/drawings.test.js`
- `docs/vps-deploy.md` (section 10 "One hostname, one path per brain": nginx, Caddy, Traefik, trust zone), `docs/shared-memory-protocol.md`, `docs/cli-commands.md`
- `tasks/feedback.md`, `tasks/todo/tasks-feedback-follow-ups.md`, `tasks/todo/release-next.md`, `tasks/CHANGELOG.md`

## Tasks

- [x] 1.0 Server knows its public base path
  - Proof: `test/server-http.test.js` (config derives `/sherpa`, `/team/sherpa`; rejects query/fragment/credentials, `//`, `%20`, `/.team`, `/team/../sherpa`, `https:/host/…`, `/graph`), `test/browser-session.test.js` (cookie `Path=/sherpa`, sign-out clears at that path, prefixed and root cookie names differ for one root, startup rejects bad base paths); VPS showed `const appBasePath = "/pathtest"` and cookie `Path=/pathtest`.
  - [x] 1.1 Derive `basePath` from `--public-base-url`
  - [x] 1.2 Pass it to the HTML shell; scope the session cookie Path and name to it
  - [x] 1.3 Focused server tests
- [x] 2.0 Browser UI works under the prefix
  - Proof: `test/browser-app-urls.test.js` (shell markup, helper behavior, source scan guard); single-brain prefix smoke (94 requests, 0 outside), two-brain local E2E and VPS Chromium runs above.
  - [x] 2.1 One helper for app URLs; fetch, links, history, WebSocket, favicon, drawing frame/assets, invite/share links, route reads
  - [x] 2.2 Guard test for new root-absolute app URLs in browser modules
  - [x] 2.3 Companion (Mac) mode keeps base `/` (unit tests; no packaged-app run)
- [x] 3.0 Clients accept a brain URL with a path
  - Proof: client tests above (182/182 in the client slice, then within 288/288); CLI behind a local prefix proxy (status, whoami, remember, index, search, recall, show, collaborate open/edit; 11 requests, all under `/sherpa`); CLI against the VPS `/pathtest` brain over HTTPS.
  - [x] 3.1 HTTP client, access check and `collaborate` WebSocket keep the base path (`remoteRouteUrl`)
  - [x] 3.2 Named brains and connections accept `https://host/prefix`; credentials keep separate keys per prefix
  - [x] 3.3 Mac companion connection validation, gateway and live gateway upstream (`upstreamUrl`); first-run setup
  - [x] 3.4 Focused tests for each
- [x] 4.0 Validate end to end
  - Proof: see Outcome.
  - [x] 4.1 Local: two brains on one origin in Chromium plus CLI
  - [x] 4.2 Regression: no-prefix smokes (pre-existing failures confirmed on clean HEAD)
  - [x] 4.3 VPS: disposable prefixed brain next to the existing one; removed afterwards
  - [x] 4.4 Independent review, findings fixed or declined (ledger below)
- [x] 5.0 Docs and finalize
  - Proof: docs reviewed against the tested commands (`brains add --target-url … --key-stdin` corrected after running it); `git diff --check`.
  - [x] 5.1 `docs/vps-deploy.md`, `docs/cli-commands.md`, protocol and module docs
  - [x] 5.2 Release note in `tasks/todo/release-next.md`; feedback index row and follow-up
  - [x] 5.3 Archive, commit

## Decisions

- Reuse `--public-base-url` instead of a new flag: it already existed, was documented and unused.
- The proxy strips the prefix; the server does not accept prefixed request paths. Routing, auth and WebSocket upgrade stay unchanged.
- `/graph` cannot be a prefix: it is the UI's own Graph route.
- A prefixed brain's cookie name also hashes its prefix: containers on one host may share an internal root path. Moving an existing brain from `/` to a prefix therefore asks its browsers to sign in once more.
- Sign-out clears only the brain's own cookie path; earlier root-path clearing was dropped because it could sign out a root brain with the same cookie name.
- Same-origin redirects with a bearer key are left as before: one hostname is one operator's trust zone and jumpyBrain servers never redirect.
- The connection dialog ignoring an early click on slow networks is pre-existing (reproduced on clean HEAD) and recorded as a follow-up, not fixed here.

### Review ledger (GPT Sol, high effort)

- R1 blocker, Mac first-run setup rejected prefixed URLs: fixed.
- R2 blocker, `/graph` prefix collided with the Graph route: fixed by rejecting it.
- R3 should, same-origin redirect could forward a key to another prefix: declined (one trust zone, servers never redirect).
- R4 should, server prefix grammar looser than clients / normalized `..`: fixed (validated as typed, whole input).
- R5 should, root-path cookies after moving a brain: superseded by the per-prefix cookie name (N2).
- R6 nit, "unchanged shell" test: declined (equivalent behavior at `/`, not byte parity).
- N1 should, direct server startup accepted `/graph`: fixed (shared validator).
- N2 should, sign-out could clear a root brain's cookie with the same name: fixed (per-prefix cookie name, no root clearing).
- N3 should, direct startup accepted `/team;beta` (truncated cookie Path): fixed (plain-segment grammar at startup).
- N4 should, invalid base path rejected only after background work started: fixed (validated first).
