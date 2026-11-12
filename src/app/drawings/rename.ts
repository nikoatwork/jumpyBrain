import { readFile } from 'node:fs/promises';
import { listCanonicalMemoryMarkdownFiles, readCanonicalMemoryDocumentById, readMarkdownDocument, replaceCanonicalMemoryDocumentById, resolveMemoryRoot } from '../../core/canonical/index.js';
import { isValidMemoryDocumentId } from '../../core/document-id.js';
import { renameDrawingFile } from '../../core/drawings/store.js';
import { rewriteDrawingMentions } from '../../core/drawings/mentions.js';
import type { DrawingRecord } from '../../core/drawings/model.js';

export type DrawingMentionNote = { id: string; title: string };
export type DrawingMentionFailure = DrawingMentionNote & { code: string };
export type DrawingRenameResult = DrawingRecord & { mentions: { updated: DrawingMentionNote[]; failed: DrawingMentionFailure[] } };
export type DrawingMentionHooks = {
  /** Settle live editing before a note write; throwing skips that note. Called inside the host write queue. */
  beforeNoteWrite?(id: string): Promise<void>;
  afterNoteWrite?(id: string): Promise<void>;
};

const title = (value: unknown) => typeof value === 'string' ? value : '';

/**
 * Rename a drawing file, then rewrite `[[Old.excalidraw]]` mentions in notes.
 * The file rename is authoritative; each note is a separate hash-checked publication,
 * so a note that cannot be written is reported instead of rolling the rename back.
 */
export async function renameDrawingAndMentions(options: { root: string; name: string; nextName: string; ifMatch: string } & DrawingMentionHooks): Promise<DrawingRenameResult> {
  const record = await renameDrawingFile(options.root, options.name, options.nextName, options.ifMatch);
  const mentions: DrawingRenameResult['mentions'] = { updated: [], failed: [] };
  if (options.name === record.name) return { ...record, mentions };
  const root = await resolveMemoryRoot(options.root);
  // Unique, visible editor IDs only, matching what the editor can open.
  const candidates = new Map<string, number>();
  const visible = new Map<string, string>();
  for (const absolutePath of await listCanonicalMemoryMarkdownFiles(root)) {
    const document = await readMarkdownDocument(root, absolutePath).catch(() => null);
    const id = document?.frontmatter.id;
    if (!document || !isValidMemoryDocumentId(id)) continue;
    candidates.set(id, (candidates.get(id) ?? 0) + 1);
    if (document.relativePath.split('/').some(part => part.startsWith('.'))) continue;
    const content = await readFile(absolutePath, 'utf8').catch(() => '');
    if (rewriteDrawingMentions(content, options.name, record.name).count) visible.set(id, title(document.frontmatter.title));
  }
  for (const [id, scannedTitle] of [...visible].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (candidates.get(id) !== 1) continue;
    let noteTitle = scannedTitle;
    try {
      await options.beforeNoteWrite?.(id);
      // Re-read after live edits settle; the write queue holds other writers off.
      const current = await readCanonicalMemoryDocumentById(root, id);
      noteTitle = title(current.title) || noteTitle;
      const rewritten = rewriteDrawingMentions(current.content, options.name, record.name);
      if (!rewritten.count) continue;
      await replaceCanonicalMemoryDocumentById(root, id, rewritten.content, { ifMatch: current.contentHash });
      mentions.updated.push({ id, title: noteTitle });
      await options.afterNoteWrite?.(id).catch(() => {});
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      mentions.failed.push({ id, title: noteTitle, code: typeof code === 'string' ? code : 'mention_update_failed' });
    }
  }
  return { ...record, mentions };
}
