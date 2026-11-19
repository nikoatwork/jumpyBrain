import { hashMemoryDocumentContent, listCanonicalMemoryFolders, listCanonicalMemoryMarkdownFiles, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { firstAttentionDate } from "../../core/attention.js";
import { readFile, stat } from "node:fs/promises";
import { exactMarkdownBody } from "../../core/frontmatter.js";

export interface MemoryExplorerFile {
  /** Null when an absent, invalid or duplicated canonical ID prevents opening. */
  id: string | null;
  file: string;
  title?: string;
  /** Declared `updated_at`; filesystem mtime only when no edit/creation date is declared. Presentation-only. */
  updatedAt?: string;
  /** Declared `created_at`/legacy `createdAt`; never inferred from the filesystem. */
  createdAt?: string;
  /** With `hashes`: sha256 over the exact file bytes, as `show` reports it. */
  contentHash?: string;
  /** With `hashes`: sha256 over the exact body after the frontmatter. */
  bodyHash?: string;
  /** With `hashes`: declared `updated_at`, else declared creation date; never file mtime (unreliable across machines and checkouts). */
  editedAt?: string;
}

export interface MemoryExplorerPacket { files: MemoryExplorerFile[]; folders?: string[] }

/** Complete canonical metadata listing, independent of retrieval indexes and attention. */
export async function listServerMemoryFiles(options: { root: string; signal?: AbortSignal; includeFolders?: boolean; hashes?: boolean }): Promise<MemoryExplorerPacket> {
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
    const createdAt = firstAttentionDate(metadata.created_at, metadata.createdAt);
    let updatedAt = firstAttentionDate(metadata.updated_at, metadata.updatedAt);
    // Plain Markdown dropped into the brain has no declared dates; mtime is its only edit signal.
    if (!updatedAt && !createdAt) updatedAt = await stat(absolutePath).then(info => info.mtime.toISOString(), () => undefined);
    let hashes: { contentHash: string; bodyHash: string; editedAt?: string } | undefined;
    const declaredEdit = firstAttentionDate(metadata.updated_at, metadata.updatedAt) ?? createdAt;
    if (options.hashes) {
      const bytes = await readFile(absolutePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
        throw error;
      });
      if (!bytes) continue;
      hashes = { contentHash: hashMemoryDocumentContent(bytes), bodyHash: hashMemoryDocumentContent(exactMarkdownBody(bytes.toString("utf8"))), ...(declaredEdit ? { editedAt: declaredEdit } : {}) };
    }
    files.push({ id, file: document.relativePath,
      ...(typeof metadata.title === "string" ? { title: metadata.title } : {}),
      ...(updatedAt ? { updatedAt } : {}), ...(createdAt ? { createdAt } : {}), ...hashes });
  }
  for (const file of files) if (file.id && counts.get(file.id) !== 1) file.id = null;
  files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return { files, ...(options.includeFolders ? { folders: await listCanonicalMemoryFolders(root, signal) } : {}) };
}
