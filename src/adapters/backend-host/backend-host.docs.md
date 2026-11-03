# Backend process registry

## Responsibilities

Own private local descriptor/lease files, canonical root identity, process launch and readiness verification. Publish a fully written/fsynced lease candidate through an exclusive hard link, avoiding an empty lock window. Reap a confirmed dead generation under a generation-specific recovery guard. Release only this process's exact instance after its work drains.

Descriptors contain a local administrative capability and require private file permissions. Root aliases resolve to one identity. The endpoint must be loopback with no redirect/query/userinfo; its authenticated response must match every registered ownership field.

## Non-responsibilities

Optional detached-only readiness accepts only the known daemon identity fields.
Legacy foreground `serve` readiness includes its lease's `startedAt`; that and
unknown extra fields refuse automatic desktop handoff, preserving configured
listen ports and bootstrap policy. This is a conservative legacy shape check,
not a new ownership protocol or proof from an executable filename.

No note writes, authentication role policy, GUI or CLI parsing. The registry does not secure against malicious code running as the filesystem owner. Unknown/corrupt state fails closed. A process killed inside dead-generation cleanup before unlink can leave a recovery guard requiring explicit inspection; no competitor is started through that uncertainty.

`runtime-pins.ts` publishes a private per-instance PID/root pin before readiness,
with retirement checks on both sides. Ordinary runtimes use retention protocol 1
inside the runtime; their pins travel with a directory exchange. The exact
`*.app/Contents/Resources/runtime` layout instead uses
`~/.jumpybrain-runtime-pins/<device>-<inode>/{.backend-pins,.retiring}` so startup
and retirement previews preserve signed resources. State directories must be
private, owned and not symbolic links. The `BUNDLE_PIN_PROTOCOL = 1` capability in the compiled module
lets the Python updater recognize this layout; older/unknown bundles remain
retained, as do live legacy in-bundle pins. No registry-wide scan is needed.
Bundle moves preserve the generation and its external pins. Small generation
records remain outside staging cleanup; unknown state requires explicit inspection.
Pins are conservatively live until PID exit (including PID reuse).
Startup captures the runtime directory's device/inode generation with its
executable identity, rejects a changed generation before pinning/serving, and
rechecks both generation and published pin identity before readiness. Detached
launch also carries its caller's expected generation. Publication from a stale
path fails instead of pinning a replacement runtime; existing pinned owners may
continue from a moved generation until they drain.
They contain no capability. Unknown/oversized pin sets block automatic retirement;
there is no process-name scan. Foreground and detached owners both participate.
