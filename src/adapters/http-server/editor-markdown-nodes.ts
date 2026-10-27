import { $createParagraphNode, ParagraphNode, type NodeKey } from "lexical";
import { markdownTable } from "./editor-markdown.js";

type ParagraphJSON = ReturnType<ParagraphNode["exportJSON"]>;

// One task per source line; indentation is presentation/source metadata, not a
// second list tree. Ordinary/ambiguous lists remain literal Markdown.
export class TaskMarkdownNode extends ParagraphNode {
  __checked: boolean;
  __spaces: number;
  static getType() { return "markdown-task"; }
  static clone(node: TaskMarkdownNode) { return new TaskMarkdownNode(node.__checked, node.__spaces, node.__key); }
  constructor(checked = false, spaces = 0, key?: NodeKey) { super(key); this.__checked = checked; this.__spaces = spaces; }
  static importJSON(value: ParagraphJSON & { checked?: boolean; spaces?: number }) {
    return new TaskMarkdownNode(value.checked, value.spaces).updateFromJSON(value);
  }
  exportJSON() { return { ...super.exportJSON(), type: "markdown-task", checked: this.__checked, spaces: this.__spaces }; }
  createDOM() {
    const row = document.createElement("p");
    row.className = "markdown-task";
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
    element.style.paddingInlineStart = `${this.__spaces}ch`;
    const check = element.firstElementChild!;
    check.setAttribute("aria-checked", String(this.__checked));
    check.setAttribute("aria-label", `Task: ${this.getTextContent() || "Untitled"}`);
  }
  toggle() { this.getWritable().__checked = !this.getLatest().__checked; }
  insertNewAfter() {
    if (this.isEmpty()) {
      const paragraph = $createParagraphNode(); this.replace(paragraph); paragraph.selectStart(); return paragraph;
    }
    const next = new TaskMarkdownNode(false, this.getLatest().__spaces);
    this.insertAfter(next); next.selectStart(); return next;
  }
  collapseAtStart() {
    const paragraph = $createParagraphNode().append(...this.getChildren());
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
