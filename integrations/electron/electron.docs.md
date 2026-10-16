# Electron prototype boundary

## Responsibilities

- `diagnostics.mjs` reuses the installed runtime schema/store in the main process. Persist private bounded lifecycle history in Electron user data: bootstrap, renderer termination/unresponsive/load failures, and wrapper/runtime/editor build mismatches. Publish at most 64 safe events to the authenticated loopback companion capability; no renderer bridge, raw exception/URL capture, crash dump, or remote telemetry. Prior-session host records survive normal restarts; exports remap correlation. Missing/old runtime modules disable collection gracefully. Missing-runtime discovery and abrupt main-process death can leave final evidence unavailable. Bounded shutdown flushing preserves existing draft-close guards.
- `host.mjs` discovers the installed native companion, validates private control-key storage, and probes authenticated gateway state. Only a refused connection permits background launch of that installed app; no shell, arbitrary URL, process adoption, restart, or shutdown is used.
- `window.mjs` hosts exactly the existing companion shell in an isolated, sandboxed Chromium renderer. Reuse the gateway's existing fragment-to-HttpOnly-cookie handshake. No frontend copy, injected styling, preload bridge, renderer Node, or remote credential reads.
- Feedback is the shared browser dialog. Allow only fixed-recipient `mailto:jumpybrain@agentmail.to` handoff with the fixed feedback subject and body fields, and same-origin blob downloads named `jumpybrain-feedback.eml`, MIME `message/rfc822`, up to 64 KiB, through the native save dialog. Other external navigation/downloads remain denied. Remove the session download listener when its window is destroyed so reopening works. No automatic email delivery or file opening.
- `main.mjs` owns single-instance desktop/window lifecycle and separate user data. Native menus use existing in-page guarded actions. `beforeunload` remains the authority for pending drafts; the default native choice preserves the window.
- `install.mjs` packages a separately named local app for the current Mac architecture. Dependencies and lockfile are isolated here, outside the CLI's dependency graph. The packaged app excludes installers, smoke entrypoint, documentation, and development dependencies.
- Test-only `smoke-app.mjs` runs the production window against disposable configuration supplied by `scripts/electron-smoke.mjs`; production entrypoints never import it or consume its fixture environment variable.

## Non-responsibilities

No server ownership, native companion replacement, Keychain implementation, canonical memory/index policy, CLI target changes, remote write approval, syncing, runtime installation/update, signing for distribution, public releases, crash-persistent drafts, or external browser embedding. The installed runtime owns the UI version and all memory behavior.
