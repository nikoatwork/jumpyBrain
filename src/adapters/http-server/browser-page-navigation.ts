import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id-format.js";
import { metadataDate } from "../../core/canonical/metadata-date.js";
import { recognitionDay } from "../../core/search-recognition.js";
import { createAttentionList, type AttentionPage } from "./browser-attention.js";
import { readablePreview, resultEditContext } from "./search-presentation.js";
import type { MemoryActor, SearchRecognitionMetadata } from "../../types.js";
import { browserEditorIcons, browserPinIcon } from "./browser-icons.js";

type Page = { id: string; title: string; preview?: string; updatedAt?: string; editor?: MemoryActor };
type History = { pinned: Page[]; recent: Page[] };
const prefix = "jumpybrain.pageNavigation.v1:";

// Sidebar-only presentation; search rows keep resultEditContext's compact contract.
// The attention packet sends attentionAt for every active note (edit/creation recency fallback),
// so a due label applies only when it differs from that recency: an explicit snooze now due.
// Compare within the attention snapshot; preview metadata may describe a different revision.
export function sidebarPageAge(page: { updatedAt?: string; createdAt?: string; attentionAt?: string }, now = new Date(), attention = page): { label: string; details: string } {
  const due = metadataDate(attention.attentionAt);
  const recency = attention.updatedAt ?? attention.createdAt;
  if (due && due !== recency) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const exact = (value: string) => value.length === 10 ? value : new Date(value).toLocaleString(undefined, { timeZoneName: "short" });
    let label = "";
    if (due.length === 10) {
      const days = Math.round((Date.parse(recognitionDay(now.toISOString(), timeZone)!) - Date.parse(recognitionDay(due, timeZone)!)) / 86400000);
      label = days > 0 ? `due ${days}d` : days < 0 ? `due in ${-days}d` : "due today";
    } else {
      const minutes = Math.floor((now.getTime() - Date.parse(due)) / 60000);
      const age = Math.abs(minutes);
      const span = age < 60 ? `${age}m` : age < 1440 ? `${Math.floor(age / 60)}h` : `${Math.floor(age / 1440)}d`;
      label = age < 1 ? "due now" : minutes < 0 ? `due in ${span}` : `due ${span}`;
    }
    return { label, details: "Due " + exact(due) };
  }
  const edited = resultEditContext({ metadataStatus: "current", updatedAt: page.updatedAt }, now);
  return edited;
}

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
  fetchPreview?(id: string): Promise<{ content: string; title?: string; recognition?: SearchRecognitionMetadata }>;
  fetchAttention?(signal: AbortSignal): Promise<unknown>; attentionScope?(): string | null;
  enabled?(): boolean; writable?(): boolean;
  onAttentionUpdated?(): void;
  onAction?(action: "settle" | "snooze" | "reactivate", page: AttentionPage, anchor: HTMLElement): void;
}) {
  const { document, window } = options;
  const element = (id: string) => document.getElementById(id)!;
  let selected: string | null = null;
  const history = createPageHistory({ scope: options.scope, storage: () => window.localStorage, onChange: render });
  let previewScope: string | null = null;
  type Preview = { preview?: string; title?: string; updatedAt?: string; editor?: MemoryActor; fetchedAt: number; pending?: boolean };
  const previews = new Map<string, Preview>();
  let previewReads = 0, paused = false;
  const cacheScope = () => JSON.stringify([options.scope(), options.attentionScope?.()]);
  let recentLimit = 8, settledLimit = 10;
  const settledShelf = element("sidebar-settled-section") as HTMLDetailsElement;
  const signatures = new Map<string, string>();
  const attention = options.fetchAttention ? createAttentionList({
    scope: options.attentionScope || options.scope,
    enabled: () => !document.hidden && (options.enabled?.() ?? true),
    now: () => Date.now(), fetch: options.fetchAttention,
    setTimer: (callback, delay) => window.setTimeout(callback, delay), clearTimer: timer => window.clearTimeout(timer),
    onChange: state => { render(); if (state.status === "ready") options.onAttentionUpdated?.(); },
  }) : null;
  function render() {
    const scope = cacheScope();
    if (scope !== previewScope) { previews.clear(); signatures.clear(); previewScope = scope; recentLimit = 8; settledLimit = 10; settledShelf.open = false; }
    const snapshot = { ...history.snapshot(), settled: [] as Page[] };
    const allNotes = [...(attention?.state.notes || []), ...(attention?.state.settled || [])];
    if (attention) snapshot.settled = attention.state.settled
      .filter(page => !snapshot.pinned.some(pin => pin.id === page.id)).map(page => ({ ...page, title: page.title || page.file || "Untitled" }));
    if (attention) snapshot.recent = attention.state.notes
      .filter(page => !snapshot.pinned.some(pin => pin.id === page.id)).map(page => ({ ...page, title: page.title || page.file || "Untitled" }));
    const focused = document.activeElement as HTMLElement | null;
    const focusId = focused?.dataset.pagePin;
    const focusLink = focused?.dataset.pageLink;
    const focusAction = focused?.dataset.pageAction;
    element("sidebar-pinned-heading").hidden = !snapshot.pinned.length;
    const settledCount = element("sidebar-settled-count");
    settledCount.textContent = String(snapshot.settled.length) + ((attention?.state.settledTotal || 0) > (attention?.state.settled.length || 0) ? "+" : "");
    for (const section of ["pinned", "recent", "settled"] as const) {
      const list = element("sidebar-" + section);
      const limit = section === "recent" ? recentLimit : section === "settled" ? settledLimit : 50;
      const pages = snapshot[section].slice(0, section === "settled" && !settledShelf.open ? 0 : limit)
        .map(page => {
          const source = { ...page, ...allNotes.find(note => note.id === page.id) };
          const merged = { ...source, ...previews.get(page.id) };
          return { ...merged, ageLabel: sidebarPageAge(merged, new Date(), source) };
        });
      for (const page of pages) if (options.fetchPreview && previewReads < 4 && !paused && !document.hidden && (!options.attentionScope || options.attentionScope()) && (options.enabled?.() ?? true)
        && !previews.get(page.id)?.pending && Date.now() - (previews.get(page.id)?.fetchedAt ?? 0) >= 10_000) {
        const pending: Preview = { ...previews.get(page.id), fetchedAt: Date.now(), pending: true }; previews.set(page.id, pending); previewReads++;
        void options.fetchPreview(page.id).then(packet => {
          if (cacheScope() !== scope || previews.get(page.id) !== pending) return;
          previews.set(page.id, { title: packet.title || page.title, preview: readablePreview(packet.content, packet.title || page.title),
            ...(packet.recognition?.updatedAt ? { updatedAt: packet.recognition.updatedAt } : {}), editor: packet.recognition?.metadataStatus === "current" ? packet.recognition.editor : undefined, fetchedAt: Date.now() });
        }).catch(() => {
          if (cacheScope() === scope && previews.get(page.id) === pending) previews.set(page.id, { fetchedAt: Date.now() });
        }).finally(() => { previewReads--; render(); });
      }
      const signature = JSON.stringify(pages.map(({ id }) => ({ id })));
      if (signature !== signatures.get(section)) {
        signatures.set(section, signature); list.replaceChildren();
        for (const page of pages) {
          const row = document.createElement("li"); row.className = "sidebar-page";
          const link = document.createElement("a");
          link.className = "sidebar-page-link"; link.href = options.href(page.id); link.title = page.title; link.dataset.pageLink = page.id;
          if (page.id === selected) link.setAttribute("aria-current", "page");
          const title = document.createElement("span"); title.textContent = page.title;
          title.className = "sidebar-page-title";
          const preview = document.createElement("span"); preview.className = "sidebar-page-preview";
          preview.textContent = readablePreview(page.preview || "", page.title) || "No preview text";
          const age = document.createElement("span"); age.className = "sidebar-page-age";
          const { ageLabel } = page;
          age.textContent = ageLabel.label; age.title = ageLabel.details;
          if (ageLabel.details) age.setAttribute("aria-label", ageLabel.details);
          const editor = document.createElement("span"); editor.className = "sidebar-page-editor"; editor.setAttribute("role", "img");
          link.append(editor, title, preview, age);
          link.addEventListener("click", (event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); options.navigate(link.getAttribute("href")!);
          });
          const pin = document.createElement("button");
          const pinned = section === "pinned";
          pin.type = "button"; pin.className = "sidebar-page-pin"; pin.dataset.pagePin = page.id;
          pin.innerHTML = browserPinIcon;
          pin.setAttribute("aria-pressed", String(pinned));
          pin.title = (pinned ? "Unpin " : "Pin ") + page.title;
          pin.setAttribute("aria-label", pin.title);
          pin.disabled = !pinned && snapshot.pinned.length >= 50;
          pin.addEventListener("click", () => history.toggle({ ...page, ...previews.get(page.id) }));
          const actions = document.createElement("span"); actions.className = "sidebar-page-actions";
          actions.append(pin);
          if (attention && options.onAction) {
            for (const action of (section === "settled" ? ["reactivate"] : ["snooze", "settle"]) as ("snooze" | "settle" | "reactivate")[]) {
              const button = document.createElement("button");
              button.type = "button"; button.className = "sidebar-page-action"; button.dataset.attentionAction = action;
              button.dataset.pageAction = page.id + ":" + action;
              button.title = (action === "snooze" ? "Snooze " : action === "reactivate" ? "Bring back " : "Settle ") + page.title;
              button.setAttribute("aria-label", button.title);
              button.innerHTML = action === "reactivate" ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10h10a6 6 0 0 1 0 12M4 10l6-6M4 10l6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : action === "snooze"
                ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
              button.addEventListener("click", () => options.onAction!(action, { ...page, ...previews.get(page.id) }, button));
              actions.append(button);
            }
          }
          row.append(link, actions); list.append(row);
        }
      }
      for (const link of list.querySelectorAll<HTMLElement>("[data-page-link]")) {
        const page = pages.find(page => page.id === link.dataset.pageLink);
        if (page) {
          link.title = page.title;
          link.setAttribute("href", options.href(page.id));
          link.querySelector(".sidebar-page-title")!.textContent = page.title;
          for (const button of link.parentElement!.querySelectorAll<HTMLButtonElement>("button")) {
            const action = button.dataset.attentionAction;
            button.title = (action === "reactivate" ? "Bring back " : action === "snooze" ? "Snooze " : action === "settle" ? "Settle " : section === "pinned" ? "Unpin " : "Pin ") + page.title;
            button.setAttribute("aria-label", button.title);
          }
          const glyph = link.querySelector<HTMLElement>(".sidebar-page-editor")!;
          const kind = page.editor?.kind === "human" || page.editor?.kind === "agent" ? page.editor.kind : "unknown";
          const label = kind === "unknown" ? "Last editor unknown" : "Last edited by " + (kind === "agent" ? "an agent" : "a human") + (page.editor?.name ? " · " + page.editor.name : "");
          if (glyph.dataset.editorKind !== kind) { glyph.dataset.editorKind = kind; glyph.innerHTML = browserEditorIcons[kind]; }
          glyph.title = label; glyph.setAttribute("aria-label", label);
          const preview = link.querySelector(".sidebar-page-preview");
          if (preview) preview.textContent = readablePreview(page.preview || "", page.title) || "No preview text";
          const age = link.querySelector<HTMLElement>(".sidebar-page-age");
          const { ageLabel } = page;
          if (age) { age.textContent = ageLabel.label; age.title = ageLabel.details; age.setAttribute("aria-label", ageLabel.details); }
        }

        if (link.dataset.pageLink === selected) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
      for (const button of list.querySelectorAll<HTMLButtonElement>("[data-attention-action]")) button.disabled = !(options.writable?.() ?? true);
      for (const button of list.querySelectorAll<HTMLButtonElement>("[data-page-pin]")) button.disabled = section !== "pinned" && snapshot.pinned.length >= 50;
      if (section !== "pinned") {
        const more = element("sidebar-" + section + "-more") as HTMLButtonElement;
        const total = section === "recent" ? attention?.state.total : attention?.state.settledTotal;
        more.hidden = snapshot[section].length <= limit && !(total && total > 100);
        more.textContent = snapshot[section].length > limit ? "Show more" : "Find more in Search";
      }
      const empty = element("sidebar-" + section + "-empty");
      if (empty) {
        empty.hidden = snapshot[section].length > 0;
        if (attention && section === "recent") {
          const message = attention.state.status === "loading" ? "Loading…" : attention.state.status === "error" ? attention.state.message : "";
          if (empty.dataset.message !== message) {
            empty.dataset.message = message; empty.replaceChildren();
            empty.textContent = message;
            if (attention.state.status === "error") {
              const retry = document.createElement("button"); retry.className = "quiet-button"; retry.type = "button"; retry.textContent = "Retry";
              retry.addEventListener("click", () => void attention.load()); empty.append(retry);
            }
          }
        }
      }
    }
    if ((focusId || focusLink || focusAction) && !focused?.isConnected) {
      const replacement = [...document.querySelectorAll<HTMLElement>(focusId ? "[data-page-pin]" : focusLink ? "[data-page-link]" : "[data-page-action]")]
        .find((item) => focusId ? item.dataset.pagePin === focusId : focusLink ? item.dataset.pageLink === focusLink : item.dataset.pageAction === focusAction);
      (replacement || element("notes-link")).focus({ preventScroll: true });
    }
  }
  settledShelf.addEventListener("toggle", render);
  for (const section of ["recent", "settled"] as const) element("sidebar-" + section + "-more").addEventListener("click", () => {
    const limit = section === "recent" ? recentLimit : settledLimit;
    const rows = section === "recent" ? attention?.state.notes : attention?.state.settled;
    if (limit >= (rows?.filter(page => !history.snapshot().pinned.some(pin => pin.id === page.id)).length ?? 0)) { element("open-search").click(); return; }
    if (section === "recent") recentLimit += 8; else settledLimit += 10;
    render();
  });
  window.addEventListener("storage", (event) => history.storageChanged(event));
  if (attention) {
    const resume = () => { paused = false; void attention.load(); };
    window.addEventListener("focus", resume); window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", () => { paused = true; previews.clear(); attention.cancel(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) attention.cancel(); else resume(); });
    void attention.load();
  }
  render();
  return {
    settleStarter(id: string) {
      try {
        if (window.localStorage.getItem("jumpybrain.focusStarter.v1:" + options.scope()) !== id) return false;
        history.remove(id);
        return true;
      } catch { return false; }
    },
    select(id: string | null) { selected = id; render(); if (attention) void attention.load(); },
    visit(page: Page) { selected = page.id; if (!history.visit(page)) render(); },
    rename(page: Page) { previews.delete(page.id); history.rename(page); render(); },
    remove(id: string) { history.remove(id); if (attention) void attention.load(); },
    refresh() { render(); if (attention) void attention.load(); },
    reloadAttention() { if (attention) void attention.load(); },
    sync: render,
  };
}
