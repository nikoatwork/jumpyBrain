import {
  $addUpdateTag, $getSelection, $isRangeSelection, $isTextNode, $setSelection,
  COMMAND_PRIORITY_HIGH, HISTORY_PUSH_TAG, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, ParagraphNode, type LexicalEditor,
} from "lexical";
import { HeadingNode } from "@lexical/rich-text";

const commands = [
  { kind: "paragraph", label: "Text", glyph: "T", aliases: ["text", "paragraph"] },
  { kind: "h1", label: "Heading 1", glyph: "H₁", aliases: ["h1"] },
  { kind: "h2", label: "Heading 2", glyph: "H₂", aliases: ["h2"] },
  { kind: "h3", label: "Heading 3", glyph: "H₃", aliases: ["h3"] },
  { kind: "bold", label: "Bold", glyph: "B", aliases: ["bold"] },
  { kind: "italic", label: "Italic", glyph: "I", aliases: ["italic"] },
  { kind: "task", label: "Task", glyph: "☑", aliases: ["checkbox", "task"] },
  { kind: "code", label: "Code", glyph: "</>", aliases: ["code", "inline-code"] },
  { kind: "code-block", label: "Code block", glyph: "{ }", aliases: ["code-block", "codeblock"] },
];
let nextId = 0;

// Selection and invocation stay in Lexical; the popup never owns document text.
export function installSlashCommands(editor: LexicalEditor, element: HTMLElement, format: (kind: string) => void) {
  const doc = element.ownerDocument, win = doc.defaultView!;
  const popup = doc.createElement("div"), id = "editor-slash-" + ++nextId;
  popup.id = id; popup.className = "editor-slash-menu";
  popup.setAttribute("role", "listbox"); popup.setAttribute("aria-label", "Formatting commands");
  popup.hidden = true; doc.body.append(popup);
  let selected = 0, signature = "", suppressed = "", composing = false, frame = 0;
  let choices = commands, current: ReturnType<typeof context> = null;
  function context() {
    if (!editor.isEditable() || editor.isComposing() || composing || doc.activeElement !== element) return null;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== "text") return null;
    const leaf = selection.anchor.getNode(), block = leaf.getParent();
    if (!$isTextNode(leaf) || leaf.hasFormat("code") || !block
        || !((block instanceof ParagraphNode && block.getType() === "paragraph") || block instanceof HeadingNode)) return null;
    const prefix = leaf.getPreviousSiblings().map((node) => node.getTextContent()).join("");
    const before = leaf.getTextContent().slice(0, selection.anchor.offset);
    const match = before.match(/^([ \t]*)\/([a-z0-9-]*)$/i);
    if (prefix || !match) return null;
    return { selection: selection.clone(), start: match[1].length, query: match[2].toLowerCase(),
      signature: leaf.getKey() + ":" + selection.anchor.offset + ":" + before };
  }
  function hide() {
    current = null; popup.hidden = true;
    if (element.getAttribute("aria-activedescendant")?.startsWith(id)) element.removeAttribute("aria-activedescendant");
    const controls = element.getAttribute("aria-controls")?.split(" ").filter((value) => value !== id).join(" ");
    if (controls) element.setAttribute("aria-controls", controls); else element.removeAttribute("aria-controls");
  }
  function refresh() {
    const live = editor.getEditorState().read(context);
    if (!live || live.signature === suppressed) { hide(); return; }
    choices = commands.filter((command) => command.aliases.some((alias) => alias.startsWith(live.query)));
    if (!choices.length) { hide(); return; }
    if (signature !== live.signature) selected = 0;
    signature = live.signature; current = live;
    popup.replaceChildren(...choices.map((command, index) => {
      const row = doc.createElement("div");
      row.id = id + "-" + index; row.dataset.index = String(index);
      row.dataset.kind = command.kind;
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(index === selected));
      row.setAttribute("aria-label", command.label);
      const glyph = doc.createElement("span"), label = doc.createElement("span");
      glyph.className = "editor-slash-glyph"; glyph.setAttribute("aria-hidden", "true"); glyph.textContent = command.glyph;
      label.className = "editor-slash-label"; label.textContent = command.label;
      row.append(glyph, label); return row;
    }));
    popup.hidden = false;
    const native = doc.getSelection();
    const rect = native?.rangeCount ? native.getRangeAt(0).getBoundingClientRect() : null;
    if (!rect?.height) { hide(); return; }
    const viewport = win.visualViewport, x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || win.innerWidth, height = viewport?.height || win.innerHeight;
    if (rect.bottom < y || rect.top > y + height) { hide(); return; }
    for (let parent: HTMLElement | null = element; parent && parent !== doc.body; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (rect.bottom < bounds.top || rect.top > bounds.bottom)) { hide(); return; }
    }
    popup.style.maxWidth = Math.max(0, width - 16) + "px";
    popup.style.maxHeight = Math.max(0, Math.min(320, height - 16)) + "px";
    const box = popup.getBoundingClientRect();
    popup.style.left = Math.max(x + 8, Math.min(rect.left, x + width - box.width - 8)) + "px";
    popup.style.top = Math.max(y + 8, Math.min(rect.bottom + 4, y + height - box.height - 8)) + "px";
    const controls = new Set(element.getAttribute("aria-controls")?.split(" ").filter(Boolean)); controls.add(id);
    element.setAttribute("aria-controls", [...controls].join(" "));
    element.setAttribute("aria-activedescendant", id + "-" + selected);
    popup.children[selected]?.scrollIntoView({ block: "nearest" });
  }
  function schedule() { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(refresh); }
  function accept() {
    const previous = current, command = choices[selected];
    if (!previous || !command) return false;
    const live = context();
    if (!live || live.signature !== previous.signature) return false;
    $addUpdateTag(HISTORY_PUSH_TAG);
    live.selection.anchor.set(live.selection.anchor.key, live.start, "text");
    $setSelection(live.selection);
    live.selection.removeText();
    format(command.kind);
    hide(); return true;
  }
  const cleanups = [editor.registerUpdateListener(schedule), editor.registerEditableListener(() => { hide(); suppressed = signature; })];
  for (const [command, delta] of [[KEY_ARROW_DOWN_COMMAND, 1], [KEY_ARROW_UP_COMMAND, -1]] as const) {
    cleanups.push(editor.registerCommand(command, (event) => {
      if (popup.hidden || composing || event?.isComposing || event?.metaKey || event?.ctrlKey || event?.altKey || event?.shiftKey) return false;
      event?.preventDefault(); selected = (selected + delta + choices.length) % choices.length; schedule(); return true;
    }, COMMAND_PRIORITY_HIGH));
  }
  cleanups.push(editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
    if (popup.hidden || composing || event?.isComposing || event?.shiftKey || event?.metaKey || event?.ctrlKey || event?.altKey) return false;
    if (!accept()) return false;
    event?.preventDefault(); return true;
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(KEY_ESCAPE_COMMAND, (event) => {
    if (popup.hidden) return false;
    event?.preventDefault(); suppressed = current?.signature || ""; hide(); return true;
  }, COMMAND_PRIORITY_HIGH));
  // Cancel focus transfer, while leaving touch pointer panning native.
  const pointer = (event: MouseEvent) => { if (event.button === 0) event.preventDefault(); };
  const click = (event: MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-index]") : null;
    if (row && popup.contains(row) && event.button === 0) {
      selected = Number(row.dataset.index);
      editor.update(() => { accept(); }, { discrete: true });
    }
  };
  const blur = () => { suppressed = current?.signature || suppressed; hide(); };
  const compositionStart = () => { composing = true; hide(); };
  const compositionEnd = () => { composing = false; schedule(); };
  popup.addEventListener("mousedown", pointer); popup.addEventListener("click", click);
  element.addEventListener("blur", blur); element.addEventListener("compositionstart", compositionStart); element.addEventListener("compositionend", compositionEnd);
  win.addEventListener("resize", schedule); doc.addEventListener("scroll", schedule, true);
  win.visualViewport?.addEventListener("resize", schedule); win.visualViewport?.addEventListener("scroll", schedule);
  return () => {
    win.cancelAnimationFrame(frame); cleanups.forEach((cleanup) => cleanup()); hide(); popup.remove();
    element.removeEventListener("blur", blur); element.removeEventListener("compositionstart", compositionStart); element.removeEventListener("compositionend", compositionEnd);
    win.removeEventListener("resize", schedule); doc.removeEventListener("scroll", schedule, true);
    win.visualViewport?.removeEventListener("resize", schedule); win.visualViewport?.removeEventListener("scroll", schedule);
  };
}
