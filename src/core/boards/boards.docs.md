# Canonical board files

## Responsibilities

Own strict version-1 board JSON and `boards/<UUID>.json` persistence at the canonical memory root, independent of retrieval `indexRoot`. Each file holds identity, name, archived state and three ordered columns of unique note IDs. Notes may belong to multiple boards. Limits are 100 boards/root, 100 cards/column, 100-character names, 64 KiB/file.

Reads never create directories or state. Reject corrupt/unknown schemas, ID/filename mismatch, links and nonregular/oversized files; never reset data. Writes share an exclusive `boards/.write.lock` across cooperating processes. Updates/deletes require a hash of prior exact file bytes. Publication fsyncs a private temporary file and atomically renames; creation rechecks ID absence under the same lock before atomic rename. Locks/temporary files are removed on handled failures. A crash may leave a lock requiring operator inspection after proving no writer remains.

## Non-responsibilities

No indexing, note-content writes, app support, database or migration from old collections. Boards are canonical organization, not derived memory state. No hostile-filesystem snapshot/CAS guarantee: external writers ignoring locks can still race publication; multi-board reads and separate note reads are not transactions. Root aliases resolve like ordinary canonical roots; board directories/files must not be symlinks.
