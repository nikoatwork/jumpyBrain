import { memoryDocumentPath, HTTP_MEMORY_ROUTES } from "../http-protocol.js";
import type { ExplorerNode } from "./folder-explorer-model.js";

export interface ExplorerOperationHost {
  writable(): boolean;
  json(url: string, options?: RequestInit): Promise<unknown>;
  guard<T>(operation: () => Promise<T>): Promise<T>;
  link(id: string): string;
  deleteFile(id: string): Promise<void>;
  changed(result: { id?: string; file?: string }): void;
}

/** Panel-local interaction state. Filesystem/concurrency policy stays behind the host transport. */
export function installExplorerActions(options: {
  document: Document; window: Window; tree: HTMLElement;
  scope(): string; enabled(): boolean; host?: ExplorerOperationHost;
  node(path: string): ExplorerNode | undefined;
  folders(): string[]; refresh(): Promise<void>;
  reveal(path: string): void; focus(path: string): void;
  message(text: string): void;
}) {
  const { document, window, tree, host } = options;
  const menu = document.getElementById("folder-explorer-menu")!;
  const dialog = document.getElementById("folder-explorer-edit") as HTMLDialogElement;
  const heading = document.getElementById("folder-explorer-edit-title")!;
  const input = document.getElementById("folder-explorer-name") as HTMLInputElement;
  const destination = document.getElementById("folder-explorer-destination") as HTMLSelectElement;
  const label = document.getElementById("folder-explorer-name-label")!;
  const error = document.getElementById("folder-explorer-edit-error")!;
  const save = document.getElementById("folder-explorer-save") as HTMLButtonElement;
  const create = document.getElementById("folder-explorer-new") as HTMLButtonElement;
  let busy = false, context: ExplorerNode | null = null;
  let edit: { action: "rename" | "create" | "move"; node: ExplorerNode; scope: string } | null = null;
  let dragging: { node: ExplorerNode; scope: string } | null = null, hover: ReturnType<typeof setTimeout> | undefined;
  let dropPath: string | null = null;
  const writable = () => Boolean(host && options.enabled() && host.writable() && !busy);
  const rowAt = (target: EventTarget | null) => (target as Element | null)?.closest<HTMLElement>("[data-explorer-path]");
  function clearDrop() {
    clearTimeout(hover); hover = undefined; dropPath = null;
    for (const row of tree.querySelectorAll("[data-drop-target]")) row.removeAttribute("data-drop-target");
  }
  function hideMenu(restore = false) {
    const node = context; menu.hidden = true; menu.replaceChildren(); context = null;
    if (restore && node) options.focus(node.path);
  }
  function reset() {
    hideMenu(); dialog.close(); edit = null; input.value = ""; destination.replaceChildren(); error.textContent = "";
    dragging = null; clearDrop(); create.disabled = !writable();
  }
  function finishEdit() {
    if (busy) return;
    const node = edit?.node; dialog.close(); edit = null; input.value = ""; destination.replaceChildren(); error.textContent = "";
    if (node) options.focus(node.path);
  }
  function openEdit(action: "rename" | "create" | "move", node: ExplorerNode) {
    hideMenu();
    if (!writable()) return;
    edit = { action, node: { ...node }, scope: options.scope() };
    error.textContent = ""; save.disabled = false;
    heading.textContent = action === "create" ? "New folder" : action === "rename" ? "Rename file" : "Move file";
    label.textContent = action === "create" ? "Folder name" : "File name";
    label.hidden = input.hidden = action === "move"; input.required = action !== "move";
    destination.hidden = action !== "move";
    input.value = action === "rename" ? node.path.split("/").at(-1)! : "";
    if (action === "move") {
      destination.replaceChildren(...options.folders().map(folder => {
        const option = document.createElement("option"); option.value = option.textContent = folder;
        option.selected = folder === node.path.slice(0, node.path.lastIndexOf("/"));
        return option;
      }));
    }
    dialog.showModal();
    if (action === "move") destination.focus();
    else { input.focus(); input.setSelectionRange(0, action === "rename" ? input.value.length - 3 : input.value.length); }
  }
  async function mutate(operation: Record<string, unknown>, node: ExplorerNode, origin: string) {
    if (!writable() || !host || origin !== options.scope()) return false;
    busy = true; create.disabled = true; save.disabled = true;
    try {
      await host.guard(async () => {
        if (origin !== options.scope() || !options.enabled() || !host.writable()) throw new Error("The active brain changed. Reopen the action.");
        let hash: string | undefined;
        if (operation.action === "move-file") {
          const snapshot = await host.json(memoryDocumentPath(node.id!)) as { id: string; file: string; contentHash: string };
          if (snapshot.id !== node.id || snapshot.file !== node.path || typeof snapshot.contentHash !== "string") throw new Error("This file moved. Refresh folders before trying again.");
          hash = snapshot.contentHash;
        }
        if (origin !== options.scope() || !options.enabled() || !host.writable()) throw new Error("The active brain changed. Reopen the action.");
        const result = await host.json(HTTP_MEMORY_ROUTES.fileOperations, { method: "POST", headers: { "Content-Type": "application/json", ...(hash ? { "If-Match": hash } : {}) }, body: JSON.stringify(operation) }) as { created?: boolean; moved?: boolean; id?: string; file?: string; indexing?: { status: string } };
        if (origin !== options.scope() || !options.enabled()) return;
        if (operation.action === "create-folder" ? result.created !== true : typeof result.moved !== "boolean" || result.id !== node.id || result.file !== operation.destination) throw new Error("The operation could not be confirmed. Refresh folders before trying again.");
        host.changed(result);
        const path = typeof operation.path === "string" ? operation.path : result.file!;
        options.reveal(path);
        await options.refresh();
        if (origin !== options.scope() || !options.enabled()) return;
        options.focus(path);
        options.message(result.created ? "Folder created." : result.indexing?.status === "failed" ? "File moved. Search index refresh needs attention." : "File moved. Filename references may need updating.");
      });
      return true;
    } catch (failure) {
      if (origin === options.scope() && options.enabled()) {
        const status = (failure as { status?: number })?.status;
        const text = status === 412 ? "This file changed. Refresh folders before trying again."
          : failure instanceof Error ? failure.message : "Could not confirm the operation. Refresh folders before trying again.";
        if (dialog.open) error.textContent = text; else options.message(text);
      }
      return false;
    } finally { busy = false; create.disabled = !writable(); save.disabled = false; }
  }
  function move(node: ExplorerNode, folder: string, origin: string) {
    if (!node.id || !folder || folder === node.path.slice(0, node.path.lastIndexOf("/"))) return;
    void mutate({ action: "move-file", id: node.id, file: node.path, destination: `${folder}/${node.path.split("/").at(-1)}` }, node, origin);
  }
  function showMenu(node: ExplorerNode | null, x: number, y: number) {
    if (!options.enabled() || busy) return;
    hideMenu(); context = node;
    const menuScope = options.scope();
    const entries: { label: string; disabled?: boolean; run(): void }[] = [];
    const parent = !node ? options.node("notes") ?? options.node(options.folders()[0] ?? "") : node.kind === "folder" ? node : options.node(node.path.slice(0, node.path.lastIndexOf("/")));
    if (parent) entries.push({ label: "New folder…", disabled: !writable(), run: () => openEdit("create", parent) });
    if (node?.kind === "file") {
      entries.push({ label: "Copy link to file", disabled: !node.id, run: () => {
        const origin = options.scope();
        void (async () => {
          try { await window.navigator.clipboard.writeText(host!.link(node.id!)); if (origin === options.scope()) options.message("File link copied."); }
          catch { if (origin === options.scope()) options.message("Could not copy the file link. Check clipboard access."); }
        })();
      } });
      entries.push({ label: "Rename…", disabled: !writable() || !node.id, run: () => openEdit("rename", node) });
      entries.push({ label: "Move to…", disabled: !writable() || !node.id, run: () => openEdit("move", node) });
      entries.push({ label: "Delete file…", disabled: !writable() || !node.id, run: () => { void host!.deleteFile(node.id!).catch(() => options.message("Could not open this file for deletion. Retry any failed save first.")); } });
    }
    if (!entries.length || !host) return;
    menu.replaceChildren(...entries.map(entry => {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem");
      button.textContent = entry.label; button.disabled = Boolean(entry.disabled);
      button.addEventListener("click", () => { hideMenu(); if (menuScope === options.scope() && options.enabled()) entry.run(); }); return button;
    }));
    menu.hidden = false; menu.style.left = "0px"; menu.style.top = "0px";
    const size = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - size.width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - size.height - 8)) + "px";
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  tree.addEventListener("contextmenu", event => {
    event.preventDefault(); const row = rowAt(event.target);
    showMenu(row ? options.node(row.dataset.explorerPath!) ?? null : null, event.clientX, event.clientY);
  });
  tree.addEventListener("keydown", event => {
    const row = rowAt(event.target), node = row && options.node(row.dataset.explorerPath!);
    if (!node || event.isComposing) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); event.stopPropagation(); const rect = row!.getBoundingClientRect(); showMenu(node, rect.left + 16, rect.bottom);
    } else if (event.key === "F2" && node.kind === "file") { event.preventDefault(); openEdit("rename", node); }
  });
  menu.addEventListener("keydown", event => {
    event.stopPropagation();
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); hideMenu(true); }
  });
  document.addEventListener("pointerdown", event => { if (!menu.contains(event.target as Node)) hideMenu(); });
  tree.addEventListener("scroll", () => hideMenu());
  window.addEventListener("resize", () => hideMenu());
  create.addEventListener("click", () => {
    const parent = options.node("notes") ?? options.node(options.folders()[0] ?? "");
    if (parent) openEdit("create", parent);
  });
  document.getElementById("folder-explorer-cancel")!.addEventListener("click", finishEdit);
  dialog.addEventListener("cancel", event => { event.preventDefault(); finishEdit(); });
  dialog.addEventListener("keydown", event => { event.stopPropagation(); });
  dialog.querySelector("form")!.addEventListener("submit", event => {
    event.preventDefault();
    const current = edit;
    if (!current || !writable()) return;
    if (current.action === "move") {
      const target = `${destination.value}/${current.node.path.split("/").at(-1)}`;
      void mutate({ action: "move-file", id: current.node.id, file: current.node.path, destination: target }, current.node, current.scope).then(ok => { if (ok && edit === current) { finishEdit(); options.focus(target); } });
      return;
    }
    const name = input.value.trim();
    if (!name || name.startsWith(".") || /[/\\\u0000-\u001f]/.test(name) || (current.action === "rename" && !/\.md$/i.test(name))) {
      error.textContent = current.action === "rename" ? "Enter a Markdown filename ending in .md, without slashes." : "Enter a folder name without slashes or a leading dot."; input.focus(); return;
    }
    const target = current.action === "create" ? `${current.node.path}/${name}` : current.node.path.slice(0, current.node.path.lastIndexOf("/") + 1) + name;
    const operation = current.action === "create" ? { action: "create-folder", path: target } : { action: "move-file", id: current.node.id, file: current.node.path, destination: target };
    void mutate(operation, current.node, current.scope).then(ok => { if (ok && edit === current) { finishEdit(); options.focus(target); } });
  });
  tree.addEventListener("dragstart", event => {
    const row = rowAt(event.target), node = row && options.node(row.dataset.explorerPath!);
    if (!writable() || node?.kind !== "file" || !node.id || !event.dataTransfer) { event.preventDefault(); return; }
    hideMenu(); dragging = { node: { ...node }, scope: options.scope() };
    event.dataTransfer.setData("application/x-jumpybrain-file", node.path); event.dataTransfer.effectAllowed = "move";
  });
  tree.addEventListener("dragover", event => {
    if (!dragging || !writable() || dragging.scope !== options.scope()) return;
    const row = rowAt(event.target), node = row && options.node(row.dataset.explorerPath!);
    if (node?.kind !== "folder" || dragging.node.path.slice(0, dragging.node.path.lastIndexOf("/")) === node.path) { clearDrop(); return; }
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (dropPath !== node.path) {
      clearDrop(); dropPath = node.path; row!.dataset.dropTarget = "true";
      hover = setTimeout(() => { if (dragging && dropPath === node.path) options.reveal(node.path + "/"); }, 650);
    }
  });
  tree.addEventListener("dragleave", event => { if (!tree.contains(event.relatedTarget as Node | null)) clearDrop(); });
  tree.addEventListener("drop", event => {
    const source = dragging, row = rowAt(event.target), node = row && options.node(row.dataset.explorerPath!);
    clearDrop(); dragging = null;
    if (!source || !writable() || node?.kind !== "folder" || source.scope !== options.scope()) return;
    event.preventDefault(); move(source.node, node.path, source.scope);
  });
  tree.addEventListener("dragend", () => { dragging = null; clearDrop(); });
  reset();
  return {
    reset,
    sync() {
      create.disabled = !writable();
      if (!options.enabled() || (edit && !host?.writable())) reset();
      else if (!host?.writable()) for (const button of menu.querySelectorAll<HTMLButtonElement>("button")) if (button.textContent !== "Copy link to file") button.disabled = true;
    },
    isBusy: () => busy, isOpen: () => dialog.open || !menu.hidden,
  };
}
