// Browser-only adapter. Bundled separately; never imported by the server runtime.
import {
  $addUpdateTag, $getNodeByKey, $createRangeSelection, $generateNodesFromRawText, $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isElementNode,
  $isRangeSelection, $isTextNode, $setSelection, CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH, DELETE_CHARACTER_COMMAND, DELETE_WORD_COMMAND, DELETE_LINE_COMMAND, FORMAT_TEXT_COMMAND, HISTORIC_TAG, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, IS_BOLD, IS_ITALIC, IS_CODE, INSERT_PARAGRAPH_COMMAND, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, PASTE_COMMAND, REDO_COMMAND, UNDO_COMMAND,
  ParagraphNode, RootNode, TextNode, $getNearestNodeFromDOMNode, createEditor, type EditorConfig, type ElementNode, type LexicalNode, type NodeKey, type RangeSelection, type TextFormatType,
} from "lexical";
import { $createHeadingNode, HeadingNode, registerRichText, type HeadingTagType } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $setBlocksType } from "@lexical/selection";
import { $isLinkNode, LinkNode } from "@lexical/link";
import {
  $convertToMarkdownString, $generateNodesFromMarkdownString, registerMarkdownShortcuts,
  HEADING, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE,
  BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, INLINE_CODE, type Transformer,
} from "@lexical/markdown";

import { codeFence, exportCodeFence, externalLinkMatch, externalLinkPattern, inertLinkPattern, inlineCodeRanges, markdownTable, bulletMarker, noteLinkPattern, relativeLinkPattern, taskMarker } from "./editor-markdown.js";
import { BulletMarkdownNode, FencedCodeMarkdownNode, TableMarkdownNode, TaskMarkdownNode } from "./editor-markdown-nodes.js";
import { installSlashCommands } from "./editor-slash-commands.js";
import { installReferencePresentation } from "./editor-reference-presentation.js";
import { createTaskCompletionFeedback } from "./editor-task-presentation.js";

import { referenceRanges, safeTitle } from "./reference-ranges.js";
import { completedReferenceTitles } from "./reference-creation.js";
import { externalLineChanges } from "./external-document-updates.js";
import {placePeerLabels,type PeerLabel} from "./collaboration-labels.js";
import { participantAppearance } from "./collaboration-appearance.js";
import { markdownSourceMap, visibleToSource, sourceToVisible, type EditorSourceMap } from "./editor-source-map.js";
import { applySourceSplices, transformSourcePosition, type SourceSplice } from "../../core/collaboration/source.js";
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
// Non-note relative links (images, other files) remain editable source, never clickable.
class InertLinkNode extends TextNode {
  static getType() { return "inert-link"; }
  static clone(node: InertLinkNode) { return new InertLinkNode(node.__text, node.__key); }
  hasFormat(format: TextFormatType) { return format === "code" || super.hasFormat(format); }
  static importJSON(value: ReturnType<TextNode["exportJSON"]>) { return new InertLinkNode().updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "inert-link" }; }
}
const relativeLinks: Transformer = {
  type: "text-match", dependencies: [InertLinkNode], importRegExp: inertLinkPattern,
  regExp: new RegExp(inertLinkPattern.source + "$"), trigger: ")",
  replace(node, match) { if (!node.hasFormat("code") && !$isLinkNode(node.getParent())) node.replace(new InertLinkNode(match[0]).setFormat(node.getFormat())); },
  export(node) { return node instanceof InertLinkNode ? node.getTextContent() : null; },
};
const bullet: Transformer = {
  type: "element", dependencies: [BulletMarkdownNode], regExp: /(?!) /, replace() {},
  export(node, children) { return node instanceof BulletMarkdownNode ? node.__marker + " " + children(node) : null; },
};
// Nested contenteditable anchors need an explicit tab stop for native keyboard access.
class ExternalLinkNode extends LinkNode {
  __destination = "";
  static getType() { return "external-link"; }
  static clone(node: ExternalLinkNode) {
    const copy = new ExternalLinkNode(node.__url, { target: node.__target, rel: node.__rel, title: node.__title }, node.__key);
    copy.__destination = node.__destination;
    return copy;
  }
  static importJSON(value: Parameters<LinkNode["updateFromJSON"]>[0] & { destination?: string }) {
    const node = new ExternalLinkNode().updateFromJSON(value);
    node.__destination = value.destination ?? "";
    return node;
  }
  exportJSON() { return { ...super.exportJSON(), type: "external-link", destination: this.__destination }; }
  createDOM(config: EditorConfig) {
    const anchor = super.createDOM(config);
    anchor.tabIndex = 0;
    // Note link `[label](../pages/x.md)`: no href (never browser navigation); the
    // path shows on hover and the host resolves it against the note's folder.
    // Note destinations never contain ":"; every external URL has a scheme.
    if (!this.__url.includes(":")) {
      anchor.removeAttribute("href");
      anchor.setAttribute("role", "link");
      anchor.dataset.noteLink = "true";
      anchor.title = this.__url;
    }
    return anchor;
  }
}
// Exported by externalLinks' generic `[label](url)` branch, which is exact here.
const noteLinks: Transformer = {
  type: "text-match", dependencies: [ExternalLinkNode], importRegExp: noteLinkPattern,
  regExp: new RegExp(noteLinkPattern.source + "$"), trigger: ")",
  replace(node, match) {
    if ($isLinkNode(node.getParent()) || node.hasFormat("code")) return;
    const label = $createTextNode(match[1]).setFormat(node.getFormat());
    node.replace(new ExternalLinkNode(match[2]).append(label));
    return label;
  },
  export: () => null,
};
const externalLinks: Transformer = {
  type: "text-match", dependencies: [ExternalLinkNode], importRegExp: externalLinkPattern,
  regExp: new RegExp(externalLinkPattern.source + "$", "i"), trigger: ")",
  replace(node, match) {
    const parsed = externalLinkMatch(match[0]);
    if (!parsed || $isLinkNode(node.getParent()) || node.hasFormat("code")) return;
    const label = $createTextNode(parsed.label).setFormat(node.getFormat());
    const link = new ExternalLinkNode(parsed.url, { target: "_blank", rel: "noopener noreferrer", title: parsed.title ?? parsed.url });
    link.__destination = match[0].slice(1 + parsed.label.length);
    node.replace(link.append(label));
    return label;
  },
  export(node, children) {
    if (!$isLinkNode(node)) return null;
    const label = children(node).replace(/[\[\]]/g, "\\$&");
    if (node instanceof ExternalLinkNode && externalLinkMatch(`[link${node.__destination}`)?.url === node.getURL()) return `[${label}${node.__destination}`;
    const url = node.getURL().replace(/([\\()])/g, "\\$1");
    const title = node.getTitle();
    return `[${label}](${url}${title && title !== node.getURL() ? ` "${title}"` : ""})`;
  },
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
const syntax: Transformer[] = [table, fencedCode, task, bullet, references, noteLinks, relativeLinks, externalLinks, INLINE_CODE, HEADING, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE];
// Reference classification and leaf splitting are derived presentation, not a
// source edit. Compare semantic text runs (including supported formatting), not
// node classes/boundaries or the internal IS_CODE shortcut-suppression flag.
// Otherwise changing a fence could reserialize an untouched line underneath it.
function referenceScanText(block: LexicalNode): string {
  if ($isLinkNode(block) || block instanceof FencedCodeMarkdownNode) return block.getTextContent().replace(/[^\n]/g, "\uFFFC");
  if ($isTextNode(block)) return !(block instanceof PageReferenceNode) && !(block.getParent() instanceof LiteralMarkdownNode) && block.hasFormat("code")
    ? "\uFFFC".repeat(block.getTextContentSize()) : block.getTextContent();
  return $isElementNode(block) ? block.getChildren().map(referenceScanText).join("") : block.getTextContent();
}

// Rendered list prefixes have no text width but still constrain opaque fences.
function referenceListStarts(blocks: LexicalNode[]) {
  const starts = new Set<number>(); let offset = 0;
  for (const block of blocks) {
    if (block instanceof BulletMarkdownNode || block instanceof TaskMarkdownNode) starts.add(offset);
    offset += block.getTextContentSize() + 1;
  }
  return starts;
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
      if (part.text === "") continue; // Lexical removes empty leaves during normalization.
      if (part.text !== undefined && previous?.text !== undefined && previous.attributes === part.attributes) previous.text += part.text;
      else children.push(part);
    }
    return { attributes: JSON.stringify(current.exportJSON()), children };
  }
  return JSON.stringify(visit(node));
}

export interface EditorSourceIntent { before: string; after: string; operations: SourceSplice[]; reason?: string }

export function createNoteEditor(element: HTMLElement, options: {
  onChange: (markdown: string, intent?: EditorSourceIntent) => void;
  // Only committed edits to active reference text; never hydration or refresh.
  onCompletedReferences?: (titles: string[]) => void;
  // Companion-only input shortcut; stored references always use [[…]].
  atReferenceTrigger?: boolean;
  // Kept for caller compatibility; explicit picker opening belongs to the host.
  onActivateReference?: (title: string) => void;
  /** A brain-relative `.md` link destination, unresolved; the host resolves and opens it. */
  onActivateNoteLink?: (destination: string) => void;
  // A permission-readonly host can explain link outcomes while ordinary
  // navigation/session locks keep reference activation disabled.
  canActivateReference?: () => boolean;
  canActivateExternalLink?: () => boolean;
  onError: (error: Error) => void;
}) {
  const sources = new Map<string, { original: string; snapshot: string }>();
  const referenceListeners = new Set<() => void>();
  const compositionListeners = new Set<() => void>();
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
    namespace: "jumpyBrain-notes", nodes: [HeadingNode, LiteralMarkdownNode, PageReferenceNode, InertLinkNode, ExternalLinkNode, TaskMarkdownNode, BulletMarkdownNode, FencedCodeMarkdownNode, TableMarkdownNode],
    theme: { link: "markdown-external-link", text: { bold: "editor-bold", italic: "editor-italic", code: "editor-inline-code" } },
    onError: options.onError,
  });
  element.contentEditable = "true";
  editor.setRootElement(element);
  const history = createEmptyHistoryState();
  let collaborativeHistory: { undo: () => void; redo?: () => void } | null = null;
  const attachHistory = () => registerHistory(editor, history, 300);
  let detachHistory = attachHistory();
  const cleanups = [registerRichText(editor), () => detachHistory()];
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
    const activeRanges = new Set(referenceRanges(text, referenceListStarts(blocks)).map((range) => range.start + ":" + range.end));
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
          const code = $isLinkNode(part.getParent()) || part.getParent() instanceof FencedCodeMarkdownNode || (!reference && part.hasFormat("code") && !literal);
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
  let sourceNewline: "\n" | "\r\n" | null = "\n";
  const detectNewline = (value: string) => value.includes("\r\n") ? /(?<!\r)\n/.test(value) ? null : "\r\n" as const : "\n" as const;
  let loading = false;
  let capturedIntent: { before: string; ranges: Array<{start:number;end:number;removedKey?:string}>; inputType: string } | undefined;
  let lastSourceIntent: EditorSourceIntent | undefined;
  let continuationIntent:typeof capturedIntent,continuationTimer:number|undefined;
  function captureSourceIntent(inputType: string, range?: StaticRange | Range, blockScope = false, inserted?:string) {
    if (loading || !editor.isEditable() || capturedIntent?.inputType==="slash"&&capturedIntent.before===markdown) return;
    continuationIntent=undefined;element.ownerDocument.defaultView!.clearTimeout(continuationTimer);
    try { editor.getEditorState().read(() => {
      const blocks = projectedBlocks();
      if (blocks.map(block=>block.raw).join("\n") !== markdown) return;
      let selection = $getSelection();
      if (range) { const resolved = $createRangeSelection(); resolved.applyDOMRange(range); selection = resolved; }
      if (!$isRangeSelection(selection)) return;
      let a = sourcePoint(selection.anchor, blocks), b = sourcePoint(selection.focus, blocks);
      if (a === null || b === null) return;
      if (a === b && /^delete/.test(inputType)) {
        const block = blocks.find(block=>block.map && a!>=block.offset && a!<=block.offset+block.raw.length);
        const visible = block?.map ? sourceToVisible(block.map,a-block.offset) : null;
        if (block?.map && visible !== null && inputType === "deleteContentBackward" && visible>0) {
          const segments=[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(block.node.getTextContent().slice(0,visible))];
          const previous=segments.at(-1)?.index;
          if(previous!==undefined) a=block.offset+visibleToSource(block.map,previous,"right")!;
        } else if(block?.map && visible !== null && inputType === "deleteContentForward" && visible<block.map.visibleLength) {
          const next=[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(block.node.getTextContent().slice(visible))][0]?.segment.length;
          if(next!==undefined)b=block.offset+visibleToSource(block.map,visible+next,"left")!;
        }
      }
      const low=Math.min(a,b),high=Math.max(a,b),ranges:Array<{start:number;end:number;removedKey?:string}>=[];
      const boundaries=(source:number)=>{
        const result=new Set([source]);
        for(const block of blocks)if(block.map && source>=block.offset && source<=block.offset+block.raw.length){
          const visible=sourceToVisible(block.map,source-block.offset);
          if(visible!==null)for(const span of block.map.spans)if(!span.escaped&&span.from===visible && span.to===visible){result.add(block.offset+span.start);result.add(block.offset+span.end)}
        }
        return [...result];
      };
      for(const start of boundaries(low))for(const end of boundaries(high))if(start<=end)ranges.push({start,end});
      if(inserted&&/^insert/.test(inputType)){
        const block=blocks.find(block=>block.map&&low>=block.offset&&high<=block.offset+block.raw.length);
        if(block?.map){
          const visible=sourceToVisible(block.map,low-block.offset);
          if(visible!==null){
            const prefix=block.node.getTextContent().slice(0,visible)+inserted;
            for(const tag of ["***","___","**","__","*","_","`"])if(prefix.endsWith(tag)){
              const opening=prefix.lastIndexOf(tag,prefix.length-tag.length-1);
              if(opening>=0&&opening<visible){const source=visibleToSource(block.map,opening,"right");if(source!==null)for(const start of boundaries(block.offset+source))ranges.push({start,end:high})}
            }
          }
        }
      }
      if(blockScope){const selected=blocks.filter(block=>block.offset+block.raw.length>=low&&block.offset<=high);if(selected.length)ranges.push({start:selected[0].offset,end:selected.at(-1)!.offset+selected.at(-1)!.raw.length})}
      if(low===high && /^delete/.test(inputType)){
        const index=blocks.findIndex(block=>block.map && low===block.offset+block.map.contentStart);
        if(index>=0){ranges.push({start:blocks[index].offset,end:low});if(index>0)ranges.push({start:blocks[index-1].offset+blocks[index-1].raw.length,end:low})}
      }
      if(/^delete/.test(inputType)){
        // A collapsed caret can remove its empty paragraph, including its
        // separator. Accept that exact range only if this node was removed.
        for(const [index,block]of blocks.entries())if(block.map&&low<=block.offset+block.map.contentStart&&high>=block.offset+block.map.contentEnd&&(low!==high||block.map.visibleLength===0&&low===block.offset+block.map.contentStart)){
          ranges.push({start:index===blocks.length-1&&index>0?block.offset-1:Math.min(low,block.offset),end:index<blocks.length-1?Math.max(high,block.offset+block.raw.length+1):Math.max(high,block.offset+block.raw.length),removedKey:block.node.getKey()});
        }
        if(low===high&&inputType==="deleteContentForward"){
          const index=blocks.findIndex(block=>block.map&&low===block.offset+block.map.contentEnd);
          if(index>=0&&index+1<blocks.length){const next=blocks[index+1];if(next.map)ranges.push({start:low,end:next.offset+next.map.contentStart})}
        }
      }
      if(range?.startContainer===element && range.startOffset===0 && range.endContainer===element && range.endOffset===element.childNodes.length)ranges.unshift({start:0,end:markdown.length});
      capturedIntent={before:markdown,ranges,inputType};
    }, {editor}); } catch { capturedIntent=undefined; }
  }
  function sourceIntent(before:string,after:string):EditorSourceIntent {
    const capture=capturedIntent??continuationIntent;capturedIntent=undefined;continuationIntent=undefined;
    if(capture?.before===before){
      // Verify the exact user-targeted interval. Repeated text never authorizes
      // moving it to a different occurrence merely because a diff is shorter.
      const candidates=capture.ranges.flatMap(({start,end,removedKey})=>{
        if(removedKey&&editor.getEditorState().read(()=>$getNodeByKey(removedKey)?.isAttached()??false))return [];
        const suffix=before.slice(end),prefix=before.slice(0,start),insertEnd=after.length-suffix.length;
        if(insertEnd<start || !after.startsWith(prefix) || !after.endsWith(suffix))return [];
        const operation={start,deleteCount:end-start,insert:after.slice(start,insertEnd)};
        try{return applySourceSplices(before,[operation])===after?[operation]:[]}catch{return []}
      });
      // Syntax-only boundary alternatives are ranked by the smallest verified
      // interval, never by a search for matching characters elsewhere.
      candidates.sort((a,b)=>a.deleteCount-b.deleteCount||a.insert.length-b.insert.length);
      if(candidates.length){
        const selected=candidates[0];
        const project=(position:number,association:"left"|"right")=>position>selected.start&&position<selected.start+selected.deleteCount?selected.start+(association==="right"?selected.insert.length:0):transformSourcePosition(position,[selected],association);
        continuationIntent={before:after,inputType:capture.inputType,ranges:capture.ranges.map(range=>({start:project(range.start,"left"),end:project(range.end,"right")}))};
        element.ownerDocument.defaultView!.clearTimeout(continuationTimer);
        continuationTimer=element.ownerDocument.defaultView!.setTimeout(()=>{continuationIntent=undefined},0);
        return {before,after,operations:[selected]};
      }
    }
    return {before,after,operations:[],reason:"This input could not be mapped to its actual source range. Its draft is retained; review before publishing."};
  }
  const beforeInput=(event:InputEvent)=>{const ranges=event.getTargetRanges?.();captureSourceIntent(event.inputType,ranges?.[0],false,event.data??undefined);};
  const keyIntent=(event:KeyboardEvent)=>{
    if(event.isComposing)return;
    if(event.key==="Backspace"||event.key==="Delete")captureSourceIntent(event.key==="Backspace"?"deleteContentBackward":"deleteContentForward");
    else if(event.key==="Enter"||event.key==="Tab")captureSourceIntent(event.key==="Enter"?"insertParagraph":"insertText");
  };
  const inputIntent=()=>queueMicrotask(()=>{
    if(loading||!capturedIntent||!/^insert/.test(capturedIntent.inputType))return;
    const next=editor.getEditorState().read(serialize);
    const intent=sourceIntent(markdown,next);
    if(!intent.reason&&intent.operations.some(operation=>operation.deleteCount||operation.insert)){markdown=next;lastSourceIntent=intent;options.onChange(next,intent)}
  });
  const compositionIntent=()=>captureSourceIntent("compositionstart");
  element.addEventListener("compositionstart",compositionIntent,true);
  element.addEventListener("beforeinput",beforeInput,true);element.addEventListener("keydown",keyIntent,true);element.addEventListener("input",inputIntent);
  cleanups.push(()=>{element.removeEventListener("compositionstart",compositionIntent,true);element.removeEventListener("beforeinput",beforeInput,true);element.removeEventListener("keydown",keyIntent,true);element.removeEventListener("input",inputIntent)});
  // Lexical can handle word/line deletion on keydown without beforeinput. Measure
  // the same native boundary, retaining the original caret and default command.
  // Move a collapsed caret only: a transient selection would replace X11 PRIMARY.
  for (const [command, unit] of [[DELETE_WORD_COMMAND, "word"], [DELETE_LINE_COMMAND, "lineboundary"]] as const) cleanups.push(editor.registerCommand(command, backward => {
    const native = element.ownerDocument.getSelection();
    let range: Range | undefined;
    if (native?.isCollapsed && native.anchorNode && element.contains(native.anchorNode)) {
      const node = native.anchorNode, offset = native.anchorOffset;
      capturedIntent = undefined;
      try {
        native.modify("move", backward ? "backward" : "forward", unit);
        if (native.focusNode && element.contains(native.focusNode)) {
          range = native.getRangeAt(0).cloneRange();
          range[backward ? "setEnd" : "setStart"](node, offset);
        }
      } catch { range = undefined; } finally { native.collapse(node, offset); }
    }
    if (range || !native?.isCollapsed) captureSourceIntent(backward ? "deleteContentBackward" : "deleteContentForward", range);
    return false;
  }, COMMAND_PRIORITY_HIGH));
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
    if (collaborativeHistory) { const active = collaborativeHistory; queueMicrotask(() => { if (collaborativeHistory === active) active.redo?.(); }); return true; }
    redoPending = true;
    // History can first commit a no-op, then restore its snapshot in a later
    // microtask. Consume intent only when reference text actually changes.
    return false;
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(UNDO_COMMAND, () => { redoPending = false; if (collaborativeHistory) { const active = collaborativeHistory; queueMicrotask(() => { if (collaborativeHistory === active) active.undo(); }); return true; } return false; }, COMMAND_PRIORITY_HIGH));
  const nativeHistory = (event: Event) => {
    const action = (event as CustomEvent).detail;
    if (event.target !== element || element.ownerDocument.activeElement !== element || !["undo", "redo"].includes(action)) return;
    event.preventDefault();
    if (editor.isEditable()) editor.dispatchCommand(action === "undo" ? UNDO_COMMAND : REDO_COMMAND, undefined);
  };
  element.addEventListener("jumpybrain:history", nativeHistory);
  cleanups.push(() => element.removeEventListener("jumpybrain:history", nativeHistory));
  let lastSelection: RangeSelection | null = null;
  const serialize = () => {
    const value = $convertToMarkdownString(transformers, undefined, true);
    return sourceNewline === "\r\n" ? value.replace(/\r?\n/g, "\r\n") : value;
  };
  cleanups.push(editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
    if (loading) return;
    editorState.read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) lastSelection = selection.clone();
      if (!dirtyElements.size && !dirtyLeaves.size) return;
      const next = serialize();
      if (next !== markdown || capturedIntent) {
        const intent=sourceIntent(markdown,next);
        if(next!==markdown || intent.operations.some(operation=>operation.deleteCount||operation.insert)){
          markdown=next;lastSourceIntent=intent;options.onChange(next,intent);
        }
      }
      if (!editor.isComposing()) reportCompletions(tags.has(HISTORIC_TAG) && !redoPending);
    });
    notifyReferenceContext();
  }));
  const compositionEnd = () => {
    win.clearTimeout(completionTimer);
    // Some browsers commit the final composition through a later input event.
    // Keep the baseline across preedit updates and inspect only committed state.
    completionTimer = win.setTimeout(() => {
      if (!loading && !editor.isComposing()) {
        editor.getEditorState().read(() => reportCompletions());
        compositionListeners.forEach((listener) => listener());
      }
    }, 0);
  };
  element.addEventListener("compositionend", compositionEnd);
  cleanups.push(() => { win.clearTimeout(completionTimer); element.removeEventListener("compositionend", compositionEnd); });
  // Do not expose formats that our Markdown subset cannot save.
  cleanups.push(editor.registerCommand(FORMAT_TEXT_COMMAND, (format) => {
    if (format !== "bold" && format !== "italic" && format !== "code") return true;
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.getNodes().some((node) => node instanceof PageReferenceNode || node instanceof InertLinkNode || node instanceof LiteralMarkdownNode || node.getParent() instanceof LiteralMarkdownNode || node instanceof FencedCodeMarkdownNode || node.getParent() instanceof FencedCodeMarkdownNode || (format !== "code" && $isTextNode(node) && node.hasFormat("code")));
  }, COMMAND_PRIORITY_HIGH));
  cleanups.push(editor.registerCommand(PASTE_COMMAND, (event) => {
    if (!event) return false;
    if (!editor.isEditable()) return true;
    captureSourceIntent("insertFromPaste",undefined,true);
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

  function changeTaskIndent(block: TaskMarkdownNode, outdent: boolean) {
    const rows = block.indentRows(), keys = new Set(rows.map(row => row.getKey()));
    const blocks = projectedBlocks().filter(item => keys.has(item.node.getKey()));
    if (!block.changeTaskIndent(outdent)) return false;
    capturedIntent = { before: markdown, inputType: "taskIndent", ranges: [{
      start: blocks[0].offset, end: blocks.at(-1)!.offset + blocks.at(-1)!.raw.length,
    }] };
    $addUpdateTag(HISTORY_PUSH_TAG);
    return true;
  }
  cleanups.push(editor.registerCommand(DELETE_CHARACTER_COMMAND, backward => {
    const selection = $getSelection();
    if (!editor.isEditable() || !backward || !$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const block = selection.anchor.getNode().getTopLevelElement();
    if (!block) return false;
    const atStart = selection.anchor.offset === 0 && (selection.anchor.key === block.getKey() || selection.anchor.getNode().is(block.getFirstDescendant()));
    if (block instanceof BulletMarkdownNode && atStart) {
      const source = projectedBlocks().find(item => item.node.getKey() === block.getKey())!;
      capturedIntent = { before: markdown, inputType: "bulletExit", ranges: [{ start: source.offset, end: source.offset + 2 }] };
      const next = $createParagraphNode().append(...block.getChildren()); block.replace(next); next.selectStart();
      sources.set(next.getKey(), { original: source.raw.slice(2), snapshot: snapshot(next) });
      $addUpdateTag(HISTORY_PUSH_TAG); return true;
    }
    if (!(block instanceof TaskMarkdownNode) || !block.__spaces || !atStart || !changeTaskIndent(block, true)) return false;
    return true;
  }, COMMAND_PRIORITY_HIGH));

  // Keyboard Enter and native/mobile beforeinput share the same source intent.
  cleanups.push(editor.registerCommand(INSERT_PARAGRAPH_COMMAND, () => {
    if (!editor.isEditable()) return true;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const block = selection.anchor.getNode().getTopLevelElement();
    if (!(block instanceof TaskMarkdownNode || block instanceof BulletMarkdownNode) || !block.isEmpty()) return false;
    if (block instanceof TaskMarkdownNode && block.__spaces) changeTaskIndent(block, true);
    else {
      const source = projectedBlocks().find(item => item.node.getKey() === block.getKey())!;
      capturedIntent = { before: markdown, inputType: "taskExit", ranges: [{ start: source.offset, end: source.offset + source.raw.length }] };
      $addUpdateTag(HISTORY_PUSH_TAG); block.insertNewAfter();
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
    if (!editor.isEditable() || !$isRangeSelection(selection)) return false;
    const block = selection.anchor.getNode().getTopLevelElement();
    if (block instanceof TaskMarkdownNode && selection.isCollapsed() && !event.isComposing) {
      if (!changeTaskIndent(block, event.shiftKey)) return false;
      event.preventDefault(); return true;
    }
    if (!(block instanceof FencedCodeMarkdownNode) || event.shiftKey) return false;
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
    editor.getEditorState().read(()=>{const node=$getNearestNodeFromDOMNode(button);const block=projectedBlocks().find(block=>block.node.getKey()===node?.getKey());if(block&&node instanceof TaskMarkdownNode)capturedIntent={before:markdown,ranges:[{start:block.offset+node.__spaces+3,end:block.offset+node.__spaces+4}],inputType:"taskToggle"}}, {editor});
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
      return referenceRanges(probe, referenceListStarts(blocks)).some((match) => match.start === start && match.end === start + 13) ? { ...range, trigger } : null;
    });
  }
  // Typing [[ (or companion @) is handled by the host’s inline autocomplete installer, never
  // by the explicit modal picker. Context notifications include selection edits.

  // Browser event delegation only: the model owns every rendered reference.
  const doc = element.ownerDocument;
  function referenceElement(target: EventTarget | null): HTMLElement | null {
    const link = target instanceof Element ? target.closest<HTMLElement>("[data-page-reference], a.markdown-external-link") : null;
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
    if (hasSelection()) return;
    const [external, note] = editor.read(() => {
      let node = $getNearestNodeFromDOMNode(link);
      if ($isTextNode(node)) node = node.getParent();
      return $isLinkNode(node) ? [node.getURL(), !node.getURL().includes(":")] : [null, false];
    });
    if (note) {
      if (editor.isEditable() || options.canActivateReference?.() === true) options.onActivateNoteLink?.(external!);
      return;
    }
    if (external !== null) {
      if ((editor.isEditable() || options.canActivateExternalLink?.() === true)
          && externalLinkMatch(`[link](${external.replace(/([\\()])/g, "\\$1")})`)) doc.defaultView?.open(external, "_blank", "noopener,noreferrer");
      return;
    }
    if (!editor.isEditable() && options.canActivateReference?.() !== true) return;
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
    if (link?.matches("a.markdown-external-link")) event.preventDefault();
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
  const externalAuxClick = (event: MouseEvent) => {
    if (referenceElement(event.target)?.matches("a.markdown-external-link")) event.preventDefault();
  };
  element.addEventListener("auxclick", externalAuxClick);
  element.addEventListener("click", clickReference);
  doc.addEventListener("keydown", keyboardReference, true);
  element.addEventListener("focusin", focusReference);
  cleanups.push(() => {
    element.removeEventListener("pointerdown", pointerDown);
    doc.removeEventListener("pointermove", pointerMove);
    doc.removeEventListener("pointerup", pointerMove);
    doc.removeEventListener("pointercancel", pointerCancel);
    element.removeEventListener("auxclick", externalAuxClick);
    element.removeEventListener("click", clickReference);
    doc.removeEventListener("keydown", keyboardReference, true);
    element.removeEventListener("focusin", focusReference);
  });

  // Loading and pasting share the same conservative Markdown grammar.
  function parseMarkdown(value: string): LexicalNode[] {
    const nodes: LexicalNode[] = [], rawLines = value.split("\n"), lines = rawLines.map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
    let fence: { char: string; length: number } | null = null;
    let previousTask: number | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], closed = !fence ? codeFence(lines, i) : null;
      const parsedTable = !fence ? markdownTable(lines, i) : null;
      if (parsedTable) {
        const original = rawLines.slice(i, parsedTable.end + 1).join("\n");
        const node = new TableMarkdownNode().append(...$generateNodesFromRawText(lines.slice(i, parsedTable.end + 1).join("\n")).map((node) => $isTextNode(node) ? node.setFormat("code") : node));
        nodes.push(node); sources.set(node.getKey(), { original, snapshot: snapshot(node) });
        i = parsedTable.end; previousTask = null; continue;
      }
      if (closed) {
        const node = new FencedCodeMarkdownNode(closed.language).append(...$generateNodesFromRawText(closed.text).map((node) => $isTextNode(node) ? node.setFormat("code") : node));
        nodes.push(node);
        sources.set(node.getKey(), { original: rawLines.slice(i, closed.end + 1).join("\n"), snapshot: snapshot(node) });
        i = closed.end; previousTask = null; continue;
      }
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      const checkbox = !fence ? taskMarker(line, previousTask) : null;
      const ordinary = !fence ? bulletMarker(line) : null;
      const content = checkbox ? checkbox.label : ordinary ? ordinary.label : line;
      let withoutCode = content;
      for (const range of inlineCodeRanges(content).reverse()) withoutCode = withoutCode.slice(0, range.start) + withoutCode.slice(range.end);
      let withoutLinks = withoutCode.replace(new RegExp(relativeLinkPattern.source, "g"), "");
      for (let parsed = externalLinkMatch(withoutLinks); parsed; parsed = externalLinkMatch(withoutLinks)) {
        withoutLinks = withoutLinks.slice(0, parsed.start) + parsed.label.replace(/\\[\\\[\]*_`~]/g, "") + withoutLinks.slice(parsed.end);
      }
      const withoutReferences = withoutLinks.replace(/\[\[[^\[\]\r\n]+\]\]/g, "");
      const literal = Boolean(fence || marker || (!checkbox && !ordinary && /^(?: {4}|\t|\s*(?:>|[-+*]\s|\d+[.)]\s|\|))/.test(line))
        || /[\[\]<>`\\~]|^\s*(?:---+|===+|\*\*\*+|___+)\s*$/.test(withoutReferences));
      let node: LexicalNode;
      if (literal) node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
      else {
        node = $generateNodesFromMarkdownString(content, syntax.filter((transformer) => transformer !== task), true)[0] || $createParagraphNode();
        if ($isElementNode(node) && node.getAllTextNodes().some((text) => !(text instanceof PageReferenceNode) && !$isLinkNode(text.getParent()) && !text.hasFormat("code") && /\*|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u.test(text.getTextContent()))) {
          node = new LiteralMarkdownNode().append($createTextNode(line).setFormat("code"));
        } else if (checkbox && $isElementNode(node)) node = new TaskMarkdownNode(checkbox.checked, checkbox.indent).append(...node.getChildren());
        else if (ordinary && $isElementNode(node)) node = new BulletMarkdownNode(ordinary.marker).append(...node.getChildren());
      }
      previousTask = node instanceof TaskMarkdownNode ? node.__spaces : null;
      nodes.push(node);
      sources.set(node.getKey(), { original: rawLines[i], snapshot: snapshot(node) });
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
    captureSourceIntent("format",undefined,!["bold","italic","code"].includes(kind));
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (kind === "bold" || kind === "italic" || kind === "code") editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
    else {
      $setBlocksType(selection, () => kind === "task" ? new TaskMarkdownNode() : kind === "code-block" ? new FencedCodeMarkdownNode() : kind === "paragraph" ? $createParagraphNode() : $createHeadingNode(kind as HeadingTagType));
      for (const node of selection.getNodes()) if ($isTextNode(node) && !(node instanceof PageReferenceNode) && node.hasFormat("code")) node.setFormat(0);
      selection.setFormat(0);
    }
  }
  cleanups.push(installSlashCommands(editor, element, applyFormat,()=>captureSourceIntent("slash",undefined,true)));
  let highlightTimer: number | undefined;
  type PeerCursor = { actor: string; principalId?: string; clientId?: string; name: string; kind: "human" | "agent"; activity?: string; leaseExpiresAt?: number; anchor?: number; focus?: number };
  let peerCursors: PeerCursor[] = [];
  const cursorLayer = element.ownerDocument.createElement("div");
  cursorLayer.dataset.collaborationCursors = "true";
  cursorLayer.setAttribute("aria-hidden", "true");
  cursorLayer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:12;overflow:hidden";
  element.ownerDocument.body.append(cursorLayer);
  // The exporter reads only its container's children. This readonly view
  // exports one attached block without moving nodes or mutating the document.
  function blockSource(node: LexicalNode, newline = sourceNewline) {
    const view = { getChildren: () => [node] } as unknown as ElementNode;
    let value = $convertToMarkdownString(transformers, view, true);
    if (newline === "\r\n") { value = value.replace(/\r?\n/g, "\r\n"); if (node.getNextSibling() && !value.endsWith("\r")) value += "\r"; }
    return value;
  }
  function blockMap(node: LexicalNode, raw: string): EditorSourceMap | null {
    let start = 0, end = raw.length;
    const literal = node instanceof LiteralMarkdownNode || node instanceof FencedCodeMarkdownNode;
    if (node instanceof FencedCodeMarkdownNode && !(node instanceof TableMarkdownNode)) { start = raw.indexOf("\n") + 1; end = Math.max(start, raw.lastIndexOf("\n")); }
    else if (node instanceof TaskMarkdownNode) start = /^( *)- \[[ xX]\] /.exec(raw)?.[0].length ?? 0;
    else if (node instanceof BulletMarkdownNode) start = 2;
    else if (node instanceof HeadingNode) start = /^#{1,6}\s/.exec(raw)?.[0].length ?? 0;
    const text = node.getTextContent(), formats = new Uint8Array(text.length); let offset = 0;
    const links: Array<{ from: number; to: number }> = [];
    const visit = (child: LexicalNode) => {
      if ($isTextNode(child)) { const size = child.getTextContentSize(); formats.fill(child.getFormat() & (IS_BOLD | IS_ITALIC | (child instanceof PageReferenceNode ? 0 : IS_CODE)), offset, offset + size); offset += size; }
      else if ($isElementNode(child)) {
        if ($isLinkNode(child)) links.push({ from: offset, to: offset + child.getTextContentSize() });
        child.getChildren().forEach(visit);
      } else offset += child.getTextContentSize();
    }; visit(node);
    return markdownSourceMap(raw, text, formats, { start, end, literal, links });
  }
  function mappedBlocks(nodes: LexicalNode[], newline = sourceNewline) {
    let offset = 0;
    return nodes.map((node) => {
      const raw = blockSource(node, newline), map = blockMap(node, raw), block = { node, offset, raw, map };
      offset += raw.length + 1; return block;
    });
  }
  const projectedBlocks = () => mappedBlocks($getRoot().getChildren());
  function sourcePoint(point: RangeSelection["anchor"], blocks: ReturnType<typeof mappedBlocks>) {
    if (!blocks.length) return null;
    const root = $getRoot(); let node = point.getNode(), visible = 0, index = -1;
    if (node === root && point.type === "element") {
      index = Math.min(point.offset, blocks.length - 1); visible = point.offset >= blocks.length ? blocks[index].node.getTextContentSize() : 0;
    } else {
      visible = point.type === "text" ? point.offset : $isElementNode(node) ? node.getChildren().slice(0, point.offset).reduce((size, child) => size + child.getTextContentSize(), 0) : 0;
      while (node.getParent() && node.getParent() !== root) { visible += node.getPreviousSiblings().reduce((size, sibling) => size + sibling.getTextContentSize(), 0); node = node.getParent()!; }
      index = blocks.findIndex((block) => block.node.getKey() === node.getKey());
    }
    const block = blocks[index]; if (!block?.map) return null;
    const source = visibleToSource(block.map, visible, visible === 0 || point.type === "text" && point.offset === 0 ? "right" : "left");
    return source === null ? null : block.offset + source;
  }
  function pointInBlock(block: LexicalNode, offset: number): { node: Node; offset: number; empty?: HTMLElement } | null {
    const leaves: LexicalNode[] = [];
    const visit = (node: LexicalNode) => { if ($isElementNode(node)) node.getChildren().forEach(visit); else leaves.push(node); }; visit(block);
    for (const leaf of leaves) {
      const size = leaf.getTextContentSize();
      if (offset <= size && $isTextNode(leaf)) {
        const dom = editor.getElementByKey(leaf.getKey()); if (!dom || dom.closest("details:not([open])")) return null;
        const walker = element.ownerDocument.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
        let text: Node | null; while ((text = walker.nextNode())) { if (offset <= (text.textContent?.length ?? 0)) return { node: text, offset }; offset -= text.textContent?.length ?? 0; }
        return null;
      }
      offset -= size;
    }
    let dom = editor.getElementByKey(block.getKey());
    if (dom && (block instanceof TaskMarkdownNode || block instanceof BulletMarkdownNode)) dom = dom.lastElementChild as HTMLElement;
    if (dom && block instanceof TableMarkdownNode) dom = dom.lastElementChild?.lastElementChild as HTMLElement;
    return dom && !block.getTextContentSize() ? { node: dom, offset: 0, empty: dom } : null;
  }
  function cursorBounds(node: Node) {
    const bounds = { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
    let current = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
    while (current) {
      const style = win.getComputedStyle(current), rect = current.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { bounds.left = Math.max(bounds.left, rect.left + current.clientLeft); bounds.right = Math.min(bounds.right, rect.left + current.clientLeft + current.clientWidth); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { bounds.top = Math.max(bounds.top, rect.top + current.clientTop); bounds.bottom = Math.min(bounds.bottom, rect.top + current.clientTop + current.clientHeight); }
      current = current.parentElement;
    }
    return bounds;
  }
  function emptyCaret(container: HTMLElement) {
    if (!container.getClientRects().length) return null;
    const rect = container.getBoundingClientRect(), style = win.getComputedStyle(container);
    const height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
    const left = rect.left + (parseFloat(style.paddingLeft) || 0), top = rect.top + (parseFloat(style.paddingTop) || 0);
    return { left, right: left + 2, top, bottom: top + height, width: 2, height };
  }
  function renderCursors() {
    cursorLayer.replaceChildren();
    if (!peerCursors.length || !element.isConnected) return;
    editor.getEditorState().read(() => {
      const blocks = projectedBlocks();
      const project = (sourceOffset: number) => {
        for (const block of blocks) if (sourceOffset >= block.offset && sourceOffset <= block.offset + block.raw.length) {
          if (!block.map) return null;
          const index = sourceToVisible(block.map, sourceOffset - block.offset);
          return index === null ? null : pointInBlock(block.node, index);
        }
        return null;
      };
      const labels:PeerLabel[]=[];
      for (const peer of peerCursors.slice(0, 64)) {
        if (peer.leaseExpiresAt !== undefined && peer.leaseExpiresAt <= Date.now() || peer.anchor === undefined || peer.focus === undefined) continue;
        const anchor = project(peer.anchor), focus = project(peer.focus); if (!anchor || !focus) continue;
        const range = element.ownerDocument.createRange();
        try {
          const backward = peer.anchor > peer.focus;
          range.setStart((backward ? focus : anchor).node, (backward ? focus : anchor).offset);
          range.setEnd((backward ? anchor : focus).node, (backward ? anchor : focus).offset);
          const appearance = participantAppearance(peer), bounds = cursorBounds(range.commonAncestorContainer);
          if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) continue;
          const rects: Array<Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">> = Array.from(range.getClientRects());
          if (range.collapsed && !rects.some((rect) => rect.height) && focus.empty) { const rect = emptyCaret(focus.empty); if (rect) rects.push(rect); }
          const unique = new Set<string>();
          for (const rect of rects.slice(0, 100)) {
            const left = Math.max(bounds.left, rect.left), right = Math.min(bounds.right, Math.max(rect.right, rect.left + 2));
            const top = Math.max(bounds.top, rect.top), bottom = Math.min(bounds.bottom, rect.bottom);
            if (right <= left || bottom <= top) continue;
            const key = [left, top, right, bottom].map((value) => Math.round(value * 10)).join(":"); if (unique.has(key)) continue; unique.add(key);
            const mark = element.ownerDocument.createElement("span"); mark.dataset.collaborationActor = peer.actor; mark.dataset.collaborationKind = peer.kind;
            mark.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;background:color-mix(in srgb, ${appearance.color} 18%, transparent);border-left:2px solid ${appearance.color};box-sizing:border-box`;
            cursorLayer.append(mark);
          }
          const caretRange = element.ownerDocument.createRange(); caretRange.setStart(focus.node, focus.offset); caretRange.collapse(true);
          let caret: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height"> | undefined = Array.from(caretRange.getClientRects()).find((rect) => rect.height > 0);
          caret ??= focus.empty ? emptyCaret(focus.empty) ?? undefined : undefined;
          if (caret && caret.left >= bounds.left && caret.left < bounds.right && caret.bottom > bounds.top && caret.top < bounds.bottom) {
            const label = element.ownerDocument.createElement("span"); label.textContent = appearance.label + " · " + appearance.activity;
            label.dataset.collaborationLabel = "true"; label.dataset.collaborationKind = peer.kind;
            label.style.cssText = `position:absolute;left:${caret.left}px;top:${Math.max(bounds.top, caret.top - 16)}px;max-width:${Math.min(180,bounds.right-bounds.left)}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px system-ui;background:${appearance.color};color:white;padding:1px 3px;border-radius:3px;box-sizing:border-box`;
            cursorLayer.append(label);labels.push({element:label,bounds}); label.style.left = Math.max(bounds.left, Math.min(caret.left, bounds.right - label.getBoundingClientRect().width)) + "px";
          }
        } catch { /* Invalidated coordinates remain awareness-only until refreshed. */ }
      }
      placePeerLabels(labels);
    });
  }
  let cursorFrame = 0;
  const cursorLayout = () => { if (!cursorFrame) cursorFrame = win.requestAnimationFrame(() => { cursorFrame = 0; renderCursors(); }); };
  element.ownerDocument.addEventListener("scroll", cursorLayout, true); win.addEventListener("resize", cursorLayout);
  const cursorResize = new ResizeObserver(cursorLayout);
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) cursorResize.observe(ancestor);
  cleanups.push(editor.registerUpdateListener(cursorLayout));
  cleanups.push(() => { element.ownerDocument.removeEventListener("scroll", cursorLayout, true); win.removeEventListener("resize", cursorLayout); cursorResize.disconnect(); win.cancelAnimationFrame(cursorFrame); cursorLayer.remove(); });
  const api = {
    getMarkdown: () => markdown,
    takeCollaborativeIntent(before:string,after:string) {const intent=lastSourceIntent;lastSourceIntent=undefined;return intent?.before===before&&intent.after===after?intent:null;},
    isComposing: () => editor.isComposing(),
    setCollaborativeNewline(value: "\n" | "\r\n" | null) { sourceNewline = value; },
    collaborativeSelection(): { anchor: number; focus: number } | null {
      if (element.ownerDocument.activeElement !== element || editor.isComposing()) return null;
      return editor.getEditorState().read(() => {
        const selected = $getSelection(); if (!$isRangeSelection(selected)) return null;
        const blocks = projectedBlocks();
        const points = [selected.anchor, selected.focus].map((point) => sourcePoint(point, blocks));
        return points.every((point) => point !== null) ? { anchor: points[0]!, focus: points[1]! } : null;
      });
    },
    setCollaborativePresence(peers: PeerCursor[]) { peerCursors = peers; renderCursors(); },
    subscribeSelection(listener: () => void) { referenceListeners.add(listener); const blur = () => listener(); element.addEventListener("blur", blur); return () => {referenceListeners.delete(listener); element.removeEventListener("blur", blur);}; },
    setMarkdown(value: string, reset = false) {
      if (!reset && value === markdown && editor.getEditorState().isEmpty() === false) return;
      taskFeedback.clear();capturedIntent=undefined;continuationIntent=undefined;lastSourceIntent=undefined;
      sourceNewline = detectNewline(value);
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
    // Remote source changes reconcile only affected subtrees. Unchanged blocks
    // retain their Lexical keys, DOM, reference state and selection identity.
    // No remote state enters the local history stack.
    applyCollaborativeMarkdown(value: string, presentation: { highlight?: boolean;operationSequence?: readonly (readonly SourceSplice[])[];retireUnprovenSelection?: boolean;resetSelection?: boolean } = {}): { status: "applied" | "unchanged" | "deferred" | "recovery"; reason?: string } {
      if (value === markdown && !presentation.operationSequence?.some(operations=>operations.length)) {
        // A local edit already renders the acknowledged source. Refresh its
        // sidecar without replacing nodes so source cursor projection is exact.
        const clean = editor.getEditorState().read(() => $getRoot().getChildren().every((node) => sources.get(node.getKey())?.snapshot === snapshot(node)));
        if (!clean && !editor.isComposing()) {
          loading = true;
          try { editor.update(() => {
            const actual = $getRoot().getChildren(), parsed = parseMarkdown(value);
            if (actual.length === parsed.length) actual.forEach((node, index) => {
              const source = sources.get(parsed[index].getKey())!;
              if (snapshot(node) === snapshot(parsed[index])) sources.set(node.getKey(), { original: source.original, snapshot: snapshot(node) });
            });
            const keys = new Set(actual.map((node) => node.getKey())); for (const key of sources.keys()) if (!keys.has(key)) sources.delete(key);
          }, { discrete: true, tag: HISTORIC_TAG }); } finally { loading = false; }
        }
        return { status: "unchanged" };
      }
      if (editor.isComposing()) return { status: "deferred" };
      const before = editor.getEditorState(), previous = markdown, savedSources = new Map(sources), previousNewline = sourceNewline;
      sourceNewline = detectNewline(value);
      const scroll = element.closest("#note-panel"), top = scroll?.scrollTop, left = scroll?.scrollLeft;
      let failure: string | undefined, treeUpdated=false;
      const active=element.ownerDocument.activeElement===element;
      loading = true;
      try {
        // Project before mutating. Lexical may report update errors through a
        // nonthrowing host handler, so expected ambiguity must not escape into
        // its update callback and masquerade as a serializer failure.
        const projected=before.read(()=>{
          const oldBlocks=mappedBlocks($getRoot().getChildren(),previousNewline),originals=oldBlocks.map(block=>block.raw),selection=$getSelection();
          if(originals.join("\n")!==previous)throw new Error("The current editable source could not be mapped exactly");
          const selected=$isRangeSelection(selection),points=selected?[selection.anchor,selection.focus].map(point=>sourcePoint(point,oldBlocks)):null;
          let sequence=presentation.operationSequence;
          if(!sequence){if(active&&selected)throw new Error("The incoming snapshot has no positional edit history. Review before continuing this selection.");sequence=previous===value?[]:[[{start:0,deleteCount:previous.length,insert:value}]]}
          let verified=previous;for(const operations of sequence)verified=applySourceSplices(verified,operations);
          if(verified!==value)throw new Error("The incoming operations do not reproduce the supplied source. Both versions are retained.");
          let offsets:number[]|null=null,retiredSelection=false;
          if(presentation.resetSelection){
            if(capturedIntent||continuationIntent)throw new Error("Pending input must be preserved before resetting the saved selection");
            retiredSelection=true;
          }else if(points){
            if(points.some(point=>point===null)){if(active)throw new Error("The active selection could not be mapped exactly; both source versions are retained")}
            else if(presentation.operationSequence){
              const anchors=points as number[];
              try{offsets=anchors.map((offset,index)=>{
                // A caret stays before text another writer inserts at its
                // position, so two people typing at one spot keep separate
                // runs. Where an inferred raw-file change proves only the
                // other side (an append at the caret's end of file), use it.
                const collapsed=anchors[0]===anchors[1],association=!collapsed&&offset<anchors[1-index]?"right":"left";
                let position=offset;
                for(const operations of sequence!){
                  const project=(side:"left"|"right")=>{try{return transformSourcePosition(position,operations,side)}catch(error){if((error as {code?:string}).code!=="position_deleted")throw error;const removed=operations.find(operation=>operation.start<position&&position<operation.start+operation.deleteCount);if(!removed)throw error;return transformSourcePosition(removed.start,operations,side)}};
                  try{position=project(association)}catch(error){if(!collapsed||(error as {code?:string}).code!=="ambiguous_source")throw error;position=project("right")}
                }
                return position;
              })}catch(error){
                if((error as {code?:string}).code!=="ambiguous_source")throw error;
                // Only the collaboration owner can prove the rendered source
                // is already saved. Never retire a selection mid-beforeinput.
                if(active&&(!presentation.retireUnprovenSelection||capturedIntent||continuationIntent))throw error;
                retiredSelection=true;
              }
            }
          }
          return {originals,offsets,selected,retiredSelection,format:selected?selection.format:0,style:selected?selection.style:""};
        });
        treeUpdated=true;
        editor.update(() => {
          if(!active)$addUpdateTag(SKIP_DOM_SELECTION_TAG);
          const root=$getRoot(),oldNodes=root.getChildren(),originals=projected.originals;
          const newNodes = parseMarkdown(value), incoming = newNodes.map((node) => sources.get(node.getKey())!.original);
          // A source-ordered match preserves repeated blocks deterministically.
          // Only blocks between surviving anchors are reconciled or replaced.
          const sourceIdentity = (source: string) => source.replace(/\r(?=\n|$)/g, "");
          const oldKeys = new Set(oldNodes.map((node) => node.getKey()));
          const positions = new Map<string, { indexes: number[]; cursor: number }>();
          originals.forEach((source, i) => { const key = oldNodes[i].getType() + "\0" + sourceIdentity(source); const entry = positions.get(key) ?? { indexes: [], cursor: 0 }; entry.indexes.push(i); positions.set(key, entry); });
          let cursor = 0;
          const chosen = newNodes.map((node, index) => {
            const candidates = positions.get(node.getType() + "\0" + sourceIdentity(incoming[index]));
            if (candidates) while (candidates.cursor < candidates.indexes.length && candidates.indexes[candidates.cursor] < cursor) candidates.cursor++;
            const match = candidates?.indexes[candidates.cursor];
            if (match === undefined) return node;
            cursor = match + 1; return oldNodes[match];
          });
          function metadata(node: LexicalNode) { const { children: _children, text: _text, ...rest } = node.exportJSON() as Record<string, unknown>; return JSON.stringify(rest); }
          function reconcile(old: LexicalNode, next: LexicalNode): LexicalNode {
            if (old.getType() !== next.getType() || metadata(old) !== metadata(next)) return next;
            if ($isTextNode(old) && $isTextNode(next)) {
              const a = old.getTextContent(), b = next.getTextContent(); let first = 0, aEnd = a.length, bEnd = b.length;
              while (first < aEnd && first < bEnd && a[first] === b[first]) first++;
              while (aEnd > first && bEnd > first && a[aEnd - 1] === b[bEnd - 1]) { aEnd--; bEnd--; }
              old.spliceText(first, aEnd - first, b.slice(first, bEnd)); return old;
            }
            if ($isElementNode(old) && $isElementNode(next)) {
              const a = old.getChildren(), b = next.getChildren(), oldChildKeys = new Set(a.map((child) => child.getKey()));
              const matches = new Map<string, { indexes: number[]; cursor: number }>();
              a.forEach((child, i) => { const signature = snapshot(child), entry = matches.get(signature) ?? { indexes: [], cursor: 0 }; entry.indexes.push(i); matches.set(signature, entry); });
              let after = 0;
              const children = b.map((child) => {
                const entry = matches.get(snapshot(child));
                if (entry) while (entry.cursor < entry.indexes.length && entry.indexes[entry.cursor] < after) entry.cursor++;
                const index = entry?.indexes[entry.cursor];
                if (index === undefined) return child;
                after = index + 1; return a[index];
              });
              const kept = new Set(children.filter((child) => oldChildKeys.has(child.getKey())).map((child) => child.getKey()));
              children.forEach((child, i) => {
                if (oldChildKeys.has(child.getKey()) || !a[i] || kept.has(a[i].getKey())) return;
                children[i] = reconcile(a[i], child); kept.add(children[i].getKey());
              });
              old.splice(0, a.length, children); return old;
            }
            return next;
          }
          const retained = new Set(chosen.filter((node) => oldKeys.has(node.getKey())));
          // Reuse compatible changed blocks at their source position as well.
          chosen.forEach((node, i) => {
            if (oldKeys.has(node.getKey())) return;
            const old = oldNodes[i];
            if (old && !retained.has(old)) { chosen[i] = reconcile(old, node); retained.add(chosen[i]); }
          });
          // Moving existing nodes one at a time avoids detaching unaffected DOM.
          chosen.forEach((node, i) => { const at = root.getChildAtIndex(i); if (at?.getKey() !== node.getKey()) { if (at) at.insertBefore(node); else root.append(node); } });
          const chosenKeys = new Set(chosen.map((node) => node.getKey()));
          for (const node of root.getChildren()) if (!chosenKeys.has(node.getKey())) node.remove();
          chosen.forEach((node, i) => sources.set(node.getKey(), { original: incoming[i], snapshot: snapshot(node) }));
          scanReferences();
          chosen.forEach((node, i) => sources.set(node.getKey(), { original: incoming[i], snapshot: snapshot(node) }));
          if (projected.offsets) {
            const nextSelection = $createRangeSelection();
            [nextSelection.anchor, nextSelection.focus].forEach((point, i) => {
              let remaining = Math.max(0, Math.min(value.length, projected.offsets![i])), index = 0;
              while (index < incoming.length - 1 && remaining > incoming[index].length) { remaining -= incoming[index].length + 1; index++; }
              const block = chosen[index];
              const map = blockMap(block, incoming[index]);
              let visible = map ? sourceToVisible(map, remaining) : null;
              if (visible === null) visible = map && remaining >= map.contentEnd ? map.visibleLength : 0;
              const leaves: LexicalNode[] = [];
              const visit = (node: LexicalNode) => { if ($isElementNode(node)) node.getChildren().forEach(visit); else leaves.push(node); }; visit(block);
              for (const leaf of leaves) { if ($isTextNode(leaf) && visible <= leaf.getTextContentSize()) { point.set(leaf.getKey(), visible, "text"); return; } visible -= leaf.getTextContentSize(); }
              point.set(block.getKey(), $isElementNode(block) ? block.getChildrenSize() : 0, "element");
            });
            nextSelection.format=projected.format;nextSelection.style=projected.style;
            $setSelection(nextSelection); lastSelection = nextSelection.clone();
          } else if(projected.selected||projected.retiredSelection){$setSelection(null);lastSelection=null}
          completionBaseline = referenceText();
        }, { discrete: true, tag: HISTORIC_TAG });
        if (!failure && editor.getEditorState().read(serialize) !== value) failure = "Source round trip did not preserve the incoming document";
        if (failure) {
          sources.clear(); savedSources.forEach((source, key) => sources.set(key, source));
          editor.setEditorState(before, { tag: HISTORIC_TAG });
          markdown = previous; sourceNewline = previousNewline;
          return { status: "recovery", reason: failure };
        }
        if(projected.retiredSelection||projected.selected&&!projected.offsets&&!active){
          const native=element.ownerDocument.getSelection();
          if(native&&(element.contains(native.anchorNode)||element.contains(native.focusNode)))native.removeAllRanges();
          // No guessed insertion position: a fresh click establishes the next
          // editing anchor after an ambiguous clean-source replacement.
          if(active&&projected.retiredSelection)element.blur();
        }
        markdown = value;
        if (presentation.highlight) {
          win.clearTimeout(highlightTimer);
          element.querySelectorAll(".external-change").forEach((block) => block.classList.remove("external-change"));
          const changes = externalLineChanges(previous.replace(/\r\n/g, "\n"), value.replace(/\r\n/g, "\n")), blocks = sourceBlocks();
          const highlighted = Array.from(element.children).filter((_, index) => blocks[index] && changes.changed.slice(blocks[index].start, blocks[index].end).some(Boolean));
          highlighted.forEach((block) => block.classList.add("external-change"));
          highlightTimer = win.setTimeout(() => highlighted.forEach((block) => block.classList.remove("external-change")), 4000);
        }
        // Detached parsing nodes must not retain a growing source sidecar.
        editor.getEditorState().read(() => { const keys = new Set($getRoot().getChildren().map((node) => node.getKey())); for (const key of sources.keys()) if (!keys.has(key)) sources.delete(key); });
        return { status: "applied" };
      } catch (error) {
        sources.clear(); savedSources.forEach((source, key) => sources.set(key, source));
        if(treeUpdated)editor.setEditorState(before, { tag: HISTORIC_TAG }); markdown = previous; sourceNewline = previousNewline;
        return { status: "recovery", reason: error instanceof Error ? error.message : "Reconciliation failed" };
      } finally {
        loading = false;
        if (scroll && top !== undefined && left !== undefined) { scroll.scrollTop = top; scroll.scrollLeft = left; }
        notifyReferenceContext();
      }
    },
    subscribeCompositionEnd(listener: () => void) { compositionListeners.add(listener); return () => { compositionListeners.delete(listener); }; },
    setCollaborativeHistory(value: { undo: () => void; redo?: () => void } | null) {
      if (Boolean(value) === Boolean(collaborativeHistory)) { collaborativeHistory = value; return; }
      detachHistory(); collaborativeHistory = value;
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      history.current = { editor, editorState: editor.getEditorState() };
      detachHistory = value ? () => {} : attachHistory();
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
      editor.getEditorState().read(()=>{const blocks=projectedBlocks(),selection=range.selection;const a=sourcePoint(selection.anchor,blocks),b=sourcePoint(selection.focus,blocks);if(a!==null&&b!==null)capturedIntent={before:markdown,ranges:[{start:Math.min(a,b),end:Math.max(a,b)}],inputType:"insertReference"}});
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
      element.ownerDocument.defaultView!.clearTimeout(highlightTimer);element.ownerDocument.defaultView!.clearTimeout(continuationTimer);
      referenceListeners.clear(); compositionListeners.clear();
      cleanups.forEach((cleanup) => cleanup());
      editor.setRootElement(null);
    },
  };
  return api;
}

Object.assign(window, { createJumpyBrainNoteEditor: createNoteEditor });
