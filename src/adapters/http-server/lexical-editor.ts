// Browser-only adapter. Bundled separately; never imported by the server runtime.
import {
  $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isElementNode,
  $isRangeSelection, $isTextNode, $setSelection, CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, HISTORY_PUSH_TAG, IS_CODE, PASTE_COMMAND,
  ParagraphNode, RootNode, TextNode, $getNearestNodeFromDOMNode, createEditor, type EditorConfig, type LexicalNode, type NodeKey, type RangeSelection,
} from "lexical";
import { $createHeadingNode, HeadingNode, registerRichText, type HeadingTagType } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $setBlocksType } from "@lexical/selection";
import {
  $convertToMarkdownString, $generateNodesFromMarkdownString, registerMarkdownShortcuts,
  HEADING, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE,
  BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, type Transformer,
} from "@lexical/markdown";

import { referenceRanges, safeTitle } from "./reference-ranges.js";
import "./reference-autocomplete.js";

// Unsupported blocks are ordinary editable text, never HTML or silently discarded nodes.
class LiteralMarkdownNode extends ParagraphNode {
  static getType() { return "literal-markdown"; }
  static clone(node: LiteralMarkdownNode) { return new LiteralMarkdownNode(node.__key); }
  constructor(key?: NodeKey) { super(key); }
  static importJSON(value: ReturnType<ParagraphNode["exportJSON"]>) {
    return new LiteralMarkdownNode().updateFromJSON(value);
  }
  exportJSON() { return { ...super.exportJSON(), type: "literal-markdown" }; }
  insertNewAfter() {
    const next = new LiteralMarkdownNode();
    this.insertAfter(next);
    next.selectStart();
    return next;
  }
  createDOM() {
    const element = document.createElement("p");
    element.className = "markdown-literal";
    element.title = "Markdown kept as literal text";
    return element;
  }
}

// A literal reference span must not escape title punctuation or interpret it as emphasis.
class PageReferenceNode extends TextNode {
  // Derived interaction state is deliberately excluded from serialized snapshots.
  __active = false;
  static getType() { return "page-reference"; }
  static clone(node: PageReferenceNode) {
    const copy = new PageReferenceNode(node.__text, node.__key);
    copy.__active = node.__active;
    return copy;
  }
  setActive(active: boolean) {
    if (this.getLatest().__active !== active) this.getWritable().__active = active;
    return this;
  }
  static importJSON(value: ReturnType<TextNode["exportJSON"]>) { return new PageReferenceNode().updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "page-reference" }; }
  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.classList.add("markdown-reference");
    this.syncLinkDOM(element);
    return element;
  }
  updateDOM(previous: this, element: HTMLElement, config: EditorConfig) {
    const replace = super.updateDOM(previous, element, config);
    this.syncLinkDOM(element);
    return replace;
  }
  syncLinkDOM(element: HTMLElement) {
    // Preserve literal serialization even for inert path/alias/code references.
    // Activation eligibility must never alter their canonical Markdown spelling.
    if (this.__active) {
      element.setAttribute("role", "link");
      element.tabIndex = 0;
      element.dataset.pageReference = "true";
      element.style.textDecoration = "underline";
      element.style.cursor = "pointer";
      element.title = "Follow page reference (click or Tab then Enter)";
    } else {
      for (const attribute of ["role", "tabindex", "data-page-reference", "title"]) element.removeAttribute(attribute);
      element.style.textDecoration = "";
      element.style.cursor = "";
    }
  }
}
// LexicalNode.replace moves selection endpoints to the replacement's END.
// Explicitly retain offsets; splitText already remaps points across its parts.
function replaceText(node: TextNode, replacement: TextNode) {
  const selection = $getSelection();
  const points = $isRangeSelection(selection) ? [selection.anchor, selection.focus].map((point) =>
    point.key === node.getKey() && point.type === "text" ? point.offset : null) : [];
  node.replace(replacement);
  const next = $getSelection();
  if ($isRangeSelection(next)) [next.anchor, next.focus].forEach((point, i) => {
    if (points[i] != null) point.set(replacement.getKey(), points[i]!, "text");
  });
}

const references: Transformer = {
  type: "text-match", dependencies: [PageReferenceNode],
  importRegExp: /\[\[[^\[\]\r\n]+\]\]/,
  regExp: /\[\[[^\[\]\r\n]+\]\]$/, trigger: "]",
  replace(node, match) { node.replace(new PageReferenceNode(match[0]).setFormat("code")); },
  export(node) { return node instanceof PageReferenceNode ? node.getTextContent() : null; },
};
const syntax: Transformer[] = [references, HEADING, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE];
// Reference classification and leaf splitting are derived presentation, not a
// source edit. Compare semantic text runs (including supported formatting), not
// node classes/boundaries or the internal IS_CODE shortcut-suppression flag.
// Otherwise changing a fence could reserialize an untouched line underneath it.
function snapshot(node: LexicalNode): string {
  type Part = { attributes: string; text?: string; children?: Part[] };
  function visit(current: LexicalNode): Part {
    if ($isTextNode(current)) {
      const { text, type: _type, ...attributes } = current.exportJSON();
      return { attributes: JSON.stringify({ ...attributes, format: current.getFormat() & ~IS_CODE }), text };
    }
    const children: Part[] = [];
    if ($isElementNode(current)) for (const child of current.getChildren()) {
      const part = visit(child), previous = children.at(-1);
      if (part.text !== undefined && previous?.text !== undefined && previous.attributes === part.attributes) previous.text += part.text;
      else children.push(part);
    }
    return { attributes: JSON.stringify(current.exportJSON()), children };
  }
  return JSON.stringify(visit(node));
}

export function createNoteEditor(element: HTMLElement, options: {
  onChange: (markdown: string) => void;
  // Kept for caller compatibility; explicit picker opening belongs to the host.
  onReference?: () => void;
  onActivateReference?: (title: string) => void;
  onError: (error: Error) => void;
}) {
  const sources = new Map<string, { original: string; snapshot: string }>();
  const referenceListeners = new Set<() => void>();
  const notifyReferenceContext = () => referenceListeners.forEach((listener) => listener());
  const preserve: Transformer = {
    type: "element", dependencies: [], regExp: /(?!) /, replace: () => {},
    export(node) {
      const source = sources.get(node.getKey());
      if (source && source.snapshot === snapshot(node)) return source.original;
      return node instanceof LiteralMarkdownNode ? node.getTextContent() : null;
    },
  };
  const transformers = [preserve, ...syntax];
  const editor = createEditor({
    namespace: "jumpyBrain-notes", nodes: [HeadingNode, LiteralMarkdownNode, PageReferenceNode],
    theme: { text: { bold: "editor-bold", italic: "editor-italic" } },
    onError: options.onError,
  });
  element.contentEditable = "true";
  editor.setRootElement(element);
  const cleanups = [registerRichText(editor), registerHistory(editor, createEmptyHistoryState(), 300)];
  // Lexical's shortcut plugin intentionally skips code-formatted leaves. Use
  // that guard for literal Markdown, including newly split/pasted text nodes.
  cleanups.push(editor.registerNodeTransform(TextNode, (node) => {
    if (node.getParent() instanceof LiteralMarkdownNode && node.getFormat() !== IS_CODE) node.setFormat("code");
  }));
  cleanups.push(registerMarkdownShortcuts(editor, syntax));

  // A RootNode transform runs after leaf transforms. Never rewrite the DOM or
  // schedule another update: splitText/replaceText preserve live Lexical points.
  // Conservative recognition boundary: a reference must fit in ONE text leaf.
  function scanReferences() {
    const blocks = $getRoot().getChildren();
    const text = blocks.map((block) => block.getTextContent()).join("\n");
    const activeRanges = new Set(referenceRanges(text).map((range) => range.start + ":" + range.end));
    // Literal export and interactive recognition are separate. Inert references
    // still need exact punctuation preservation when surrounding text is edited.
    const ranges = Array.from(text.matchAll(/\[\[[^\[\]\r\n]+\]\]/g), (match) => ({ start: match.index!, end: match.index! + match[0].length }));
    let blockOffset = 0, rangeIndex = 0;
    for (const block of blocks) {
      const leaves: { node: TextNode; start: number }[] = [];
      let cursor = blockOffset;
      function visit(node: LexicalNode) {
        if ($isTextNode(node)) {
          leaves.push({ node, start: cursor }); cursor += node.getTextContentSize();
        } else if ($isElementNode(node)) node.getChildren().forEach(visit);
        else cursor += node.getTextContentSize(); // e.g. pasted LineBreakNode
      }
      visit(block);
      blockOffset += block.getTextContentSize() + 1;
      for (const { node, start } of leaves) {
        if (node.isComposing()) continue;
        const end = start + node.getTextContentSize();
        // Both leaves and ranges are source-ordered. Walk once instead of
        // filtering every reference for every leaf (quadratic on large notes).
        const matches: typeof ranges = [];
        while (rangeIndex < ranges.length && ranges[rangeIndex].start < end) {
          const range = ranges[rangeIndex++];
          if (range.start >= start && range.end <= end) matches.push(range);
        }
        const cuts = matches.flatMap((range) => [range.start - start, range.end - start])
          .filter((cut) => cut > 0 && cut < end - start);
        const parts = cuts.length ? node.splitText(...cuts) : [node];
        let position = start;
        for (const part of parts) {
          const stop = position + part.getTextContentSize();
          const valid = matches.some((range) => range.start === position && range.end === stop);
          const reference = part instanceof PageReferenceNode;
          const literal = part.getParent() instanceof LiteralMarkdownNode;
          if (valid && !reference) {
            replaceText(part, new PageReferenceNode(part.getTextContent())
              .setActive(activeRanges.has(position + ":" + stop))
              .setFormat(part.getFormat() | IS_CODE).setStyle(part.getStyle()));
          } else if (valid && reference) {
            part.setActive(activeRanges.has(position + ":" + stop));
          } else if (!valid && reference) {
            replaceText(part, $createTextNode(part.getTextContent())
              .setFormat(literal ? IS_CODE : part.getFormat() & ~IS_CODE).setStyle(part.getStyle()));
          } else if (!valid && !literal && part.hasFormat("code")) {
            // Selection replacement and splitText can make ordinary TextNodes
            // carrying the reference's internal shortcut guard. Inline code is
            // otherwise a literal block in this editor, never a supported format.
            part.setFormat(part.getFormat() & ~IS_CODE);
          }
          position = stop;
        }
      }
    }
  }
  cleanups.push(editor.registerNodeTransform(RootNode, scanReferences));
  let markdown = "";
  let loading = false;
  let lastSelection: RangeSelection | null = null;
  const serialize = () => $convertToMarkdownString(transformers, undefined, true);
  cleanups.push(editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
    if (loading) return;
    editorState.read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) lastSelection = selection.clone();
      if (!dirtyElements.size && !dirtyLeaves.size) return;
      const next = serialize();
      if (next !== markdown) { markdown = next; options.onChange(next); }
    });
    notifyReferenceContext();
  }));
  // Paste text, not arbitrary clipboard HTML/styles/images. Multi-line Markdown is
  // parsed on load; paste remains safe visible text and is one undoable operation.
  // Do not expose formats that our Markdown subset cannot save.
  cleanups.push(editor.registerCommand(FORMAT_TEXT_COMMAND, (format) => {
    if (format !== "bold" && format !== "italic") return true;
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.getNodes().some((node) => node instanceof PageReferenceNode || node instanceof LiteralMarkdownNode || node.getParent() instanceof LiteralMarkdownNode);
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(PASTE_COMMAND, (event) => {
    if (!event) return false;
    const transfer = "clipboardData" in event ? event.clipboardData : "dataTransfer" in event ? event.dataTransfer : null;
    if (!transfer) return false;
    event.preventDefault();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertRawText(transfer.getData("text/plain"));
    return true;
  }, COMMAND_PRIORITY_HIGH));

  function captureSelection() {
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.clone() : lastSelection?.clone() || null;
    });
  }
  function restoreSelection(selection: RangeSelection | null) {
    if (selection) editor.update(() => $setSelection(selection.clone()), { discrete: true });
  }
  function referenceRange(autocomplete = false) {
    return editor.getEditorState().read(() => {
      const selected = captureSelection();
      if (!selected) return null;
      const range = selected.clone();
      let query = range.getTextContent();
      if (range.isCollapsed()) {
        const node = range.anchor.getNode();
        if ($isTextNode(node)) {
          const value = node.getTextContent(), caret = range.anchor.offset;
          const opening = value.lastIndexOf("[[", caret);
          if (opening >= 0 && caret >= opening + 2 && value[opening - 1] !== "\\" && !/[\[\]\r\n]/.test(value.slice(opening + 2, caret))) {
            const closing = value.indexOf("]]", caret);
            const complete = closing >= caret && !/[\[\]\r\n]/.test(value.slice(caret, closing));
            // A missing closer in this leaf may actually live in a formatted
            // sibling. Never replace just the first fragment of that reference.
            // Unfinished triggers are supported only at the logical block end;
            // complete references must fit in one leaf. Do not merge formatting.
            if (!complete && (caret !== value.length || node.getNextSiblings().some((sibling) => sibling.getTextContentSize() > 0))) {
              // The explicit picker can still insert at the caret; it must not
              // consume an unfinished opener whose closer may be in a sibling.
              return autocomplete ? null : { selection: range, query: "", value: markdown, text: "" };
            }
            const end = complete ? closing + 2 : caret;
            query = value.slice(opening + 2, caret);
            range.anchor.set(node.getKey(), opening, "text");
            range.focus.set(node.getKey(), end, "text");
          }
        }
      }
      return { selection: range, query, value: markdown, text: range.getTextContent() };
    });
  }
  // Derive trigger context from the live Lexical model,
  // not from a stale modal snapshot or guessed Markdown/DOM offset mapping.
  function autocompleteRange() {
    return editor.read(() => {
      const caret = $getSelection();
      if (!editor.isEditable() || !$isRangeSelection(caret) || !caret.isCollapsed() || caret.anchor.type !== "text") return null;
      const range = referenceRange(true);
      if (!range || !range.text.startsWith("[[") || /[\[\]\r\n]/.test(range.query)
          || range.selection.anchor.key !== caret.anchor.key || range.selection.focus.key !== caret.anchor.key
          || caret.anchor.offset !== range.selection.anchor.offset + 2 + range.query.length) return null;
      const leaf = caret.anchor.getNode(), block = leaf.getParent();
      if (!$isTextNode(leaf) || !block || !(block instanceof ParagraphNode || block instanceof HeadingNode)) return null;
      const blocks = $getRoot().getChildren();
      let offset = 0, found = false;
      for (const candidate of blocks) {
        if (candidate.getKey() === block.getKey()) { found = true; break; }
        offset += candidate.getTextContentSize() + 1;
      }
      if (!found) return null;
      for (const sibling of leaf.getPreviousSiblings()) offset += sibling.getTextContentSize();
      const start = offset + range.selection.anchor.offset, end = offset + range.selection.focus.offset;
      const text = blocks.map((node) => node.getTextContent()).join("\n");
      // A complete sentinel permits the same context scanner to validate empty
      // and unfinished queries. This is string-only; no editor DOM/model edit.
      const probe = text.slice(0, start) + "[[Candidate]]" + text.slice(end);
      return referenceRanges(probe).some((match) => match.start === start && match.end === start + 13) ? range : null;
    });
  }
  // Typing [[ is handled by the host’s inline autocomplete installer, never
  // by the explicit modal picker. Context notifications include selection edits.

  // Browser event delegation only: the model owns every rendered reference.
  const doc = element.ownerDocument;
  function referenceElement(target: EventTarget | null): HTMLElement | null {
    const link = target instanceof Element ? target.closest<HTMLElement>("[data-page-reference]") : null;
    return link && element.contains(link) ? link : null;
  }
  function hasSelection() {
    const native = doc.getSelection();
    if (native && !native.isCollapsed) return true;
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) && !selection.isCollapsed();
    });
  }
  function follow(link: HTMLElement) {
    if (!editor.isEditable() || hasSelection()) return;
    const title = editor.read(() => {
      const node = $getNearestNodeFromDOMNode(link);
      if (!(node instanceof PageReferenceNode) || !node.__active) return null;
      const match = node.getTextContent().match(/^\[\[([^\[\]]+)\]\]$/);
      return match && safeTitle(match[1]) ? match[1] : null;
    });
    if (title !== null) options.onActivateReference?.(title);
  }
  let gesture: { link: HTMLElement | null; x: number; y: number; blocked: boolean } | null = null;
  let tabFocus = false;
  let activationFocus: HTMLElement | null = null;
  const pointerDown = (event: PointerEvent) => {
    tabFocus = false; activationFocus = null;
    gesture = { link: referenceElement(event.target), x: event.clientX, y: event.clientY,
      blocked: event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || hasSelection() };
    // No preventDefault: caret placement and drag selection stay native.
  };
  const pointerMove = (event: PointerEvent) => {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.blocked = true;
  };
  const pointerCancel = () => { gesture = null; };
  const clickReference = (event: MouseEvent) => {
    const link = referenceElement(event.target), pending = gesture;
    gesture = null;
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || hasSelection()) return;
    // Accessible activation can be a click-only event with no pointer sequence.
    if (event.detail === 0) { follow(link); return; }
    if (!pending || pending.link !== link || pending.blocked || event.detail !== 1) return;
    follow(link);
  };
  const keyboardReference = (event: KeyboardEvent) => {
    if (event.key === "Tab") { tabFocus = true; activationFocus = null; return; }
    const link = referenceElement(event.target);
    if (event.key === "Enter" && link && activationFocus === link && doc.activeElement === link
        && !event.isComposing && !event.repeat && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopImmediatePropagation(); follow(link);
    } else if (!["Shift", "Control", "Meta", "Alt"].includes(event.key)) {
      // Arrow keys/typing return this focus to ordinary editing, including Enter.
      tabFocus = false; activationFocus = null;
    }
  };
  const focusReference = (event: FocusEvent) => {
    activationFocus = tabFocus ? referenceElement(event.target) : null;
    tabFocus = false;
  };
  element.addEventListener("pointerdown", pointerDown);
  doc.addEventListener("pointermove", pointerMove);
  doc.addEventListener("pointerup", pointerMove);
  doc.addEventListener("pointercancel", pointerCancel);
  element.addEventListener("click", clickReference);
  doc.addEventListener("keydown", keyboardReference, true);
  element.addEventListener("focusin", focusReference);
  cleanups.push(() => {
    element.removeEventListener("pointerdown", pointerDown);
    doc.removeEventListener("pointermove", pointerMove);
    doc.removeEventListener("pointerup", pointerMove);
    doc.removeEventListener("pointercancel", pointerCancel);
    element.removeEventListener("click", clickReference);
    doc.removeEventListener("keydown", keyboardReference, true);
    element.removeEventListener("focusin", focusReference);
  });

  return {
    getMarkdown: () => markdown,
    setMarkdown(value: string, reset = false) {
      if (!reset && value === markdown && editor.getEditorState().isEmpty() === false) return;
      loading = true;
      sources.clear(); lastSelection = null;
      editor.update(() => {
        const root = $getRoot(); root.clear();
        let fence: { char: string; length: number } | null = null;
        for (const line of value.split("\n")) {
          const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
          const withoutReferences = line.replace(/\[\[[^\[\]\r\n]+\]\]/g, "");
          const literal = Boolean(fence || marker || /^(?: {4}|\t|\s*(?:>|[-+*]\s|\d+[.)]\s|\|))/.test(line)
            || /[\[\]<>`\\~]|^\s*(?:---+|===+|\*\*\*+|___+)\s*$/.test(withoutReferences));
          let node: LexicalNode;
          if (literal) node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
          else {
            node = $generateNodesFromMarkdownString(line, syntax, true)[0] || $createParagraphNode();
            // Unmatched delimiters may belong to multiline emphasis or unsupported
            // syntax: leave their whole line literal rather than half-interpreting it.
            if ($isElementNode(node) && node.getAllTextNodes().some((text) => !(text instanceof PageReferenceNode) && /\*|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u.test(text.getTextContent()))) {
              node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
            }
          }
          root.append(node);
          sources.set(node.getKey(), { original: line, snapshot: "" });
          if (marker) {
            if (!fence) fence = { char: marker[1][0], length: marker[1].length };
            else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*(?:`+|~+)\s*$/.test(line)) fence = null;
          }
        }
        scanReferences();
        for (const node of root.getChildren()) sources.get(node.getKey())!.snapshot = snapshot(node);
        $setSelection(null);
      }, { discrete: true });
      markdown = value;
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      loading = false;
      notifyReferenceContext();
    },
    setReadOnly(value: boolean) {
      editor.setEditable(!value);
      if (element.contentEditable !== String(!value)) element.contentEditable = String(!value);
      element.setAttribute("aria-readonly", String(value));
      notifyReferenceContext();
    },
    captureSelection, restoreSelection, referenceRange, autocompleteRange,
    subscribeReferenceContext(listener: () => void) {
      referenceListeners.add(listener);
      return () => { referenceListeners.delete(listener); };
    },
    focus(end = false) { editor.focus(undefined, { defaultSelection: end ? "rootEnd" : "rootStart" }); },
    insertReference(range: { selection: RangeSelection; value: string }, text: string) {
      if (!editor.isEditable() || range.value !== markdown) return false;
      editor.update(() => {
        $setSelection(range.selection.clone());
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if (selection.anchor.getNode().getParent() instanceof LiteralMarkdownNode) selection.insertText(text);
          else { selection.insertNodes([new PageReferenceNode(text).setFormat("code")]); selection.setFormat(0); }
        }
      }, { discrete: true, tag: HISTORY_PUSH_TAG });
      return true;
    },
    format(kind: string) {
      if (!editor.isEditable()) return;
      restoreSelection(captureSelection());
      if (kind === "bold" || kind === "italic") editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
      else editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => kind === "paragraph" ? $createParagraphNode() : $createHeadingNode(kind as HeadingTagType));
          for (const node of selection.getNodes()) if ($isTextNode(node) && !(node instanceof PageReferenceNode) && node.hasFormat("code")) node.setFormat(0);
          selection.setFormat(0);
        }
      }, { tag: HISTORY_PUSH_TAG });
      editor.focus();
    },
    destroy() {
      referenceListeners.clear();
      cleanups.forEach((cleanup) => cleanup());
      editor.setRootElement(null);
    },
  };
}

Object.assign(window, { createJumpyBrainNoteEditor: createNoteEditor });
