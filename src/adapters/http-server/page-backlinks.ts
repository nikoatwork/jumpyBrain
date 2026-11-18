import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import type { EditorSession } from "./editor-session.js";

export type PageBacklink = { id?: string; title: string; snippet?: string };
const SHOWN = 5;

/** Accept only this page's backlink packet; older servers ignore `backlinks=1` and return a plain read. */
export function pageBacklinks(packet: unknown, id: string): { count: number; truncated: boolean; pages: PageBacklink[] } | null {
  const value = packet as { id?: unknown; count?: unknown; truncated?: unknown; backlinks?: unknown } | null;
  if (value?.id !== id || !Array.isArray(value.backlinks) || !Number.isSafeInteger(value.count)) return null;
  const pages = value.backlinks.flatMap((item: { id?: unknown; title?: unknown; snippet?: unknown }) => typeof item?.title !== "string" ? [] : [{
    ...(isValidMemoryDocumentId(item.id) && item.id !== id ? { id: item.id } : {}),
    title: item.title || "Untitled", ...(typeof item.snippet === "string" && item.snippet ? { snippet: item.snippet } : {}),
  }]);
  return { count: Math.max(value.count as number, pages.length), truncated: value.truncated === true, pages };
}

/** Read-only "Linked from" list; transport, brain fences and save-first navigation stay with the host. */
export function installPageBacklinks(options: {
  document: Document; editor(): EditorSession | null;
  scope(): string; enabled(): boolean;
  load(id: string, signal: AbortSignal): Promise<unknown>;
  href(id: string): string; navigate(url: string): void;
  changed?(): void;
}) {
  const doc = options.document, win = doc.defaultView!;
  const $ = (id: string) => doc.getElementById("page-backlinks" + id)!;
  const panel = $(""), list = $("-list"), more = $("-more") as HTMLButtonElement;
  let key = "", title = "", loadedAt = 0, expanded = false;
  let request: AbortController | null = null, shown: PageBacklink[] = [], total = 0, truncated = false;
  const identity = () => {
    const state = options.editor()?.state;
    return state?.loaded && !state.cancelled && options.enabled() ? JSON.stringify([options.scope(), state.documentId]) : "";
  };
  function render(pages: PageBacklink[], count = pages.length) {
    shown = pages; total = count;
    list.replaceChildren();
    const renderedKey = key;
    for (const page of expanded ? pages : pages.slice(0, SHOWN)) {
      const item = doc.createElement("li"), row = doc.createElement(page.id ? "a" : "span");
      row.className = "list-row page-backlink";
      for (const [name, text] of [["title", page.title], ["snippet", page.snippet]]) if (text) {
        const part = doc.createElement("span");
        part.className = "page-backlink-" + name; part.textContent = text;
        row.append(part);
      }
      if (page.id) {
        (row as HTMLAnchorElement).href = options.href(page.id);
        row.addEventListener("click", event => {
          const mouse = event as MouseEvent;
          if (identity() !== renderedKey) { event.preventDefault(); return; }
          if (mouse.button || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
          event.preventDefault(); options.navigate(row.getAttribute("href")!);
        });
      } else {
        row.setAttribute("aria-disabled", "true"); row.tabIndex = -1;
        row.title = "This note has no memory ID, so it can't be opened here.";
      }
      item.append(row); list.append(item);
    }
    $("-count").textContent = String(count);
    more.hidden = expanded || pages.length <= SHOWN;
    more.textContent = "Show all " + pages.length;
    $("-limited").hidden = !expanded || !truncated;
    panel.hidden = !pages.length;
    options.changed?.();
  }
  function load() {
    const state = options.editor()!.state, startedKey = key;
    request?.abort();
    const controller = new AbortController(); request = controller;
    const timeout = win.setTimeout(() => controller.abort(), 10_000);
    title = state.savedTitle; loadedAt = Date.now();
    void options.load(state.documentId, controller.signal).then(value => {
      if (key !== startedKey || controller.signal.aborted || identity() !== startedKey) return;
      const packet = pageBacklinks(value, state.documentId);
      // Unsupported or malformed responses keep the section hidden; failures keep the last list.
      truncated = packet?.truncated ?? false;
      render(packet?.pages ?? [], packet?.count);
    }).catch(() => { /* Linking notes are optional context; the note stays usable. */ })
      .finally(() => { win.clearTimeout(timeout); if (request === controller) request = null; });
  }
  function sync() {
    const next = identity();
    if (next !== key) {
      request?.abort(); request = null; key = next; expanded = false; truncated = false;
      render([]);
      if (key) load();
      return;
    }
    // A rename changes which title links resolve here.
    if (key && options.editor()!.state.savedTitle !== title) load();
  }
  more.addEventListener("click", () => { expanded = true; render(shown, total); (list.children[SHOWN]?.firstElementChild as HTMLElement | null)?.focus(); });
  doc.addEventListener?.("visibilitychange", () => {
    // Other notes may have gained links while this tab was hidden.
    if (!doc.hidden && key && identity() === key && Date.now() - loadedAt > 30_000) load();
  });
  win.addEventListener("pagehide", () => { request?.abort(); request = null; key = ""; render([]); });
  win.addEventListener("pageshow", event => { if ((event as PageTransitionEvent).persisted) sync(); });
  return { sync, has: (id: string) => shown.some(page => page.id === id) };
}
