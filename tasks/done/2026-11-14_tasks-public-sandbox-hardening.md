# Public Sandbox Hardening

Status: **completed 2026-11-14 as a docs-only 80/20 pass** at the owner's request ("nothing fancy"). No product code changed. The original July 2026 plan (no-auth demo mode, an in-process limiter, counters, CLI aliases) is condensed into the audit below.

## Goal

Make a public writable demo brain safe enough for strangers to connect to from the CLI. The original design favoured dependency-light rate limits and resettable state over a required external auth provider.

## Outcome

The safety this list wanted already exists outside core, and core's client side is already done:

- **Demo deployment (separate private demo repository).** A dependency-free gateway in front of core provides per-client graph and CLI rate limits (`429 rate_limited` with `Retry-After`) and an allowlist for the published key. That key cannot use document `PUT`, index, wrapups, `dream/*` or other routes (`403`). The gateway also caps public-write bodies at 64 KiB, serves anonymous graph reads, and resets the root from seed hourly and on start. This was read from the demo repo's README, `deploy/coolify-notes.md`, `docs/ops-checklist.md` and `scripts/demo-gateway.mjs`; the live deployment was not probed.
- **Self-hosted servers.** [VPS docs](../../docs/vps-deploy.md#request-rate-limits-belong-to-your-proxy) already put request-rate limits at the reverse proxy (`limit_req_status 429`). [Shared-brain admission errors](2026-11-14_tasks-shared-brain-admission-errors.md) already made the CLI explain 429/503 with a validated `Retry-After`. That task also explicitly scoped out a product rate limiter.
- **Shipped here.** A short [Public writable sandbox](../../docs/vps-deploy.md#public-writable-sandbox) section covers the dedicated disposable root, least-privilege published key, proxy route allowlist with per-IP 429 limits and a body cap, and what a scheduled reset does and does not solve.

An in-process core limiter would duplicate the demo gateway and the documented proxy limits. Adding one would mean new config, a trusted-proxy flag and new tests for no gap that remains.

### Finding worth acting on (demo-side, not done here)

Keys in `JUMPYBRAIN_SERVER_API_KEYS` authenticate as **admin** (`src/adapters/access-control/index.ts`, bootstrap principal). The demo publishes a key from that variable, so its gateway allowlist is the only thing preventing admin actions. A `writer` key from `jumpybrain access issue` would still need the allowlist, because writers can edit and delete notes, but it removes admin and backend RPC capability from the public key. Issued keys are stored in `<root>/.jumpybrain/access.json`, and the demo reset wipes the whole root. Switching the demo to a writer key therefore needs the reset to preserve that file. This belongs in the demo repository's task list. The demo repo was read-only for this task.

## Audit of the original items

- [x] 1.1 Read module docs: done for the boundaries involved; no source module changed.
- [~] 1.2 Unauthenticated endpoint policy: obsolete. The project kept keyed access, and the demo gateway's allowlist defines the public surface. The new docs describe the same posture.
- [~] 1.3 Per-bucket rate budgets: done elsewhere. The demo gateway sets graph/CLI budgets (180/90 per minute by default, environment-tunable), and self-hosters size proxy `limit_req`.
- [x] 1.4 Shared public key fallback: this is the current posture. It is documented in the new section, with the admin-key caveat.
- [x] 1.5 Abuse and reset assumptions: documented in the new section. Resets remove junk and return derived state to a known point. They do not bound traffic between resets and they delete root-local logs. Rate limits do not stop low-volume spam.
- [~] 2.1–2.5 In-process limiter, trusted-proxy keying, route classes, 429 shape and limiter tests: dropped. The gateway and proxy already return `429 rate_limited` with `Retry-After`, and core's client decodes it. A core limiter would duplicate them.
- [~] 3.1–3.4 Public-demo server mode (relaxed key requirement, auth bypass, mode log line): dropped. The owner excluded a no-auth mode, and keyed access with the gateway in front already works.
- [x] 4.1 Remote CLI path: works today with `--target-url` plus `JUMPYBRAIN_API_KEY`. `JUMPYBRAIN_DEMO_URL` is only a shell variable in the demo docs, not something the CLI reads.
- [~] 4.2 Optional client API key: dropped by owner decision (no no-auth mode).
- [~] 4.3 Copy-paste connect command and `JUMPYBRAIN_DEMO_URL` alias: done elsewhere. The demo's `/try`, `/agent` and homepage session setup cover it; no core alias was added (owner decision).
- [x] 4.4 CLI explanation of 429: done by [shared-brain admission errors](2026-11-14_tasks-shared-brain-admission-errors.md). The message stays generic, with no reset-schedule knowledge in core.
- [~] 5.1 `rate_limit_rejected` server log: obsolete without a core limiter. Refusals are logged by the proxy or gateway.
- [~] 5.2 In-process counters and sandbox admin route: dropped by owner decision.
- [~] 5.3 Public-mode HTTP tests: obsolete without a public mode. The demo repo owns its gateway smoke tests.
- [x] 6.1 / 6.2 Docs for sandbox posture and when to use a shared key: the new VPS section. `docs/cloud-shared-memory.md` already links refusal guidance to the proxy section, so it needed no change.
- [~] 6.3 `npm test` / `cli:pack`: not applicable to a docs-only change (see Verification).
- [x] 6.4 Revoke the historical README credential: completed 2026-07-11 by `tasks-open-source-security-docs-audit`.

## Verification

- Snapshot: based on `8bb99a74`. The change is documentation only: `docs/vps-deploy.md`, this list, inbound link repairs and the changelog.
- Following `docs/testing.md` for documentation-only changes: reviewed links and commands and ran `git diff --check`. The new anchors (`collaboration.md#separate-access`, `vps-deploy.md#public-writable-sandbox`) resolve to existing headings. `jumpybrain access issue --role writer` matches the documented CLI in `docs/collaboration.md`.
- The admin role of bootstrap keys and the location of `access.json` were confirmed by reading `src/adapters/access-control/index.ts`.
- No tests, typecheck or lint were run, because no code changed.

## Remaining limits

- The live demo's limits and allowlist were taken from that repo's code and docs, not probed against the live deployment.
- The demo still publishes an admin-level bootstrap key that only its gateway contains (see the finding above). This is a follow-up for the demo repo.
- Core keeps no per-IP limiter. A self-hoster who exposes a server without a proxy has none; the docs say so.
- No release note: user-facing behavior is unchanged.
