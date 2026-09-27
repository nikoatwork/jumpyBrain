// Browser-only adapter. Bundled separately; never imported by the server runtime.
import {
  $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isElementNode,
  $isRangeSelection, $isTextNode, $setSelection, CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, HISTORY_PUSH_TAG, IS_CODE, PASTE_COMMAND,
  ParagraphNode, TextNode, createEditor, type EditorConfig, type LexicalNode, type NodeKey, type RangeSelection,
} from "lexical";
import { $createHeadingNode, HeadingNode, registerRichText, type HeadingTagType } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $setBlocksType } from "@lexical/selection";
import {
  $convertToMarkdownString, $generateNodesFromMarkdownString, registerMarkdownShortcuts,
  HEADING, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE,
  BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, type Transformer,
} from "@lexical/markdown";

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
  static getType() { return "page-reference"; }
  static clone(node: PageReferenceNode) { return new PageReferenceNode(node.__text, node.__key); }
  static importJSON(value: ReturnType<TextNode["exportJSON"]>) { return new PageReferenceNode().updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "page-reference" }; }
  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.classList.add("markdown-reference");
    return element;
  }
}
const references: Transformer = {
  type: "text-match", dependencies: [PageReferenceNode],
  importRegExp: /\[\[[^\[\]\r\n]+\]\]/,
  regExp: /\[\[[^\[\]\r\n]+\]\]$/, trigger: "]",
  replace(node, match) { node.replace(new PageReferenceNode(match[0]).setFormat("code")); },
  export(node) { return node instanceof PageReferenceNode ? node.getTextContent() : null; },
};
const syntax: Transformer[] = [references, HEADING, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE];
function snapshot(node: LexicalNode): string {
  return JSON.stringify([node.exportJSON(), $isElementNode(node) ? node.getChildren().map(snapshot) : []]);
}

export function createNoteEditor(element: HTMLElement, options: {
  onChange: (markdown: string) => void;
  onReference: () => void;
  onError: (error: Error) => void;
}) {
  const sources = new Map<string, { original: string; snapshot: string }>();
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
  function referenceRange() {
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
            const end = closing >= caret && !/[\[\]\r\n]/.test(value.slice(caret, closing)) ? closing + 2 : caret;
            query = value.slice(opening + 2, caret);
            range.anchor.set(node.getKey(), opening, "text");
            range.focus.set(node.getKey(), end, "text");
          }
        }
      }
      return { selection: range, query, value: markdown, text: range.getTextContent() };
    });
  }
  const handleInput = (event: Event) => {
    const input = event as InputEvent;
    if (input.isComposing || input.inputType !== "insertText" || input.data !== "[") return;
    queueMicrotask(() => {
      const range = referenceRange();
      if (range?.text === "[[") options.onReference();
    });
  };
  // Controlled Lexical edits may prevent the native input event; ordinary
  // browser edits commit after beforeinput. Cover both paths.
  element.addEventListener("beforeinput", handleInput);
  element.addEventListener("input", handleInput);

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
            if ($isElementNode(node) && node.getAllTextNodes().some((text) => !(text instanceof PageReferenceNode) && /[*_]/.test(text.getTextContent()))) {
              node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
            }
          }
          root.append(node);
          sources.set(node.getKey(), { original: line, snapshot: snapshot(node) });
          if (marker) {
            if (!fence) fence = { char: marker[1][0], length: marker[1].length };
            else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*(?:`+|~+)\s*$/.test(line)) fence = null;
          }
        }
        $setSelection(null);
      }, { discrete: true });
      markdown = value;
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      loading = false;
    },
    setReadOnly(value: boolean) {
      editor.setEditable(!value);
      if (element.contentEditable !== String(!value)) element.contentEditable = String(!value);
      element.setAttribute("aria-readonly", String(value));
    },
    captureSelection, restoreSelection, referenceRange,
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
      cleanups.forEach((cleanup) => cleanup());
      element.removeEventListener("beforeinput", handleInput);
      element.removeEventListener("input", handleInput);
      editor.setRootElement(null);
    },
  };
}

Object.assign(window, { createJumpyBrainNoteEditor: createNoteEditor });
