# Collaboration source policy

## Responsibilities

Own bounded source-splice rebasing, read revisions/epochs, operation identities, per-actor undo and sequenced streams. Validate UTF-16 boundaries and well-formed text. Independent operations rebase; ambiguous replacements reject rather than guessing. Snapshot history is bounded by both operation count and retained UTF-8 bytes. A fork supports publication transactions without changing the accepted model before disk success.

## Non-responsibilities

No filesystem, transport, authentication, runtime or app imports. This model never defines Saved; the app owns canonical publication.

## Granular source transactions

`sourceDifferences` computes exact ascending codepoint-safe splices whose coordinates all refer to the same base text. `applySourceSplices` applies them from right to left; `rebaseSourceSplices` transforms them across a peer transaction and rejects genuine range overlap. Alignment is bounded by source bytes, 256 splices, edit distance 2,048, 16 million work steps and 4.5 million trace cells. Budget failure is explicit `diff_limit`; ordinary live reconciliation never falls back to a broad replacement across unchanged regions. The legacy single-envelope helper remains available only where the caller explicitly needs that envelope.

`SourceModel.applyBatch` validates every splice before committing one revision, receipt and undo unit. A rejected range or failed application leaves the model unchanged. The application forks this state and publishes its complete candidate source once before acknowledging. Request identities cover canonical ordered splice tuples, independent of object-property order.

## Selective history and positions

Undo/Redo stores causal inverse references. Rebase cancels only proven original/inverse pairs and commutes intervening independent operations; text equality and shared actor identity do not justify skipping edits. Selective inverses split removal around later inserted peer text and honor peer deletions. Redo restores only the surviving owned fragments that were actually undone. A later replacement or retired source whose ownership cannot be proven is rejected for explicit review rather than erasing peer content or resurrecting retired text. Logical inverses with no byte change still advance the session revision so their causal history remains explicit.

If an intervening inverse has lost its original operation at the retention boundary, Undo/Redo returns `history_expired` before mutation. A still-retained deletion receipt alone cannot prove that its removed text remains eligible for restoration.

`transformPosition` validates its retained read revision and UTF-16 boundary, projects through the same transaction history, supports left/right insertion bias, and rejects deleted interiors. Presence and stream consumers can invalidate an anchor rather than paint or write at an unrelated location. History, inverse proof work and splice counts remain bounded.
