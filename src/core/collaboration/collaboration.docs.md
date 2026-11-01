# Collaboration source policy

## Responsibilities

Own bounded source-splice rebasing, read revisions/epochs, operation identities, per-actor undo and sequenced streams. Validate UTF-16 boundaries and well-formed text. Independent operations rebase; ambiguous replacements reject rather than guessing. Snapshot history is bounded by both operation count and retained UTF-8 bytes. A fork supports publication transactions without changing the accepted model before disk success.

## Non-responsibilities

No filesystem, transport, authentication, runtime or app imports. This model never defines Saved; the app owns canonical publication.
