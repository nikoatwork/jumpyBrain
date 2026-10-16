import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id-format.js";

type Page = { id: string; title: string };
type History = { pinned: Page[]; recent: Page[] };
const prefix = "jumpybrain.pageNavigation.v1:";
const pinIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 3 6 6-4 1-3 5-2 1-4-4 1-2 5-3 1-4ZM10 14l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Device-local navigation metadata, never canonical memory or an access credential.
export function createPageHistory(options: { scope(): string | null; storage(): Storage; onChange(): void }) {
  let key: string | null = null;
  let storageAvailable = true;
  let history: History = { pinned: [], recent: [] };
  function decode(raw: string | null): History {
    try {
      const value = JSON.parse(raw || "null");
      const pages = (rows: unknown, limit: number): Page[] => {
        const seen = new Set<string>();
        return (Array.isArray(rows) ? rows : []).filter((page) => {
          if (!page || typeof page.id !== "string" || !MEMORY_DOCUMENT_ID_PATTERN.test(page.id)
            || typeof page.title !== "string" || seen.has(page.id)) return false;
          seen.add(page.id); return true;
        }).slice(0, limit).map(({ id, title }) => ({ id, title: title.slice(0, 300) }));
      };
      return { pinned: pages(value?.pinned, 50), recent: pages(value?.recent, 30) };
    } catch { return { pinned: [], recent: [] }; }
  }
  function read() {
    if (!key || !storageAvailable) return;
    try { history = decode(options.storage().getItem(key)); } catch { /* In-tab history still works. */ }
  }
  function sync() {
    const scope = options.scope();
    const next = scope ? prefix + scope : null;
    if (key === next) return;
    key = next; storageAvailable = true; history = { pinned: [], recent: [] }; read();
  }
  function change(update: () => void) {
    sync();
    if (!key) return false;
    const beforeRead = JSON.stringify(history);
    read();
    const beforeUpdate = JSON.stringify(history);
    update();
    const updated = JSON.stringify(history);
    if (updated === beforeUpdate) {
      if (updated !== beforeRead) options.onChange();
      return updated !== beforeRead;
    }
    try { options.storage().setItem(key, updated); } catch { storageAvailable = false; }
    options.onChange();
    return true;
  }
  return {
    snapshot() { sync(); return { pinned: [...history.pinned], recent: history.recent.filter((page) => !history.pinned.some((pin) => pin.id === page.id)).slice(0, 8) }; },
    visit(page: Page) {
      if (!MEMORY_DOCUMENT_ID_PATTERN.test(page.id)) return false;
      return change(() => {
        const entry = { id: page.id, title: (page.title || "Untitled").slice(0, 300) };
        history.recent = [entry, ...history.recent.filter((item) => item.id !== page.id)].slice(0, 30);
        history.pinned = history.pinned.map((item) => item.id === page.id ? entry : item);
      });
    },
    rename(page: Page) {
      change(() => {
        const update = (item: Page) => item.id === page.id ? { ...item, title: (page.title || "Untitled").slice(0, 300) } : item;
        history.pinned = history.pinned.map(update); history.recent = history.recent.map(update);
      });
    },
    toggle(page: Page) {
      if (!MEMORY_DOCUMENT_ID_PATTERN.test(page.id)) return;
      change(() => {
        const pinned = history.pinned.some((item) => item.id === page.id);
        if (pinned) history.pinned = history.pinned.filter((item) => item.id !== page.id);
        else if (history.pinned.length < 50) history.pinned.unshift({ id: page.id, title: (page.title || "Untitled").slice(0, 300) });
      });
    },
    remove(id: string) { change(() => { history.pinned = history.pinned.filter((item) => item.id !== id); history.recent = history.recent.filter((item) => item.id !== id); }); },
    storageChanged(event: StorageEvent) {
      sync();
      if (!key || (event.key !== null && event.key !== key)) return;
      history = decode(event.newValue); options.onChange();
    },
  };
}

export function installPageNavigation(options: {
  document: Document; window: Window; scope(): string | null;
  href(id: string): string; navigate(url: string): void;
}) {
  const { document, window } = options;
  const element = (id: string) => document.getElementById(id)!;
  const pinCurrent = element("pin-current-page") as HTMLButtonElement;
  let current: Page | null = null;
  let selected: string | null = null;
  const history = createPageHistory({ scope: options.scope, storage: () => window.localStorage, onChange: render });
  function render() {
    const snapshot = history.snapshot();
    const focused = document.activeElement as HTMLElement | null;
    const focusId = focused?.dataset.pagePin;
    const focusLink = focused?.dataset.pageLink;
    for (const section of ["pinned", "recent"] as const) {
      const list = element("sidebar-" + section);
      list.replaceChildren();
      for (const page of snapshot[section]) {
        const row = document.createElement("li"); row.className = "sidebar-page";
        const link = document.createElement("a");
        link.className = "sidebar-page-link"; link.href = options.href(page.id); link.title = page.title; link.dataset.pageLink = page.id;
        if (page.id === selected) link.setAttribute("aria-current", "page");
        const title = document.createElement("span"); title.textContent = page.title;
        link.append(title);
        link.addEventListener("click", (event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); options.navigate(link.getAttribute("href")!);
        });
        const pin = document.createElement("button");
        const pinned = section === "pinned";
        pin.type = "button"; pin.className = "sidebar-page-pin"; pin.dataset.pagePin = page.id;
        pin.innerHTML = pinIcon;
        pin.setAttribute("aria-pressed", String(pinned));
        pin.title = (pinned ? "Unpin " : "Pin ") + page.title;
        pin.setAttribute("aria-label", pin.title);
        pin.disabled = !pinned && snapshot.pinned.length >= 50;
        pin.addEventListener("click", () => history.toggle(page));
        row.append(link, pin); list.append(row);
      }
      element("sidebar-" + section + "-empty").hidden = snapshot[section].length > 0;
    }
    const pinned = snapshot.pinned.some((page) => page.id === current?.id);
    pinCurrent.hidden = !current;
    pinCurrent.disabled = !pinned && snapshot.pinned.length >= 50;
    pinCurrent.setAttribute("aria-pressed", String(pinned));
    pinCurrent.title = pinned ? "Unpin page" : "Pin page";
    pinCurrent.setAttribute("aria-label", pinCurrent.title);
    if (focusId || focusLink) {
      const replacement = [...document.querySelectorAll<HTMLElement>(focusId ? "[data-page-pin]" : "[data-page-link]")]
        .find((item) => focusId ? item.dataset.pagePin === focusId : item.dataset.pageLink === focusLink);
      (replacement || element("notes-link")).focus({ preventScroll: true });
    }
  }
  pinCurrent.innerHTML = pinIcon;
  pinCurrent.addEventListener("click", () => { if (current) history.toggle(current); });
  window.addEventListener("storage", (event) => history.storageChanged(event));
  render();
  return {
    select(id: string | null) { selected = id; current = null; render(); },
    visit(page: Page) { current = page; selected = page.id; if (!history.visit(page)) render(); },
    rename(page: Page) { if (current?.id === page.id) current = page; history.rename(page); },
    remove(id: string) { if (current?.id === id) current = null; history.remove(id); },
    refresh() { current = null; render(); },
  };
}
