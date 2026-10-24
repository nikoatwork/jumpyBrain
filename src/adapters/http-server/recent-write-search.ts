import { matchesRecognition, normalizeRecognitionOptions } from "../../core/search-recognition.js";
import type { SearchRecognitionOptions, SearchRecognitionMetadata, SearchRecognitionScope } from "../../types.js";
// Bounded tab-only projection of confirmed writes, never canonical or persistent memory.
export interface RecentWrite { id: string; title: string; file: string; body: string; recognition?: SearchRecognitionMetadata }
type Hit = { recognition?: SearchRecognitionMetadata; provenance?: { metadata?: { id?: string; title?: unknown }; file?: string }; [key: string]: unknown };
type Packet = { recognition?: SearchRecognitionScope; results?: Hit[]; index?: { stale?: boolean }; readiness?: { freshness?: string }; localOnly?: boolean; [key: string]: unknown };
export function createRecentWriteSearch(options: { scope(): string; fetch(query: string, signal: AbortSignal, limit?: number, recognition?: SearchRecognitionOptions): Promise<unknown> }) {
  const saved = new Map<string, RecentWrite>();
  const deleted = new Set<string>();
  let scope = "", revision = 0;
  function reset() { saved.clear(); deleted.clear(); scope = options.scope(); revision++; }
  function current() { if (scope !== options.scope()) reset(); }
  function remember(note: RecentWrite) {
    current(); revision++; deleted.delete(note.id); saved.delete(note.id);
    saved.set(note.id, { ...note, body: note.body.slice(0, 32768) });
    if (saved.size > 50) saved.delete(saved.keys().next().value!);
  }
  function remove(id: string) {
    current(); revision++; saved.delete(id); deleted.add(id);
    if (deleted.size > 50) deleted.delete(deleted.values().next().value!);
  }
  async function search(query: string, signal: AbortSignal, limit = 24, input?: SearchRecognitionOptions): Promise<Packet> {
    const recognition = normalizeRecognitionOptions(input);
    signal.throwIfAborted();
    current(); const startedScope = scope, startedRevision = revision;
    let packet: Packet;
    try { packet = await options.fetch(query, signal, recognition ? 120 : limit, recognition ? { ...recognition, offset: 0 } : undefined) as Packet; }
    catch (error) {
      if (signal.aborted || startedScope !== options.scope()) throw error;
      // Explicit partial fallback, only if we can actually supply a local match.
      if (![...saved.values()].some(note => matches(note, query))) throw error;
      packet = { results: [], localOnly: true, index: { stale: true } };
    }
    signal.throwIfAborted();
    if (startedScope !== options.scope()) throw new DOMException("Connection changed", "AbortError");
    // Once the server verifies a fresh generation, it becomes authoritative
    // again. Never retire a write that happened after this query started.
    if (packet.index?.stale === false && packet.readiness?.freshness === "fresh" && revision === startedRevision) {
      saved.clear(); deleted.clear();
    }
    const local = [...saved.values()].reverse().filter(note => matches(note, query));
    const localIds = new Set(local.map(note => note.id));
    let results: Hit[] = [...local.map(note => ({ id: note.id, confirmedWriteMatch: true, snippet: note.body.slice(0, recognition ? 8192 : 240), ...(note.recognition ? { recognition: { ...note.recognition, preview: note.body.slice(0, 8192) } } : {}),
      provenance: { file: note.file, metadata: { id: note.id, title: note.title } } })),
      ...(packet.results ?? []).filter(hit => {
        const id = hit.provenance?.metadata?.id;
        // Changed titles/bodies supersede old indexed matches, even if the new
        // content no longer matches this query.
        return !id || (!saved.has(id) && !deleted.has(id) && !localIds.has(id));
      })].sort((a, b) => titleRank(b.provenance?.metadata?.title, query) - titleRank(a.provenance?.metadata?.title, query));
    if (recognition) {
      if (!packet.localOnly && packet.recognition?.version !== 1) throw Object.assign(new Error("Server does not support search recognition; upgrade it."), { code: "unsupported_recognition" });
      results = results.filter(hit => matchesRecognition(hit.recognition ?? { metadataStatus: "unavailable" }, recognition));
      if (recognition.sort === "edited") results.sort((a, b) => {
        const delta = (b.recognition?.updatedAt ? Date.parse(b.recognition.updatedAt) : -Infinity) - (a.recognition?.updatedAt ? Date.parse(a.recognition.updatedAt) : -Infinity);
        return (Number.isNaN(delta) ? 0 : delta) || String(a.provenance?.file).localeCompare(String(b.provenance?.file));
      });
      results = results.slice(0, 120);
      const offset = recognition.offset ?? 0;
      return { ...packet, recognition: { version: 1, options: recognition, candidateLimit: 120, candidates: packet.recognition?.candidates ?? 0, matched: results.length, partial: true, metadataUnavailable: packet.recognition?.metadataUnavailable ?? 0, ...(offset + limit < results.length ? { nextOffset: offset + limit } : {}) }, results: results.slice(offset, offset + limit) };
    }
    return { ...packet, results: results.slice(0, Math.max(1, Math.min(120, limit))) };
  }
  function titleRank(title: unknown, query: string): number {
    if (typeof title !== "string") return 0;
    const name = title.normalize("NFKC").trim().toLocaleLowerCase();
    const term = query.normalize("NFKC").trim().toLocaleLowerCase();
    return name === term ? 3 : name.includes(term) ? 2 : term.split(/\s+/).every(word => name.includes(word)) ? 1 : 0;
  }
  function matches(note: RecentWrite, query: string) {
    const haystack = (note.title + "\n" + note.body).normalize("NFKC").toLocaleLowerCase();
    return query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).every(term => haystack.includes(term));
  }
  return { search, remember, remove, reset };
}
