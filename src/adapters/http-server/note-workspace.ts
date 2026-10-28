import { metadataDate } from "../../core/canonical/metadata-date.js";
import type { createDocumentEditor } from "./document-controller.js";
import type { MemoryActor, SearchRecognitionMetadata } from "../../types.js";

/** Facts about the accepted saved revision; never attribution for a live draft. */
export function savedVersionContext(recognition: SearchRecognitionMetadata | undefined, actor: MemoryActor) {
  const current = recognition?.metadataStatus === "current";
  const editor = current ? recognition.editor : undefined;
  const label = editor?.kind === "human"
    ? actor.id && editor.id === actor.id ? "You" : editor.name ? "Person · " + editor.name : "A person"
    : editor?.kind === "agent" ? editor.name ? "Agent · " + editor.name : "An agent" : "Editor unknown";
  const date = current ? metadataDate(recognition.updatedAt) : undefined;
  return { editor: label, edited: date?.length === 10 ? date : date ? new Date(date).toLocaleString(undefined, { timeZoneName: "short" }) : "Date unknown" };
}

/** View-only context over the existing editor. Transport and save policy stay with the host. */
export function installNoteWorkspace(options: {
  document: Document; editor(): ReturnType<typeof createDocumentEditor> | null;
  actor(): MemoryActor; writable(): boolean;
}) {
  const doc = options.document, win = doc.defaultView!;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const toggle = $<HTMLButtonElement>("toggle-page-details"), panel = $("page-details");
  const layout = $("note-layout"), body = $("note-editor"), list = $("note-outline-list");
  let key = "", signature = "", open = false, stopped = false, frame = 0;
  let headings: HTMLElement[] = [];
  function show(value: boolean, restore = false) {
    open = value;
    panel.hidden = !open;
    layout.dataset.details = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    if (restore && !toggle.hidden) toggle.focus({ preventScroll: true });
    if (open) syncOutline();
  }
  function syncOutline() {
    if (!open || stopped) return;
    headings = [...body.querySelectorAll<HTMLElement>(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6")];
    const next = JSON.stringify(headings.map(heading => [heading.tagName, heading.textContent]));
    if (next === signature) return;
    signature = next;
    list.replaceChildren();
    $("note-outline").hidden = !headings.length;
    headings.forEach((heading, index) => {
      const item = doc.createElement("li"), button = doc.createElement("button");
      button.type = "button";
      button.className = "outline-link";
      button.textContent = heading.textContent || "Untitled section";
      button.title = button.textContent;
      button.style.setProperty("--heading-depth", String(Number(heading.tagName.slice(1)) - 1));
      button.addEventListener("click", () => {
        const editor = options.editor(), target = headings[index];
        if (!editor?.state.loaded || editor.state.cancelled || editor.state.navigationPending || !target?.isConnected || !body.contains(target)) return;
        target.scrollIntoView({ block: "start", behavior: "instant" });
        // User-requested section navigation places the caret at the section start.
        body.focus({ preventScroll: true });
        const range = doc.createRange(); range.selectNodeContents(target); range.collapse(true);
        const selection = win.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      });
      item.append(button); list.append(item);
    });
  }
  function sync() {
    const state = options.editor()?.state;
    const loaded = state?.loaded && !state.cancelled;
    const next = loaded ? String(state.generation) + ":" + state.documentId : "";
    if (key !== next) {
      key = next; signature = ""; headings = []; list.replaceChildren();
      $("note-outline").hidden = true;
      $("note-file").textContent = "";
      $("saved-version-editor").textContent = "";
      $("saved-version-edited").textContent = "";
      show(false, panel.contains(doc.activeElement));
    }
    toggle.hidden = !loaded;
    toggle.disabled = Boolean(state?.navigationPending);
    $("note-editor-hint").hidden = !loaded || !options.writable() || Boolean(state?.navigationPending) || !/^\n*$/.test(state?.draft ?? "")
      || Boolean(body.querySelector(".markdown-literal, .markdown-code-block, .markdown-task, .markdown-table, h1, h2, h3, h4, h5, h6"));
    if (!loaded) return;
    const context = savedVersionContext(state.recognition, options.actor());
    $("saved-version-editor").textContent = context.editor;
    $("saved-version-edited").textContent = context.edited;
    $("note-file").textContent = state.file || "Location unavailable";
    syncOutline();
  }
  const onToggle = () => { sync(); if (!toggle.disabled && !toggle.hidden) show(!open); };
  const onClose = () => show(false, true);
  const onKey = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && !event.isComposing && event.key === "Escape" && open && !doc.querySelector("dialog[open], [popover]:popover-open:not([role=tooltip])")) {
      event.preventDefault(); event.stopPropagation(); onClose();
    }
  };
  toggle.addEventListener("click", onToggle);
  $("close-page-details").addEventListener("click", onClose);
  panel.addEventListener("keydown", onKey);
  // Observe mounted supported headings, not a second Markdown parser. Coalesce
  // DOM updates and retain row identity/focus while only body prose changes.
  const observer = new MutationObserver(() => {
    if (frame || stopped) return;
    frame = win.requestAnimationFrame(() => { frame = 0; sync(); });
  });
  observer.observe(body, { subtree: true, childList: true, characterData: true });
  win.addEventListener("pagehide", () => {
    stopped = true; observer.disconnect(); win.cancelAnimationFrame(frame); frame = 0;
    key = ""; headings = []; signature = ""; list.replaceChildren(); show(false);
  });
  win.addEventListener("pageshow", event => {
    if (event.persisted) { stopped = false; observer.observe(body, { subtree: true, childList: true, characterData: true }); sync(); }
  });
  sync();
  return { sync };
}
