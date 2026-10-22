import { firstAttentionDate, resolveMemoryAttention, validateMemoryAttentionAction } from "../../core/attention.js";
import { listCanonicalMemoryMarkdownFiles, MemoryDocumentLookupError, patchCanonicalMemoryDocumentAttention, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import type { RemoteMemoryRecentNote } from "./recent.js";
import { markRemoteIndexStale } from "./state.js";

export interface RemoteMemoryAttentionNote extends RemoteMemoryRecentNote { attentionAt?: string }
export interface RemoteMemoryAttentionPacket {
  memory: "all"; target: "remote"; root: "remote:all";
  notes: RemoteMemoryAttentionNote[];
  nextWakeAt?: string;
  warnings?: { code: "invalid_attention_at"; id: string }[];
}

/** Fresh metadata-only corpus scan; bounds output, not input work. */
export async function attentionServerMemory(options: { root: string; now?: number }): Promise<RemoteMemoryAttentionPacket> {
  const root = await resolveMemoryRoot(options.root);
  await assertCompatibleMemoryRoot(root);
  const now = options.now ?? Date.now();
  const counts = new Map<string, number>();
  const candidates: { note: RemoteMemoryAttentionNote; state: ReturnType<typeof resolveMemoryAttention> }[] = [];
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
    const document = await readMarkdownDocument(root, file);
    const metadata = document.frontmatter;
    if (!isValidMemoryDocumentId(metadata.id)) continue;
    counts.set(metadata.id, (counts.get(metadata.id) ?? 0) + 1);
    if (document.relativePath.split("/").some(part => part.startsWith("."))) continue;
    const updatedAt = firstAttentionDate(metadata.updated_at, metadata.updatedAt);
    const createdAt = firstAttentionDate(metadata.created_at, metadata.createdAt);
    const state = resolveMemoryAttention(metadata, now);
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
  }).slice(0, 8);
  const warnings = active.filter(({ state }) => state.invalid).map(({ note }) => ({ code: "invalid_attention_at" as const, id: note.id }));
  return { memory: "all", target: "remote", root: "remote:all", notes: active.map(({ note }) => note),
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
