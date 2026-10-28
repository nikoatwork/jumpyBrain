import type { LexicalEditor } from "lexical";
import { referenceMarkerFont } from "./reference-marker-font.js";

const fonts = new WeakMap<Document, Promise<void>>();

export const referencePresentationStyles = `
  #note-editor.reference-markers-ready > :not([data-reference-editing]) .markdown-reference[data-page-reference="true"] {
    font-family: "jumpybrain-reference-markers", var(--writing-font, var(--font-writing, serif));
  }
`;

// Keep one literal text leaf for Lexical, native copy, caret offsets and IME.
// The font supplies ONLY empty, zero-advance [ and ] glyphs. All title text
// falls back to the normal writing font, including emphasis and heading sizes.
export function installReferencePresentation(editor: LexicalEditor, element: HTMLElement) {
  const doc = element.ownerDocument;
  let disposed = false;
  let pointerSelecting = false;
  let editing = new Set<Element>();
  const sync = () => {
    // Changing glyph widths mid-drag moves the text out from under the pointer.
    // Finish the native caret/selection gesture before revealing source syntax.
    if (pointerSelecting) return;
    const selection = doc.getSelection();
    const next = new Set<Element>();
    if (editor.isEditable() && doc.activeElement === element && selection?.rangeCount
        && element.contains(selection.anchorNode) && element.contains(selection.focusNode)) {
      const range = selection.getRangeAt(0);
      let block: Node | null = range.commonAncestorContainer;
      while (block && block.parentNode !== element) block = block.parentNode;
      if (block instanceof Element) next.add(block);
      else for (const child of element.children) if (range.intersectsNode(child)) next.add(child);
    }
    for (const block of editing) if (!next.has(block)) block.removeAttribute("data-reference-editing");
    for (const block of next) if (!editing.has(block)) block.setAttribute("data-reference-editing", "true");
    editing = next;
  };
  // Buffered font data needs no network request or CSP font-source exception.
  // Leave ordinary, visible brackets if the host cannot load the font.
  if (typeof FontFace !== "undefined") {
    let ready = fonts.get(doc);
    if (!ready) {
      const font = new FontFace("jumpybrain-reference-markers", Uint8Array.from(atob(referenceMarkerFont), (c) => c.charCodeAt(0)), {
        unicodeRange: "U+005B,U+005D",
      });
      ready = font.load().then((loaded) => { doc.fonts.add(loaded); });
      fonts.set(doc, ready);
    }
    void ready.then(() => {
      if (!disposed) { element.classList.add("reference-markers-ready"); sync(); }
    }).catch(() => { /* Visible-bracket fallback. */ });
  }
  const onFocus = () => { queueMicrotask(() => { if (!disposed) sync(); }); };
  const pointerDown = (event: PointerEvent) => { if (event.button === 0) pointerSelecting = true; };
  const pointerEnd = () => { pointerSelecting = false; onFocus(); };
  doc.addEventListener("selectionchange", sync);
  element.addEventListener("focusin", onFocus);
  element.addEventListener("focusout", onFocus);
  element.addEventListener("pointerdown", pointerDown);
  doc.addEventListener("pointerup", pointerEnd);
  doc.addEventListener("pointercancel", pointerEnd);
  doc.defaultView?.addEventListener("blur", pointerEnd);
  const removeUpdate = editor.registerUpdateListener(sync);
  const removeEditable = editor.registerEditableListener(sync);
  return () => {
    disposed = true;
    removeUpdate(); removeEditable();
    doc.removeEventListener("selectionchange", sync);
    element.removeEventListener("focusin", onFocus);
    element.removeEventListener("focusout", onFocus);
    element.removeEventListener("pointerdown", pointerDown);
    doc.removeEventListener("pointerup", pointerEnd);
    doc.removeEventListener("pointercancel", pointerEnd);
    doc.defaultView?.removeEventListener("blur", pointerEnd);
    element.classList.remove("reference-markers-ready");
    for (const block of editing) block.removeAttribute("data-reference-editing");
    editing.clear();
  };
}
