import { $createParagraphNode, ParagraphNode, type NodeKey } from "lexical";

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
  createDOM() {
    const element = document.createElement("pre");
    element.className = "markdown-code-block";
    element.dataset.language = this.__language;
    element.setAttribute("aria-label", this.__language ? `Code block (${this.__language})` : "Code block");
    element.title = "Code · Ctrl/Cmd+Enter to continue below";
    return element;
  }
  updateDOM() { return false; }
  insertNewAfter() { const next = $createParagraphNode(); this.insertAfter(next); next.selectStart(); return next; }
  // Backspace at the first character must not silently turn code into prose.
  collapseAtStart() { return true; }
}
