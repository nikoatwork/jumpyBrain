import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import { readablePreview } from "./search-presentation.js";
import type { createDocumentEditor } from "./document-controller.js";

/** Literal bounded title query retained by the explicit graph topic preview. */
export function relatedPageQuery(title: string, body: string): string {
  return (title.trim() || body.slice(0, 240)).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Bounded saved content, including journal text rather than only its date title. */
export function relatedPageContentQuery(title: string, body: string): string {
  // This is generated discovery text, not a user's operator/phrase query.
  // Markdown punctuation must not become exact-query syntax or exclusions.
  const text = [title, readablePreview(body.slice(0, 4096), title, 1000)].join(" ");
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).join(" ").toLowerCase().slice(0, 1000);
}
export function selectRelatedPages(query: string, results: unknown, currentId: string) {
  if (!query.trim()) return [];
  const seen = new Set<string>();
  const candidates = (Array.isArray(results) ? results : []).filter(hit => {
    const id = hit?.provenance?.metadata?.id;
    if (!isValidMemoryDocumentId(id) || id === currentId || seen.has(id)) return false;
    seen.add(id); return true;
  });
  // Shared retrieval already ranks lexical/semantic evidence. Its fused scores
  // are not calibrated similarity, so an absolute graph cutoff loses valid hits.
  return candidates.slice(0, 5).map(hit => {
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
  linked?(id: string): { id: string; title: string }[];
}) {
  const panel = options.document.getElementById("related-pages")!;
  const list = options.document.getElementById("related-pages-list")!;
  const win = options.document.defaultView!;
  let key = "", stopped = false, request: AbortController | null = null;
  let refreshTimer: number | null = null;
  let lastQuery = "", idleTicks = 0;
  let displayed: { id: string; title: string }[] = [];
  function cancel() {
    request?.abort(); request = null;
    if (refreshTimer !== null) win.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  function identity() {
    const state = options.editor()?.state;
    return state?.loaded && !state.cancelled && options.enabled()
      ? JSON.stringify([options.scope(), state.documentId]) : "";
  }
  function render(pages: { id: string; title: string }[]) {
    if (JSON.stringify(pages) === JSON.stringify(displayed)) return;
    displayed = pages;
    const renderedKey = key;
    list.replaceChildren();
    for (const page of pages) {
      const item = options.document.createElement("li");
      const link = options.document.createElement("a");
      link.className = "quiet-button"; link.href = options.href(page.id);
      link.textContent = page.title || "Untitled"; link.title = page.title;
      link.addEventListener("click", event => {
        sync();
        if (key !== renderedKey || !options.enabled()) { event.preventDefault(); return; }
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); options.navigate(link.getAttribute("href")!);
      });
      item.append(link); list.append(item);
    }
    panel.hidden = !pages.length;
  }
  function refresh() {
    refreshTimer = null;
    sync();
    if (stopped || !key || request || options.document.hidden) return;
    const state = options.editor()!.state;
    const startedKey = key;
    const query = relatedPageContentQuery(state.savedTitle, state.savedBody);
    // Schedule from completion, so slow/failed requests never overlap or loop.
    const schedule = () => {
      if (!stopped && key === startedKey && !options.document.hidden && refreshTimer === null)
        refreshTimer = win.setTimeout(refresh, 10_000);
    };
    // Cheap ten-second checks coalesce changes; unchanged content only queries
    // once a minute, including stale/error recovery and other-note discovery.
    if (!query || query === lastQuery && ++idleTicks < 6) { schedule(); return; }
    lastQuery = query; idleTicks = 0;
    const controller = new AbortController(); request = controller;
    const timeout = win.setTimeout(() => controller.abort(), 5000);
    void options.search(query, controller.signal, 24).then(value => {
      sync();
      if (stopped || key !== startedKey || controller.signal.aborted) return;
      const packet = value as { results?: unknown; index?: { stale?: boolean }; readiness?: { freshness?: string }; localOnly?: boolean };
      // Preserve the last useful set while maintenance catches up with typing.
      // Never use partial local-only or stale packets to replace recommendations.
      if (!packet || !Array.isArray(packet.results) || packet.index?.stale || packet.localOnly
        || (packet.readiness?.freshness && packet.readiness.freshness !== "fresh")) return;
      const linked = options.linked?.(state.documentId) ?? [];
      render([...linked, ...selectRelatedPages(query, packet.results, state.documentId)
        .filter(page => !linked.some(other => other.id === page.id))]);
    }).catch(() => { /* Keep useful links; explicit Search owns recovery UI. */ })
      .finally(() => {
        win.clearTimeout(timeout);
        if (request === controller) { request = null; schedule(); }
      });
  }
  function sync() {
    if (stopped) return;
    const next = identity();
    if (key === next) return;
    cancel(); key = next; lastQuery = ""; idleTicks = 0;
    render([]);
    if (!next) return;
    render(options.linked?.(options.editor()!.state.documentId) ?? []);
    refresh();
  }
  const stop = () => { stopped = true; key = ""; cancel(); render([]); };
  win.addEventListener("pagehide", stop);
  win.addEventListener("pageshow", event => {
    if (event.persisted) { stopped = false; sync(); }
  });
  options.document.addEventListener?.("visibilitychange", () => {
    if (options.document.hidden) cancel();
    else if (!stopped) {
      sync();
      // Resume on the normal cadence; foregrounding is not another search trigger.
      if (key && !request && refreshTimer === null) refreshTimer = win.setTimeout(refresh, 10_000);
    }
  });
  return { sync };
}
