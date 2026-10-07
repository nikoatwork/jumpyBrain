// THROWAWAY FEASIBILITY ONLY; not a production editor plugin or Markdown parser.
// Bundle independently; inject the existing notes-browser createNoteSearch controller.
// Fixture must set editor onReference to a no-op so the normal modal stays closed.
// One text leaf in a paragraph, heading, or literal bullet. Context eligibility
// comes from the prototype Lexical bridge, not guessed source/DOM offsets.
// No multiline/cross-format triggers or global duplicate-title guarantees.
import type { createNoteEditor } from "./editor.js";
import { safeTitle } from "./reference-ranges.js";

type Bridge = Pick<ReturnType<typeof createNoteEditor>, "autocompleteRange" | "subscribeReferenceContext" | "captureSelection" | "getMarkdown" | "insertReference" | "restoreSelection">;
type Result = { documentId: string | null; title: string; referenceTitle: string | null };
type SearchState = { query: string; status: string; results: Result[]; selected: number; stale: boolean; message: string };
type Search = { state: SearchState; query(value: string, immediate?: boolean): void; cancel(): void; move(delta: number): void };
export type AutocompleteOptions = {
  createSearch(effects: {
    setTimer(callback: () => void, delay: number): number;
    clearTimer(timer: number): void;
    abortController(): AbortController;
    fetch(query: string, signal: AbortSignal): Promise<unknown>;
    onChange(state: SearchState): void;
  }): Search;
  fetch(query: string, signal: AbortSignal): Promise<unknown>;
  // Caller MUST refresh/dismiss synchronously on document/credential transitions.
  getSession?: () => unknown;
  onError?: (error: unknown) => void;
};

export function installAutocomplete(element: HTMLElement, bridge: Bridge, options: AutocompleteOptions) {
  const doc = element.ownerDocument, win = doc.defaultView!;
  const popup = doc.createElement("div");
  popup.dataset.referenceAutocomplete = "true";
  popup.setAttribute("role", "listbox"); popup.setAttribute("aria-label", "Page references (prototype)");
  popup.style.cssText = "position:fixed;z-index:10000;box-sizing:border-box;width:320px;max-height:240px;overflow:auto;background:white;color:#222;border:1px solid #aaa;border-radius:6px;padding:6px;box-shadow:0 4px 16px #0002;touch-action:none";
  popup.hidden = true; doc.body.append(popup);
  let destroyed = false, composing = false, frame = 0, active = false;
  let session = options.getSession?.(), signature = "", suppressed = "", feedback = "";
  let current: ReturnType<typeof live> = null;
  const cleanups: (() => void)[] = [];
  const search = options.createSearch({
    setTimer: (callback, delay) => win.setTimeout(callback, delay),
    clearTimer: (timer) => win.clearTimeout(timer), abortController: () => new AbortController(),
    fetch: options.fetch, onChange: () => { if (!destroyed) refresh(); },
  });

  function live() {
    const native = doc.getSelection();
    if (composing || !element.isContentEditable || !element.contains(doc.activeElement) || !native?.isCollapsed || !native.rangeCount
        || !native.anchorNode || !element.contains(native.anchorNode) || native.anchorNode.nodeType !== 3) return null;
    const value = bridge.getMarkdown();
    const caret = bridge.captureSelection(), range = bridge.autocompleteRange();
    if (!caret?.isCollapsed() || !range || range.value !== value || !range.text.startsWith("[[")
        || /[\[\]\r\n]/.test(range.query) || range.selection.anchor.key !== caret.anchor.key
        || range.selection.focus.key !== caret.anchor.key || caret.anchor.type !== "text"
        || caret.anchor.offset !== range.selection.anchor.offset + 2 + range.query.length
        || native.anchorOffset !== caret.anchor.offset) return null;
    // Verify committed bridge state still describes this live native leaf; never
    // accept captureSelection's last-selection fallback from another surface.
    const text = native.anchorNode.textContent || "", start = range.selection.anchor.offset;
    if (text.slice(start, range.selection.focus.offset) !== range.text || /[\\[!]/.test(text[start - 1] || "")
        || text.slice(0, start).replace(/\[\[[^\[\]]*\]\]/g, "").includes("[")) return null;
    const key = JSON.stringify([value, caret.anchor.key, caret.anchor.offset, start, range.query]);
    return { range, caret, key, native: native.getRangeAt(0).cloneRange() };
  }
  function hide() {
    active = false; current = null; signature = ""; popup.hidden = true; search.cancel();
  }
  function dismiss() { suppressed = live()?.key || ""; hide(); }
  function position() {
    if (!current || popup.hidden) return;
    const rect = current.native.getClientRects()[0] || current.native.getBoundingClientRect();
    // No measurement characters or editor DOM mutation. If the browser supplies
    // no collapsed-range rect, omit the popup rather than invent a caret location.
    if (!rect || !rect.height) { popup.hidden = true; return; }
    const viewport = win.visualViewport, x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth, height = viewport?.height || win.innerHeight;
    if (rect.bottom < y || rect.top > y + height || rect.right < x || rect.left > x + width) { popup.hidden = true; return; }
    // Also hide when a scrolling ancestor clips the caret.
    for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if ((/(auto|scroll|hidden|clip)/.test(style.overflowY) && (rect.bottom < bounds.top || rect.top > bounds.bottom))
          || (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (rect.right < bounds.left || rect.left > bounds.right))) { popup.hidden = true; return; }
    }
    popup.style.maxWidth = Math.max(0, width - 16) + "px";
    popup.style.maxHeight = Math.max(0, Math.min(240, height - 16)) + "px";
    const box = popup.getBoundingClientRect();
    const top = rect.bottom + 4 + box.height <= y + height - 8 ? rect.bottom + 4 : rect.top - box.height - 4;
    popup.style.left = Math.max(x + 8, Math.min(rect.left, x + width - box.width - 8)) + "px";
    popup.style.top = Math.max(y + 8, Math.min(top, y + height - box.height - 8)) + "px";
  }
  function problem(result: Result) {
    const title = result.referenceTitle;
    if (!result.documentId || !title || !safeTitle(title)) return "No safe exact page title. Choose another note.";
    return search.state.results.some((other) => other.documentId !== result.documentId && other.referenceTitle?.trim().toLowerCase() === title.toLowerCase())
      ? "Several results share this title. Choose another title." : "";
  }
  function render() {
    const state = search.state;
    popup.replaceChildren();
    const message = doc.createElement("div"); message.setAttribute("role", "status");
    message.textContent = feedback || (!state.query ? "Type a page title…" : state.status === "ready" && state.results.length
      ? "↑ ↓ choose · Enter insert · Esc close" : state.message);
    if (state.stale) message.textContent += " · Index may be stale";
    popup.append(message);
    state.results.forEach((result, index) => {
      const row = doc.createElement("div"); row.dataset.index = String(index);
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(index === state.selected));
      row.setAttribute("aria-disabled", String(Boolean(problem(result))));
      row.textContent = result.title; row.style.cssText = "padding:7px;cursor:pointer;overflow-wrap:anywhere";
      if (index === state.selected) row.style.background = "#eee";
      popup.append(row);
    });
    popup.hidden = false; position();
    // Accessibility is illustrative only: no production combobox/AT contract.
  }
  function refresh() {
    if (destroyed) return;
    try {
      const nextSession = options.getSession?.();
      if (!Object.is(session, nextSession)) { session = nextSession; dismiss(); return; }
      const next = live();
      if (!next) { suppressed = ""; hide(); return; }
      if (next.key === suppressed) { hide(); return; }
      suppressed = ""; current = next; active = true;
      if (signature !== next.key) {
        signature = next.key; feedback = "";
        // Controller owns debounce, normalization, ranking, abort/generation and
        // empty-query behavior. Same-query caret movement also cancels old work.
        search.query(next.range.query); return;
      }
      render();
    } catch (error) { hide(); options.onError?.(error); }
  }
  function schedule() { if (!destroyed && !frame) frame = win.requestAnimationFrame(() => { frame = 0; refresh(); }); }
  function choose(index: number) {
    const expected = signature, oldSession = session, result = search.state.results[index];
    refresh();
    if (!result || !active || popup.hidden || signature !== expected || !Object.is(session, oldSession)) return;
    const error = problem(result);
    if (error) { feedback = error; render(); return; }
    try {
      const next = live();
      if (!next || next.key !== expected) { hide(); return; }
      // Selection is captured NOW, not when the popup opened. Pointer handlers
      // prevent blur. Bridge insertion carries the editor's undo history tag.
      bridge.restoreSelection(next.caret);
      const revalidated = live();
      if (!revalidated || revalidated.key !== expected) { hide(); return; }
      if (!bridge.insertReference(revalidated.range, "[[" + result.referenceTitle + "]]")) throw new Error("Reference insertion rejected: editor changed.");
      hide(); schedule();
    } catch (error) { hide(); options.onError?.(error); }
  }
  function listen(target: EventTarget, name: string, callback: EventListener, capture = false) {
    target.addEventListener(name, callback, capture); cleanups.push(() => target.removeEventListener(name, callback, capture));
  }
  listen(element, "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.isComposing || composing || key.keyCode === 229 || key.metaKey || key.ctrlKey || key.altKey || key.shiftKey) return;
    refresh();
    if (!active || popup.hidden) return;
    if (key.key === "Escape") { key.preventDefault(); key.stopImmediatePropagation(); dismiss(); }
    else if (["ArrowDown", "ArrowUp", "Enter"].includes(key.key) && search.state.results.some((result) => result.documentId)) {
      key.preventDefault(); key.stopImmediatePropagation();
      if (key.key === "Enter") choose(search.state.selected);
      else { search.move(key.key === "ArrowDown" ? 1 : -1); popup.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }
    }
  }, true);
  // Handle mouse/touch at pointerdown, before focus/selection can leave editor.
  // Immediate touch activation is intentional; no touch scrolling/drag picker UX.
  listen(popup, "pointerdown", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0 || !pointer.isPrimary) return;
    event.preventDefault();
    const row = (event.target as Element).closest<HTMLElement>("[data-index]");
    if (row) choose(Number(row.dataset.index));
  });
  listen(doc, "pointerdown", (event) => { if (!element.contains(event.target as Node) && !popup.contains(event.target as Node)) dismiss(); }, true);
  listen(element, "compositionstart", () => { composing = true; hide(); });
  listen(element, "compositionend", () => { composing = false; schedule(); });
  for (const name of ["beforeinput", "input"]) listen(element, name, (event) => {
    if ((event as InputEvent).isComposing) { composing = true; hide(); } else schedule();
  });
  for (const name of ["keyup", "pointerup", "focus", "blur"]) listen(element, name, schedule);
  listen(doc, "selectionchange", schedule);
  listen(win, "blur", () => dismiss());
  listen(win, "scroll", schedule, true); listen(win, "resize", schedule);
  if (win.visualViewport) { listen(win.visualViewport, "scroll", schedule); listen(win.visualViewport, "resize", schedule); }
  // Supported editor lifecycle seam covers undo/programmatic edits and avoids
  // a MutationObserver over the entire contenteditable tree.
  cleanups.push(bridge.subscribeReferenceContext(schedule));
  schedule();
  return {
    refresh, dismiss,
    get state() { return { active: active && !popup.hidden, composing, query: search.state.query, status: search.state.status, feedback }; },
    destroy() {
      if (destroyed) return;
      destroyed = true; hide(); win.cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup()); popup.remove();
    },
  };
}
Object.assign(window, { installReferenceAutocomplete: installAutocomplete });
