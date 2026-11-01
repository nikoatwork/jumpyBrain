# Backend process registry

## Responsibilities

Own private local descriptor/lease files, canonical root identity, process launch and readiness verification. Publish a fully written/fsynced lease candidate through an exclusive hard link, avoiding an empty lock window. Reap a confirmed dead generation under a generation-specific recovery guard. Release only this process's exact instance after its work drains.

Descriptors contain a local administrative capability and require private file permissions. Root aliases resolve to one identity. The endpoint must be loopback with no redirect/query/userinfo; its authenticated response must match every registered ownership field.

## Non-responsibilities

No note writes, authentication role policy, GUI or CLI parsing. The registry does not secure against malicious code running as the filesystem owner. Unknown/corrupt state fails closed. A process killed inside dead-generation cleanup before unlink can leave a recovery guard requiring explicit inspection; no competitor is started through that uncertainty.
