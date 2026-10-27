import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import { selectGraphSearchResults } from "./graph-search.js";
import type { createDocumentEditor } from "./document-controller.js";

/** Same bounded saved-title query as the optional extension; never uses a draft. */
export function relatedPageQuery(title: string, body: string): string {
  return (title.trim() || body.slice(0, 240)).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}
export function selectRelatedPages(query: string, results: unknown, currentId: string) {
  const seen = new Set<string>();
  const candidates = (Array.isArray(results) ? results : []).filter(hit => {
    const id = hit?.provenance?.metadata?.id;
    if (!isValidMemoryDocumentId(id) || id === currentId || seen.has(id)) return false;
    seen.add(id); return true;
  });
  return selectGraphSearchResults(query, candidates).slice(0, 5).map(hit => {
    const metadata = (hit as { provenance: { metadata: { id: string; title?: unknown } } }).provenance.metadata;
    return { id: metadata.id, title: typeof metadata.title === "string" ? metadata.title : "Untitled" };
  });
}

/** Transient read-only discovery; host retains transport, brain fences and navigation. */
export function installRelatedPages(options: {
  document: Document; editor(): ReturnType<typeof createDocumentEditor> | null;
  scope(): string; enabled(): boolean;
  search(query: string, signal: AbortSignal, limit: number): Promise<unknown>;
  href(id: string): string; navigate(url: string): void;
}) {
  const panel = options.document.getElementById("related-pages")!;
  const list = options.document.getElementById("related-pages-list")!;
  let key = "", stopped = false, request: AbortController | null = null;
  function sync() {
    if (stopped) return;
    const state = options.editor()?.state;
    const query = state ? relatedPageQuery(state.savedTitle, state.savedBody) : "";
    const next = state?.loaded && !state.cancelled && options.enabled() && query
      ? JSON.stringify([options.scope(), state.documentId, state.contentHash, query]) : "";
    if (key === next) return;
    key = next; request?.abort(); request = null;
    panel.hidden = true; list.replaceChildren();
    if (!next || !state) return;
    const controller = new AbortController(); request = controller;
    const timer = options.document.defaultView!.setTimeout(() => controller.abort(), 5000);
    void options.search(query, controller.signal, 24).then(value => {
      sync();
      if (stopped || key !== next || controller.signal.aborted) return;
      const packet = value as { results?: unknown; index?: { stale?: boolean }; localOnly?: boolean };
      // Stale/partial local fallback is useful in explicit Search, but is not
      // sufficient evidence for automatic recommendations below a saved page.
      if (packet?.index?.stale || packet?.localOnly) return;
      for (const page of selectRelatedPages(query, packet?.results, state.documentId)) {
        const item = options.document.createElement("li");
        const link = options.document.createElement("a");
        link.className = "quiet-button"; link.href = options.href(page.id);
        link.textContent = page.title || "Untitled"; link.title = page.title;
        link.addEventListener("click", event => {
          sync();
          if (key !== next || !options.enabled()) { event.preventDefault(); return; }
          if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); options.navigate(link.getAttribute("href")!);
        });
        item.append(link); list.append(item);
      }
      panel.hidden = !list.childElementCount;
    }).catch(() => { /* Quiet abstention; explicit Search retains its recovery UI. */ })
      .finally(() => { options.document.defaultView!.clearTimeout(timer); if (request === controller) request = null; });
  }
  const stop = () => { stopped = true; key = ""; request?.abort(); request = null; panel.hidden = true; list.replaceChildren(); };
  options.document.defaultView!.addEventListener("pagehide", stop);
  options.document.defaultView!.addEventListener("pageshow", event => {
    if (event.persisted) { stopped = false; sync(); }
  });
  return { sync };
}
