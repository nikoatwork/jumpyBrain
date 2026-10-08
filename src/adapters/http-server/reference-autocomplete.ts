// Browser-only, framework-free presentation over the injected notes search controller.
// Recognition, source offsets, and undoable replacement belong to the editor bridge.
import type { createNoteEditor } from "./lexical-editor.js";
import { safeTitle } from "./reference-ranges.js";

type Bridge = Pick<ReturnType<typeof createNoteEditor>, "autocompleteRange" | "subscribeReferenceContext" | "captureSelection" | "getMarkdown" | "insertReference" | "restoreSelection">;
type Result = { documentId: string | null; title: string; referenceTitle: string | null };
type SearchState = { query: string; status: string; results: Result[]; selected: number; stale: boolean; message: string };
type Search = {
  state: SearchState;
  query(value: string, immediate?: boolean): void;
  cancel(): void;
  move(delta: number): void;
  markStale(): void;
};
export type AutocompleteOptions = {
  createSearch(effects: {
    setTimer(callback: () => void, delay: number): number;
    clearTimer(timer: number): void;
    abortController(): AbortController;
    fetch(query: string, signal: AbortSignal): Promise<unknown>;
    onChange(state: SearchState): void;
  }): Search;
  // The host owns authentication, transport, and synchronous dismissal before
  // document/credential/modal/navigation transitions (not just a later refresh).
  fetch(query: string, signal: AbortSignal): Promise<unknown>;
  getSession?: () => unknown;
  isEnabled?: () => boolean;
  onError?: (error: unknown) => void;
};

let nextId = 0;
export function installReferenceAutocomplete(element: HTMLElement, bridge: Bridge, options: AutocompleteOptions) {
  const doc = element.ownerDocument, win = doc.defaultView!;
  const id = "reference-autocomplete-" + ++nextId;
  const popup = doc.createElement("div"), list = doc.createElement("div"), status = doc.createElement("div");
  popup.dataset.referenceAutocomplete = "true";
  popup.style.cssText = "position:fixed;z-index:10000;box-sizing:border-box;width:320px;max-height:240px;overflow:auto;background:var(--surface,white);color:var(--ink,#222);border:1px solid var(--line,#aaa);border-radius:6px;padding:6px;box-shadow:0 4px 16px #0002;touch-action:pan-y;overscroll-behavior:contain;user-select:none;-webkit-user-select:none";
  list.id = id;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Page references");
  // A live region must not be a listbox child (only options belong there).
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.style.cssText = "padding:4px 7px;font-size:0.875em;overflow-wrap:anywhere";
  popup.append(status, list);
  popup.hidden = true;
  doc.body.append(popup);
  const attributes = ["role", "aria-autocomplete", "aria-controls", "aria-activedescendant", "aria-haspopup"];
  const original = new Map(attributes.map((name) => [name, element.getAttribute(name)]));
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-autocomplete", "list");
  element.setAttribute("aria-haspopup", "listbox");
  element.setAttribute("aria-controls", [original.get("aria-controls"), id].filter(Boolean).join(" "));
  element.removeAttribute("aria-activedescendant");

  let destroyed = false, composing = false, frame = 0, active = false;
  let session = options.getSession?.(), signature = "", suppressed = "", feedback = "";
  let current: ReturnType<typeof live> = null;
  let renderedKey = "", renderedResults: Result[] = [];
  let blockedClickUntil = 0;
  type Gesture = {
    pointerId: number; x: number; y: number; scrollTop: number; moved: boolean;
    index: number; result: Result | undefined; key: string; session: unknown;
  };
  let gesture: Gesture | null = null, pendingTap: Gesture | null = null;
  let tapTimer = 0;
  const cleanups: (() => void)[] = [];
  const search = options.createSearch({
    setTimer: (callback, delay) => win.setTimeout(callback, delay),
    clearTimer: (timer) => win.clearTimeout(timer),
    abortController: () => new AbortController(),
    fetch: options.fetch,
    onChange: () => { if (!destroyed) refresh(); },
  });

  function live() {
    const native = doc.getSelection();
    if (destroyed || composing || options.isEnabled?.() === false || !element.isContentEditable
        || !element.contains(doc.activeElement) || !native?.isCollapsed || !native.rangeCount
        || !native.anchorNode || !element.contains(native.anchorNode) || native.anchorNode.nodeType !== 3) return null;
    const value = bridge.getMarkdown();
    const caret = bridge.captureSelection(), range = bridge.autocompleteRange();
    if (!caret?.isCollapsed() || !range || range.value !== value || !range.text.startsWith("[[")
        || /[\[\]\r\n]/.test(range.query) || range.selection.anchor.key !== caret.anchor.key
        || range.selection.focus.key !== caret.anchor.key || caret.anchor.type !== "text"
        || caret.anchor.offset !== range.selection.anchor.offset + 2 + range.query.length
        || native.anchorOffset !== caret.anchor.offset) return null;
    // Never accept captureSelection's last-selection fallback from another surface.
    const text = native.anchorNode.textContent || "", start = range.selection.anchor.offset;
    if (text.slice(start, range.selection.focus.offset) !== range.text || /[\\[!]/.test(text[start - 1] || "")
        || text.slice(0, start).replace(/\[\[[^\[\]]*\]\]/g, "").includes("[")) return null;
    const key = JSON.stringify([value, caret.anchor.key, caret.anchor.offset, start, range.query]);
    return { range, caret, key, native: native.getRangeAt(0).cloneRange() };
  }
  function cancelGesture() {
    if (gesture || pendingTap) blockedClickUntil = win.performance.now() + 800;
    gesture = null; pendingTap = null;
    win.clearTimeout(tapTimer);
  }
  function hide() {
    active = false; current = null; signature = ""; popup.hidden = true;
    element.removeAttribute("aria-activedescendant");
    cancelGesture();
    search.cancel();
  }
  function dismiss() {
    if (destroyed) return;
    // Retain suppression even when the host has already disabled the editor.
    suppressed = current?.key || live()?.key || "";
    hide();
  }
  function position() {
    if (!current || popup.hidden) return;
    const rect = current.native.getClientRects()[0] || current.native.getBoundingClientRect();
    // No measurement characters or editor DOM mutation. Missing geometry fails closed.
    if (!rect || !rect.height) { popup.hidden = true; return; }
    const viewport = win.visualViewport, x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth, height = viewport?.height || win.innerHeight;
    if (width <= 16 || height <= 16 || rect.bottom < y || rect.top > y + height || rect.right < x || rect.left > x + width) {
      popup.hidden = true; return;
    }
    for (let parent: HTMLElement | null = element; parent && parent !== doc.body; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if ((/(auto|scroll|hidden|clip)/.test(style.overflowY) && (rect.bottom < bounds.top || rect.top > bounds.bottom))
          || (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (rect.right < bounds.left || rect.left > bounds.right))) {
        popup.hidden = true; return;
      }
    }
    popup.style.maxWidth = Math.max(0, width - 16) + "px";
    popup.style.maxHeight = Math.max(0, Math.min(240, height - 16)) + "px";
    const box = popup.getBoundingClientRect();
    const top = rect.bottom + 4 + box.height <= y + height - 8 ? rect.bottom + 4 : rect.top - box.height - 4;
    popup.style.left = Math.max(x + 8, Math.min(rect.left, x + width - box.width - 8)) + "px";
    popup.style.top = Math.max(y + 8, Math.min(top, y + height - box.height - 8)) + "px";
  }
  function sameResult(left: Result | undefined, right: Result | undefined) {
    return Boolean(left && right && left.documentId === right.documentId && left.title === right.title && left.referenceTitle === right.referenceTitle);
  }
  function problem(result: Result) {
    const title = result.referenceTitle;
    if (!result.documentId || !title || !safeTitle(title)) return "No safe exact page title. Choose another note.";
    return search.state.results.some((other) => other.documentId !== result.documentId && other.referenceTitle?.trim().toLowerCase() === title.toLowerCase())
      ? "Several results share this title. Choose another title." : "";
  }
  function render() {
    const state = search.state;
    const key = JSON.stringify(state.results.map((result) => [result.documentId, result.title, result.referenceTitle]));
    // Freshness/selection refreshes must never detach a pointer's click target.
    // Defer even a changed result set until release; acceptance checks its identity.
    if (key !== renderedKey && !gesture && !pendingTap) {
      renderedKey = key;
      renderedResults = state.results.map((result) => ({ ...result }));
      list.replaceChildren(...renderedResults.map((result, index) => {
        const row = doc.createElement("div");
        row.id = id + "-option-" + index;
        row.dataset.index = String(index);
        row.setAttribute("role", "option");
        row.textContent = result.title;
        row.style.cssText = "padding:7px;cursor:pointer;overflow-wrap:anywhere";
        return row;
      }));
    }
    let selectedId = "";
    Array.from(list.children).forEach((child, index) => {
      const row = child as HTMLElement, result = renderedResults[index];
      const selected = index === state.selected && sameResult(result, state.results[index]);
      const error = problem(result);
      row.setAttribute("aria-selected", String(selected));
      row.setAttribute("aria-disabled", String(Boolean(error)));
      row.setAttribute("aria-label", result.title + (error ? ". " + error : ""));
      row.style.background = selected ? "var(--surface-hover,#eee)" : "";
      if (selected) selectedId = row.id;
    });
    const message = (feedback || (!state.query ? "Type a page title…" : state.status === "ready" && state.results.length
      ? state.results.length + " suggestions. Up and Down to choose, Enter to insert, Escape to close." : state.message))
      + (state.stale ? " · Index may be stale" : "");
    // Do not move a held row by wrapping new freshness/status text above it.
    // Also avoid repeating identical live announcements on geometry updates.
    if (!gesture && !pendingTap && status.textContent !== message) status.textContent = message;
    popup.hidden = false;
    position();
    if (!popup.hidden && selectedId) element.setAttribute("aria-activedescendant", selectedId);
    else element.removeAttribute("aria-activedescendant");
  }
  function refresh() {
    if (destroyed) return;
    try {
      const nextSession = options.getSession?.();
      if (!Object.is(session, nextSession)) { session = nextSession; dismiss(); return; }
      const next = live();
      if (!next) { hide(); return; }
      if (next.key === suppressed) { hide(); return; }
      suppressed = ""; current = next; active = true;
      if (signature !== next.key) {
        cancelGesture();
        signature = next.key; feedback = "";
        // Search owns debounce, normalization, ranking, abort/generation, and
        // empty-query behavior. A changed caret also invalidates old requests.
        search.query(next.range.query);
        return;
      }
      render();
    } catch (error) { hide(); options.onError?.(error); }
  }
  function schedule() {
    if (!destroyed && !frame) frame = win.requestAnimationFrame(() => { frame = 0; refresh(); });
  }
  function choose(index: number, result = renderedResults[index], expected = signature, oldSession = session) {
    refresh();
    if (!result || !active || popup.hidden || signature !== expected || !Object.is(session, oldSession)
        || !sameResult(result, search.state.results[index])) return;
    const error = problem(result);
    if (error) { feedback = error; render(); return; }
    try {
      const next = live();
      if (!next || next.key !== expected || !Object.is(options.getSession?.(), oldSession)) { hide(); return; }
      bridge.restoreSelection(next.caret);
      const revalidated = live();
      if (!revalidated || revalidated.key !== expected || !Object.is(options.getSession?.(), oldSession)) { hide(); return; }
      if (!bridge.insertReference(revalidated.range, "[[" + result.referenceTitle + "]]")) {
        throw new Error("Reference insertion rejected: editor changed.");
      }
      hide(); schedule();
    } catch (error) { hide(); options.onError?.(error); }
  }
  function listen(target: EventTarget, name: string, callback: EventListener, capture = false) {
    target.addEventListener(name, callback, capture);
    cleanups.push(() => target.removeEventListener(name, callback, capture));
  }
  function rowAt(target: EventTarget | null) {
    const node = target as Node | null;
    const row = (node?.nodeType === 1 ? node as Element : node?.parentElement)?.closest<HTMLElement>("[data-index]");
    return row && list.contains(row) ? row : null;
  }
  function revealSelected() {
    const row = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row) return;
    // Only scroll the popup, never the document/editor behind it.
    const bounds = popup.getBoundingClientRect(), rect = row.getBoundingClientRect();
    if (rect.top < bounds.top) popup.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom) popup.scrollTop += rect.bottom - bounds.bottom;
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
      else { search.move(key.key === "ArrowDown" ? 1 : -1); revealSelected(); }
    }
  }, true);
  listen(popup, "pointerdown", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0 || !pointer.isPrimary || popup.hidden) return;
    cancelGesture();
    const row = rowAt(event.target), index = row ? Number(row.dataset.index) : -1;
    gesture = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY,
      scrollTop: popup.scrollTop, moved: false, index, result: renderedResults[index], key: signature, session };
    // Touch must retain native panning. Non-focusable, unselectable rows plus
    // cancelling compatibility mousedown keep the editable surface focused.
    if (pointer.pointerType !== "touch" && row) event.preventDefault();
  });
  listen(popup, "mousedown", (event) => { if ((event as MouseEvent).button === 0) event.preventDefault(); });
  listen(doc, "pointermove", (event) => {
    const pointer = event as PointerEvent;
    if (gesture?.pointerId === pointer.pointerId && Math.hypot(pointer.clientX - gesture.x, pointer.clientY - gesture.y) > 10) gesture.moved = true;
  }, true);
  listen(popup, "scroll", () => { if (gesture && popup.scrollTop !== gesture.scrollTop) gesture.moved = true; });
  listen(doc, "pointerup", (event) => {
    const pointer = event as PointerEvent, pending = gesture;
    if (!pending || pending.pointerId !== pointer.pointerId) return;
    gesture = null;
    blockedClickUntil = win.performance.now() + 800;
    // Touch uses implicit capture, so hit-test release instead of trusting target.
    const row = rowAt(doc.elementFromPoint(pointer.clientX, pointer.clientY));
    const tap = !pending.moved && Math.hypot(pointer.clientX - pending.x, pointer.clientY - pending.y) <= 10
      && popup.scrollTop === pending.scrollTop && row && Number(row.dataset.index) === pending.index;
    if (tap && pending.result) {
      if (pointer.pointerType === "touch") {
        // Keep the row mounted through compatibility mousedown so it cannot
        // blur the editor by being retargeted underneath a now-hidden popup.
        // Native touch scrolling is untouched; only the eventual click accepts.
        pendingTap = pending;
        tapTimer = win.setTimeout(() => { pendingTap = null; refresh(); }, 800);
      } else {
        event.preventDefault();
        choose(pending.index, pending.result, pending.key, pending.session);
      }
    } else refresh();
  }, true);
  listen(doc, "pointercancel", (event) => {
    if (gesture?.pointerId !== (event as PointerEvent).pointerId) return;
    cancelGesture(); refresh();
  }, true);
  listen(popup, "click", (event) => {
    const click = event as MouseEvent, row = rowAt(event.target);
    if (!row || click.button !== 0) return;
    event.preventDefault();
    const pending = pendingTap;
    if (pending) {
      pendingTap = null; win.clearTimeout(tapTimer);
      if (Number(row.dataset.index) === pending.index) choose(pending.index, pending.result, pending.key, pending.session);
      else refresh();
      return;
    }
    // AT can dispatch click without any pointer sequence (usually detail=0).
    // A compatibility click after release/cancel must not insert a second time.
    if (click.detail !== 0 && win.performance.now() < blockedClickUntil) return;
    choose(Number(row.dataset.index));
  });
  listen(doc, "pointerdown", (event) => {
    if (!element.contains(event.target as Node) && !popup.contains(event.target as Node)) dismiss();
  }, true);
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
  cleanups.push(bridge.subscribeReferenceContext(schedule));
  schedule();
  return {
    refresh, dismiss,
    markStale() { if (!destroyed) search.markStale(); },
    get state() { return { active: active && !popup.hidden, composing, query: search.state.query, status: search.state.status, feedback, stale: search.state.stale }; },
    destroy() {
      if (destroyed) return;
      destroyed = true; hide(); win.cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup());
      popup.remove();
      for (const [name, value] of original) {
        if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      }
    },
  };
}

Object.assign(window, { installReferenceAutocomplete });
