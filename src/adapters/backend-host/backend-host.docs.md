# Backend process registry

## Responsibilities

Own private local descriptor/lease files, canonical root identity, process launch and readiness verification. Publish a fully written/fsynced lease candidate through an exclusive hard link, avoiding an empty lock window. Reap a confirmed dead generation under a generation-specific recovery guard. Release only this process's exact instance after its work drains.

Descriptors contain a local administrative capability and require private file permissions. Root aliases resolve to one identity. The endpoint must be loopback with no redirect/query/userinfo; its authenticated response must match every registered ownership field.

## Non-responsibilities

No note writes, authentication role policy, GUI or CLI parsing. The registry does not secure against malicious code running as the filesystem owner. Unknown/corrupt state fails closed. A process killed inside dead-generation cleanup before unlink can leave a recovery guard requiring explicit inspection; no competitor is started through that uncertainty.

`runtime-pins.ts` is retention protocol 1: publish a private per-instance PID/root
pin before readiness, with retirement checks on both sides. Pins travel with a
swapped runtime and are conservatively live until PID exit (including PID reuse).
Startup captures the runtime directory's device/inode generation with its
executable identity, rejects a changed generation before pinning/serving, and
rechecks both generation and published pin identity before readiness. Detached
launch also carries its caller's expected generation. Publication from a stale
path fails instead of pinning a replacement runtime; existing pinned owners may
continue from a moved generation until they drain.
They contain no capability. Unknown/oversized pin sets block automatic retirement;
there is no process-name scan. Foreground and detached owners both participate.
