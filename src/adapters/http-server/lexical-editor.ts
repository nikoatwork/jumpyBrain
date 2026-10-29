// Browser-only adapter. Bundled separately; never imported by the server runtime.
import {
  $addUpdateTag, $generateNodesFromRawText, $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isElementNode,
  $isRangeSelection, $isTextNode, $setSelection, CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH, FORMAT_TEXT_COMMAND, HISTORIC_TAG, HISTORY_PUSH_TAG, IS_CODE, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, PASTE_COMMAND, REDO_COMMAND, UNDO_COMMAND,
  ParagraphNode, RootNode, TextNode, $getNearestNodeFromDOMNode, createEditor, type EditorConfig, type LexicalNode, type NodeKey, type RangeSelection, type TextFormatType,
} from "lexical";
import { $createHeadingNode, HeadingNode, registerRichText, type HeadingTagType } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $setBlocksType } from "@lexical/selection";
import {
  $convertToMarkdownString, $generateNodesFromMarkdownString, registerMarkdownShortcuts,
  HEADING, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE,
  BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, INLINE_CODE, type Transformer,
} from "@lexical/markdown";

import { codeFence, exportCodeFence, inlineCodeRanges, markdownTable, taskMarker } from "./editor-markdown.js";
import { FencedCodeMarkdownNode, TableMarkdownNode, TaskMarkdownNode } from "./editor-markdown-nodes.js";
import { installSlashCommands } from "./editor-slash-commands.js";
import { installReferencePresentation } from "./editor-reference-presentation.js";
import { createTaskCompletionFeedback } from "./editor-task-presentation.js";

import { referenceRanges, safeTitle } from "./reference-ranges.js";
import { completedReferenceTitles } from "./reference-creation.js";
import { externalLineChanges } from "./external-document-updates.js";
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
  hasFormat(format: TextFormatType) { return format === "code" || super.hasFormat(format); }
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
      element.style.cursor = "pointer";
      element.title = "Follow page reference (click or Tab then Enter)";
    } else {
      for (const attribute of ["role", "tabindex", "data-page-reference", "title"]) element.removeAttribute(attribute);
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
  replace(node, match) { node.replace(new PageReferenceNode(match[0])); },
  export(node) { return node instanceof PageReferenceNode ? node.getTextContent() : null; },
};
const task: Transformer = {
  type: "element", dependencies: [TaskMarkdownNode], regExp: /(?!) /, replace() {},
  export(node, children) { return node instanceof TaskMarkdownNode ? " ".repeat(node.__spaces) + "- [" + (node.__checked ? "x" : " ") + "] " + children(node) : null; },
};
const fencedCode: Transformer = {
  type: "element", dependencies: [FencedCodeMarkdownNode], regExp: /(?!) /, replace() {},
  export(node) { return node instanceof FencedCodeMarkdownNode ? exportCodeFence(node.getTextContent(), node.__language) : null; },
};
const table: Transformer = {
  type: "element", dependencies: [TableMarkdownNode], regExp: /(?!) /, replace() {},
  export(node) { return node instanceof TableMarkdownNode ? node.getTextContent() : null; },
};
const syntax: Transformer[] = [table, fencedCode, task, references, INLINE_CODE, HEADING, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE];
// Reference classification and leaf splitting are derived presentation, not a
// source edit. Compare semantic text runs (including supported formatting), not
// node classes/boundaries or the internal IS_CODE shortcut-suppression flag.
// Otherwise changing a fence could reserialize an untouched line underneath it.
function referenceScanText(block: LexicalNode): string {
  if (block instanceof FencedCodeMarkdownNode) return block.getTextContent().replace(/[^\n]/g, "\uFFFC");
  if ($isTextNode(block)) return !(block instanceof PageReferenceNode) && !(block.getParent() instanceof LiteralMarkdownNode) && block.hasFormat("code")
    ? "\uFFFC".repeat(block.getTextContentSize()) : block.getTextContent();
  return $isElementNode(block) ? block.getChildren().map(referenceScanText).join("") : block.getTextContent();
}

function snapshot(node: LexicalNode): string {
  type Part = { attributes: string; text?: string; children?: Part[] };
  function visit(current: LexicalNode): Part {
    if ($isTextNode(current)) {
      const { text, type: _type, ...attributes } = current.exportJSON();
      return { attributes: JSON.stringify({ ...attributes, format: current instanceof PageReferenceNode || current.getParent() instanceof LiteralMarkdownNode ? current.getFormat() & ~IS_CODE : current.getFormat() }), text };
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
  // Only committed edits to active reference text; never hydration or refresh.
  onCompletedReferences?: (titles: string[]) => void;
  // Companion-only input shortcut; stored references always use [[…]].
  atReferenceTrigger?: boolean;
  // Kept for caller compatibility; explicit picker opening belongs to the host.
  onActivateReference?: (title: string) => void;
  // A permission-readonly host can explain link outcomes while ordinary
  // navigation/session locks keep reference activation disabled.
  canActivateReference?: () => boolean;
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
    namespace: "jumpyBrain-notes", nodes: [HeadingNode, LiteralMarkdownNode, PageReferenceNode, TaskMarkdownNode, FencedCodeMarkdownNode, TableMarkdownNode],
    theme: { text: { bold: "editor-bold", italic: "editor-italic", code: "editor-inline-code" } },
    onError: options.onError,
  });
  element.contentEditable = "true";
  editor.setRootElement(element);
  const history = createEmptyHistoryState();
  const cleanups = [registerRichText(editor), registerHistory(editor, history, 300)];
  const taskFeedback = createTaskCompletionFeedback(element);
  cleanups.push(() => taskFeedback.clear());
  cleanups.push(installReferencePresentation(editor, element));
  // Lexical's shortcut plugin intentionally skips code-formatted leaves. Use
  // that guard for literal Markdown, including newly split/pasted text nodes.
  cleanups.push(editor.registerNodeTransform(TextNode, (node) => {
    if ((node.getParent() instanceof LiteralMarkdownNode || node.getParent() instanceof FencedCodeMarkdownNode) && node.getFormat() !== IS_CODE) node.setFormat("code");
  }));
  cleanups.push(registerMarkdownShortcuts(editor, syntax.filter((transformer) => transformer !== task)));

  // A RootNode transform runs after leaf transforms. Never rewrite the DOM or
  // schedule another update: splitText/replaceText preserve live Lexical points.
  // Conservative recognition boundary: a reference must fit in ONE text leaf.
  function scanReferences() {
    for (const block of $getRoot().getChildren()) {
      if (!(block instanceof ParagraphNode) || block.getType() !== "paragraph") continue;
      const previous = block.getPreviousSibling();
      const marker = taskMarker(block.getTextContent(), previous instanceof TaskMarkdownNode ? previous.__spaces : null);
      const first = block.getFirstChild();
      if (!marker || !$isTextNode(first) || first.hasFormat("code")) continue;
      const prefix = marker.indent + 6;
      if (first.getTextContentSize() < prefix) continue;
      const parts = first.splitText(prefix);
      const next = new TaskMarkdownNode(marker.checked, marker.indent);
      block.replace(next.append(...block.getChildren()));
      parts[0].remove();
      if (next.isEmpty()) next.selectStart();
      $addUpdateTag(HISTORY_PUSH_TAG);
    }
    const blocks = $getRoot().getChildren();
    const text = blocks.map(referenceScanText).join("\n");
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
          const code = part.getParent() instanceof FencedCodeMarkdownNode || (!reference && part.hasFormat("code") && !literal);
          if (valid && !reference && !code) {
            replaceText(part, new PageReferenceNode(part.getTextContent())
              .setActive(activeRanges.has(position + ":" + stop))
              .setFormat(part.getFormat() & ~IS_CODE).setStyle(part.getStyle()));
          } else if (valid && reference) {
            part.setActive(activeRanges.has(position + ":" + stop));
          } else if (!valid && reference) {
            replaceText(part, $createTextNode(part.getTextContent())
              .setFormat(literal ? IS_CODE : part.getFormat() & ~IS_CODE).setStyle(part.getStyle()));
          }
          position = stop;
        }
      }
    }
  }
  cleanups.push(editor.registerNodeTransform(RootNode, scanReferences));
  let markdown = "";
  let loading = false;
  let completionBaseline = "", redoPending = false, completionTimer = 0;
  const win = element.ownerDocument.defaultView!;
  const referenceText = () => $getRoot().getChildren().map((block) => block.getTextContent()).join("\n");
  function reportCompletions(suppress = false) {
    const text = referenceText(), active: { start: number; end: number; title: string }[] = [];
    let offset = 0;
    for (const block of $getRoot().getChildren()) {
      function visit(node: LexicalNode) {
        if ($isTextNode(node)) {
          if (node instanceof PageReferenceNode && node.__active) active.push({ start: offset, end: offset + node.getTextContentSize(), title: node.getTextContent().slice(2, -2) });
          offset += node.getTextContentSize();
        } else if ($isElementNode(node)) node.getChildren().forEach(visit);
        else offset += node.getTextContentSize();
      }
      visit(block); offset++;
    }
    const completed = suppress ? [] : completedReferenceTitles(completionBaseline, text, active);
    if (text !== completionBaseline) redoPending = false;
    completionBaseline = text;
    if (completed.length) options.onCompletedReferences?.(completed);
  }
  cleanups.push(editor.registerCommand(REDO_COMMAND, () => {
    redoPending = true;
    // History can first commit a no-op, then restore its snapshot in a later
    // microtask. Consume intent only when reference text actually changes.
    return false;
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(UNDO_COMMAND, () => { redoPending = false; return false; }, COMMAND_PRIORITY_HIGH));
  let lastSelection: RangeSelection | null = null;
  const serialize = () => $convertToMarkdownString(transformers, undefined, true);
  cleanups.push(editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
    if (loading) return;
    editorState.read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) lastSelection = selection.clone();
      if (!dirtyElements.size && !dirtyLeaves.size) return;
      const next = serialize();
      if (next !== markdown) { markdown = next; options.onChange(next); }
      if (!editor.isComposing()) reportCompletions(tags.has(HISTORIC_TAG) && !redoPending);
    });
    notifyReferenceContext();
  }));
  const compositionEnd = () => {
    win.clearTimeout(completionTimer);
    // Some browsers commit the final composition through a later input event.
    // Keep the baseline across preedit updates and inspect only committed state.
    completionTimer = win.setTimeout(() => {
      if (!loading && !editor.isComposing()) editor.getEditorState().read(() => reportCompletions());
    }, 0);
  };
  element.addEventListener("compositionend", compositionEnd);
  cleanups.push(() => { win.clearTimeout(completionTimer); element.removeEventListener("compositionend", compositionEnd); });
  // Do not expose formats that our Markdown subset cannot save.
  cleanups.push(editor.registerCommand(FORMAT_TEXT_COMMAND, (format) => {
    if (format !== "bold" && format !== "italic" && format !== "code") return true;
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.getNodes().some((node) => node instanceof PageReferenceNode || node instanceof LiteralMarkdownNode || node.getParent() instanceof LiteralMarkdownNode || node instanceof FencedCodeMarkdownNode || node.getParent() instanceof FencedCodeMarkdownNode || (format !== "code" && $isTextNode(node) && node.hasFormat("code")));
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(PASTE_COMMAND, (event) => {
    if (!event) return false;
    if (!editor.isEditable()) return true;
    const transfer = "clipboardData" in event ? event.clipboardData : "dataTransfer" in event ? event.dataTransfer : null;
    if (!transfer) return false;
    event.preventDefault();
    const selection = $getSelection();
    const text = transfer.getData("text/plain").replace(/\r\n?/g, "\n");
    if ($isRangeSelection(selection) && text) {
      $addUpdateTag(HISTORY_PUSH_TAG);
      const anchorBlock = selection.anchor.getNode().getTopLevelElement();
      const focusBlock = selection.focus.getNode().getTopLevelElement();
      // An insertion within an existing literal/code block must stay literal.
      // Replacing a whole block (or note) can introduce formatted Markdown.
      const withinLiteral = (anchorBlock instanceof LiteralMarkdownNode || anchorBlock instanceof FencedCodeMarkdownNode || selection.getNodes().some((node) => $isTextNode(node) && !(node instanceof PageReferenceNode) && node.hasFormat("code"))) && anchorBlock === focusBlock
        && (selection.isCollapsed() || selection.getTextContent() !== anchorBlock?.getTextContent());
      if (withinLiteral) selection.insertRawText(text);
      else {
        const nodes = parseMarkdown(text);
        // A literal fragment pasted into an existing rich block must not turn
        // its surrounding text into a literal block and erase its formatting.
        const fragment = nodes.length === 1 && nodes[0] instanceof LiteralMarkdownNode
          && anchorBlock === focusBlock && anchorBlock && !anchorBlock.isEmpty()
          && (selection.isCollapsed() || selection.getTextContent() !== anchorBlock?.getTextContent());
        if (fragment) selection.insertRawText(text);
        else selection.insertNodes(nodes);
      }
    }
    return true;
  }, COMMAND_PRIORITY_HIGH));

  cleanups.push(editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
    if (!editor.isEditable()) return true;
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;
    const block = selection.anchor.getNode().getTopLevelElement();
    if (block instanceof FencedCodeMarkdownNode) {
      event?.preventDefault();
      if (event?.metaKey || event?.ctrlKey) { block.insertNewAfter(); selection.setFormat(0); }
      else selection.insertRawText("\n");
      return true;
    }
    if (selection.isCollapsed() && block instanceof ParagraphNode && !(block instanceof LiteralMarkdownNode)) {
      const match = block.getTextContent().match(/^(`{3,})([A-Za-z0-9_+.#-]*)$/);
      if (match) {
        event?.preventDefault();
        const code = new FencedCodeMarkdownNode(match[2]); block.replace(code); code.selectStart(); return true;
      }
    }
    return false;
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(KEY_TAB_COMMAND, (event) => {
    const selection = $getSelection();
    if (!editor.isEditable() || !$isRangeSelection(selection) || !(selection.anchor.getNode().getTopLevelElement() instanceof FencedCodeMarkdownNode) || event.shiftKey) return false;
    event.preventDefault(); selection.insertRawText("\t"); return true;
  }, COMMAND_PRIORITY_HIGH));
  const taskPointer = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest("[data-task-toggle]")) event.preventDefault();
  };
  const toggleTask = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest("[data-task-toggle]") : null;
    if (!button || !element.contains(button)) return;
    event.preventDefault();
    if (!editor.isEditable()) return;
    let completed = false;
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(button);
      if (node instanceof TaskMarkdownNode) {
        node.toggle();
        completed = node.getLatest().__checked;
      }
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    if (completed) taskFeedback.play(button as HTMLElement);
  };
  const taskKeyboard = (event: KeyboardEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-task-toggle]") : null;
    if (button && (event.key === " " || event.key === "Enter")) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat && !event.isComposing) button.click();
    }
  };
  element.addEventListener("keydown", taskKeyboard, true);
  cleanups.push(() => element.removeEventListener("keydown", taskKeyboard, true));
  element.addEventListener("pointerdown", taskPointer);
  element.addEventListener("click", toggleTask);
  const syncTasks = () => {
    element.querySelectorAll<HTMLButtonElement>("[data-task-toggle]").forEach((button) => { button.disabled = !editor.isEditable(); });
    taskFeedback.sync();
  };
  cleanups.push(editor.registerUpdateListener(syncTasks), editor.registerEditableListener(syncTasks));
  cleanups.push(() => { element.removeEventListener("pointerdown", taskPointer); element.removeEventListener("click", toggleTask); });

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
      const leaf = caret.anchor.getNode(), block = leaf.getParent();
      if (!$isTextNode(leaf) || !block || !(block instanceof ParagraphNode || block instanceof HeadingNode)) return null;
      let range = referenceRange(true);
      let trigger: "[[" | "@" = "[[";
      if (!range?.text.startsWith("[[") && options.atReferenceTrigger) {
        const value = leaf.getTextContent(), end = caret.anchor.offset;
        const opening = value.lastIndexOf("@", end - 1);
        const previous = opening > 0 ? value[opening - 1]
          : leaf.getPreviousSiblings().map((node) => node.getTextContent()).join("").slice(-1);
        // Like unfinished [[ queries, stay within one leaf at logical block end.
        // A word boundary excludes email addresses, escapes and URL userinfo.
        if (opening < 0 || (previous && !/[\s(]/.test(previous))
            || end !== value.length || leaf.getNextSiblings().some((node) => node.getTextContentSize() > 0)) return null;
        const selection = caret.clone();
        selection.anchor.set(leaf.getKey(), opening, "text");
        range = { selection, query: value.slice(opening + 1, end), value: markdown, text: value.slice(opening, end) };
        trigger = "@";
      }
      // Literal bullets use IS_CODE only to suppress formatting shortcuts. Let
      // the shared source scanner reject actual code/unsupported contexts below.
      if (leaf.hasFormat("code") && !(leaf instanceof PageReferenceNode) && !(block instanceof LiteralMarkdownNode)) return null;
      if (block instanceof FencedCodeMarkdownNode) return null;
      if (!range || !range.text.startsWith(trigger) || /[\[\]\r\n]/.test(range.query)
          || (trigger === "@" && range.query.includes("@"))
          || range.selection.anchor.key !== caret.anchor.key || range.selection.focus.key !== caret.anchor.key
          || caret.anchor.offset !== range.selection.anchor.offset + trigger.length + range.query.length) return null;
      const blocks = $getRoot().getChildren();
      let offset = 0, found = false;
      for (const candidate of blocks) {
        if (candidate.getKey() === block.getKey()) { found = true; break; }
        offset += candidate.getTextContentSize() + 1;
      }
      if (!found) return null;
      for (const sibling of leaf.getPreviousSiblings()) offset += sibling.getTextContentSize();
      const start = offset + range.selection.anchor.offset, end = offset + range.selection.focus.offset;
      const text = blocks.map(referenceScanText).join("\n");
      // A complete sentinel permits the same context scanner to validate empty
      // and unfinished queries. This is string-only; no editor DOM/model edit.
      const probe = text.slice(0, start) + "[[Candidate]]" + text.slice(end);
      return referenceRanges(probe).some((match) => match.start === start && match.end === start + 13) ? { ...range, trigger } : null;
    });
  }
  // Typing [[ (or companion @) is handled by the host’s inline autocomplete installer, never
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
    if ((!editor.isEditable() && options.canActivateReference?.() !== true) || hasSelection()) return;
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

  // Loading and pasting share the same conservative Markdown grammar.
  function parseMarkdown(value: string): LexicalNode[] {
    const nodes: LexicalNode[] = [], lines = value.split("\n");
    let fence: { char: string; length: number } | null = null;
    let previousTask: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], closed = !fence ? codeFence(lines, i) : null;
      const parsedTable = !fence ? markdownTable(lines, i) : null;
      if (parsedTable) {
        const original = lines.slice(i, parsedTable.end + 1).join("\n");
        const node = new TableMarkdownNode().append(...$generateNodesFromRawText(original).map((node) => $isTextNode(node) ? node.setFormat("code") : node));
        nodes.push(node); sources.set(node.getKey(), { original, snapshot: snapshot(node) });
        i = parsedTable.end; previousTask = null; continue;
      }
      if (closed) {
        const node = new FencedCodeMarkdownNode(closed.language).append(...$generateNodesFromRawText(closed.text).map((node) => $isTextNode(node) ? node.setFormat("code") : node));
        nodes.push(node);
        sources.set(node.getKey(), { original: lines.slice(i, closed.end + 1).join("\n"), snapshot: snapshot(node) });
        i = closed.end; previousTask = null; continue;
      }
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      const checkbox = !fence ? taskMarker(line, previousTask) : null;
      const content = checkbox ? checkbox.label : line;
      let withoutCode = content;
      for (const range of inlineCodeRanges(content).reverse()) withoutCode = withoutCode.slice(0, range.start) + withoutCode.slice(range.end);
      const withoutReferences = withoutCode.replace(/\[\[[^\[\]\r\n]+\]\]/g, "");
      const literal = Boolean(fence || marker || (!checkbox && /^(?: {4}|\t|\s*(?:>|[-+*]\s|\d+[.)]\s|\|))/.test(line))
        || /[\[\]<>`\\~]|^\s*(?:---+|===+|\*\*\*+|___+)\s*$/.test(withoutReferences));
      let node: LexicalNode;
      if (literal) node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
      else {
        node = $generateNodesFromMarkdownString(content, syntax.filter((transformer) => transformer !== task), true)[0] || $createParagraphNode();
        if ($isElementNode(node) && node.getAllTextNodes().some((text) => !(text instanceof PageReferenceNode) && !text.hasFormat("code") && /\*|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u.test(text.getTextContent()))) {
          node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
        } else if (checkbox && $isElementNode(node)) node = new TaskMarkdownNode(checkbox.checked, checkbox.indent).append(...node.getChildren());
      }
      previousTask = node instanceof TaskMarkdownNode ? node.__spaces : null;
      nodes.push(node);
      sources.set(node.getKey(), { original: line, snapshot: snapshot(node) });
      if (marker) {
        if (!fence) fence = { char: marker[1][0], length: marker[1].length };
        else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^ {0,3}(?:`+|~+)[ \t]*$/.test(line)) fence = null;
      }
    }
    return nodes;
  }

  // External reconciliation operates on source lines; a code block spans many.
  function sourceBlocks() {
    return editor.getEditorState().read(() => {
      let start = 0;
      return $getRoot().getChildren().map((node) => {
        const source = sources.get(node.getKey());
        const original = source?.snapshot === snapshot(node) ? source.original : node instanceof FencedCodeMarkdownNode && !(node instanceof TableMarkdownNode) ? exportCodeFence(node.getTextContent(), node.__language) : node.getTextContent();
        const count = original.split("\n").length;
        const range = { start, end: start + count, code: node instanceof FencedCodeMarkdownNode && !(node instanceof TableMarkdownNode) };
        start += count;
        return range;
      });
    });
  }

  // Shared operation for toolbar and slash acceptance, inside one history edit.
  function applyFormat(kind: string) {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (kind === "bold" || kind === "italic" || kind === "code") editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
    else {
      $setBlocksType(selection, () => kind === "task" ? new TaskMarkdownNode() : kind === "code-block" ? new FencedCodeMarkdownNode() : kind === "paragraph" ? $createParagraphNode() : $createHeadingNode(kind as HeadingTagType));
      for (const node of selection.getNodes()) if ($isTextNode(node) && !(node instanceof PageReferenceNode) && node.hasFormat("code")) node.setFormat(0);
      selection.setFormat(0);
    }
  }
  cleanups.push(installSlashCommands(editor, element, applyFormat));
  let highlightTimer: number | undefined;
  const api = {
    getMarkdown: () => markdown,
    setMarkdown(value: string, reset = false) {
      if (!reset && value === markdown && editor.getEditorState().isEmpty() === false) return;
      taskFeedback.clear();
      loading = true;
      redoPending = false;
      win.clearTimeout(completionTimer);
      sources.clear(); lastSelection = null;
      editor.update(() => {
        const root = $getRoot(); root.clear();
        root.append(...parseMarkdown(value));
        scanReferences();
        for (const node of root.getChildren()) sources.get(node.getKey())!.snapshot = snapshot(node);
        completionBaseline = referenceText();
        $setSelection(null);
      }, { discrete: true });
      markdown = value;
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      history.current = { editor, editorState: editor.getEditorState() };
      loading = false;
      notifyReferenceContext();
    },
    setExternalMarkdown(value: string) {
      if (value === markdown) return;
      const doc = element.ownerDocument, win = doc.defaultView!;
      const changes = externalLineChanges(markdown, value);
      const oldBlocks = sourceBlocks();
      const selection = win.getSelection();
      let caret: { line: number; offset: number } | null = null;
      if (doc.activeElement === element && selection?.isCollapsed && selection.anchorNode && element.contains(selection.anchorNode)) {
        let block: Node = selection.anchorNode;
        while (block.parentNode && block.parentNode !== element) block = block.parentNode;
        const line = Array.from(element.childNodes).indexOf(block as ChildNode);
        if (line >= 0) {
          const offset = editor.getEditorState().read(() => {
            const selected = $getSelection();
            if (!$isRangeSelection(selected)) return 0;
            const anchor = selected.anchor, node = anchor.getNode();
            let size = anchor.type === "text" ? anchor.offset : $isElementNode(node) ? node.getChildren().slice(0, anchor.offset).reduce((sum, child) => sum + child.getTextContentSize(), 0) : 0;
            let current = node;
            while (current.getParent() && current.getParent() !== $getRoot()) {
              size += current.getPreviousSiblings().reduce((sum, child) => sum + child.getTextContentSize(), 0);
              current = current.getParent()!;
            }
            return size;
          });
          const content = editor.getEditorState().read(() => $getRoot().getChildAtIndex(line)!.getTextContent());
          const parts = content.slice(0, offset).split("\n"), source = oldBlocks[line];
          caret = { line: source.start + (source.code ? 1 : 0) + parts.length - 1, offset: parts.at(-1)!.length };
        }
      }
      const scroll = element.closest("#note-panel");
      const scrollTop = scroll?.scrollTop, scrollLeft = scroll?.scrollLeft;
      // External acceptance establishes a new undo baseline. Local edits made
      // after it remain undoable; Undo cannot restore the replaced remote body.
      api.setMarkdown(value);
      if (caret) {
        const matched = changes.matches.indexOf(caret.line), newBlocks = sourceBlocks();
        const sourceLine = matched >= 0 ? matched : Math.min(caret.line, value.split("\n").length - 1);
        const index = newBlocks.findIndex((block) => sourceLine >= block.start && sourceLine < block.end);
        editor.update(() => {
          const block = $getRoot().getChildAtIndex(index);
          if (!$isElementNode(block)) return;
          const source = newBlocks[index], line = Math.max(0, sourceLine - source.start - (source.code ? 1 : 0));
          const textLines = block.getTextContent().split("\n");
          let remaining = Math.min(caret!.offset, textLines[line]?.length ?? 0) + textLines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
          const leaves: LexicalNode[] = [];
          const visit = (node: LexicalNode) => { if ($isElementNode(node)) node.getChildren().forEach(visit); else leaves.push(node); };
          visit(block);
          for (const leaf of leaves) {
            if ($isTextNode(leaf) && remaining <= leaf.getTextContentSize()) { leaf.select(remaining, remaining); return; }
            remaining -= leaf.getTextContentSize();
          }
          block.selectEnd();
        }, { discrete: true });
      }
      if (scroll && scrollTop !== undefined && scrollLeft !== undefined) { scroll.scrollTop = scrollTop; scroll.scrollLeft = scrollLeft; }
      win.clearTimeout(highlightTimer);
      const newBlocks = sourceBlocks();
      const highlighted = Array.from(element.children).filter((_, index) => changes.changed.slice(newBlocks[index].start, newBlocks[index].end).some(Boolean));
      highlighted.forEach((block) => block.classList.add("external-change"));
      highlightTimer = win.setTimeout(() => highlighted.forEach((block) => block.classList.remove("external-change")), 4000);
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
          if (selection.anchor.getNode().getParent() instanceof LiteralMarkdownNode || selection.anchor.getNode().getParent() instanceof FencedCodeMarkdownNode || ($isTextNode(selection.anchor.getNode()) && (selection.anchor.getNode() as TextNode).hasFormat("code") && !(selection.anchor.getNode() instanceof PageReferenceNode))) selection.insertText(text);
          else { selection.insertNodes([new PageReferenceNode(text)]); selection.setFormat(0); }
        }
      }, { discrete: true, tag: HISTORY_PUSH_TAG });
      return true;
    },
    format(kind: string) {
      if (!editor.isEditable()) return;
      restoreSelection(captureSelection());
      editor.update(() => applyFormat(kind), { discrete: true, tag: HISTORY_PUSH_TAG });
      editor.focus();
    },
    destroy() {
      element.ownerDocument.defaultView!.clearTimeout(highlightTimer);
      referenceListeners.clear();
      cleanups.forEach((cleanup) => cleanup());
      editor.setRootElement(null);
    },
  };
  return api;
}

Object.assign(window, { createJumpyBrainNoteEditor: createNoteEditor });
