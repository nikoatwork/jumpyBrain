import { listCanonicalMemoryMarkdownFiles, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";

export interface RemoteMemoryRecentNote {
  id: string;
  title: string;
  file: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface RemoteMemoryRecentPacket {
  memory: "all";
  target: "remote";
  root: "remote:all";
  notes: RemoteMemoryRecentNote[];
}

/** Fresh, editor-openable canonical documents; no index or filesystem recency state. */
export async function recentServerMemory(options: { root: string }): Promise<RemoteMemoryRecentPacket> {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  // Like document GET/PUT, use the memory root, not the retrieval-only indexRoot.
  const candidates: { note: RemoteMemoryRecentNote; timestamp: number }[] = [];
  const counts = new Map<string, number>();
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
    const document = await readMarkdownDocument(root, file);
    const metadata = document.frontmatter;
    if (!isValidMemoryDocumentId(metadata.id)) continue;
    counts.set(metadata.id, (counts.get(metadata.id) ?? 0) + 1);
    // Count even hidden matches: the editor lookup would reject their duplicate IDs.
    if (document.relativePath.split("/").some((part) => part.startsWith("."))) continue;
    const updatedAt = firstValidDate(metadata.updated_at, metadata.updatedAt);
    const createdAt = firstValidDate(metadata.created_at, metadata.createdAt, metadata.date);
    const date = updatedAt ?? createdAt;
    candidates.push({
      note: {
        id: metadata.id,
        title: typeof metadata.title === "string" ? metadata.title : "",
        file: document.relativePath,
        ...(updatedAt ? { updatedAt } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      timestamp: date ? Date.parse(date) : Number.NEGATIVE_INFINITY,
    });
  }
  const notes = candidates
    .filter(({ note }) => counts.get(note.id) === 1)
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? -1 : 1;
      return a.note.file < b.note.file ? -1 : a.note.file > b.note.file ? 1 : 0;
    })
    .slice(0, 8)
    .map(({ note }) => note);
  return { memory: "all", target: "remote", root: "remote:all", notes };
}

/** ISO calendar dates or timezone-explicit timestamps; reject calendar rollover. */
function firstValidDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
    if (!match || value.startsWith("0000-")) continue;
    const day = Date.parse(`${match[1]}T00:00:00.000Z`);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) continue;
    if (Number.isFinite(Date.parse(value))) return value;
  }
  return undefined;
}
