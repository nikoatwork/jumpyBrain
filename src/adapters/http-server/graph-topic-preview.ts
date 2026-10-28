import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import { safeReferenceTitle } from "./reference-policy.js";
import { relatedPageQuery, selectRelatedPages } from "./related-pages.js";
import type { MemoryGraphNode, MemoryGraphResult } from "../../types.js";

type Page = { id: string; title: string };
export const graphTopicMarkup = (closeIcon: string) => `<dialog id="graph-topic" aria-labelledby="graph-topic-title">
  <div class="dialog-heading"><h2 id="graph-topic-title"></h2><button id="graph-topic-close" class="icon-button" type="button" aria-label="Close topic preview" title="Close topic preview">${closeIcon}</button></div>
  <p class="graph-topic-description">This topic has no saved page yet. Explore the notes connected to it.</p>
  <h3>Linked notes on this map</h3><ul id="graph-topic-links"></ul><p id="graph-topic-empty">No openable linked notes on this map.</p>
  <section id="graph-topic-related" hidden><h3>Related notes</h3><ul id="graph-topic-results"></ul></section>
  <p id="graph-topic-status" role="status" aria-live="polite"></p>
  <button id="graph-topic-create" class="button" type="button" hidden>Create page</button>
</dialog>`;
export const graphTopicStyles = `
  #graph-topic { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: var(--space-6); overflow: auto; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); }
  #graph-topic::backdrop { background: var(--backdrop); }
  #graph-topic .dialog-heading { display: flex; align-items: start; gap: var(--space-3); justify-content: space-between; }
  #graph-topic h2 { overflow-wrap: anywhere; min-width: 0; }
  #graph-topic-close { flex: none; }
  #graph-topic h3 { margin: var(--space-5) 0 var(--space-2); font-size: var(--text-caption); font-weight: var(--weight-regular); color: var(--ink-soft); }
  #graph-topic p { font-size: var(--text-ui); color: var(--ink-soft); overflow-wrap: anywhere; }
  #graph-topic ul { list-style: none; padding: 0; margin: 0; }
  #graph-topic a { display: block; padding: var(--space-2) 0; color: var(--ink); overflow-wrap: anywhere; }
  #graph-topic-status:empty { display: none; }
`;

/** Only explicit edges in the bounded displayed packet establish linked notes. */
export function graphTopicLinks(node: Pick<MemoryGraphNode, "id">, graph: Pick<MemoryGraphResult, "nodes" | "edges"> | null): Page[] {
  const neighbors = new Set(graph?.edges.flatMap(edge => edge.target === node.id ? [edge.source] : edge.source === node.id ? [edge.target] : []) ?? []);
  const seen = new Set<string>();
  return (graph?.nodes ?? []).flatMap(other => {
    if (!neighbors.has(other.id) || other.nodeKind !== "document" || !isValidMemoryDocumentId(other.documentId) || seen.has(other.documentId)) return [];
    seen.add(other.documentId);
    return [{ id: other.documentId, title: other.title }];
  }).slice(0, 40);
}

export function installGraphTopicPreview(options: {
  document: Document; scope(): string; enabled(): boolean; canCreate(): boolean;
  search(query: string, signal: AbortSignal, limit: number): Promise<unknown>;
  ensure(title: string, signal: AbortSignal): Promise<{ status: string; id?: string; created?: boolean }>;
  href(id: string): string;
  navigate(destination: string | (() => Promise<string>)): Promise<boolean>;
  onCreated(): void;
}) {
  const get = (id: string) => options.document.getElementById("graph-topic" + id)!;
  const dialog = get("") as HTMLDialogElement, button = get("-create") as HTMLButtonElement;
  let active: { scope: string; title: string; pages: Page[]; request: AbortController; searchRequest: AbortController; busy: boolean; creationStarted: boolean } | null = null;
  let created: { scope: string; id: string; pages: Page[] } | null = null;
  const current = (entry: NonNullable<typeof active>) => active === entry && entry.scope === options.scope() && options.enabled() && !entry.request.signal.aborted;
  function close() { active?.request.abort(); active?.searchRequest.abort(); active = null; if (dialog.open) dialog.close(); }
  function append(list: HTMLElement, pages: Page[], entry: NonNullable<typeof active>) {
    for (const page of pages) {
      const item = options.document.createElement("li"), link = options.document.createElement("a");
      link.href = options.href(page.id); link.textContent = page.title || "Untitled";
      link.addEventListener("click", event => {
        if (!current(entry) || entry.busy) { event.preventDefault(); return; }
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); void options.navigate(link.getAttribute("href")!);
      });
      item.append(link); list.append(item);
    }
  }
  get("-close").addEventListener("click", close);
  dialog.addEventListener("close", () => { if (!dialog.open) close(); });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  options.document.defaultView!.addEventListener("pagehide", close);
  button.addEventListener("click", async () => {
    const entry = active;
    if (!entry || !current(entry) || entry.busy || !options.canCreate() || !safeReferenceTitle(entry.title)) return;
    entry.busy = true; entry.creationStarted = true; button.disabled = true; get("-status").textContent = "Opening page…";
    try {
      const opened = await options.navigate(async () => {
        if (!current(entry) || !options.canCreate()) throw new Error("cancelled");
        const result = await options.ensure(entry.title, entry.request.signal);
        if (!current(entry)) throw new Error("cancelled");
        if (result.status !== "found" || !isValidMemoryDocumentId(result.id)) throw new Error(result.status);
        created = { scope: entry.scope, id: result.id, pages: entry.pages };
        if (result.created) options.onCreated();
        return options.href(result.id);
      });
      if (current(entry) && !opened) get("-status").textContent = "Save your current note, then try again.";
    } catch {
      if (current(entry)) get("-status").textContent = "Page creation could not be confirmed. Retry to check the saved title. Your linked notes are still available.";
    } finally {
      if (active === entry) { entry.busy = false; button.disabled = false; }
    }
  });
  return {
    close,
    related(id: string | undefined): Page[] { return created?.scope === options.scope() && created.id === id ? created.pages : []; },
    open(node: MemoryGraphNode, graph: MemoryGraphResult | null) {
      if (!options.enabled()) return;
      close();
      const entry = { scope: options.scope(), title: node.title || node.id, pages: graphTopicLinks(node, graph), request: new AbortController(), searchRequest: new AbortController(), busy: false, creationStarted: false };
      active = entry;
      get("-title").textContent = entry.title;
      get("-links").replaceChildren(); get("-results").replaceChildren();
      append(get("-links"), entry.pages, entry);
      get("-empty").hidden = entry.pages.length > 0;
      get("-related").hidden = true;
      button.hidden = !options.canCreate() || !safeReferenceTitle(entry.title); button.disabled = false;
      get("-status").textContent = "Finding related notes…";
      dialog.showModal();
      const timer = options.document.defaultView!.setTimeout(() => entry.searchRequest.abort(), 5000);
      const query = relatedPageQuery(entry.title, "");
      void options.search(query, entry.searchRequest.signal, 24).then(value => {
        if (!current(entry) || entry.searchRequest.signal.aborted) return;
        const packet = value as { results?: unknown; index?: { stale?: boolean }; localOnly?: boolean };
        const linked = new Set(entry.pages.map(page => page.id));
        const related = selectRelatedPages(query, packet?.results, "").filter(page => !linked.has(page.id));
        append(get("-results"), related, entry);
        get("-related").hidden = !related.length;
        if (!entry.creationStarted) get("-status").textContent = packet?.index?.stale || packet?.localOnly ? "Search is updating; related results may be incomplete." : related.length ? "" : "No additional related notes found.";
      }).catch(() => {
        if (current(entry) && !entry.creationStarted) get("-status").textContent = "Related search is unavailable. Linked notes are shown above.";
      }).finally(() => options.document.defaultView!.clearTimeout(timer));
    },
  };
}
