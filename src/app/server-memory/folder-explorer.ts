import { listCanonicalMemoryFolders, listCanonicalMemoryMarkdownFiles, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";

export interface MemoryExplorerFile {
  /** Null when an absent, invalid or duplicated canonical ID prevents opening. */
  id: string | null;
  file: string;
  title?: string;
}

export interface MemoryExplorerPacket { files: MemoryExplorerFile[]; folders?: string[] }

/** Complete canonical metadata listing, independent of retrieval indexes and attention. */
export async function listServerMemoryFiles(options: { root: string; signal?: AbortSignal; includeFolders?: boolean }): Promise<MemoryExplorerPacket> {
  const { signal } = options;
  signal?.throwIfAborted();
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  const files: MemoryExplorerFile[] = [];
  const counts = new Map<string, number>();
  // Use the editor's canonical buckets, never a configured retrieval-only indexRoot.
  for (const absolutePath of await listCanonicalMemoryMarkdownFiles(root, signal)) {
    const document = await readMarkdownDocument(root, absolutePath, signal).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    });
    if (!document) continue;
    const metadata = document.frontmatter;
    const id = isValidMemoryDocumentId(metadata.id) ? metadata.id : null;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    // Hidden duplicates still affect editor lookup, but hidden files are not navigation rows.
    if (document.relativePath.split("/").some(part => part.startsWith("."))) continue;
    files.push({ id, file: document.relativePath,
      ...(typeof metadata.title === "string" ? { title: metadata.title } : {}) });
  }
  for (const file of files) if (file.id && counts.get(file.id) !== 1) file.id = null;
  files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return { files, ...(options.includeFolders ? { folders: await listCanonicalMemoryFolders(root, signal) } : {}) };
}
