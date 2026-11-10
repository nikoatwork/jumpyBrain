import { installExplorerActions, type ExplorerOperationHost } from "./folder-explorer-actions.js";
import { buildExplorerTree, explorerAge, explorerFiles, explorerFolders, explorerRows, isExplorerSort, revealExplorerFile, type ExplorerFile, type ExplorerNode, type ExplorerRow, type ExplorerSort } from "./folder-explorer-model.js";
import { prepareDropdown } from "./browser-dropdown.js";

// Device-local presentation preference, like sidebar width; never canonical or brain-scoped.
const sortKey = "jumpybrain.folderExplorerSort";

/** Scoped panel. The host owns authentication, write admission and guarded navigation. */
export function installFolderExplorer(options: {
  document: Document; window: Window;
  scope(): string; enabled(): boolean;
  fetch(signal: AbortSignal): Promise<unknown>;
  navigate(id: string): Promise<boolean>;
  operations?: ExplorerOperationHost;
}) {
  const { document, window } = options;
  const panel = document.getElementById("folder-explorer")!;
  const treeElement = document.getElementById("folder-explorer-tree")!;
  const search = document.getElementById("folder-explorer-search") as HTMLInputElement;
  const toggle = document.getElementById("toggle-folders") as HTMLButtonElement;
  const refreshButton = document.getElementById("folder-explorer-refresh") as HTMLButtonElement;
  const closeButton = document.getElementById("folder-explorer-close") as HTMLButtonElement;
  const message = document.getElementById("folder-explorer-message")!;
  const sortSelect = document.getElementById("folder-explorer-sort") as HTMLSelectElement;
  let sort: ExplorerSort = "name";
  try { const saved = window.localStorage.getItem(sortKey); if (isExplorerSort(saved)) sort = saved; } catch { /* Tab-only preference. */ }
  sortSelect.value = sort; prepareDropdown(sortSelect);
  const narrow = window.matchMedia("(max-width: 680px)");
  const overlay = window.matchMedia("(max-width: 1000px)");
  let scope = options.scope(), selected: string | null = null, opened = false, stopped = false;
  let directories: string[] = [];
  let files: ExplorerFile[] = [], tree: ExplorerNode[] = [], rows: ExplorerRow[] = [];
  let request: AbortController | null = null, loading = false, navigating = false, revision = 0;
  let expanded = new Set<string>(), searchCollapsed = new Set<string>(), focused: string | null = null;
  const buttons = new Map<string, HTMLButtonElement>();

  function findNode(path: string, nodes = tree): ExplorerNode | undefined {
    for (const node of nodes) { if (node.path === path) return node; const found = findNode(path, node.children); if (found) return found; }
  }
  const actions = installExplorerActions({
    document, window, tree: treeElement, host: options.operations,
    scope: options.scope, enabled: options.enabled, node: findNode,
    folders: () => directories,
    refresh: () => refresh(), focus,
    reveal: path => { revealExplorerFile(tree, path, expanded); render(); },
    message: text => { message.textContent = text; },
  });

  function cancel() {
    revision++; request?.abort(); request = null; loading = false;
    refreshButton.disabled = false; treeElement.removeAttribute("aria-busy");
  }
  function updatePresentation() {
    panel.hidden = !opened;
    document.body.dataset.folderExplorerOpen = String(opened);
    toggle.setAttribute("aria-expanded", String(opened));
    if (opened && narrow.matches) {
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
    } else { panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); }
  }
  function close(restoreFocus = true) {
    opened = false; actions.reset(); cancel(); updatePresentation();
    if (restoreFocus && !toggle.disabled) toggle.focus();
  }
  function sync() {
    if (stopped) return;
    const next = options.scope(), enabled = options.enabled();
    toggle.disabled = !enabled;
    actions.sync();
    if (next !== scope || !enabled) {
      const hadFocus = panel.contains(document.activeElement);
      scope = next; close(hadFocus);
      directories = []; files = []; tree = []; rows = []; buttons.clear(); treeElement.replaceChildren();
      expanded = new Set(); searchCollapsed = new Set(); search.value = ""; focused = null; message.textContent = "";
    }
  }
  function focus(path: string | null) {
    if (!path) return;
    focused = path;
    for (const [key, button] of buttons) button.tabIndex = key === path ? 0 : -1;
    buttons.get(path)?.focus();
    buttons.get(path)?.scrollIntoView({ block: "nearest" });
  }
  function render() {
    if (!opened) return;
    const priorFocus = treeElement.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.explorerPath : null;
    rows = explorerRows(tree, expanded, search.value, searchCollapsed);
    if (!rows.some(row => row.node.path === focused)) focused = rows.find(row => row.node.id === selected)?.node.path ?? rows[0]?.node.path ?? null;
    const children: HTMLButtonElement[] = [], currentPaths = new Set<string>(), now = new Date();
    for (const row of rows) {
      const { node } = row;
      currentPaths.add(node.path);
      let button = buttons.get(node.path);
      if (!button) {
        button = document.createElement("button"); button.type = "button";
        button.className = "folder-explorer-row"; button.setAttribute("role", "treeitem");
        const glyph = document.createElement("span"); glyph.className = "folder-explorer-glyph"; glyph.setAttribute("aria-hidden", "true");
        const label = document.createElement("span"); label.className = "folder-explorer-label";
        const age = document.createElement("span"); age.className = "folder-explorer-age"; age.setAttribute("aria-hidden", "true");
        button.append(glyph, label, age); buttons.set(node.path, button);
      }
      button.dataset.explorerPath = node.path;
      button.draggable = node.kind === "file" && Boolean(node.id) && Boolean(options.operations?.writable()) && !actions.isBusy();
      if (node.kind === "folder") {
        button.dataset.folderPath = node.path; delete button.dataset.filePath;
        button.setAttribute("aria-expanded", String(row.expanded));
      } else {
        button.dataset.filePath = node.path; delete button.dataset.folderPath; button.removeAttribute("aria-expanded");
      }
      const unavailable = node.kind === "file" && !node.id;
      button.setAttribute("aria-disabled", String(unavailable));
      button.setAttribute("aria-level", String(row.level));
      button.setAttribute("aria-posinset", String(row.position));
      button.setAttribute("aria-setsize", String(row.siblings));
      const active = node.kind === "file" && Boolean(node.id) && node.id === selected;
      button.setAttribute("aria-selected", String(active));
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      button.style.setProperty("--folder-depth", String(Math.min(row.level - 1, 12)));
      const age = node.kind === "file" ? explorerAge(node, sort, now) : { label: "", details: "" };
      button.children[1]!.textContent = row.label;
      button.lastElementChild!.textContent = age.label;
      button.title = node.path + (node.title ? "\n" + node.title : "") + (age.details ? "\n" + age.details : "") + (unavailable ? "\nMissing or ambiguous note ID — cannot open" : "");
      button.setAttribute("aria-label", row.label + (age.details ? ", " + age.details.toLocaleLowerCase() : "") + (unavailable ? ", unavailable note ID" : ""));
      button.tabIndex = node.path === focused ? 0 : -1;
      children.push(button);
    }
    for (const path of buttons.keys()) if (!currentPaths.has(path)) buttons.delete(path);
    treeElement.replaceChildren(...children);
    if (priorFocus) focus(rows.some(row => row.node.path === priorFocus) ? priorFocus : focused);
    if (!loading) message.textContent = rows.length ? "" : search.value.trim() ? "No notes or folders match." : "No Markdown notes yet.";
  }
  function revealSelected() {
    const file = files.find(item => item.id && item.id === selected);
    if (file) revealExplorerFile(tree, file.file, expanded);
  }
  async function refresh(reveal = false) {
    sync();
    if (!opened || !options.enabled() || stopped) return;
    cancel();
    const token = revision, origin = scope, controller = new AbortController(); request = controller;
    loading = true; refreshButton.disabled = true; treeElement.setAttribute("aria-busy", "true");
    message.textContent = "Loading folders…";
    try {
      const packet = await options.fetch(controller.signal);
      if (controller.signal.aborted || token !== revision || origin !== options.scope() || !options.enabled()) return;
      files = explorerFiles(packet); directories = explorerFolders(packet); tree = buildExplorerTree(files, directories, sort);
      if (reveal) revealSelected();
      loading = false; render();
    } catch {
      if (controller.signal.aborted || token !== revision || origin !== options.scope() || !options.enabled()) return;
      message.textContent = "Could not load folders. Try Refresh folders.";
    } finally {
      if (token === revision) {
        loading = false; request = null; refreshButton.disabled = false; treeElement.removeAttribute("aria-busy");
      }
    }
  }
  function open() {
    sync();
    if (!options.enabled() || stopped) return;
    opened = true; revealSelected(); updatePresentation(); render();
    search.focus(); search.select();
    void refresh(true);
  }
  function select(id: string | null) {
    sync();
    if (selected === id) return;
    selected = id;
    // Navigation highlights selection; disclosure is changed only on explicit open.
    render();
    if (id && opened && !files.some(file => file.id === id)) void refresh();
  }
  function rename(id: string, title: string) {
    sync();
    const file = files.find(item => item.id === id);
    if (!file || file.title === title) return;
    file.title = title; tree = buildExplorerTree(files, directories, sort); render();
  }
  function disclose(row: ExplorerRow, value = !row.expanded) {
    if (search.value.trim()) {
      if (value) searchCollapsed.delete(row.node.path); else searchCollapsed.add(row.node.path);
    } else {
      if (value) expanded.add(row.node.path); else expanded.delete(row.node.path);
    }
    render();
  }
  async function activate(row: ExplorerRow) {
    sync();
    if (!opened || !options.enabled() || actions.isBusy()) return;
    if (row.node.kind === "folder") { disclose(row); return; }
    if (!row.node.id || navigating) return;
    const origin = scope, current = selected === row.node.id;
    navigating = true;
    try {
      const navigated = await options.navigate(row.node.id);
      if (origin === options.scope() && (navigated || current) && overlay.matches) close(false);
    } catch {
      if (origin === options.scope()) message.textContent = "Could not open this note. Try again.";
    } finally { navigating = false; }
  }
  toggle.addEventListener("click", () => opened ? close() : open());
  closeButton.addEventListener("click", () => close());
  refreshButton.addEventListener("click", () => { void refresh(); });
  search.addEventListener("input", () => { searchCollapsed.clear(); render(); });
  sortSelect.addEventListener("change", () => {
    if (!isExplorerSort(sortSelect.value)) { sortSelect.value = sort; return; }
    sort = sortSelect.value;
    try { window.localStorage.setItem(sortKey, sort); } catch { /* Tab-only preference. */ }
    tree = buildExplorerTree(files, directories, sort); render();
  });
  search.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" && rows.length) { event.preventDefault(); focus(rows[0]!.node.path); }
  });
  treeElement.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-explorer-path]");
    const row = rows.find(item => item.node.path === button?.dataset.explorerPath);
    if (actions.isBusy()) return;
    if (row) { focused = row.node.path; void activate(row); }
  });
  treeElement.addEventListener("focusin", event => {
    const path = (event.target as HTMLElement).dataset.explorerPath;
    if (path) { focused = path; for (const [key, button] of buttons) button.tabIndex = key === path ? 0 : -1; }
  });
  treeElement.addEventListener("keydown", event => {
    const index = rows.findIndex(row => row.node.path === (event.target as HTMLElement).dataset.explorerPath);
    const row = rows[index];
    if (!row || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); focus(rows[Math.min(index + 1, rows.length - 1)]!.node.path); break;
      case "ArrowUp": event.preventDefault(); if (index) focus(rows[index - 1]!.node.path); else search.focus(); break;
      case "Home": event.preventDefault(); focus(rows[0]!.node.path); break;
      case "End": event.preventDefault(); focus(rows.at(-1)!.node.path); break;
      case "ArrowRight":
        event.preventDefault();
        if (row.node.kind === "folder") { if (!row.expanded) disclose(row, true); else focus(rows[index + 1]?.node.path ?? row.node.path); }
        break;
      case "ArrowLeft": event.preventDefault(); if (row.expanded) disclose(row, false); else focus(row.parent); break;
      // Enter/Space keep native button activation.
    }
  });
  panel.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (search.value) { search.value = ""; searchCollapsed.clear(); render(); search.focus(); }
      else close();
    }
    if (event.key === "Tab" && narrow.matches) {
      const controls = [document.getElementById("folder-explorer-new") as HTMLButtonElement, refreshButton, closeButton, search, sortSelect, ...buttons.values()].filter(button => !button.disabled && button.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  narrow.addEventListener("change", updatePresentation);
  window.addEventListener("pagehide", () => { close(false); stopped = true; files = []; tree = []; rows = []; buttons.clear(); treeElement.replaceChildren(); });
  window.addEventListener("pageshow", () => { stopped = false; sync(); });
  sync();
  return { sync, refresh, select, rename, close, isOpen: () => opened, isBusy: actions.isBusy, isActionOpen: actions.isOpen };
}
