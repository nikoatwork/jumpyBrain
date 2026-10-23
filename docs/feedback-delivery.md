# Direct feedback delivery

Feedback now has an explicit **Send feedback** action. Opening the dialog only collects the existing bounded diagnostic preview. Sending uploads the message and, unless excluded, exactly that diagnostic report to the support service. Failed or unconfirmed requests keep the draft for retry. Email-app and `.eml` alternatives remain secondary.

To query received feedback, follow [Check AgentMail feedback](check-feedback.md) for the inbox, verified browser access, fallback and test-message filtering.

## Deployment status

### Installed-app regression found on 2026-10-23

An explicitly authorized test through the actual Feedback dialog in the installed **0.3.6 Mac app** failed: **Direct feedback is not available in this installation yet.** The synthetic draft remained intact. Its bundled `dist/adapters/http-server/feedback-config.json` contained `{"url":""}`, so the forwarder had no delivery destination. The live AgentMail inbox was refreshed afterward and still contained only the October 20 feedback and October 22 synthetic test; the new test did not arrive. Session diagnostics were excluded.

The retained downloaded 0.3.6 and 0.3.7 release tarballs also contain an empty feedback URL. `scripts/build-editor.mjs` writes an empty URL whenever `JUMPYBRAIN_FEEDBACK_URL` is absent; release packaging rebuilds the runtime. The earlier configured-build verification below does not establish delivery from these released installations. Updating to the retained 0.3.7 artifact alone would not restore it. Track the repair in [feedback release configuration](../tasks/todo/tasks-feedback-release-configuration.md) and the failed test in [the installed-app check](../tasks/done/2026-10-23_tasks-installed-feedback-e2e.md).

### Earlier configured deployment verification (2026-10-22)

The relay is deployed on the existing VPS under the deployment-configured hostname at `/support/feedback`. Its health route, `/support/health`, reports `deliveryConfigured:true`. The AgentMail key named **jumpyBrain feedback relay** permits only **Message Send**, scoped to `jumpybrain@agentmail.to`. The existing memory service is unchanged. The local Mac app has been rebuilt, installed, and reopened with direct Feedback visible and this endpoint bundled. On 2026-10-22, one explicitly authorized test through the installed app’s bundled forwarder and live relay was accepted by AgentMail and verified in the destination inbox. Its downloaded diagnostics attachment exactly matched the synthetic report; no personal notes or real diagnostics were sent. Configured health alone does not verify delivery.

The current deployment is a separate Docker Compose service in `/srv/jumpybrain-feedback` on the existing VPS, using the Coolify-managed Traefik proxy/network and certificate. It is not registered as a new application in the Coolify dashboard. The tracked [Compose file](../deploy/feedback/compose.yaml) routes only `/support/feedback` and `/support/health`, strips `/support`, and publishes no host port. The service runs as the unprivileged Node user with a read-only filesystem and bounded resources/logging. Its root-private `.env` is the credential destination. Set `JUMPYBRAIN_FEEDBACK_HOST` (hostname only), `AGENTMAIL_API_KEY`, and `AGENTMAIL_SENDING_INBOX` there, then run `docker compose up -d --force-recreate` from that directory. Do not put credentials in chat or Git. One authorized synthetic delivery test has passed.

## Relay on Coolify/VPS

Create a separate Coolify application from this repository using `Dockerfile.feedback`, exposing port `3002` behind HTTPS. It runs only the support relay; it needs no memory root, QMD, or memory-server key. Configure these private server-side variables:

```text
AGENTMAIL_API_KEY=<set in Coolify secrets>
AGENTMAIL_SENDING_INBOX=<your authorized sending inbox ID>
```

The recipient is fixed to `jumpybrain@agentmail.to`; callers cannot set recipients, subject, headers, sender, or attachment URLs. Use a sending inbox authorized by the account. Health is `GET /health`; submissions use `POST /feedback`. For a direct Node deployment, build first and run `node scripts/feedback-relay.mjs`; `HOST` defaults to loopback and `PORT` to `3002`.

The process can run before mail configuration exists: health distinguishes process availability from delivery readiness, and submissions return 503 `feedback_unavailable` until both required variables are set. They are never falsely acknowledged or silently queued.

The public receiver accepts at most 100 attempts/hour and four simultaneous requests per process, 64 KiB request bodies, 4,000 message characters, and 24 KB diagnostics. Configure additional ingress rate limits for public exposure. It trusts no forwarded IP headers, offers no public read/list route or CORS allowance, and never logs report content or provider error bodies. The single-process limits reset on restart and are not distributed abuse protection.

## Configure app hosts

Builds have no default relay address. Set `JUMPYBRAIN_FEEDBACK_URL=https://relay.example.com/support/feedback` for the tracked Compose deployment, or use the actual submission URL of your relay. Set it at runtime on a hosted memory server. Browser requests first authenticate to that server; it forwards only the report. No memory API key, cookie, root, or remote host credential goes to the relay.

For a Mac app relay, set the public URL **during the build/setup**:

```sh
JUMPYBRAIN_FEEDBACK_URL=https://relay.example.com/support/feedback npm run desktop:setup
```

`build-editor.mjs` writes this public URL into `dist/adapters/http-server/feedback-config.json`, which ships with the bundled runtime. This works when launched from Finder because the native helper deliberately does not inherit shell configuration. Never put mail keys in the app or this generated file. Keep company brain hostnames in private deployment configuration; use a separate public feedback hostname for publicly distributed builds, since a bundled URL is inspectable. A runtime environment URL takes precedence for standalone hosts. Explicitly setting an empty value disables direct delivery (at build time for the Mac app, or runtime for standalone hosts). Missing/disabled configuration returns an explicit unavailable result and retains the feedback draft.

Desktop feedback stays on its local gateway rather than going through the selected brain. Thus a read-only or offline brain does not prevent reporting a problem. Requests still require the local session, exact Origin, and current tab/generation; admitted submissions participate in shutdown/switch draining.

## Delivery and retry semantics

The browser creates a UUID for the reviewed report and reuses it after unconfirmed delivery, including closing/reopening the dialog. Editing the report creates a new submission. A successful send clears the message only after the returned ID matches. Tab reload loses feedback state; there is no background retry or durable local outbox.

The relay uses AgentMail's [send API](https://docs.agentmail.to/api-reference/inboxes/messages/send) with a fixed plain-text message and optional base64 text attachment. AgentMail's [idempotency header](https://docs.agentmail.to/idempotency) deduplicates unchanged retries for 24 hours. After that window, a retry can send a duplicate. Success means the mail provider accepted the report, not that a human read it or that inbox delivery was verified.

Tests use disposable reports and injected senders, never live account credentials or real mail. Run `node --test test/feedback-delivery.test.js test/feedback.test.js test/macos-companion-gateway.test.js` after a build, `npm run smoke:feedback`, and `npm run smoke:electron`. Live delivery checks require explicit authorization; the deployment check above passed with synthetic content.
