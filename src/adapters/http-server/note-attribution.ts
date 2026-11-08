import type { EditorSession } from "./editor-session.js";

/** Selection is a discovery trigger, never evidence of block-level history. */
export function installNoteAttribution(options: {
  document: Document; editor(): EditorSession | null; context(): { editor: string; edited: string };
}) {
  const doc = options.document, win = doc.defaultView!, body = doc.getElementById("note-editor")!;
  const hint = doc.getElementById("note-attribution")!;
  const facts = doc.getElementById("note-attribution-facts")!, scope = doc.getElementById("note-attribution-scope")!;
  let dismissed = false, frame = 0;
  function sync() {
    const state = options.editor()?.state, selection = doc.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!state?.loaded || state.cancelled || state.navigationPending || !range || selection!.isCollapsed
      || !body.contains(range.startContainer) || !body.contains(range.endContainer)
      || doc.querySelector('dialog[open]') || doc.getElementById("note-panel")?.hidden) { hint.hidden = true; return; }
    if (dismissed) { hint.hidden = true; return; }
    const rect = range.getBoundingClientRect(), clip = body.closest("#note-panel")?.getBoundingClientRect();
    if (!rect.width || rect.bottom < (clip?.top ?? 0) || rect.top > (clip?.bottom ?? win.innerHeight)) { hint.hidden = true; return; }
    const context = options.context();
    const text = context.editor + " · " + context.edited;
    if (facts.textContent !== text) facts.textContent = text;
    const detail = state.dirty || state.saveStatus === "saving" ? "Whole saved note. Selection may contain unsaved edits; section history is unavailable." : "Whole note; section history is unavailable.";
    if (scope.textContent !== detail) scope.textContent = detail;
    hint.hidden = false;
    const width = hint.getBoundingClientRect().width, height = hint.getBoundingClientRect().height;
    hint.style.left = Math.max(8, Math.min(rect.left, win.innerWidth - width - 8)) + "px";
    hint.style.top = Math.max(8, Math.min(rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8, win.innerHeight - height - 8)) + "px";
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; sync(); }); };
  doc.addEventListener("selectionchange", () => { dismissed = false; schedule(); });
  doc.addEventListener("scroll", schedule, true);
  win.addEventListener("resize", schedule);
  doc.addEventListener("keydown", event => {
    // The editor selection survives toolbar/search focus. Its passive hint
    // must not consume Escape belonging to those focused controls or to IME.
    if (!event.defaultPrevented && !event.isComposing && event.key === "Escape" && body.contains(event.target as Node) && !hint.hidden) { event.preventDefault(); event.stopPropagation(); dismissed = true; hint.hidden = true; }
  }, true);
  win.addEventListener("pagehide", () => { hint.hidden = true; win.cancelAnimationFrame(frame); frame = 0; });
  return { sync };
}
