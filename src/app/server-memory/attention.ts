import { firstAttentionDate, resolveMemoryAttention, validateMemoryAttentionAction } from "../../core/attention.js";
import { listCanonicalMemoryMarkdownFiles, MemoryDocumentLookupError, patchCanonicalMemoryDocumentAttention, readCanonicalMarkdownSnapshot, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { attributionHash } from "../../core/contribution.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import type { RemoteMemoryRecentNote } from "./recent.js";
import { markRemoteIndexStale } from "./state.js";
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

export interface RemoteMemoryAttentionNote extends RemoteMemoryRecentNote { attentionAt?: string }
export interface RemoteMemoryAttentionPacket {
  memory: "all"; target: "remote"; root: "remote:all";
  notes: RemoteMemoryAttentionNote[];
  settled: RemoteMemoryAttentionNote[];
  total: number;
  settledTotal: number;
  nextWakeAt?: string;
  warnings?: { code: "invalid_attention_at"; id: string }[];
}

/** Fresh corpus scan; settled fingerprints require bodies. Bounds output, not input work. */
export async function attentionServerMemory(options: { root: string; now?: number }): Promise<RemoteMemoryAttentionPacket> {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  const now = options.now ?? Date.now();
  const counts = new Map<string, number>();
  const candidates: { note: RemoteMemoryAttentionNote; state: ReturnType<typeof resolveMemoryAttention> }[] = [];
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
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
    const metadata = document.frontmatter;
    if (!isValidMemoryDocumentId(metadata.id)) continue;
    counts.set(metadata.id, (counts.get(metadata.id) ?? 0) + 1);
    if (document.relativePath.split("/").some(part => part.startsWith("."))) continue;
    const updatedAt = firstAttentionDate(metadata.updated_at, metadata.updatedAt);
    const createdAt = firstAttentionDate(metadata.created_at, metadata.createdAt);
    const state = resolveMemoryAttention(metadata, now, revision);
    candidates.push({ note: { id: metadata.id, title: typeof metadata.title === "string" ? metadata.title : "", file: document.relativePath,
      ...(updatedAt ? { updatedAt } : {}), ...(createdAt ? { createdAt } : {}),
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
  return { memory: "all", target: "remote", root: "remote:all", notes: active.slice(0, 100).map(({ note }) => note),
    settled: settled.slice(0, 100).map(({ note }) => note), total: active.length, settledTotal: settled.length,
    ...(nextWakeAt ? { nextWakeAt } : {}), ...(warnings.length ? { warnings } : {}) };
}

export async function patchServerMemoryAttention(options: { root: string; id: string; ifMatch: string; mutation: unknown; now?: number }) {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  const mutation = validateMemoryAttentionAction(options.mutation, options.now ?? Date.now());
  if (!mutation) throw new MemoryDocumentLookupError("validation_failed", "Use settle, reactivate, or snooze with a future timezone-explicit until timestamp.");
  const packet = await patchCanonicalMemoryDocumentAttention(root, options.id, { ifMatch: options.ifMatch, mutation });
  // Canonical publication already succeeded; bookkeeping must never invite retry with stale state.
  let index;
  try { index = await markRemoteIndexStale(root); } catch { index = { stale: true, indexed: false }; }
  return { ...packet, memory: "all" as const, target: "remote" as const, root: "remote:all" as const, indexed: false as const, index };
}
