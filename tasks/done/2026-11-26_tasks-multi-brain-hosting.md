# Add a second hosted brain

## Goal

Add and remove an independent brain on an existing VPS while the original origin remains available. This slice works with current clients using explicit URLs.

[Architecture and rollout overview](2026-11-26_tasks-multi-brain.md).

## Tasks

- [x] Extend the supported deployment recipe with a repeatable per-brain service definition and an example for two brains behind one HTTPS proxy. Give each instance a canonical root, private listener, key, and hostname. Document the existing Coolify equivalent and per-root backup and restart procedures.
- [x] Run the add and rollback drill with real proxy routing, HTTP and WebSockets. Verify that the original origin remains reachable when the second service starts, fails, and stops. Check cross-key denial and authenticated HTTPS and WebSockets on both origins. Exercise browser sign-in, invite, shared-note links and revocation on the disposable origin.
- [x] Measure idle and overlapping search/index load on a representative VPS. Record the tested setup and resource limits per brain.

## Completion gate

Use the deployed release and disposable resources. Verify the real HTTPS proxy, backend lifecycle, browser sign-in and live WebSocket protocol, isolation, cleanup and bounded resource use before archiving. Treat public DNS and trust infrastructure as separate from adding the service.

## Outcome and verification

- Added repeatable per-brain recipes for [native systemd deployments](../../docs/vps-deploy.md#10-run-another-brain-on-the-same-vps) and [Coolify](../../docs/coolify-deploy.md#add-another-brain-on-the-same-server). Both use existing released clients and one service per root. The added brain has a dedicated root, credentials, listener or container network, hostname, and backup lifecycle.
- Tested v0.3.29, Node 22.23.1, and the existing Traefik proxy on the shared Linux VPS. Started a disposable, resource-limited systemd service using the installed release, a private root and a new key. The test hostname resolved to the VPS and used a short-lived certificate explicitly trusted by the test client. A temporary firewall rule admitted only the existing proxy on the test port. The original service, root and proxy route stayed in use.
- Both origins passed authenticated HTTPS and WSS hello. Each key was rejected by the other brain, and only the disposable brain returned its test note. The new origin passed WSS note open, Secure browser sessions, a shared-note URL and authenticated read, single-use invite redemption, and immediate revocation. Original-brain checks used read-only operations.
- Ran CLI index and recall concurrently on the disposable brain alongside strict read-only search on the original. The new service was about 32 MiB at idle and reached about 67 MiB peak under the small lexical workload, under a 768 MiB and 75% CPU quota. Post-index recall found the marker. This measures one small lexical workload on a roughly 4 GiB host. It does not size semantic indexes or larger corpora.
- Forced the disposable service to exit, observed the isolated proxy failure, restarted it against the same root and recalled the persisted marker. Then stopped it gracefully and removed its route, which returned 404. Verified removal of the service, root, temporary files, certificate, firewall rule and listener. The original PID, existing proxy file checksum and HTTPS health were unchanged.
- Verified the documented service template with `systemd-analyze verify` on Linux. The live drill used a transient systemd service and Traefik, rather than installing the permanent template and nginx. The Chromium server-role smoke passed on disposable fixtures. Coolify UI deployment, public CA issuance for a new hostname, and the optional original-owner handoff were outside this gate.
