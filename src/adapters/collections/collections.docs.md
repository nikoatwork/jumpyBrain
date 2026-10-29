# Collection persistence

## Responsibilities

One desktop gateway owns `<support>/collections.json`, version 1, outside the Markdown vault and caches. Scope keys contain profile identity, kind and destination. Reads reject unsupported/corrupt data; they never reset it. Writes validate the full scope snapshot, serialize within the host, check revision, fsync a private temporary file and atomically rename. A stale save returns a conflict. Profiles sharing a destination still have independent organization. Restart and app upgrades preserve this file.

## Non-responsibilities

No multi-process writer coordination, synchronization, migration from notes, index rebuild or implicit recreation. Back up application support to preserve boards; copying a vault alone does not carry them. The normal singleton gateway supplies authentication and generation admission.
