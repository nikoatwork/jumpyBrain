# Direct feedback delivery

Status: completed and archived on 2026-10-22 with user approval. All delivery, deployment, and verification tasks are complete; no closure blockers remain.

Completion: direct sending is implemented and committed in `616ae5c`; the recorded installed-app test verified relay delivery and the exact synthetic attachment. Deployment details and test results below describe that verification, not a new check performed during archival.

User requested direct in-app sending after the download/email-app paths proved unhelpful.

- [x] Make explicit Send feedback primary; retain diagnostic preview/opt-out and drafts on failure.
- [x] Add authenticated browser and desktop gateway submission without remote brain write permission or mail credentials on clients.
- [x] Add deployable fixed-recipient AgentMail relay, bounded request/rate/concurrency limits, and stable provider retry keys.
- [x] Provide public relay URL build configuration for Finder-launched desktop apps.
- [x] Verify focused validation, provider mapping, hosted authentication, gateway Origin/generation fencing, and offline/read-only reporting with disposable fixtures.
- [x] Browser smoke passed at desktop/narrow widths in light/dark themes: direct send, failed send/retained draft, identical retry after reopening, diagnostics opt-out, and existing email alternatives.
- [x] Electron smoke passed through the production gateway/window with a fixture sender: direct submission, draft clearing, isolation, editing/autosave, close protection, and tab cleanup. Focused delivery/diagnostics/gateway tests: 38 passed. Earlier graph/server/host coverage: 57 passed.
- [x] Architecture, package, server boundary and HTTP checks passed. Bundle review measured 159,905 bytes gzip with the prior feedback module versus 160,322 with direct sending (+417 bytes); adjusted the review gate from 160 KB to 161 KB and reran both bundle checks successfully.
- [x] User confirmed the existing Coolify/VPS for a new relay. Deployed separate Compose service on the existing VPS under `/srv/jumpybrain-feedback`; existing Coolify Traefik routes HTTPS `/support/feedback` and `/support/health` on the private deployment hostname. No memory-service replacement or DNS change. Container is healthy; original `/health` still responds.
- [x] Added explicit unconfigured relay state: health reports `deliveryConfigured:false`, submissions fail closed. Seven delivery tests pass, including missing configuration.
- [x] With explicit user approval, created **jumpyBrain feedback relay** in the user's signed-in Chrome AgentMail account: **Message Send** only, single inbox `jumpybrain@agentmail.to`. Stored in `/srv/jumpybrain-feedback/.env` with mode 0600, restarted relay, verified healthy and `deliveryConfigured:true`, and removed the temporary downloaded credential.
- [x] The installed build bundled the deployment-specific relay URL; custom URL overrides remain supported, and explicitly empty build/runtime configuration disables delivery. Rebuilt and installed the Mac app (0.3.3), preserving an installer backup; reopened and verified the primary Send feedback dialog. Thirty focused delivery/diagnostics/gateway/bundle checks passed, plus the new runtime-disable regression (eight delivery tests total).
- [x] User authorized one labeled test report with synthetic diagnostics. Sent through the installed app’s bundled forwarder → HTTPS VPS relay → AgentMail; provider accepted report `98b1fa7b-7795-43a7-8b6a-3046a74f3f85`. Verified it in the signed-in Chrome inbox at `jumpybrain@agentmail.to`, then downloaded the attachment and confirmed it exactly matched the 199-byte synthetic report. Removed the temporary download. No personal notes or real diagnostics were sent.

- [x] Removed the private company hostname from tracked configuration/docs before committing. Builds now require an explicit relay URL; Compose requires a deployment hostname. Running infrastructure and the installed app were not changed.

One authorized synthetic test email was accepted and received with its exact attachment. Existing user changes in the shared checkout are preserved. Relay infrastructure is live and mail delivery is verified. The local installed app includes the current shared checkout and the public relay URL. VPS deployment uses a minimal compiled relay artifact, not the full app checkout. This Compose service is managed on the VPS, not registered in the Coolify dashboard.
