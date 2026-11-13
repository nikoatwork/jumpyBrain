import { $createParagraphNode, ParagraphNode, type NodeKey } from "lexical";
import { markdownTable } from "./editor-markdown.js";

type ParagraphJSON = ReturnType<ParagraphNode["exportJSON"]>;

// Unsupported blocks are ordinary editable text, never HTML or silently discarded nodes.
export class LiteralMarkdownNode extends ParagraphNode {
  static getType() { return "literal-markdown"; }
  static clone(node: LiteralMarkdownNode) { return new LiteralMarkdownNode(node.__key); }
  constructor(key?: NodeKey) { super(key); }
  static importJSON(value: ParagraphJSON) {
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

// One task per source line; indentation is presentation/source metadata, not a
// second list tree. Ambiguous lists remain literal Markdown. `marker` holds the
// note's nesting unit, bullet and checked spelling (`  -x`, `\t*X`). A literal
// task keeps its whole label as editable source text, like a literal line.
export class TaskMarkdownNode extends ParagraphNode {
  __checked: boolean;
  __spaces: number;
  __marker: string;
  __literal: boolean;
  static getType() { return "markdown-task"; }
  static clone(node: TaskMarkdownNode) { return new TaskMarkdownNode(node.__checked, node.__spaces, node.__marker, node.__literal, node.__key); }
  constructor(checked = false, spaces = 0, marker = "  -x", literal = false, key?: NodeKey) {
    super(key); this.__checked = checked; this.__spaces = spaces; this.__marker = marker; this.__literal = literal;
  }
  static importJSON(value: ParagraphJSON & { checked?: boolean; spaces?: number; marker?: string; literal?: boolean }) {
    return new TaskMarkdownNode(value.checked, value.spaces, value.marker, value.literal).updateFromJSON(value);
  }
  exportJSON() { return { ...super.exportJSON(), type: "markdown-task", checked: this.__checked, spaces: this.__spaces, marker: this.__marker, literal: this.__literal }; }
  // Canonical row prefix, e.g. `\t\t* [X] `.
  prefix() {
    const { __marker: marker, __spaces: spaces, __checked: checked } = this.getLatest();
    return marker.slice(0, -2).repeat(spaces / 2) + marker.at(-2) + " [" + (checked ? marker.at(-1) : " ") + "] ";
  }
  createDOM() {
    const row = document.createElement("p");
    const check = document.createElement("button");
    check.type = "button";
    check.contentEditable = "false";
    check.dataset.taskToggle = "true";
    check.setAttribute("role", "checkbox");
    const label = document.createElement("span");
    row.append(check, label);
    this.syncDOM(row);
    return row;
  }
  getDOMSlot(element: HTMLElement) { return super.getDOMSlot(element.lastElementChild as HTMLElement); }
  updateDOM(_previous: this, element: HTMLElement) { this.syncDOM(element); return false; }
  syncDOM(element: HTMLElement) {
    element.className = this.__literal ? "markdown-task markdown-literal" : "markdown-task";
    element.style.paddingInlineStart = `${this.__spaces}ch`;
    const check = element.firstElementChild!;
    check.setAttribute("aria-checked", String(this.__checked));
    check.setAttribute("aria-label", `Task: ${this.getTextContent() || "Untitled"}`);
  }
  toggle() { this.getWritable().__checked = !this.getLatest().__checked; }
  // The contiguous deeper source rows form this task’s subtree.
  indentRows() {
    const rows: TaskMarkdownNode[] = [this];
    let next = this.getNextSibling();
    while (next instanceof TaskMarkdownNode && next.__spaces > this.getLatest().__spaces) {
      rows.push(next); next = next.getNextSibling();
    }
    return rows;
  }
  changeTaskIndent(outdent: boolean) {
    const spaces = this.getLatest().__spaces, previous = this.getPreviousSibling();
    if (outdent ? spaces === 0 : !(previous instanceof TaskMarkdownNode) || previous.__spaces < spaces) return false;
    for (const row of this.indentRows()) row.getWritable().__spaces += outdent ? -2 : 2;
    return true;
  }
  insertNewAfter() {
    if (this.isEmpty()) {
      const paragraph = $createParagraphNode(); this.replace(paragraph); paragraph.selectStart(); return paragraph;
    }
    const { __spaces, __marker, __literal } = this.getLatest(), next = new TaskMarkdownNode(false, __spaces, __marker, __literal);
    this.insertAfter(next); next.selectStart(); return next;
  }
  // A literal label stays literal source rather than becoming inline code.
  collapseAtStart() {
    const paragraph = (this.getLatest().__literal ? new LiteralMarkdownNode() : $createParagraphNode()).append(...this.getChildren());
    this.replace(paragraph); paragraph.selectStart(); return true;
  }
}

export class FencedCodeMarkdownNode extends ParagraphNode {
  __language: string;
  static getType() { return "markdown-code-block"; }
  static clone(node: FencedCodeMarkdownNode) { return new FencedCodeMarkdownNode(node.__language, node.__key); }
  constructor(language = "", key?: NodeKey) { super(key); this.__language = language; }
  static importJSON(value: ParagraphJSON & { language?: string }) { return new FencedCodeMarkdownNode(value.language).updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "markdown-code-block", language: this.__language }; }
  createDOM(): HTMLElement {
    const element = document.createElement("pre");
    element.className = "markdown-code-block";
    element.dataset.language = this.__language;
    element.setAttribute("aria-label", this.__language ? `Code block (${this.__language})` : "Code block");
    element.title = "Code · Ctrl/Cmd+Enter to continue below";
    return element;
  }
  updateDOM(_previous: this, _element: HTMLElement) { return false; }
  insertNewAfter() { const next = $createParagraphNode(); this.insertAfter(next); next.selectStart(); return next; }
  // Backspace at the first character must not silently turn code into prose.
  collapseAtStart() { return true; }
}

// Preview and editable source share one canonical text payload. The preview is
// inert text-only DOM, outside Lexical's content slot; it never serializes.
export class TableMarkdownNode extends FencedCodeMarkdownNode {
  static getType() { return "markdown-table"; }
  static clone(node: TableMarkdownNode) { return new TableMarkdownNode("", node.__key); }
  static importJSON(value: ParagraphJSON) { return new TableMarkdownNode().updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "markdown-table" }; }
  createDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table";
    const preview = document.createElement("div");
    preview.className = "markdown-table-preview";
    preview.contentEditable = "false";
    const details = document.createElement("details"), summary = document.createElement("summary"), source = document.createElement("pre");
    summary.contentEditable = "false";
    summary.textContent = "Table Markdown";
    source.className = "markdown-code-block";
    source.setAttribute("aria-label", "Table Markdown source");
    details.append(summary, source); wrapper.append(preview, details);
    this.syncPreview(wrapper);
    return wrapper;
  }
  getDOMSlot(element: HTMLElement) { return super.getDOMSlot(element.lastElementChild!.lastElementChild as HTMLElement); }
  updateDOM(_previous: this, element: HTMLElement) { this.syncPreview(element); return false; }
  syncPreview(element: HTMLElement) {
    const preview = element.firstElementChild!;
    const source = this.getTextContent(), lines = source.split("\n"), parsed = markdownTable(lines);
    preview.replaceChildren();
    if (!parsed || parsed.end !== lines.length - 1) {
      const message = document.createElement("span"); message.textContent = "Table source changed · edit Markdown below";
      preview.append(message); (element.lastElementChild as HTMLDetailsElement).open = true; return;
    }
    const table = document.createElement("table");
    table.setAttribute("aria-label", "Markdown table");
    for (const [index, cells] of parsed.rows.entries()) {
      const section = document.createElement(index ? "tbody" : "thead"), row = document.createElement("tr");
      for (const [column, text] of cells.entries()) {
        const cell = document.createElement(index ? "td" : "th");
        if (!index) cell.setAttribute("scope", "col");
        cell.style.textAlign = parsed.align[column];
        cell.textContent = text.replace(/\\\|/g, "|"); row.append(cell);
      }
      section.append(row); table.append(section);
    }
    preview.append(table);
  }
}

// One ordinary top-level bullet per source line, matching the task source model.
export class BulletMarkdownNode extends ParagraphNode {
  __marker: string;
  static getType() { return "markdown-bullet"; }
  static clone(node: BulletMarkdownNode) { return new BulletMarkdownNode(node.__marker, node.__key); }
  constructor(marker = "-", key?: NodeKey) { super(key); this.__marker = marker; }
  static importJSON(value: ParagraphJSON & { marker?: string }) { return new BulletMarkdownNode(value.marker).updateFromJSON(value); }
  exportJSON() { return { ...super.exportJSON(), type: "markdown-bullet", marker: this.__marker }; }
  createDOM() { const row = document.createElement("ul"); row.className = "markdown-bullet"; row.append(document.createElement("li")); return row; }
  getDOMSlot(element: HTMLElement) { return super.getDOMSlot(element.firstElementChild as HTMLElement); }
  insertNewAfter() {
    const next = this.isEmpty() ? $createParagraphNode() : new BulletMarkdownNode(this.getLatest().__marker);
    if (this.isEmpty()) this.replace(next); else this.insertAfter(next);
    next.selectStart(); return next;
  }
  collapseAtStart() { const next = $createParagraphNode().append(...this.getChildren()); this.replace(next); next.selectStart(); return true; }
}
