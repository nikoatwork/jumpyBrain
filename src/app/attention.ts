import { firstAttentionDate, resolveMemoryAttention, validateMemoryAttentionAction } from "../core/attention.js";
import { listCanonicalMemoryMarkdownFiles, MemoryDocumentLookupError, patchCanonicalMemoryDocumentAttention, readCanonicalMarkdownSnapshot, readMarkdownDocument, readMarkdownPrefix, resolveMemoryRoot } from "../core/canonical/index.js";
import { attributionHash, normalizeMemoryActor } from "../core/contribution.js";
import { isValidMemoryDocumentId } from "../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../core/memory-root/index.js";
import { readablePreview } from "../core/readable-preview.js";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";

/** Bounded, disposable digest cache. A stat change always rereads canonical bytes. */
export function createSettledRevisionReader(readSnapshot = readCanonicalMarkdownSnapshot, capacity = 1024) {
  const cache = new Map<string, { signature: string; revision: string }>();
  const signature = (stat: Awaited<ReturnType<typeof fileStat>>) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  const fileStat = (file: string) => lstat(file, { bigint: true });
  return async (root: string, file: string) => {
    try {
      const before = await fileStat(file);
      if (!before.isFile()) throw new Error("Not a regular canonical file");
      const key = signature(before), cached = cache.get(file);
      if (cached?.signature === key) { cache.delete(file); cache.set(file, cached); return { revision: cached.revision }; }
      const document = await readSnapshot(root, file);
      if (signature(await fileStat(file)) !== key) throw new Error("Canonical file changed during attention read");
      const revision = attributionHash(document.content);
      cache.delete(file); cache.set(file, { signature: key, revision });
      if (cache.size > capacity) cache.delete(cache.keys().next().value!);
      return { revision, document };
    } catch {
      // A collaborator may be writing/removing this file. Preserve its last
      // metadata classification this cycle; do not blank the entire sidebar.
      cache.delete(file); return undefined;
    }
  };
}
const settledRevision = createSettledRevisionReader();

import type { MemoryActor, MemoryAttentionNote, MemoryAttentionPacket } from "../types.js";
export type { MemoryAttentionNote, MemoryAttentionPacket } from "../types.js";

async function sourceVersion(file: string): Promise<string | undefined> {
  try {
    const stat = await lstat(file, { bigint: true });
    if (!stat.isFile()) return undefined;
    return createHash("sha256").update([stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":" )).digest("hex");
  } catch { return undefined; }
}

export const ATTENTION_PREVIEW_CHARACTERS = 160;
const PREVIEW_SOURCE_BYTES = 16384;
/** Bounded, disposable display-text cache keyed by the note's stat-derived source version.
 * A changed, unstable or unreadable file is reread; nothing here is canonical. */
export function createAttentionPreviewReader(readPrefix = readMarkdownPrefix, capacity = 1024) {
  const cache = new Map<string, { version: string; preview: string }>();
  return async (file: string, title: string, version: string | undefined) => {
    const cached = cache.get(file);
    if (version && cached?.version === version) { cache.delete(file); cache.set(file, cached); return cached.preview; }
    cache.delete(file);
    try {
      const preview = readablePreview(await readPrefix(file, PREVIEW_SOURCE_BYTES), title, ATTENTION_PREVIEW_CHARACTERS);
      if (version && await sourceVersion(file) === version) {
        cache.set(file, { version, preview });
        if (cache.size > capacity) cache.delete(cache.keys().next().value!);
      }
      return preview;
    } catch { return ""; }
  };
}
const attentionPreview = createAttentionPreviewReader();

/** Fresh corpus scan; settled fingerprints require bodies. Bounds output, not input work.
 * `previews` adds capped display text for the emitted notes only (at most 200 bounded prefix reads
 * on a cold cache, none while files are unchanged). */
export async function listMemoryAttention(rootArg: string, options: { now?: number; previews?: boolean } = {}): Promise<MemoryAttentionPacket> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const now = options.now ?? Date.now();
  const counts = new Map<string, number>();
  const candidates: { absolutePath: string; note: MemoryAttentionNote; state: ReturnType<typeof resolveMemoryAttention> }[] = [];
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
    const beforeVersion = await sourceVersion(file);
    let document = await readMarkdownDocument(root, file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    });
    if (!document) continue;
    let revision: string | undefined;
    if (document.frontmatter.attention_at === null && typeof document.frontmatter.attention_settled_hash === "string") {
      const result = await settledRevision(root, file);
      if (result?.document) document = result.document;
      revision = result?.revision;
    }
    const version = beforeVersion && await sourceVersion(file) === beforeVersion ? beforeVersion : undefined;
    const metadata = document.frontmatter;
    let creator: MemoryActor | undefined;
    try { creator = normalizeMemoryActor({ kind: metadata.creator_kind,
      ...(metadata.creator_id ? { id: metadata.creator_id } : {}),
      ...(metadata.creator_name ? { name: metadata.creator_name } : {}) }); } catch {}

    if (!isValidMemoryDocumentId(metadata.id)) continue;
    counts.set(metadata.id, (counts.get(metadata.id) ?? 0) + 1);
    if (document.relativePath.split("/").some(part => part.startsWith("."))) continue;
    const updatedAt = firstAttentionDate(metadata.updated_at, metadata.updatedAt);
    const createdAt = firstAttentionDate(metadata.created_at, metadata.createdAt);
    const state = resolveMemoryAttention(metadata, now, revision);
    candidates.push({ absolutePath: file, note: { id: metadata.id, title: typeof metadata.title === "string" ? metadata.title : "", file: document.relativePath,
      ...(version ? { sourceVersion: version } : {}), ...(creator ? { creator } : {}), ...(updatedAt ? { updatedAt } : {}), ...(createdAt ? { createdAt } : {}),
      ...(state.attentionAt ? { attentionAt: state.attentionAt } : {}) }, state });
  }
  const eligible = candidates.filter(({ note }) => counts.get(note.id) === 1);
  const snoozed = eligible.filter(({ state }) => state.state === "snoozed");
  const nextWakeAt = snoozed.map(({ state }) => state.attentionAt!).sort((a,b) => Date.parse(a) - Date.parse(b))[0];
  const active = eligible.filter(({ state }) => state.state === "active").sort((a,b) => {
    const left = a.state.attentionAt ? Date.parse(a.state.attentionAt) : Number.NEGATIVE_INFINITY;
    const right = b.state.attentionAt ? Date.parse(b.state.attentionAt) : Number.NEGATIVE_INFINITY;
    return left !== right ? (left > right ? -1 : 1) : a.note.file < b.note.file ? -1 : a.note.file > b.note.file ? 1 : 0;
  });
  const settled = eligible.filter(({ state }) => state.state === "settled").sort((a, b) => {
    const left = Date.parse(a.note.updatedAt ?? a.note.createdAt ?? "") || 0;
    const right = Date.parse(b.note.updatedAt ?? b.note.createdAt ?? "") || 0;
    return right - left || (a.note.file < b.note.file ? -1 : a.note.file > b.note.file ? 1 : 0);
  });
  const warnings = active.slice(0, 100).filter(({ state }) => state.invalid).map(({ note }) => ({ code: "invalid_attention_at" as const, id: note.id }));
  const emit = async (rows: typeof candidates) => {
    const notes: MemoryAttentionNote[] = [];
    for (const { note, absolutePath } of rows.slice(0, 100)) notes.push(options.previews
      ? { ...note, preview: await attentionPreview(absolutePath, note.title, note.sourceVersion) } : note);
    return notes;
  };
  return { notes: await emit(active),
    settled: await emit(settled), total: active.length, settledTotal: settled.length,
    ...(nextWakeAt ? { nextWakeAt } : {}), ...(warnings.length ? { warnings } : {}) };
}

export async function patchMemoryDocumentAttention(rootArg: string, id: string, options: { ifMatch: string; mutation: unknown; now?: number }) {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const mutation = validateMemoryAttentionAction(options.mutation, options.now ?? Date.now());
  if (!mutation) throw new MemoryDocumentLookupError("validation_failed", "Use settle, reactivate, or snooze with a future timezone-explicit until timestamp.");
  const packet = await patchCanonicalMemoryDocumentAttention(root, id, { ifMatch: options.ifMatch, mutation });
  return { ...packet, indexed: false as const, indexing: { status: "pending" as const } };
}
