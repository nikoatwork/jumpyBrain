# Direct feedback delivery

Feedback has a message field, an **Include logs** checkbox with a short information tooltip, a **Send feedback** action, and a top-right close icon. Opening the dialog collects bounded diagnostics locally. Choosing Send uploads the message and, unless excluded, the frozen diagnostic report to the support service. Failed or unconfirmed requests keep the draft for retry. There is no log preview, email-client handoff or draft download in the dialog.

To query received feedback, follow [Check AgentMail feedback](check-feedback.md) for the read-only API command, ignored credential setup and test-message filtering.

## CLI feedback

Agents and terminal users can send the same fixed-recipient report with `jumpybrain feedback --message "..." --json`, or pipe text on stdin. `--dry-run` previews without network access. The CLI sends supplied text only, with no diagnostics or memory credentials, independently of the selected brain or app. See [CLI feedback](cli-commands.md#product-feedback) for authorization, limits, receipts and deliberate retries. Shared transport lives in `src/adapters/feedback/`; the existing HTTP-server export and packaged config path remain compatible.

## Deployment status

The supported public endpoint is the [public demo](../README.md)'s `/support/feedback` route; `/support/health` reports relay readiness. The default URL is public package metadata (`jumpybrain.feedbackUrl` in `package.json`), so normal source builds and release packaging retain it without shell configuration. It contains no mail credentials. The proxy routes only those two support paths to the relay; the demo's memory app remains separate. The existing private relay hostname is retained for older configured clients.

On 2026-10-23, the repaired 0.3.7 local Mac app was built and installed from an isolated feedback snapshot, then tested through its actual Feedback dialog. It reported **Feedback sent** and cleared the synthetic draft. AgentMail API list/get calls verified test marker `mac-feedback-e2e-2026-10-23-02` in a received message at `2026-10-23T09:25:32.838Z`. Session diagnostics were excluded from that live send; automated browser/Electron fixtures verified the actual diagnostic attachment, opt-out and retry behavior. Existing connection-file hashes matched before/after installation. These changes are installed locally; a new public release has not been published.

### Installed-app regression found on 2026-10-23

An explicitly authorized test through the actual Feedback dialog in the installed **0.3.6 Mac app** failed: **Direct feedback is not available in this installation yet.** The synthetic draft remained intact. Its bundled `dist/adapters/http-server/feedback-config.json` contained `{"url":""}`, so the forwarder had no delivery destination. The live AgentMail inbox was refreshed afterward and still contained only the October 20 feedback and October 22 synthetic test; the new test did not arrive. Session diagnostics were excluded.

The retained downloaded 0.3.6 and 0.3.7 release tarballs also contain an empty feedback URL. At the time, `scripts/build-editor.mjs` defaulted to an empty URL whenever `JUMPYBRAIN_FEEDBACK_URL` was absent; release packaging rebuilds the runtime. The earlier configured-build verification below does not establish delivery from those released installations. Updating to the previously published 0.3.7 artifact alone would not restore it. The repaired build uses the public package default and validates the packed configuration. Track the repair in [feedback release configuration](../tasks/done/2026-10-23_tasks-feedback-release-configuration.md) and the failed test in [the installed-app check](../tasks/done/2026-10-23_tasks-installed-feedback-e2e.md).

### Earlier configured deployment verification (2026-10-22)

The relay is deployed on the existing VPS under the deployment-configured hostname at `/support/feedback`. Its health route, `/support/health`, reports `deliveryConfigured:true`. The AgentMail key named **jumpyBrain feedback relay** permits only **Message Send**, scoped to `jumpybrain@agentmail.to`. The existing memory service is unchanged. The local Mac app has been rebuilt, installed, and reopened with direct Feedback visible and this endpoint bundled. On 2026-10-22, one explicitly authorized test through the installed app’s bundled forwarder and live relay was accepted by AgentMail and verified in the destination inbox. Its downloaded diagnostics attachment exactly matched the synthetic report; no personal notes or real diagnostics were sent. Configured health alone does not verify delivery.

The deployment is a separate Docker Compose service in `/srv/jumpybrain-feedback` on the existing VPS, using the Coolify-managed Traefik proxy/network and certificate. It is not registered as a new application in the Coolify dashboard. The tracked [Compose file](../deploy/feedback/compose.yaml) routes only `/support/feedback` and `/support/health`, strips `/support`, and publishes no host port. The service runs as the unprivileged Node user with a read-only filesystem and bounded resources/logging. Its root-private `.env` is the credential destination. Set `JUMPYBRAIN_FEEDBACK_HOST` (hostname only), optional `JUMPYBRAIN_FEEDBACK_PUBLIC_HOST` for the additional public route, `AGENTMAIL_API_KEY`, and `AGENTMAIL_SENDING_INBOX` there, then run `docker compose up -d --force-recreate` from that directory. The public host defaults to the primary host when omitted. Do not put credentials in chat or Git.

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

Normal builds use `package.json`'s public feedback URL. To use your own relay, set `JUMPYBRAIN_FEEDBACK_URL=https://relay.example.com/support/feedback` during the build or at runtime on a hosted memory server. Browser requests first authenticate to that server; it forwards only the report. No memory API key, cookie, root, or remote host credential goes to the relay.

For a custom Mac app relay, override the public URL **during the build/setup**:

```sh
JUMPYBRAIN_FEEDBACK_URL=https://relay.example.com/support/feedback npm run desktop:setup
```

`build-editor.mjs` writes the selected public URL into `dist/adapters/http-server/feedback-config.json`, which ships with the bundled runtime. This works when launched from Finder because the native helper deliberately does not inherit shell configuration. Never put mail keys in the app or this generated file. Keep private brain hostnames in private deployment configuration; the shipped URL uses an already public host. A runtime environment URL takes precedence for standalone hosts. Explicitly setting an empty value disables direct delivery for custom builds/hosts; official releases reject an empty override. Packaging reads the tarball's actual config, checks it against the intended endpoint, and requires the config and forwarder modules. Missing/disabled configuration returns an explicit unavailable result and retains the feedback draft.

Desktop feedback stays on its local gateway rather than going through the selected brain. Thus a read-only or offline brain does not prevent reporting a problem. Requests still require the local session, exact Origin, and current tab/generation; admitted submissions participate in shutdown/switch draining.

## Delivery and retry semantics

The browser creates a UUID for the reviewed report and reuses it after unconfirmed delivery, including closing/reopening the dialog. Editing the report creates a new submission. A successful send clears the message only after the returned ID matches, closes the dialog, restores focus to Feedback and shows a shared thank-you notification. Forced session closure suppresses late notifications; confirmed acceptance still clears that submitted report. A subsequent dialog collects fresh diagnostics. Tab reload loses feedback state; there is no background retry or durable local outbox.

The relay uses AgentMail's [send API](https://docs.agentmail.to/api-reference/inboxes/messages/send) with a fixed plain-text message and optional base64 text attachment. AgentMail's [idempotency header](https://docs.agentmail.to/idempotency) deduplicates unchanged retries for 24 hours. After that window, a retry can send a duplicate. Success means the mail provider accepted the report, not that a human read it or that inbox delivery was verified.

Tests use disposable reports and injected senders, never live account credentials or real mail. Run `node --test test/feedback-delivery.test.js test/feedback.test.js test/macos-companion-gateway.test.js` after a build, `npm run smoke:feedback`, and `npm run smoke:electron`. Live delivery checks require explicit authorization; the deployment check above passed with synthetic content.
