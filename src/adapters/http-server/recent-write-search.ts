// Bounded tab-only projection of confirmed writes, never canonical or persistent memory.
export interface RecentWrite { id: string; title: string; file: string; body: string }
type Hit = { provenance?: { metadata?: { id?: string; title?: unknown }; file?: string }; [key: string]: unknown };
type Packet = { results?: Hit[]; index?: { stale?: boolean }; readiness?: { freshness?: string }; localOnly?: boolean; [key: string]: unknown };
export function createRecentWriteSearch(options: { scope(): string; fetch(query: string, signal: AbortSignal, limit?: number): Promise<unknown> }) {
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
  async function search(query: string, signal: AbortSignal, limit = 24): Promise<Packet> {
    signal.throwIfAborted();
    current(); const startedScope = scope, startedRevision = revision;
    let packet: Packet;
    try { packet = await options.fetch(query, signal, limit) as Packet; }
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
    return { ...packet, results: [...local.map(note => ({ id: note.id, snippet: note.body.slice(0, 240),
      provenance: { file: note.file, metadata: { id: note.id, title: note.title } } })),
      ...(packet.results ?? []).filter(hit => {
        const id = hit.provenance?.metadata?.id;
        // Changed titles/bodies supersede old indexed matches, even if the new
        // content no longer matches this query.
        return !id || (!saved.has(id) && !deleted.has(id) && !localIds.has(id));
      })].sort((a, b) => titleRank(b.provenance?.metadata?.title, query) - titleRank(a.provenance?.metadata?.title, query)).slice(0, Math.max(1, Math.min(120, limit))) };
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
