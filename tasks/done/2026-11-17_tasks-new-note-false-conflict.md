# Stop false conflicts when cutting the first line of a new note

Priority: P1. Completed in source on 2026-11-17. Pending release.

## Evidence

- [Nov 17 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=d8413d31-aa7a-41e4-9189-adeb9a9c944f) (Mac app, diagnostics attached): deleting the first line of a new note still gives a conflict. Nobody else edited it. The word "still" suggests an earlier fix did not cover this path.
- Related earlier work: [single-user recovery settlement](../done/2026-11-10_tasks-single-user-recovery-settlement.md), [seamless live co-editing](../done/2026-11-10_tasks-seamless-live-coediting.md), [idle session recovery](../done/2026-11-12_tasks-idle-session-recovery.md).
- The attachment reports Mac app v0.3.25, build `756ca2369761cc07`. Several saves succeeded immediately before a browser save reported `unproven_input` at 16:18:09.418 UTC and `conflict` one millisecond later. This points to the editor’s source-range proof path. The attachment does not identify the exact keyboard gesture.

## Reproduction and verification

- Tested the patch against `950fd6a` using the production editor in disposable Chromium against a real local backend. Cutting the visible starter heading with its trailing separator exercised the same `unproven_input` → `conflict` path as the attachment.
- Lexical handles the cut without the editor’s usual `beforeinput` capture. The editor now records the selection before Lexical processes the cut and verifies the resulting splice using the existing positional proof.
- Review reran the fresh-note smoke at 1280px and 390px and confirmed the cut saved to canonical Markdown. Removing the file externally still raised a conflict and retained subsequent unsaved typing. All 40 focused editor source-map, Markdown and collaboration tests passed.
- The attachment does not identify the original keystroke. The packaged Mac app was unavailable on the Linux verification host.
- `ux-update-feedback-smoke.mjs` passed at both widths, including title, body, Undo and external updates. `collaboration-overlap-smoke.mjs` passed two-writer deletion, replacement, reconnect and rename scenarios.
- The supplementary `collaboration-editor-smoke.mjs` stopped in the structural peer-cursor layout checks on both the baseline and patched source. The baseline failed the scrolled-panel cursor check and the patch runs failed earlier visibility checks in the same structural proof. No cut occurs in that proof.
- On the unpatched build, triple-clicking the starter heading and pressing Ctrl+X produced the message “This input could not be mapped to its actual source range.” On the rebuilt patch the same regression passed at both widths. The exploratory keyboard checks also covered cuts with typed content, cut/paste, word deletion, line deletion and forward deletion.
