// Browser-only rendered-text search. CSS Highlights decorate DOM ranges without
// touching Lexical nodes, canonical Markdown, history, selection or save state.
export function installNoteFind(options: {
  document: Document; available(): boolean; capture(): unknown; restore(selection: unknown): void;
}) {
  const doc = options.document, win = doc.defaultView!;
  const $ = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const bar = $("note-find"), input = $<HTMLInputElement>("note-find-input"), body = $("note-editor");
  const previous = $<HTMLButtonElement>("note-find-previous"), next = $<HTMLButtonElement>("note-find-next");
  let ranges: Range[] = [], current = 0, selection: unknown, focus: HTMLElement | null = null, frame = 0;
  const highlights = CSS.highlights;
  function paint(scroll = false) {
    highlights.delete("note-find"); highlights.delete("note-find-current");
    if (ranges.length) {
      highlights.set("note-find", new Highlight(...ranges));
      highlights.set("note-find-current", new Highlight(ranges[current]));
      if (scroll) {
        const panel = $("note-panel"), bounds = panel.getBoundingClientRect();
        const match = ranges[current].getBoundingClientRect();
        panel.scrollTop += match.top - bounds.top - panel.clientHeight / 2;
      }
    }
    $("note-find-count").textContent = input.value ? (ranges.length ? current + 1 : 0) + " of " + ranges.length + (ranges.length === 2000 ? "+" : "") : "";
    previous.disabled = next.disabled = !ranges.length;
  }
  function refresh(scroll = false) {
    if (bar.hidden) return;
    ranges = [];
    if (input.value) {
      // Match across inline formatting, but never across separate blocks.
      const groups: Text[][] = [];
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node: Node | null, block: Element | null = null, group: Text[] | null = null;
      while ((node = walker.nextNode())) {
        if (node instanceof Element) { if (node.tagName === "BR") group = null; continue; }
        const text = node as Text, parent = text.parentElement!.closest("p, h1, h2, h3, h4, h5, h6, li, pre, td, th") || body;
        if (!group || parent !== block) { group = []; groups.push(group); block = parent; }
        group.push(text);
      }
      const pattern = new RegExp(input.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
      for (const nodes of groups) {
        const text = nodes.map(node => node.data).join("");
        for (const match of text.matchAll(pattern)) {
          if (ranges.length >= 2000) break;
          const range = doc.createRange();
          let offset = 0;
          for (const node of nodes) {
            if (match.index! >= offset && match.index! < offset + node.length) range.setStart(node, match.index! - offset);
            const end = match.index! + match[0].length;
            if (end > offset && end <= offset + node.length) { range.setEnd(node, end - offset); break; }
            offset += node.length;
          }
          ranges.push(range);
        }
        if (ranges.length >= 2000) break;
      }
    }
    current = Math.min(current, Math.max(0, ranges.length - 1)); paint(scroll);
  }
  function close(restore = true) {
    if (bar.hidden) return;
    bar.hidden = true; ranges = []; paint();
    if (restore && options.available()) {
      if (focus && doc.contains(focus)) focus.focus({ preventScroll: true });
      if (selection) options.restore(selection);
    }
  }
  function open() {
    if (!highlights || !options.available() || doc.querySelector("dialog[open]")) return false;
    if (bar.hidden) {
      focus = doc.activeElement as HTMLElement; selection = body.contains(doc.activeElement) ? options.capture() : null;
      bar.hidden = false; current = 0;
    }
    refresh(); input.focus(); input.select(); return true;
  }
  function move(direction: number) {
    if (!ranges.length) return;
    current = (current + direction + ranges.length) % ranges.length; paint(true);
  }
  input.addEventListener("input", () => { current = 0; refresh(true); });
  bar.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  });
  previous.addEventListener("click", () => move(-1)); next.addEventListener("click", () => move(1));
  $("note-find-close").addEventListener("click", () => close());
  doc.addEventListener("keydown", event => {
    if (!bar.hidden && event.key === "Escape" && !doc.querySelector("dialog[open]") && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
    if (open()) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  // The native menu dispatches the same scoped action; unrelated dialogs keep focus.
  doc.addEventListener("jumpybrain:find", open);
  new MutationObserver(() => {
    if (bar.hidden || frame) return;
    frame = win.requestAnimationFrame(() => { frame = 0; refresh(); });
  }).observe(body, { childList: true, characterData: true, subtree: true });
  return { close, open };
}
